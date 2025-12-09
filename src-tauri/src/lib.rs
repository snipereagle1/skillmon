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

    let scopes = [
        "esi-skills.read_skills.v1",
        "esi-skills.read_skillqueue.v1",
        "esi-clones.read_clones.v1",
        "esi-clones.read_implants.v1",
        "esi-universe.read_structures.v1",
    ];

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

#[derive(Debug, Clone, Serialize)]
pub struct CharacterSkillResponse {
    pub skill_id: i64,
    pub skill_name: String,
    pub group_id: i64,
    pub group_name: String,
    pub trained_skill_level: i64,
    pub active_skill_level: i64,
    pub skillpoints_in_skill: i64,
    pub is_in_queue: bool,
    pub queue_level: Option<i64>,
    pub is_injected: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillGroupResponse {
    pub group_id: i64,
    pub group_name: String,
    pub total_levels: i64,
    pub trained_levels: i64,
    pub has_trained_skills: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterSkillsResponse {
    pub character_id: i64,
    pub skills: Vec<CharacterSkillResponse>,
    pub groups: Vec<SkillGroupResponse>,
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

async fn get_type_names(
    pool: &db::Pool,
    type_ids: &[i64],
) -> Result<HashMap<i64, String>, String> {
    if type_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut type_names = HashMap::new();

    for chunk in type_ids.chunks(100) {
        let mut query_builder: QueryBuilder<Sqlite> =
            QueryBuilder::new("SELECT type_id, name FROM sde_types WHERE type_id IN (");

        let mut separated = query_builder.separated(", ");
        for type_id in chunk {
            separated.push_bind(type_id);
        }
        separated.push_unseparated(")");

        let query = query_builder.build();
        let rows = query
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query type names: {}", e))?;

        for row in rows {
            let type_id: i64 = row.get(0);
            let name: String = row.get(1);
            type_names.insert(type_id, name);
        }
    }

    Ok(type_names)
}

async fn get_cached_character_clones(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
) -> Result<Option<esi::CharactersCharacterIdClonesGet>> {
    let endpoint_path = format!("characters/{}/clones", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    let cached_entry = cache::get_cached_response(pool, &cache_key).await?;

    if let Some((cached_body, _)) = &cached_entry {
        let cached_data: esi::CharactersCharacterIdClonesGet =
            serde_json::from_str(cached_body)
                .context("Failed to deserialize cached clones")?;
        return Ok(Some(cached_data));
    }

    let mut request = esi::GetCharactersCharacterIdClonesRequest {
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
            let cached_data: esi::CharactersCharacterIdClonesGet =
                serde_json::from_str(&cached_body)
                    .context("Failed to deserialize cached clones")?;
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

        let data: esi::CharactersCharacterIdClonesGet =
            serde_json::from_str(&body_str).context("Failed to deserialize clones")?;
        return Ok(Some(data));
    }

    Ok(None)
}

async fn get_cached_character_implants(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
) -> Result<Option<esi::CharactersCharacterIdImplantsGet>> {
    let endpoint_path = format!("characters/{}/implants", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    let cached_entry = cache::get_cached_response(pool, &cache_key).await?;

    if let Some((cached_body, _)) = &cached_entry {
        let cached_data: esi::CharactersCharacterIdImplantsGet =
            serde_json::from_str(cached_body)
                .context("Failed to deserialize cached implants")?;
        return Ok(Some(cached_data));
    }

    let mut request = esi::GetCharactersCharacterIdImplantsRequest {
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
            let cached_data: esi::CharactersCharacterIdImplantsGet =
                serde_json::from_str(&cached_body)
                    .context("Failed to deserialize cached implants")?;
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

        let data: esi::CharactersCharacterIdImplantsGet =
            serde_json::from_str(&body_str).context("Failed to deserialize implants")?;
        return Ok(Some(data));
    }

    Ok(None)
}

async fn get_cached_station_info(
    pool: &db::Pool,
    client: &reqwest::Client,
    station_id: i64,
) -> Result<Option<esi::UniverseStationsStationIdGet>> {
    let endpoint_path = format!("universe/stations/{}", station_id);
    let cache_key = format!("{}:0", endpoint_path);

    let cached_entry = cache::get_cached_response(pool, &cache_key).await?;

    if let Some((cached_body, _)) = &cached_entry {
        let cached_data: esi::UniverseStationsStationIdGet =
            serde_json::from_str(cached_body)
                .context("Failed to deserialize cached station info")?;
        return Ok(Some(cached_data));
    }

    let mut request = esi::GetUniverseStationsStationIdRequest {
        station_id,
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
            let cached_data: esi::UniverseStationsStationIdGet =
                serde_json::from_str(&cached_body)
                    .context("Failed to deserialize cached station info")?;
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

        let data: esi::UniverseStationsStationIdGet =
            serde_json::from_str(&body_str).context("Failed to deserialize station info")?;
        return Ok(Some(data));
    }

    Ok(None)
}

async fn get_cached_structure_info(
    pool: &db::Pool,
    client: &reqwest::Client,
    structure_id: i64,
) -> Result<Option<esi::UniverseStructuresStructureIdGet>> {
    let endpoint_path = format!("universe/structures/{}", structure_id);
    let cache_key = format!("{}:0", endpoint_path);

    let cached_entry = cache::get_cached_response(pool, &cache_key).await?;

    if let Some((cached_body, _)) = &cached_entry {
        let cached_data: esi::UniverseStructuresStructureIdGet =
            serde_json::from_str(cached_body)
                .context("Failed to deserialize cached structure info")?;
        return Ok(Some(cached_data));
    }

    let mut request = esi::GetUniverseStructuresStructureIdRequest {
        structure_id,
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
            let cached_data: esi::UniverseStructuresStructureIdGet =
                serde_json::from_str(&cached_body)
                    .context("Failed to deserialize cached structure info")?;
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

        let data: esi::UniverseStructuresStructureIdGet =
            serde_json::from_str(&body_str).context("Failed to deserialize structure info")?;
        return Ok(Some(data));
    }

    Ok(None)
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

#[derive(Debug, Clone, Serialize)]
struct CloneResponse {
    id: i64,
    character_id: i64,
    clone_id: Option<i64>,
    name: Option<String>,
    location_type: String,
    location_id: i64,
    location_name: String,
    is_current: bool,
    implants: Vec<i64>,
}

#[tauri::command]
async fn get_clones(
    pool: State<'_, db::Pool>,
    character_id: i64,
) -> Result<Vec<CloneResponse>, String> {
    let access_token = auth::ensure_valid_access_token(&*pool, character_id)
        .await
        .map_err(|e| format!("Failed to get valid token: {}", e))?;

    let client = create_authenticated_client(&access_token)
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let clones_data = get_cached_character_clones(&*pool, &client, character_id)
        .await
        .map_err(|e| format!("Failed to fetch clones: {}", e))?
        .ok_or_else(|| "No clones data returned".to_string())?;

    let current_implants = get_cached_character_implants(&*pool, &client, character_id)
        .await
        .map_err(|e| format!("Failed to fetch implants: {}", e))?
        .unwrap_or_default();

    let mut clones_to_store = Vec::new();
    let mut current_clone_matched = false;

    for jump_clone in &clones_data.jump_clones {
        if let Some(obj) = jump_clone.as_object() {
            let clone_id = obj.get("jump_clone_id").and_then(|v| v.as_i64());
            let location_id = obj.get("location_id").and_then(|v| v.as_i64()).unwrap_or(0);
            let location_type_str = obj.get("location_type")
                .and_then(|v| v.as_str())
                .unwrap_or("station");
            let implants = obj.get("implants")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_i64()).collect::<Vec<_>>())
                .unwrap_or_default();

            let location_name = resolve_clone_location(
                &*pool,
                &client,
                location_type_str,
                location_id,
                character_id,
            ).await.unwrap_or_else(|_| "Unknown Location".to_string());

            clones_to_store.push((
                clone_id,
                None,
                location_type_str.to_string(),
                location_id,
                Some(location_name.clone()),
                false,
                implants.clone(),
            ));
        }
    }

    let mut current_implants_sorted = current_implants.clone();
    current_implants_sorted.sort();

    if let Some(home_location) = &clones_data.home_location {
        if let (Some(location_id), Some(location_type)) = (
            home_location.location_id,
            home_location.location_type.as_ref(),
        ) {
            let location_type_str = match location_type {
                esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Station => "station",
                esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Structure => "structure",
            };

            let location_name = resolve_clone_location(
                &*pool,
                &client,
                location_type_str,
                location_id,
                character_id,
            ).await.unwrap_or_else(|_| "Unknown Location".to_string());

            if !current_implants_sorted.is_empty() {
                let matched_clone_id = db::find_clone_by_implants(
                    &*pool,
                    character_id,
                    &current_implants_sorted,
                ).await.map_err(|e| format!("Failed to find clone by implants: {}", e))?;

                if let Some(matched_id) = matched_clone_id {
                    sqlx::query("UPDATE clones SET location_type = ?, location_id = ?, location_name = ?, is_current = 1 WHERE id = ?")
                        .bind(location_type_str)
                        .bind(location_id)
                        .bind(&location_name)
                        .bind(matched_id)
                        .execute(&*pool)
                        .await
                        .map_err(|e| format!("Failed to update matched clone: {}", e))?;
                    current_clone_matched = true;
                } else {
                    clones_to_store.push((
                        None,
                        None,
                        location_type_str.to_string(),
                        location_id,
                        Some(location_name),
                        true,
                        current_implants_sorted,
                    ));
                }
            }
        }
    }

    if !current_clone_matched && !current_implants_sorted.is_empty() {
        let matched_clone_id = db::find_clone_by_implants(
            &*pool,
            character_id,
            &current_implants_sorted,
        ).await.map_err(|e| format!("Failed to find clone by implants: {}", e))?;

        if let Some(matched_id) = matched_clone_id {
            sqlx::query("UPDATE clones SET is_current = 1 WHERE id = ?")
                .bind(matched_id)
                .execute(&*pool)
                .await
                .map_err(|e| format!("Failed to update matched clone: {}", e))?;
        } else if let Some(home_location) = &clones_data.home_location {
            if let (Some(location_id), Some(location_type)) = (
                home_location.location_id,
                home_location.location_type.as_ref(),
            ) {
                let location_type_str = match location_type {
                    esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Station => "station",
                    esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Structure => "structure",
                };

                let location_name = resolve_clone_location(
                    &*pool,
                    &client,
                    location_type_str,
                    location_id,
                    character_id,
                ).await.unwrap_or_else(|_| "Unknown Location".to_string());

                clones_to_store.push((
                    None,
                    None,
                    location_type_str.to_string(),
                    location_id,
                    Some(location_name),
                    true,
                    current_implants_sorted,
                ));
            }
        }
    }

    db::set_character_clones(&*pool, character_id, &clones_to_store)
        .await
        .map_err(|e| format!("Failed to store clones: {}", e))?;

    let stored_clones = db::get_character_clones(&*pool, character_id)
        .await
        .map_err(|e| format!("Failed to get stored clones: {}", e))?;

    let mut result = Vec::new();
    for clone in stored_clones {
        let implants = db::get_clone_implants(&*pool, clone.id)
            .await
            .map_err(|e| format!("Failed to get clone implants: {}", e))?
            .into_iter()
            .map(|i| i.implant_type_id)
            .collect();

        result.push(CloneResponse {
            id: clone.id,
            character_id: clone.character_id,
            clone_id: clone.clone_id,
            name: clone.name,
            location_type: clone.location_type,
            location_id: clone.location_id,
            location_name: clone.location_name.unwrap_or_else(|| "Unknown".to_string()),
            is_current: clone.is_current,
            implants,
        });
    }

    Ok(result)
}

async fn resolve_clone_location(
    pool: &db::Pool,
    client: &reqwest::Client,
    location_type: &str,
    location_id: i64,
    character_id: i64,
) -> Result<String> {
    match location_type {
        "station" => {
            if let Some(station) = get_cached_station_info(pool, client, location_id).await? {
                Ok(format!("{} - {}", station.system_id, station.name))
            } else {
                Ok(format!("Station {}", location_id))
            }
        }
        "structure" => {
            match get_cached_structure_info(pool, client, location_id).await {
                Ok(Some(structure)) => {
                    Ok(format!("{} - {}", structure.solar_system_id, structure.name))
                }
                Ok(None) => Ok("Inaccessible Structure".to_string()),
                Err(_) => Ok("Inaccessible Structure".to_string()),
            }
        }
        _ => Ok(format!("Unknown Location {}", location_id)),
    }
}

#[tauri::command]
async fn update_clone_name(
    pool: State<'_, db::Pool>,
    clone_id: i64,
    name: Option<String>,
) -> Result<(), String> {
    db::update_clone_name(&*pool, clone_id, name.as_deref())
        .await
        .map_err(|e| format!("Failed to update clone name: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn get_type_names(
    pool: State<'_, db::Pool>,
    type_ids: Vec<i64>,
) -> Result<HashMap<i64, String>, String> {
    get_type_names(&*pool, &type_ids).await
}

#[tauri::command]
async fn get_character_skills_with_groups(
    pool: State<'_, db::Pool>,
    character_id: i64,
) -> Result<CharacterSkillsResponse, String> {
    const SKILL_CATEGORY_ID: i64 = 16;

    // Get all skill groups for the Skill category
    let skill_groups = db::get_skill_groups_for_category(&*pool, SKILL_CATEGORY_ID)
        .await
        .map_err(|e| format!("Failed to get skill groups: {}", e))?;

    // Get character's trained skills
    let character_skills = db::get_character_skills(&*pool, character_id)
        .await
        .map_err(|e| format!("Failed to get character skills: {}", e))?;
    let character_skills_map: HashMap<i64, db::CharacterSkill> = character_skills
        .into_iter()
        .map(|s| (s.skill_id, s))
        .collect();

    // Get character's skill queue to check which skills are queued
    // Try to get from cache first, fall back to empty if we can't get token
    let queued_skills: HashMap<i64, i64> = {
        let mut result = HashMap::new();
        if let Ok(access_token) = auth::ensure_valid_access_token(&*pool, character_id).await {
            if let Ok(client) = create_authenticated_client(&access_token) {
                if let Ok(Some(queue_data)) = get_cached_skill_queue(&*pool, &client, character_id).await {
                    for item in queue_data {
                        if let Some(obj) = item.as_object() {
                            if let (Some(skill_id), Some(finished_level)) = (
                                obj.get("skill_id").and_then(|v| v.as_i64()),
                                obj.get("finished_level").and_then(|v| v.as_i64()),
                            ) {
                                result.insert(skill_id, finished_level);
                            }
                        }
                    }
                }
            }
        }
        result
    };

    // Get all skills in each group from SDE
    let mut all_skill_ids = Vec::new();
    let mut skills_by_group: HashMap<i64, Vec<(i64, String)>> = HashMap::new();

    for group in &skill_groups {
        let skills_in_group: Vec<(i64, String)> = sqlx::query_as::<_, (i64, String)>(
            "SELECT type_id, name FROM sde_types WHERE group_id = ? AND published = 1 ORDER BY name",
        )
        .bind(group.group_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| format!("Failed to get skills for group {}: {}", group.group_id, e))?;

        for (skill_id, _) in &skills_in_group {
            all_skill_ids.push(*skill_id);
        }
        skills_by_group.insert(group.group_id, skills_in_group);
    }

    // Skill names are already retrieved in the skills_by_group query above

    // Build response
    let mut skills_response = Vec::new();
    let mut groups_response = Vec::new();

    for group in &skill_groups {
        let skills_in_group = skills_by_group.get(&group.group_id).cloned().unwrap_or_default();
        let mut total_levels = 0i64;
        let mut trained_levels = 0i64;
        let mut has_trained_skills = false;

        for (skill_id, skill_name) in &skills_in_group {
            total_levels += 5; // Each skill has 5 levels

            let char_skill = character_skills_map.get(skill_id);
            let trained_level = char_skill.map(|s| s.trained_skill_level).unwrap_or(0);
            let active_level = char_skill.map(|s| s.active_skill_level).unwrap_or(0);
            let skillpoints = char_skill.map(|s| s.skillpoints_in_skill).unwrap_or(0);
            let is_injected = char_skill.is_some();
            let is_in_queue = queued_skills.contains_key(skill_id);
            let queue_level = queued_skills.get(skill_id).copied();

            if trained_level > 0 {
                trained_levels += trained_level;
                has_trained_skills = true;
            }

            let final_skill_name = skill_name.clone();

            skills_response.push(CharacterSkillResponse {
                skill_id: *skill_id,
                skill_name: final_skill_name,
                group_id: group.group_id,
                group_name: group.group_name.clone(),
                trained_skill_level: trained_level,
                active_skill_level: active_level,
                skillpoints_in_skill: skillpoints,
                is_in_queue: is_in_queue,
                queue_level: queue_level,
                is_injected: is_injected,
            });
        }

        groups_response.push(SkillGroupResponse {
            group_id: group.group_id,
            group_name: group.group_name.clone(),
            total_levels,
            trained_levels,
            has_trained_skills,
        });
    }

    Ok(CharacterSkillsResponse {
        character_id,
        skills: skills_response,
        groups: groups_response,
    })
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
            get_character_skills_with_groups,
            refresh_sde,
            get_clones,
            update_clone_name,
            get_type_names
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
