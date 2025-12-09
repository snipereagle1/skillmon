use std::collections::HashMap;
use std::sync::Mutex;

use anyhow::{Context, Result};
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use reqwest::header::{ACCEPT_LANGUAGE, IF_NONE_MATCH};
use serde::Serialize;
use serde_plain;
use sqlx::{QueryBuilder, Row, Sqlite};
use tauri::{Emitter, Listener, Manager, State};

mod auth;
mod cache;
mod db;
mod esi;
mod sde;

type AuthStateMap = Mutex<HashMap<String, auth::AuthState>>;

#[tauri::command]
async fn start_eve_login(
    app: tauri::AppHandle,
    auth_states: State<'_, AuthStateMap>,
) -> Result<String, String> {
    let client_id = std::env::var("EVE_CLIENT_ID")
        .map_err(|_| "EVE_CLIENT_ID environment variable not set".to_string())?;

    // Use HTTP callback for dev mode (can be overridden with env var)
    let callback_url = std::env::var("EVE_CALLBACK_URL")
        .unwrap_or_else(|_| "http://localhost:1421/callback".to_string());

    let scopes = ["esi-skills.read_skills.v1", "esi-skills.read_skillqueue.v1"];

    let (auth_url, auth_state) = auth::generate_auth_url(&client_id, &scopes, &callback_url);

    let state_key = auth_state.state.clone();
    auth_states
        .lock()
        .map_err(|e| format!("Failed to lock auth state: {}", e))?
        .insert(state_key, auth_state);

    use tauri_plugin_opener::OpenerExt;
    let browser_result = app.opener().open_url(auth_url.clone(), None::<String>);

    // In dev mode or if browser opening fails, return the URL so user can open it manually
    match browser_result {
        Ok(_) => Ok(format!(
            "Browser opened. If it didn't open, use this URL:\n{}",
            auth_url
        )),
        Err(e) => Ok(format!(
            "Failed to open browser automatically. Please open this URL manually:\n{}\n\nError: {}",
            auth_url, e
        )),
    }
}

#[tauri::command]
async fn get_characters(pool: State<'_, db::Pool>) -> Result<Vec<db::Character>, String> {
    db::get_all_characters(&*pool)
        .await
        .map_err(|e| format!("Failed to get characters: {}", e))
}

#[tauri::command]
async fn logout_character(pool: State<'_, db::Pool>, character_id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM tokens WHERE character_id = ?")
        .bind(character_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete tokens: {}", e))?;

    db::delete_character(&*pool, character_id)
        .await
        .map_err(|e| format!("Failed to delete character: {}", e))
}

#[tauri::command]
async fn refresh_sde(app: tauri::AppHandle, pool: State<'_, db::Pool>) -> Result<(), String> {
    sde::force_refresh(&app, &*pool)
        .await
        .map_err(|e| format!("Failed to refresh SDE: {}", e))
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillQueueItem {
    pub skill_id: i64,
    pub skill_name: Option<String>,
    pub queue_position: i32,
    pub finished_level: i32,
    pub start_date: Option<String>,
    pub finish_date: Option<String>,
    pub training_start_sp: Option<i64>,
    pub level_start_sp: Option<i64>,
    pub level_end_sp: Option<i64>,
    pub current_sp: Option<i64>,
    pub sp_per_minute: Option<f64>,
    pub primary_attribute: Option<i64>,
    pub secondary_attribute: Option<i64>,
    pub rank: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterAttributesResponse {
    pub charisma: i64,
    pub intelligence: i64,
    pub memory: i64,
    pub perception: i64,
    pub willpower: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterSkillQueue {
    pub character_id: i64,
    pub character_name: String,
    pub skill_queue: Vec<SkillQueueItem>,
    pub attributes: Option<CharacterAttributesResponse>,
}

fn create_authenticated_client(access_token: &str) -> Result<reqwest::Client> {
    let mut headers = HeaderMap::new();
    let auth_value = HeaderValue::from_str(&format!("Bearer {}", access_token))
        .context("Invalid access token")?;
    headers.insert(AUTHORIZATION, auth_value);

    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .context("Failed to build HTTP client")
}

async fn get_cached_skill_queue(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
) -> Result<Option<esi::CharactersCharacterIdSkillqueueGet>> {
    let endpoint_path = format!("characters/{}/skillqueue", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    let cached_entry = cache::get_cached_response(pool, &cache_key).await?;

    if let Some((cached_body, _)) = &cached_entry {
        let cached_data: esi::CharactersCharacterIdSkillqueueGet =
            serde_json::from_str(cached_body)
                .context("Failed to deserialize cached skill queue")?;
        return Ok(Some(cached_data));
    }

    let mut request = esi::GetCharactersCharacterIdSkillqueueRequest {
        character_id,
        x_compatibility_date: chrono::NaiveDate::from_ymd_opt(2020, 1, 1).unwrap(),
        ..Default::default()
    };

    if let Some((_, Some(etag))) = cached_entry {
        request.if_none_match = Some(etag);
    }

    let url = esi::BASE_URL
        .parse::<reqwest::Url>()
        .context("Invalid base URL")?
        .join(&request.render_path()?)
        .context("Failed to construct request URL")?;

    let mut req_builder = client.get(url);
    if let Some(value) = request.accept_language.as_ref() {
        let header_value = HeaderValue::from_str(value.as_str())?;
        req_builder = req_builder.header(ACCEPT_LANGUAGE, header_value);
    }
    if let Some(value) = request.if_none_match.as_ref() {
        let header_value = HeaderValue::from_str(value.as_str())?;
        req_builder = req_builder.header(IF_NONE_MATCH, header_value);
    }
    {
        let header_value =
            HeaderValue::from_str(&serde_plain::to_string(&request.x_compatibility_date)?)?;
        req_builder = req_builder.header("x-compatibility-date", header_value);
    }
    if let Some(value) = request.x_tenant.as_ref() {
        let header_value = HeaderValue::from_str(value.as_str())?;
        req_builder = req_builder.header("x-tenant", header_value);
    }

    let response = req_builder.send().await?;
    let status = response.status();
    let headers = response.headers().clone();

    if status.as_u16() == 304 {
        if let Some((cached_body, _)) = cache::get_cached_response(pool, &cache_key).await? {
            let cached_data: esi::CharactersCharacterIdSkillqueueGet =
                serde_json::from_str(&cached_body)
                    .context("Failed to deserialize cached skill queue")?;
            return Ok(Some(cached_data));
        }
    }

    if status.is_success() {
        let body_bytes = response.bytes().await?;
        let body_str = String::from_utf8_lossy(&body_bytes);

        let etag = cache::extract_etag(&headers);
        let expires_at = cache::extract_expires(&headers);

        cache::set_cached_response(pool, &cache_key, etag.as_deref(), expires_at, &body_str)
            .await?;

        let data: esi::CharactersCharacterIdSkillqueueGet =
            serde_json::from_str(&body_str).context("Failed to deserialize skill queue")?;
        return Ok(Some(data));
    }

    Ok(None)
}

async fn get_cached_character_attributes(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
) -> Result<Option<esi::CharactersCharacterIdAttributesGet>> {
    let endpoint_path = format!("characters/{}/attributes", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    let cached_entry = cache::get_cached_response(pool, &cache_key).await?;

    if let Some((cached_body, _)) = &cached_entry {
        let cached_data: esi::CharactersCharacterIdAttributesGet =
            serde_json::from_str(cached_body)
                .context("Failed to deserialize cached character attributes")?;

        db::set_character_attributes(
            pool,
            character_id,
            cached_data.charisma,
            cached_data.intelligence,
            cached_data.memory,
            cached_data.perception,
            cached_data.willpower,
            cached_data.bonus_remaps,
            cached_data
                .accrued_remap_cooldown_date
                .as_ref()
                .map(|d| d.to_rfc3339()),
            cached_data.last_remap_date.as_ref().map(|d| d.to_rfc3339()),
        )
        .await
        .ok();

        return Ok(Some(cached_data));
    }

    let mut request = esi::GetCharactersCharacterIdAttributesRequest {
        character_id,
        x_compatibility_date: chrono::NaiveDate::from_ymd_opt(2020, 1, 1).unwrap(),
        ..Default::default()
    };

    if let Some((_, Some(etag))) = cached_entry {
        request.if_none_match = Some(etag);
    }

    let url = esi::BASE_URL
        .parse::<reqwest::Url>()
        .context("Invalid base URL")?
        .join(&request.render_path()?)
        .context("Failed to construct request URL")?;

    let mut req_builder = client.get(url);
    if let Some(value) = request.accept_language.as_ref() {
        let header_value = HeaderValue::from_str(value.as_str())?;
        req_builder = req_builder.header(ACCEPT_LANGUAGE, header_value);
    }
    if let Some(value) = request.if_none_match.as_ref() {
        let header_value = HeaderValue::from_str(value.as_str())?;
        req_builder = req_builder.header(IF_NONE_MATCH, header_value);
    }
    {
        let header_value =
            HeaderValue::from_str(&serde_plain::to_string(&request.x_compatibility_date)?)?;
        req_builder = req_builder.header("x-compatibility-date", header_value);
    }
    if let Some(value) = request.x_tenant.as_ref() {
        let header_value = HeaderValue::from_str(value.as_str())?;
        req_builder = req_builder.header("x-tenant", header_value);
    }

    let response = req_builder.send().await?;
    let status = response.status();
    let headers = response.headers().clone();

    if status.as_u16() == 304 {
        if let Some((cached_body, _)) = cache::get_cached_response(pool, &cache_key).await? {
            let cached_data: esi::CharactersCharacterIdAttributesGet =
                serde_json::from_str(&cached_body)
                    .context("Failed to deserialize cached character attributes")?;
            return Ok(Some(cached_data));
        }
    }

    if status.is_success() {
        let body_bytes = response.bytes().await?;
        let body_str = String::from_utf8_lossy(&body_bytes);

        let etag = cache::extract_etag(&headers);
        let expires_at = cache::extract_expires(&headers);

        cache::set_cached_response(pool, &cache_key, etag.as_deref(), expires_at, &body_str)
            .await?;

        let data: esi::CharactersCharacterIdAttributesGet = serde_json::from_str(&body_str)
            .context("Failed to deserialize character attributes")?;

        db::set_character_attributes(
            pool,
            character_id,
            data.charisma,
            data.intelligence,
            data.memory,
            data.perception,
            data.willpower,
            data.bonus_remaps,
            data.accrued_remap_cooldown_date
                .as_ref()
                .map(|d| d.to_rfc3339()),
            data.last_remap_date.as_ref().map(|d| d.to_rfc3339()),
        )
        .await?;

        return Ok(Some(data));
    }

    Ok(None)
}

async fn get_cached_character_skills(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
) -> Result<Option<esi::CharactersCharacterIdSkillsGet>> {
    let endpoint_path = format!("characters/{}/skills", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    let cached_entry = cache::get_cached_response(pool, &cache_key).await?;

    if let Some((cached_body, _)) = &cached_entry {
        let cached_data: esi::CharactersCharacterIdSkillsGet =
            serde_json::from_str(cached_body)
                .context("Failed to deserialize cached character skills")?;

        let skills_data: Vec<(i64, i64, i64, i64)> = cached_data
            .skills
            .iter()
            .filter_map(|skill| {
                let obj = skill.as_object()?;
                Some((
                    obj.get("skill_id")?.as_i64()?,
                    obj.get("active_skill_level")?.as_i64()?,
                    obj.get("skillpoints_in_skill")?.as_i64()?,
                    obj.get("trained_skill_level")?.as_i64()?,
                ))
            })
            .collect();
        db::set_character_skills(pool, character_id, &skills_data)
            .await
            .ok();

        return Ok(Some(cached_data));
    }

    let mut request = esi::GetCharactersCharacterIdSkillsRequest {
        character_id,
        x_compatibility_date: chrono::NaiveDate::from_ymd_opt(2020, 1, 1).unwrap(),
        ..Default::default()
    };

    if let Some((_, Some(etag))) = cached_entry {
        request.if_none_match = Some(etag);
    }

    let url = esi::BASE_URL
        .parse::<reqwest::Url>()
        .context("Invalid base URL")?
        .join(&request.render_path()?)
        .context("Failed to construct request URL")?;

    let mut req_builder = client.get(url);
    if let Some(value) = request.accept_language.as_ref() {
        let header_value = HeaderValue::from_str(value.as_str())?;
        req_builder = req_builder.header(ACCEPT_LANGUAGE, header_value);
    }
    if let Some(value) = request.if_none_match.as_ref() {
        let header_value = HeaderValue::from_str(value.as_str())?;
        req_builder = req_builder.header(IF_NONE_MATCH, header_value);
    }
    {
        let header_value =
            HeaderValue::from_str(&serde_plain::to_string(&request.x_compatibility_date)?)?;
        req_builder = req_builder.header("x-compatibility-date", header_value);
    }
    if let Some(value) = request.x_tenant.as_ref() {
        let header_value = HeaderValue::from_str(value.as_str())?;
        req_builder = req_builder.header("x-tenant", header_value);
    }

    let response = req_builder.send().await?;
    let status = response.status();
    let headers = response.headers().clone();

    if status.as_u16() == 304 {
        if let Some((cached_body, _)) = cache::get_cached_response(pool, &cache_key).await? {
            let cached_data: esi::CharactersCharacterIdSkillsGet =
                serde_json::from_str(&cached_body)
                    .context("Failed to deserialize cached character skills")?;

            let skills_data: Vec<(i64, i64, i64, i64)> = cached_data
                .skills
                .iter()
                .filter_map(|skill| {
                    let obj = skill.as_object()?;
                    Some((
                        obj.get("skill_id")?.as_i64()?,
                        obj.get("active_skill_level")?.as_i64()?,
                        obj.get("skillpoints_in_skill")?.as_i64()?,
                        obj.get("trained_skill_level")?.as_i64()?,
                    ))
                })
                .collect();
            db::set_character_skills(pool, character_id, &skills_data)
                .await
                .ok();

            return Ok(Some(cached_data));
        }
    }

    if status.is_success() {
        let body_bytes = response.bytes().await?;
        let body_str = String::from_utf8_lossy(&body_bytes);

        let etag = cache::extract_etag(&headers);
        let expires_at = cache::extract_expires(&headers);

        cache::set_cached_response(pool, &cache_key, etag.as_deref(), expires_at, &body_str)
            .await?;

        let data: esi::CharactersCharacterIdSkillsGet = serde_json::from_str(&body_str)
            .context("Failed to deserialize character skills")?;

        let skills_data: Vec<(i64, i64, i64, i64)> = data
            .skills
            .iter()
            .filter_map(|skill| {
                let obj = skill.as_object()?;
                Some((
                    obj.get("skill_id")?.as_i64()?,
                    obj.get("active_skill_level")?.as_i64()?,
                    obj.get("skillpoints_in_skill")?.as_i64()?,
                    obj.get("trained_skill_level")?.as_i64()?,
                ))
            })
            .collect();
        db::set_character_skills(pool, character_id, &skills_data)
            .await
            .ok();

        return Ok(Some(data));
    }

    Ok(None)
}

async fn get_skill_names(
    pool: &db::Pool,
    skill_ids: &[i64],
) -> Result<HashMap<i64, String>, String> {
    if skill_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut skill_names = HashMap::new();

    for chunk in skill_ids.chunks(100) {
        let mut query_builder: QueryBuilder<Sqlite> =
            QueryBuilder::new("SELECT type_id, name FROM sde_types WHERE type_id IN (");

        let mut separated = query_builder.separated(", ");
        for skill_id in chunk {
            separated.push_bind(skill_id);
        }
        separated.push_unseparated(")");

        let query = query_builder.build();
        let rows = query
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query skill names: {}", e))?;

        for row in rows {
            let type_id: i64 = row.get(0);
            let name: String = row.get(1);
            skill_names.insert(type_id, name);
        }
    }

    Ok(skill_names)
}

#[derive(Debug, Clone)]
struct SkillAttributes {
    primary_attribute: Option<i64>,
    secondary_attribute: Option<i64>,
    rank: Option<i64>,
}

async fn get_skill_attributes(
    pool: &db::Pool,
    skill_ids: &[i64],
) -> Result<HashMap<i64, SkillAttributes>, String> {
    if skill_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut skill_attrs = HashMap::new();

    for chunk in skill_ids.chunks(100) {
        let mut query_builder: QueryBuilder<Sqlite> = QueryBuilder::new(
            r#"
            SELECT
                tda.type_id,
                MAX(CASE WHEN tda.attribute_id = 180 THEN tda.value END) as primary_attribute,
                MAX(CASE WHEN tda.attribute_id = 181 THEN tda.value END) as secondary_attribute,
                MAX(CASE WHEN tda.attribute_id = 275 THEN tda.value END) as rank
            FROM sde_type_dogma_attributes tda
            WHERE tda.type_id IN (
            "#,
        );

        let mut separated = query_builder.separated(", ");
        for skill_id in chunk {
            separated.push_bind(skill_id);
        }
        separated.push_unseparated(") GROUP BY tda.type_id");

        let query = query_builder.build();
        let rows = query
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query skill attributes: {}", e))?;

        for row in rows {
            let type_id: i64 = row.get(0);
            let primary: Option<f64> = row.get(1);
            let secondary: Option<f64> = row.get(2);
            let rank: Option<f64> = row.get(3);

            skill_attrs.insert(
                type_id,
                SkillAttributes {
                    primary_attribute: primary.map(|v| v as i64),
                    secondary_attribute: secondary.map(|v| v as i64),
                    rank: rank.map(|v| v as i64),
                },
            );
        }
    }

    Ok(skill_attrs)
}

fn calculate_sp_per_minute(primary: i64, secondary: i64) -> f64 {
    primary as f64 + (secondary as f64 / 2.0)
}

fn calculate_sp_for_level(rank: i64, level: i32) -> i64 {
    if level < 1 || level > 5 {
        return 0;
    }
    let base: f64 = 2.0;
    let exponent = 2.5 * (level as f64 - 1.0);
    let sp = base.powf(exponent) * 250.0 * rank as f64;
    sp as i64
}

#[tauri::command]
async fn get_skill_queues(pool: State<'_, db::Pool>) -> Result<Vec<CharacterSkillQueue>, String> {
    let characters = db::get_all_characters(&*pool)
        .await
        .map_err(|e| format!("Failed to get characters: {}", e))?;

    let mut results = Vec::new();
    let mut all_skill_ids = Vec::new();
    let mut character_skill_sp: HashMap<i64, HashMap<i64, i64>> = HashMap::new();

    for character in characters {
        let access_token =
            match auth::ensure_valid_access_token(&*pool, character.character_id).await {
                Ok(token) => token,
                Err(e) => {
                    eprintln!(
                        "Failed to get valid token for character {}: {}",
                        character.character_id, e
                    );
                    continue;
                }
            };

        let client = create_authenticated_client(&access_token)
            .map_err(|e| format!("Failed to create client: {}", e))?;

        let character_attributes =
            match get_cached_character_attributes(&*pool, &client, character.character_id).await {
                Ok(Some(attrs)) => Some(CharacterAttributesResponse {
                    charisma: attrs.charisma,
                    intelligence: attrs.intelligence,
                    memory: attrs.memory,
                    perception: attrs.perception,
                    willpower: attrs.willpower,
                }),
                Ok(None) => {
                    if let Ok(Some(cached_attrs)) =
                        db::get_character_attributes(&*pool, character.character_id).await
                    {
                        Some(CharacterAttributesResponse {
                            charisma: cached_attrs.charisma,
                            intelligence: cached_attrs.intelligence,
                            memory: cached_attrs.memory,
                            perception: cached_attrs.perception,
                            willpower: cached_attrs.willpower,
                        })
                    } else {
                        None
                    }
                }
                Err(e) => {
                    eprintln!(
                        "Failed to fetch attributes for character {}: {}",
                        character.character_id, e
                    );
                    if let Ok(Some(cached_attrs)) =
                        db::get_character_attributes(&*pool, character.character_id).await
                    {
                        Some(CharacterAttributesResponse {
                            charisma: cached_attrs.charisma,
                            intelligence: cached_attrs.intelligence,
                            memory: cached_attrs.memory,
                            perception: cached_attrs.perception,
                            willpower: cached_attrs.willpower,
                        })
                    } else {
                        None
                    }
                }
            };

        get_cached_character_skills(&*pool, &client, character.character_id)
            .await
            .ok();
        let mut skill_sp_map: HashMap<i64, i64> = HashMap::new();
        if let Ok(skills) = db::get_character_skills(&*pool, character.character_id).await {
            for skill in skills {
                skill_sp_map.insert(skill.skill_id, skill.skillpoints_in_skill);
            }
        }
        character_skill_sp.insert(character.character_id, skill_sp_map);

        match get_cached_skill_queue(&*pool, &client, character.character_id).await {
            Ok(Some(queue_data)) => {
                let skill_queue: Vec<SkillQueueItem> = queue_data
                    .into_iter()
                    .filter_map(|item| {
                        let obj = item.as_object()?;
                        let skill_id = obj.get("skill_id")?.as_i64()?;
                        let queue_pos = obj.get("queue_position")?.as_i64()? as i32;
                        all_skill_ids.push(skill_id);
                        Some(SkillQueueItem {
                            skill_id,
                            skill_name: None,
                            queue_position: queue_pos,
                            finished_level: obj.get("finished_level")?.as_i64()? as i32,
                            start_date: obj
                                .get("start_date")
                                .and_then(|v| v.as_str())
                                .map(String::from),
                            finish_date: obj
                                .get("finish_date")
                                .and_then(|v| v.as_str())
                                .map(String::from),
                            training_start_sp: obj
                                .get("training_start_sp")
                                .and_then(|v| v.as_i64()),
                            level_start_sp: obj.get("level_start_sp").and_then(|v| v.as_i64()),
                            level_end_sp: obj.get("level_end_sp").and_then(|v| v.as_i64()),
                            current_sp: None,
                            sp_per_minute: None,
                            primary_attribute: None,
                            secondary_attribute: None,
                            rank: None,
                        })
                    })
                    .collect();

                results.push(CharacterSkillQueue {
                    character_id: character.character_id,
                    character_name: character.character_name,
                    skill_queue,
                    attributes: character_attributes,
                });
            }
            Ok(None) => {
                eprintln!(
                    "Failed to fetch skill queue for character {}: No data returned",
                    character.character_id
                );
            }
            Err(e) => {
                eprintln!(
                    "Failed to fetch skill queue for character {}: {}",
                    character.character_id, e
                );
            }
        }
    }

    let unique_skill_ids: Vec<i64> = all_skill_ids
        .iter()
        .copied()
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let skill_names = get_skill_names(&*pool, &unique_skill_ids)
        .await
        .map_err(|e| format!("Failed to get skill names: {}", e))?;
    let skill_attributes = get_skill_attributes(&*pool, &unique_skill_ids)
        .await
        .map_err(|e| format!("Failed to get skill attributes: {}", e))?;

    for result in &mut results {
        let char_attrs = &result.attributes;
        let mut skill_progress_map: HashMap<i64, i64> = HashMap::new();
        let skill_known_sp = character_skill_sp
            .get(&result.character_id)
            .map(|m| m.clone())
            .unwrap_or_default();
        for skill_item in &mut result.skill_queue {
            if let Some(name) = skill_names.get(&skill_item.skill_id) {
                skill_item.skill_name = Some(name.clone());
            }

            let known_sp = skill_known_sp.get(&skill_item.skill_id).copied();
            let current_tracker = skill_progress_map.get(&skill_item.skill_id).copied();

            let is_currently_training = skill_item.queue_position == 0 || {
                let now = chrono::Utc::now();
                if let (Some(start_str), Some(finish_str)) = (&skill_item.start_date, &skill_item.finish_date) {
                    if let (Ok(start), Ok(finish)) = (
                        chrono::DateTime::parse_from_rfc3339(start_str),
                        chrono::DateTime::parse_from_rfc3339(finish_str),
                    ) {
                        let start_utc = start.with_timezone(&chrono::Utc);
                        let finish_utc = finish.with_timezone(&chrono::Utc);
                        now >= start_utc && now < finish_utc
                    } else {
                        false
                    }
                } else {
                    false
                }
            };


            let mut progress_sp = if is_currently_training {
                let base_sp = known_sp
                    .or(skill_item.training_start_sp)
                    .or(skill_item.level_start_sp)
                    .unwrap_or(0);

                if let (Some(start_str), Some(finish_str)) = (
                    &skill_item.start_date,
                    &skill_item.finish_date,
                ) {
                    if let (Ok(start), Ok(finish)) = (
                        chrono::DateTime::parse_from_rfc3339(start_str),
                        chrono::DateTime::parse_from_rfc3339(finish_str),
                    ) {
                        let start_utc = start.with_timezone(&chrono::Utc);
                        let finish_utc = finish.with_timezone(&chrono::Utc);
                        let now = chrono::Utc::now();

                        if now >= start_utc && now < finish_utc {
                            let total_duration = (finish_utc - start_utc).num_seconds() as f64;
                            let elapsed_duration = (now - start_utc).num_seconds() as f64;

                            if total_duration > 0.0 && elapsed_duration > 0.0 {
                                let total_sp_needed = skill_item.level_end_sp.unwrap_or(0) - skill_item.level_start_sp.unwrap_or(0);
                                let progress_ratio = elapsed_duration / total_duration;
                                let sp_gained = (total_sp_needed as f64 * progress_ratio) as i64;
                                let calculated_sp = base_sp + sp_gained;

                                if let Some(level_end) = skill_item.level_end_sp {
                                    if calculated_sp > level_end {
                                        level_end
                                    } else {
                                        calculated_sp
                                    }
                                } else {
                                    calculated_sp
                                }
                            } else {
                                base_sp
                            }
                        } else {
                            base_sp
                        }
                    } else {
                        base_sp
                    }
                } else {
                    base_sp
                }
            } else {
                current_tracker
                    .or(known_sp)
                    .or(skill_item.training_start_sp)
                    .or(skill_item.level_start_sp)
                    .unwrap_or(0)
            };


            if is_currently_training {
                if let Some(level_end) = skill_item.level_end_sp {
                    if progress_sp > level_end {
                        progress_sp = level_end;
                    }
                }
            } else {
                if let Some(level_start) = skill_item.level_start_sp {
                    if progress_sp < level_start {
                        progress_sp = level_start;
                    }
                }
                if let Some(level_end) = skill_item.level_end_sp {
                    if progress_sp > level_end {
                        progress_sp = level_end;
                    }
                }
            }

            skill_item.current_sp = Some(progress_sp);

            if let Some(level_end) = skill_item.level_end_sp {
                let next_progress = std::cmp::max(progress_sp, level_end);
                skill_progress_map.insert(skill_item.skill_id, next_progress);
            } else {
                skill_progress_map.insert(skill_item.skill_id, progress_sp);
            }

            if let Some(skill_attr) = skill_attributes.get(&skill_item.skill_id) {
                skill_item.primary_attribute = skill_attr.primary_attribute;
                skill_item.secondary_attribute = skill_attr.secondary_attribute;
                skill_item.rank = skill_attr.rank;

                if let Some(attrs) = char_attrs {
                    if let (Some(primary_attr_id), Some(secondary_attr_id)) =
                        (skill_attr.primary_attribute, skill_attr.secondary_attribute)
                    {
                        let primary_value = match primary_attr_id {
                            164 => attrs.charisma,     // Charisma dogma attribute
                            165 => attrs.intelligence, // Intelligence dogma attribute
                            166 => attrs.memory,       // Memory dogma attribute
                            167 => attrs.perception,   // Perception dogma attribute
                            168 => attrs.willpower,    // Willpower dogma attribute
                            _ => {
                                eprintln!(
                                    "Unknown primary attribute ID: {} for skill {}",
                                    primary_attr_id, skill_item.skill_id
                                );
                                0
                            }
                        };
                        let secondary_value = match secondary_attr_id {
                            164 => attrs.charisma,     // Charisma dogma attribute
                            165 => attrs.intelligence, // Intelligence dogma attribute
                            166 => attrs.memory,       // Memory dogma attribute
                            167 => attrs.perception,   // Perception dogma attribute
                            168 => attrs.willpower,    // Willpower dogma attribute
                            _ => {
                                eprintln!(
                                    "Unknown secondary attribute ID: {} for skill {}",
                                    secondary_attr_id, skill_item.skill_id
                                );
                                0
                            }
                        };
                        let sp_per_min = calculate_sp_per_minute(primary_value, secondary_value);
                        skill_item.sp_per_minute = Some(sp_per_min);

                    }
                }
            }
        }
    }

    Ok(results)
}

pub async fn handle_oauth_callback(
    app: tauri::AppHandle,
    code: String,
    state: String,
    callback_url: &str,
) -> Result<()> {
    let auth_states = app.state::<AuthStateMap>();
    let pool = app.state::<db::Pool>();

    let code_verifier = {
        let mut auth_states_guard = auth_states
            .lock()
            .map_err(|e| anyhow::anyhow!("Failed to lock auth state: {}", e))?;
        let auth_state = auth_states_guard
            .remove(&state)
            .ok_or_else(|| anyhow::anyhow!("Invalid state parameter"))?;
        auth_state.code_verifier
    };

    let client_id =
        std::env::var("EVE_CLIENT_ID").context("EVE_CLIENT_ID environment variable not set")?;

    let token_response =
        auth::exchange_code_for_tokens(&client_id, &code, &code_verifier, callback_url)
            .await
            .context("Failed to exchange code for tokens")?;

    let character_info = auth::extract_character_from_jwt(&token_response.access_token)
        .context("Failed to extract character info from JWT")?;

    let expires_at = Utc::now().timestamp() + token_response.expires_in;

    let existing_character = db::get_character(&*pool, character_info.character_id).await?;

    if existing_character.is_none() {
        db::add_character(
            &*pool,
            character_info.character_id,
            &character_info.character_name,
        )
        .await
        .context("Failed to add character")?;
    } else {
        db::update_character(
            &*pool,
            character_info.character_id,
            &character_info.character_name,
        )
        .await
        .context("Failed to update character")?;
    }

    let existing_tokens = db::get_tokens(&*pool, character_info.character_id).await?;

    if existing_tokens.is_none() {
        db::set_tokens(
            &*pool,
            character_info.character_id,
            &token_response.access_token,
            &token_response.refresh_token,
            expires_at,
        )
        .await
        .context("Failed to set tokens")?;
    } else {
        db::update_tokens(
            &*pool,
            character_info.character_id,
            &token_response.access_token,
            &token_response.refresh_token,
            expires_at,
        )
        .await
        .context("Failed to update tokens")?;
    }

    println!(
        "Authentication successful for character: {} (ID: {})",
        character_info.character_name, character_info.character_id
    );

    // Small delay to ensure frontend listeners are ready
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Emit to all windows
    println!(
        "Emitting auth-success event with character_id: {}",
        character_info.character_id
    );
    match app.emit("auth-success", character_info.character_id) {
        Ok(_) => println!("Auth success event emitted successfully"),
        Err(e) => {
            eprintln!("Failed to emit auth success event: {}", e);
            return Err(anyhow::anyhow!("Failed to emit auth success event: {}", e));
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            tauri::async_runtime::block_on(async {
                let pool = db::init_db(&app.handle()).await?;
                app.manage(pool);
                app.manage(AuthStateMap::default());

                // Kick off background SDE import/refresh
                let pool = app.state::<db::Pool>().inner().clone();
                let app_handle_for_sde = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    match sde::ensure_latest(&app_handle_for_sde, &pool).await {
                        Ok(_) => eprintln!("SDE import completed successfully"),
                        Err(err) => eprintln!("SDE import failed: {:#}", err),
                    }
                });

                // Start HTTP callback server for dev mode (if using HTTP callback)
                let callback_url = std::env::var("EVE_CALLBACK_URL")
                    .unwrap_or_else(|_| "http://localhost:1421/callback".to_string());

                if callback_url.starts_with("http://") {
                    let app_handle = app.handle().clone();
                    let port = callback_url
                        .strip_prefix("http://localhost:")
                        .and_then(|s| s.split('/').next())
                        .and_then(|s| s.parse::<u16>().ok())
                        .unwrap_or(1421);

                    tauri::async_runtime::spawn(async move {
                        if let Err(e) =
                            auth::callback_server::CallbackServer::start(port, app_handle).await
                        {
                            eprintln!(
                                "Callback server error (this is OK if server already running): {}",
                                e
                            );
                        }
                    });
                }

                let app_handle = app.handle().clone();
                app_handle
                    .clone()
                    .listen("deep-link://new-url", move |event| {
                        let url_str = event.payload();
                        if url_str.starts_with("eveauth-skillmon://callback") {
                            let url = url::Url::parse(url_str).ok();
                            if let Some(url) = url {
                                let code = url
                                    .query_pairs()
                                    .find(|(key, _)| key == "code")
                                    .map(|(_, value)| value.to_string());
                                let state = url
                                    .query_pairs()
                                    .find(|(key, _)| key == "state")
                                    .map(|(_, value)| value.to_string());

                                if let (Some(code), Some(state)) = (code, state) {
                                    let app_handle = app_handle.clone();
                                    let callback_url = "eveauth-skillmon://callback".to_string();
                                    tauri::async_runtime::spawn(async move {
                                        if let Err(e) = handle_oauth_callback(
                                            app_handle.clone(),
                                            code,
                                            state,
                                            &callback_url,
                                        )
                                        .await
                                        {
                                            let _ = app_handle.emit("auth-error", e.to_string());
                                        }
                                    });
                                }
                            }
                        }
                    });

                Ok(())
            })
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            start_eve_login,
            get_characters,
            logout_character,
            get_skill_queues,
            refresh_sde
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
