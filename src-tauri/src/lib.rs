use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc, Mutex,
};

use anyhow::{Context, Result};
use chrono::{NaiveDateTime, Utc};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde::Serialize;
use sqlx::{QueryBuilder, Row, Sqlite};
use tauri::{Emitter, Listener, Manager, State};

mod auth;
mod cache;
mod db;
mod esi;
mod sde;

type AuthStateMap = Mutex<HashMap<String, auth::AuthState>>;
type StartupState = Arc<AtomicU8>; // 0 = complete, 1 = in progress

// EVE_CLIENT_ID is embedded at compile time from environment variable if available,
// otherwise falls back to runtime environment variable
pub fn get_eve_client_id() -> Result<String> {
    // Try compile-time embedded value first (set during CI builds)
    if let Some(compile_time_id) = option_env!("EVE_CLIENT_ID") {
        return Ok(compile_time_id.to_string());
    }
    // Fall back to runtime environment variable (for local development)
    std::env::var("EVE_CLIENT_ID").context("EVE_CLIENT_ID environment variable not set")
}

// Must match NOTIFICATION_TYPES.SKILL_QUEUE_LOW in src/lib/notificationTypes.ts
pub const NOTIFICATION_TYPE_SKILL_QUEUE_LOW: &str = "skill_queue_low";

#[derive(Debug, Clone, Serialize)]
pub struct Character {
    pub character_id: i64,
    pub character_name: String,
    pub unallocated_sp: i64,
}

impl From<db::Character> for Character {
    fn from(c: db::Character) -> Self {
        Character {
            character_id: c.character_id,
            character_name: c.character_name,
            unallocated_sp: c.unallocated_sp,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RateLimitResponse {
    pub group: String,
    pub limit: i32,
    pub remaining: i32,
    pub window_minutes: i32,
    pub updated_at: String,
}

impl From<&esi::RateLimitInfo> for RateLimitResponse {
    fn from(r: &esi::RateLimitInfo) -> Self {
        RateLimitResponse {
            group: r.group.clone(),
            limit: r.limit,
            remaining: r.remaining,
            window_minutes: r.window_minutes,
            updated_at: r.updated_at.to_rfc3339(),
        }
    }
}

#[tauri::command]
async fn start_eve_login(
    app: tauri::AppHandle,
    auth_states: State<'_, AuthStateMap>,
) -> Result<String, String> {
    let client_id = get_eve_client_id().map_err(|e| e.to_string())?;
    // Use HTTP callback for dev mode, deep link for production (can be overridden with env var)
    let callback_url = std::env::var("EVE_CALLBACK_URL").unwrap_or_else(|_| {
        if tauri::is_dev() {
            "http://localhost:1421/callback".to_string()
        } else {
            "eveauth-skillmon://callback".to_string()
        }
    });

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
async fn is_startup_complete(startup_state: State<'_, StartupState>) -> Result<bool, String> {
    Ok(startup_state.load(Ordering::SeqCst) == 0)
}

#[tauri::command]
async fn get_characters(pool: State<'_, db::Pool>) -> Result<Vec<Character>, String> {
    db::get_all_characters(&pool)
        .await
        .map(|chars| chars.into_iter().map(Character::from).collect())
        .map_err(|e| format!("Failed to get characters: {}", e))
}

#[tauri::command]
async fn logout_character(pool: State<'_, db::Pool>, character_id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM tokens WHERE character_id = ?")
        .bind(character_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete tokens: {}", e))?;

    db::delete_character(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to delete character: {}", e))
}

#[tauri::command]
async fn refresh_sde(app: tauri::AppHandle, pool: State<'_, db::Pool>) -> Result<(), String> {
    sde::force_refresh(&app, &pool)
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
pub struct AttributeBreakdown {
    pub base: i64,
    pub implants: i64,
    pub remap: i64,
    pub accelerator: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterAttributesBreakdown {
    pub charisma: AttributeBreakdown,
    pub intelligence: AttributeBreakdown,
    pub memory: AttributeBreakdown,
    pub perception: AttributeBreakdown,
    pub willpower: AttributeBreakdown,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterSkillQueue {
    pub character_id: i64,
    pub character_name: String,
    pub skill_queue: Vec<SkillQueueItem>,
    pub attributes: Option<CharacterAttributesResponse>,
    pub unallocated_sp: i64,
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

#[derive(Debug, Clone, Serialize)]
pub struct NotificationResponse {
    pub id: i64,
    pub character_id: i64,
    pub notification_type: String,
    pub title: String,
    pub message: String,
    pub status: String,
    pub created_at: String,
}

impl From<db::Notification> for NotificationResponse {
    fn from(n: db::Notification) -> Self {
        let created_at = if let Ok(naive_dt) =
            NaiveDateTime::parse_from_str(&n.created_at, "%Y-%m-%d %H:%M:%S")
        {
            let utc_dt = naive_dt.and_utc();
            utc_dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        } else {
            n.created_at
        };

        NotificationResponse {
            id: n.id,
            character_id: n.character_id,
            notification_type: n.notification_type,
            title: n.title,
            message: n.message,
            status: n.status,
            created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct NotificationSettingResponse {
    pub id: i64,
    pub character_id: i64,
    pub notification_type: String,
    pub enabled: bool,
    pub config: Option<String>,
}

impl From<db::NotificationSetting> for NotificationSettingResponse {
    fn from(s: db::NotificationSetting) -> Self {
        NotificationSettingResponse {
            id: s.id,
            character_id: s.character_id,
            notification_type: s.notification_type,
            enabled: s.enabled,
            config: s.config,
        }
    }
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
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdSkillqueueGet>> {
    let endpoint_path = format!("characters/{}/skillqueue", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);
    esi::fetch_cached(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await
}

async fn get_cached_character_attributes(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdAttributesGet>> {
    let endpoint_path = format!("characters/{}/attributes", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    if let Some(data) = esi::fetch_cached::<esi::CharactersCharacterIdAttributesGet>(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await?
    {
        let attributes = db::CharacterAttributes {
            character_id,
            charisma: data.charisma,
            intelligence: data.intelligence,
            memory: data.memory,
            perception: data.perception,
            willpower: data.willpower,
            bonus_remaps: data.bonus_remaps,
            accrued_remap_cooldown_date: data
                .accrued_remap_cooldown_date
                .as_ref()
                .map(|d| d.to_rfc3339()),
            last_remap_date: data.last_remap_date.as_ref().map(|d| d.to_rfc3339()),
        };
        db::set_character_attributes(pool, &attributes).await.ok();

        Ok(Some(data))
    } else {
        Ok(None)
    }
}

async fn get_cached_character_skills(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdSkillsGet>> {
    let endpoint_path = format!("characters/{}/skills", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    if let Some(data) = esi::fetch_cached::<esi::CharactersCharacterIdSkillsGet>(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await?
    {
        let skills_data: Vec<(i64, i64, i64, i64)> = data
            .skills
            .iter()
            .filter_map(|skill: &serde_json::Value| {
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

        let unallocated_sp = data.unallocated_sp.unwrap_or(0);
        db::set_character_unallocated_sp(pool, character_id, unallocated_sp)
            .await
            .ok();

        Ok(Some(data))
    } else {
        Ok(None)
    }
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

async fn get_type_names_helper(
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
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdClonesGet>> {
    let endpoint_path = format!("characters/{}/clones", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);
    esi::fetch_cached(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await
}

async fn get_cached_character_implants(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdImplantsGet>> {
    let endpoint_path = format!("characters/{}/implants", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);
    esi::fetch_cached(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await
}

async fn get_cached_station_info(
    pool: &db::Pool,
    client: &reqwest::Client,
    station_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::UniverseStationsStationIdGet>> {
    let endpoint_path = format!("universe/stations/{}", station_id);
    let cache_key = format!("{}:0", endpoint_path);
    esi::fetch_cached(pool, client, &endpoint_path, &cache_key, rate_limits, 0).await
}

async fn get_cached_structure_info(
    pool: &db::Pool,
    client: &reqwest::Client,
    structure_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::UniverseStructuresStructureIdGet>> {
    let endpoint_path = format!("universe/structures/{}", structure_id);
    let cache_key = format!("{}:0", endpoint_path);
    esi::fetch_cached(pool, client, &endpoint_path, &cache_key, rate_limits, 0).await
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

#[allow(dead_code)]
fn calculate_sp_for_level(rank: i64, level: i32) -> i64 {
    if !(1..=5).contains(&level) {
        return 0;
    }
    let base: f64 = 2.0;
    let exponent = 2.5 * (level as f64 - 1.0);
    let sp = base.powf(exponent) * 250.0 * rank as f64;
    sp as i64
}

fn calculate_total_queue_hours(skill_queue: &[SkillQueueItem]) -> f64 {
    let mut total_hours = 0.0;
    for skill in skill_queue {
        if let Some(sp_per_min) = skill.sp_per_minute {
            if sp_per_min > 0.0 {
                if let (Some(level_start), Some(level_end)) =
                    (skill.level_start_sp, skill.level_end_sp)
                {
                    let current_sp = skill.current_sp.unwrap_or(level_start);
                    let remaining_sp = level_end - current_sp;
                    if remaining_sp > 0 {
                        let sp_per_hour = sp_per_min * 60.0;
                        total_hours += remaining_sp as f64 / sp_per_hour;
                    }
                }
            }
        }
    }
    total_hours
}

async fn check_skill_queue_notifications(
    pool: &db::Pool,
    character_id: i64,
    skill_queue: &[SkillQueueItem],
) -> Result<()> {
    let setting =
        db::get_notification_setting(pool, character_id, NOTIFICATION_TYPE_SKILL_QUEUE_LOW).await?;

    if let Some(setting) = setting {
        if !setting.enabled {
            // Notification disabled, clear any existing active notifications
            db::clear_notification(pool, character_id, NOTIFICATION_TYPE_SKILL_QUEUE_LOW)
                .await
                .ok();
            return Ok(());
        }

        // Parse config to get threshold
        let threshold_hours: f64 = if let Some(config_str) = &setting.config {
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(config_str) {
                config
                    .get("threshold_hours")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(24.0)
            } else {
                24.0
            }
        } else {
            24.0
        };

        let total_hours = calculate_total_queue_hours(skill_queue);
        // Note: Empty skill queues return 0.0 hours, which will trigger a notification
        // if threshold > 0 (desired behavior - user should be notified when queue is empty)

        // Get actual notification count to check if one exists
        // Use get_notifications and filter to ensure we're checking the same data
        let all_notifications = db::get_notifications(pool, Some(character_id), None)
            .await
            .ok();
        let active_count = all_notifications
            .as_ref()
            .map(|n| {
                n.iter()
                    .filter(|notif| {
                        notif.notification_type == NOTIFICATION_TYPE_SKILL_QUEUE_LOW
                            && notif.status == "active"
                    })
                    .count()
            })
            .unwrap_or(0);
        let has_active = active_count > 0;

        // Note: Using < (not <=) means exact threshold matches don't trigger notifications.
        // This is intentional - only notify when queue is below the threshold, not at or above it.
        if total_hours < threshold_hours {
            // Queue is below threshold, create notification if one doesn't exist
            if !has_active {
                let hours_str = if total_hours < 1.0 {
                    format!("{:.1} hours", total_hours)
                } else {
                    format!("{:.0} hours", total_hours)
                };
                db::create_notification(
                    pool,
                    character_id,
                    NOTIFICATION_TYPE_SKILL_QUEUE_LOW,
                    "Skill Queue Low",
                    &format!(
                        "Skill queue has {} remaining (below {} hour threshold)",
                        hours_str, threshold_hours
                    ),
                )
                .await?;
            }
        } else {
            // Queue is above threshold, clear notification if it exists
            if has_active {
                db::clear_notification(pool, character_id, NOTIFICATION_TYPE_SKILL_QUEUE_LOW)
                    .await?;
            }
        }
    }

    Ok(())
}

async fn refresh_all_skill_queues(pool: &db::Pool, rate_limits: &esi::RateLimitStore) {
    let characters = match db::get_all_characters(pool).await {
        Ok(chars) => chars,
        Err(e) => {
            eprintln!("Failed to get characters for startup refresh: {}", e);
            return;
        }
    };

    for character in characters {
        let _ = build_character_skill_queue(
            pool,
            rate_limits,
            character.character_id,
            &character.character_name,
        )
        .await;
    }
}

async fn build_character_skill_queue(
    pool: &db::Pool,
    rate_limits: &esi::RateLimitStore,
    character_id: i64,
    character_name: &str,
) -> Result<Option<CharacterSkillQueue>, String> {
    let access_token = match auth::ensure_valid_access_token(pool, character_id).await {
        Ok(token) => token,
        Err(e) => {
            eprintln!(
                "Failed to get valid token for character {}: {}",
                character_id, e
            );
            return Ok(None);
        }
    };

    let client = create_authenticated_client(&access_token)
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let character_attributes =
        match get_cached_character_attributes(pool, &client, character_id, rate_limits).await {
            Ok(Some(attrs)) => Some(CharacterAttributesResponse {
                charisma: attrs.charisma,
                intelligence: attrs.intelligence,
                memory: attrs.memory,
                perception: attrs.perception,
                willpower: attrs.willpower,
            }),
            Ok(None) => {
                if let Ok(Some(cached_attrs)) =
                    db::get_character_attributes(pool, character_id).await
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
                    character_id, e
                );
                if let Ok(Some(cached_attrs)) =
                    db::get_character_attributes(pool, character_id).await
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

    get_cached_character_skills(pool, &client, character_id, rate_limits)
        .await
        .ok();
    let mut skill_sp_map: HashMap<i64, i64> = HashMap::new();
    if let Ok(skills) = db::get_character_skills(pool, character_id).await {
        for skill in skills {
            skill_sp_map.insert(skill.skill_id, skill.skillpoints_in_skill);
        }
    }

    let updated_character = db::get_character(pool, character_id)
        .await
        .ok()
        .flatten()
        .unwrap_or(db::Character {
            character_id,
            character_name: character_name.to_string(),
            unallocated_sp: 0,
        });

    let queue_data = match get_cached_skill_queue(pool, &client, character_id, rate_limits).await {
        Ok(Some(data)) => {
            // Check if the currently training skill (queue_position 0) has finished
            // If so, the cache is stale and we need to refresh
            let should_refresh = data.iter().any(|item: &serde_json::Value| {
                if let Some(obj) = item.as_object() {
                    if let (Some(queue_pos), Some(finish_str)) = (
                        obj.get("queue_position").and_then(|v| v.as_i64()),
                        obj.get("finish_date").and_then(|v| v.as_str()),
                    ) {
                        if queue_pos == 0 {
                            if let Ok(finish) = chrono::DateTime::parse_from_rfc3339(finish_str) {
                                let finish_utc = finish.with_timezone(&chrono::Utc);
                                let now = chrono::Utc::now();
                                return now >= finish_utc;
                            }
                        }
                    }
                }
                false
            });

            if should_refresh {
                // Clear cache and fetch fresh data
                cache::clear_character_cache(pool, character_id).await.ok();
                match get_cached_skill_queue(pool, &client, character_id, rate_limits).await {
                    Ok(Some(fresh_data)) => fresh_data,
                    Ok(None) => {
                        eprintln!(
                            "Failed to fetch skill queue for character {}: No data returned after refresh",
                            character_id
                        );
                        return Ok(None);
                    }
                    Err(e) => {
                        eprintln!(
                            "Failed to fetch skill queue for character {} after refresh: {}",
                            character_id, e
                        );
                        return Ok(None);
                    }
                }
            } else {
                data
            }
        }
        Ok(None) => {
            eprintln!(
                "Failed to fetch skill queue for character {}: No data returned",
                character_id
            );
            return Ok(None);
        }
        Err(e) => {
            eprintln!(
                "Failed to fetch skill queue for character {}: {}",
                character_id, e
            );
            return Ok(None);
        }
    };

    let mut skill_ids = Vec::new();
    let mut skill_queue: Vec<SkillQueueItem> = queue_data
        .into_iter()
        .filter_map(|item: serde_json::Value| {
            let obj = item.as_object()?;
            let skill_id = obj.get("skill_id")?.as_i64()?;
            let queue_pos = obj.get("queue_position")?.as_i64()? as i32;
            skill_ids.push(skill_id);
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
                training_start_sp: obj.get("training_start_sp").and_then(|v| v.as_i64()),
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

    let skill_names = get_skill_names(pool, &skill_ids)
        .await
        .map_err(|e| format!("Failed to get skill names: {}", e))?;
    let skill_attributes = get_skill_attributes(pool, &skill_ids)
        .await
        .map_err(|e| format!("Failed to get skill attributes: {}", e))?;

    let char_attrs = &character_attributes;
    let mut skill_progress_map: HashMap<i64, i64> = HashMap::new();

    for skill_item in &mut skill_queue {
        if let Some(name) = skill_names.get(&skill_item.skill_id) {
            skill_item.skill_name = Some(name.clone());
        }

        let known_sp = skill_sp_map.get(&skill_item.skill_id).copied();
        let current_tracker = skill_progress_map.get(&skill_item.skill_id).copied();

        let is_currently_training = skill_item.queue_position == 0 || {
            let now = chrono::Utc::now();
            if let (Some(start_str), Some(finish_str)) =
                (&skill_item.start_date, &skill_item.finish_date)
            {
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

            if let (Some(start_str), Some(finish_str)) =
                (&skill_item.start_date, &skill_item.finish_date)
            {
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
                            let total_sp_needed = skill_item.level_end_sp.unwrap_or(0) - base_sp;
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
                        164 => attrs.charisma,
                        165 => attrs.intelligence,
                        166 => attrs.memory,
                        167 => attrs.perception,
                        168 => attrs.willpower,
                        _ => {
                            eprintln!(
                                "Unknown primary attribute ID: {} for skill {}",
                                primary_attr_id, skill_item.skill_id
                            );
                            0
                        }
                    };
                    let secondary_value = match secondary_attr_id {
                        164 => attrs.charisma,
                        165 => attrs.intelligence,
                        166 => attrs.memory,
                        167 => attrs.perception,
                        168 => attrs.willpower,
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

    let queue_result = CharacterSkillQueue {
        character_id: updated_character.character_id,
        character_name: updated_character.character_name.clone(),
        skill_queue: skill_queue.clone(),
        attributes: character_attributes,
        unallocated_sp: updated_character.unallocated_sp,
    };

    // Check for notifications
    if let Err(e) = check_skill_queue_notifications(pool, character_id, &skill_queue).await {
        eprintln!(
            "Failed to check skill queue notifications for character {}: {}",
            character_id, e
        );
    }

    Ok(Some(queue_result))
}

#[tauri::command]
async fn get_skill_queues(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
) -> Result<Vec<CharacterSkillQueue>, String> {
    let characters = db::get_all_characters(&pool)
        .await
        .map_err(|e| format!("Failed to get characters: {}", e))?;

    let mut results = Vec::new();
    let mut all_skill_ids = Vec::new();
    let mut character_skill_sp: HashMap<i64, HashMap<i64, i64>> = HashMap::new();

    for character in characters {
        let access_token =
            match auth::ensure_valid_access_token(&pool, character.character_id).await {
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

        let character_attributes = match get_cached_character_attributes(
            &pool,
            &client,
            character.character_id,
            &rate_limits,
        )
        .await
        {
            Ok(Some(attrs)) => Some(CharacterAttributesResponse {
                charisma: attrs.charisma,
                intelligence: attrs.intelligence,
                memory: attrs.memory,
                perception: attrs.perception,
                willpower: attrs.willpower,
            }),
            Ok(None) => {
                if let Ok(Some(cached_attrs)) =
                    db::get_character_attributes(&pool, character.character_id).await
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
                    db::get_character_attributes(&pool, character.character_id).await
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

        get_cached_character_skills(&pool, &client, character.character_id, &rate_limits)
            .await
            .ok();
        let mut skill_sp_map: HashMap<i64, i64> = HashMap::new();
        if let Ok(skills) = db::get_character_skills(&pool, character.character_id).await {
            for skill in skills {
                skill_sp_map.insert(skill.skill_id, skill.skillpoints_in_skill);
            }
        }
        character_skill_sp.insert(character.character_id, skill_sp_map);

        // Re-read character to get updated unallocated_sp value
        let character_id = character.character_id;
        let character_name = character.character_name.clone();
        let updated_character = db::get_character(&pool, character_id)
            .await
            .ok()
            .flatten()
            .unwrap_or(db::Character {
                character_id,
                character_name: character_name.clone(),
                unallocated_sp: 0,
            });

        match get_cached_skill_queue(&pool, &client, character_id, &rate_limits).await {
            Ok(Some(queue_data)) => {
                let skill_queue: Vec<SkillQueueItem> = queue_data
                    .into_iter()
                    .filter_map(|item: serde_json::Value| {
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
                    character_id: updated_character.character_id,
                    character_name: updated_character.character_name,
                    skill_queue,
                    attributes: character_attributes,
                    unallocated_sp: updated_character.unallocated_sp,
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
    let skill_names = get_skill_names(&pool, &unique_skill_ids)
        .await
        .map_err(|e| format!("Failed to get skill names: {}", e))?;
    let skill_attributes = get_skill_attributes(&pool, &unique_skill_ids)
        .await
        .map_err(|e| format!("Failed to get skill attributes: {}", e))?;

    for result in &mut results {
        let char_attrs = &result.attributes;
        let mut skill_progress_map: HashMap<i64, i64> = HashMap::new();
        let skill_known_sp = character_skill_sp
            .get(&result.character_id)
            .cloned()
            .unwrap_or_default();
        for skill_item in &mut result.skill_queue {
            if let Some(name) = skill_names.get(&skill_item.skill_id) {
                skill_item.skill_name = Some(name.clone());
            }

            let known_sp = skill_known_sp.get(&skill_item.skill_id).copied();
            let current_tracker = skill_progress_map.get(&skill_item.skill_id).copied();

            let is_currently_training = skill_item.queue_position == 0 || {
                let now = chrono::Utc::now();
                if let (Some(start_str), Some(finish_str)) =
                    (&skill_item.start_date, &skill_item.finish_date)
                {
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

                if let (Some(start_str), Some(finish_str)) =
                    (&skill_item.start_date, &skill_item.finish_date)
                {
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
                                let total_sp_needed = skill_item.level_end_sp.unwrap_or(0)
                                    - skill_item.level_start_sp.unwrap_or(0);
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

#[tauri::command]
async fn get_skill_queue_for_character(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<CharacterSkillQueue, String> {
    let character = db::get_character(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get character: {}", e))?
        .ok_or_else(|| format!("Character {} not found", character_id))?;

    build_character_skill_queue(&pool, &rate_limits, character_id, &character.character_name)
        .await
        .map_err(|e| format!("Failed to build skill queue: {}", e))?
        .ok_or_else(|| {
            format!(
                "No skill queue data available for character {}",
                character_id
            )
        })
}

#[tauri::command]
async fn force_refresh_skill_queue(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<CharacterSkillQueue, String> {
    cache::clear_character_cache(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to clear cache: {}", e))?;

    let character = db::get_character(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get character: {}", e))?
        .ok_or_else(|| format!("Character {} not found", character_id))?;

    build_character_skill_queue(&pool, &rate_limits, character_id, &character.character_name)
        .await
        .map_err(|e| format!("Failed to build skill queue: {}", e))?
        .ok_or_else(|| {
            format!(
                "No skill queue data available for character {}",
                character_id
            )
        })
}

#[derive(Debug, Clone, Serialize)]
struct CloneImplantResponse {
    implant_type_id: i64,
    slot: Option<i64>,
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
    implants: Vec<CloneImplantResponse>,
}

#[tauri::command]
async fn get_clones(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<Vec<CloneResponse>, String> {
    let access_token = auth::ensure_valid_access_token(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get valid token: {}", e))?;

    let client = create_authenticated_client(&access_token)
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let clones_data = get_cached_character_clones(&pool, &client, character_id, &rate_limits)
        .await
        .map_err(|e| format!("Failed to fetch clones: {}", e))?
        .ok_or_else(|| "No clones data returned".to_string())?;

    let current_implants =
        get_cached_character_implants(&pool, &client, character_id, &rate_limits)
            .await
            .map_err(|e| format!("Failed to fetch implants: {}", e))?
            .unwrap_or_default();

    let mut clones_to_store = Vec::new();
    let mut matched_clone_id_for_current: Option<i64> = None;
    let mut matched_clone_location_update: Option<(String, i64)> = None;

    // Process jump clones (these are never the current clone)
    for jump_clone in &clones_data.jump_clones {
        if let Some(obj) = jump_clone.as_object() {
            let clone_id = obj.get("jump_clone_id").and_then(|v| v.as_i64());
            let location_id = obj.get("location_id").and_then(|v| v.as_i64()).unwrap_or(0);
            let location_type_str = obj
                .get("location_type")
                .and_then(|v| v.as_str())
                .unwrap_or("station");
            let implants = obj
                .get("implants")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_i64()).collect::<Vec<_>>())
                .unwrap_or_default();

            // Resolve location (this will check database first, then fetch from ESI if needed)
            let _location_name = resolve_clone_location(
                &pool,
                &client,
                location_type_str,
                location_id,
                character_id,
                &rate_limits,
            )
            .await
            .unwrap_or_else(|_| "Unknown Location".to_string());

            clones_to_store.push((
                clone_id,
                None,
                location_type_str.to_string(),
                location_id,
                false,
                implants,
            ));
        }
    }

    // Determine which clone should be marked as current
    let mut current_implants_sorted = current_implants.clone();
    current_implants_sorted.sort();

    if !current_implants_sorted.is_empty() {
        // Try to find an existing clone that matches the current implants
        let matched_clone_id =
            db::find_clone_by_implants(&pool, character_id, &current_implants_sorted)
                .await
                .map_err(|e| format!("Failed to find clone by implants: {}", e))?;

        if let Some(matched_id) = matched_clone_id {
            // Found a matching clone - we'll mark it as current after storing clones
            matched_clone_id_for_current = Some(matched_id);

            // If we have home location, prepare to update the clone's location info
            if let Some(home_location) = &clones_data.home_location {
                if let (Some(location_id), Some(location_type)) = (
                    home_location.location_id,
                    home_location.location_type.as_ref(),
                ) {
                    let location_type_str = match location_type {
                        esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Station => {
                            "station"
                        }
                        esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Structure => {
                            "structure"
                        }
                    };

                    // Resolve location (this will check database first, then fetch from ESI if needed)
                    let _location_name = resolve_clone_location(
                        &pool,
                        &client,
                        location_type_str,
                        location_id,
                        character_id,
                        &rate_limits,
                    )
                    .await
                    .unwrap_or_else(|_| "Unknown Location".to_string());

                    matched_clone_location_update =
                        Some((location_type_str.to_string(), location_id));
                }
            }
        } else if let Some(home_location) = &clones_data.home_location {
            // No matching clone found by implants. Before creating a new one, try to find
            // an existing clone with NULL clone_id that has the same implants using the same function.
            // This handles the case where duplicates were created previously.
            let existing_null_clone =
                db::find_clone_by_implants(&pool, character_id, &current_implants_sorted)
                    .await
                    .ok()
                    .flatten();

            // Check if the found clone has NULL clone_id
            let null_clone_id = if let Some(id) = existing_null_clone {
                sqlx::query_scalar::<_, Option<i64>>(
                    "SELECT clone_id FROM clones WHERE id = ? AND clone_id IS NULL",
                )
                .bind(id)
                .fetch_optional(&*pool)
                .await
                .ok()
                .flatten()
                .map(|_| id)
            } else {
                None
            };

            if let Some(existing_id) = null_clone_id {
                // Found an existing clone with NULL clone_id and matching implants, mark it as current
                matched_clone_id_for_current = Some(existing_id);
                if let (Some(location_id), Some(location_type)) = (
                    home_location.location_id,
                    home_location.location_type.as_ref(),
                ) {
                    let location_type_str = match location_type {
                        esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Station => {
                            "station"
                        }
                        esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Structure => {
                            "structure"
                        }
                    };

                    // Resolve location (this will check database first, then fetch from ESI if needed)
                    let _location_name = resolve_clone_location(
                        &pool,
                        &client,
                        location_type_str,
                        location_id,
                        character_id,
                        &rate_limits,
                    )
                    .await
                    .unwrap_or_else(|_| "Unknown Location".to_string());

                    matched_clone_location_update =
                        Some((location_type_str.to_string(), location_id));
                }
            } else {
                // No existing clone found, create a new one
                if let (Some(location_id), Some(location_type)) = (
                    home_location.location_id,
                    home_location.location_type.as_ref(),
                ) {
                    let location_type_str = match location_type {
                        esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Station => {
                            "station"
                        }
                        esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Structure => {
                            "structure"
                        }
                    };

                    // Resolve location (this will check database first, then fetch from ESI if needed)
                    let _location_name = resolve_clone_location(
                        &pool,
                        &client,
                        location_type_str,
                        location_id,
                        character_id,
                        &rate_limits,
                    )
                    .await
                    .unwrap_or_else(|_| "Unknown Location".to_string());

                    clones_to_store.push((
                        None,
                        None,
                        location_type_str.to_string(),
                        location_id,
                        true,
                        current_implants_sorted,
                    ));
                }
            }
        }
    }

    db::set_character_clones(&pool, character_id, &clones_to_store)
        .await
        .map_err(|e| format!("Failed to store clones: {}", e))?;

    // Now mark the matched clone as current (after set_character_clones has cleared all flags)
    if let Some(matched_id) = matched_clone_id_for_current {
        if let Some((location_type, location_id)) = matched_clone_location_update {
            sqlx::query(
                "UPDATE clones SET location_type = ?, location_id = ?, is_current = 1 WHERE id = ?",
            )
            .bind(location_type)
            .bind(location_id)
            .bind(matched_id)
            .execute(&*pool)
            .await
            .map_err(|e| format!("Failed to update matched clone: {}", e))?;
        } else {
            sqlx::query("UPDATE clones SET is_current = 1 WHERE id = ?")
                .bind(matched_id)
                .execute(&*pool)
                .await
                .map_err(|e| format!("Failed to update matched clone: {}", e))?;
        }
    }

    let stored_clones = db::get_character_clones(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get stored clones: {}", e))?;

    let mut result = Vec::new();
    for clone in stored_clones {
        let implants: Vec<CloneImplantResponse> = db::get_clone_implants(&pool, clone.id)
            .await
            .map_err(|e| format!("Failed to get clone implants: {}", e))?
            .into_iter()
            .map(|i| CloneImplantResponse {
                implant_type_id: i.implant_type_id,
                slot: i.slot,
            })
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
    _character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<String> {
    match location_type {
        "station" => {
            // Check database first
            if let Some(station) = db::get_station(pool, location_id).await? {
                return Ok(station.name);
            }

            // Not in database, fetch from ESI
            if let Some(station) =
                get_cached_station_info(pool, client, location_id, rate_limits).await?
            {
                let name = if !station.name.is_empty() {
                    station.name
                } else {
                    format!("Unknown Location {}", location_id)
                };

                // Upsert to database
                db::upsert_station(pool, location_id, &name, station.system_id, station.owner)
                    .await?;

                Ok(name)
            } else {
                let name = format!("Unknown Location {}", location_id);
                // Store unknown location in database to avoid repeated failed calls
                db::upsert_station(pool, location_id, &name, 0, None).await?;
                Ok(name)
            }
        }
        "structure" => {
            // Check database first
            if let Some(structure) = db::get_structure(pool, location_id).await? {
                return Ok(structure.name);
            }

            // Not in database, fetch from ESI
            match get_cached_structure_info(pool, client, location_id, rate_limits).await {
                Ok(Some(structure)) => {
                    let name = if !structure.name.is_empty() {
                        structure.name
                    } else {
                        format!("Unknown Location {}", location_id)
                    };

                    // Upsert to database
                    db::upsert_structure(
                        pool,
                        location_id,
                        &name,
                        structure.solar_system_id,
                        structure.type_id,
                        structure.owner_id,
                    )
                    .await?;

                    Ok(name)
                }
                Ok(None) => {
                    // Inaccessible structure - store placeholder
                    let name = "Inaccessible Structure".to_string();
                    db::upsert_structure(pool, location_id, &name, 0, None, 0).await?;
                    Ok(name)
                }
                Err(_) => {
                    // Error fetching - store placeholder
                    let name = "Inaccessible Structure".to_string();
                    db::upsert_structure(pool, location_id, &name, 0, None, 0).await?;
                    Ok(name)
                }
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
    db::update_clone_name(&pool, clone_id, name.as_deref())
        .await
        .map_err(|e| format!("Failed to update clone name: {}", e))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct TypeNameEntry {
    pub type_id: i64,
    pub name: String,
}

#[tauri::command]
async fn get_type_names(
    pool: State<'_, db::Pool>,
    type_ids: Vec<i64>,
) -> Result<Vec<TypeNameEntry>, String> {
    let map = get_type_names_helper(&pool, &type_ids).await?;
    Ok(map
        .into_iter()
        .map(|(type_id, name)| TypeNameEntry { type_id, name })
        .collect())
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterRateLimits {
    pub character_id: i64,
    pub limits: Vec<RateLimitResponse>,
}

#[tauri::command]
async fn get_rate_limits(
    rate_limits: State<'_, esi::RateLimitStore>,
) -> Result<Vec<CharacterRateLimits>, String> {
    let store = rate_limits.read().await;
    Ok(store
        .iter()
        .map(|(character_id, limits_map)| CharacterRateLimits {
            character_id: *character_id,
            limits: limits_map.values().map(RateLimitResponse::from).collect(),
        })
        .collect())
}

#[tauri::command]
async fn get_character_attributes_breakdown(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<CharacterAttributesBreakdown, String> {
    const BASE_ATTRIBUTE: i64 = 17;
    const REMAP_TOTAL: i64 = 14;
    const ATTRIBUTE_IDS: [(i64, &str); 5] = [
        (164, "charisma"),
        (165, "intelligence"),
        (166, "memory"),
        (167, "perception"),
        (168, "willpower"),
    ];

    let access_token = auth::ensure_valid_access_token(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get valid token: {}", e))?;

    let client = create_authenticated_client(&access_token)
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let attributes =
        match get_cached_character_attributes(&pool, &client, character_id, &rate_limits).await {
            Ok(Some(attrs)) => db::CharacterAttributes {
                character_id,
                charisma: attrs.charisma,
                intelligence: attrs.intelligence,
                memory: attrs.memory,
                perception: attrs.perception,
                willpower: attrs.willpower,
                bonus_remaps: attrs.bonus_remaps,
                accrued_remap_cooldown_date: attrs
                    .accrued_remap_cooldown_date
                    .as_ref()
                    .map(|d| d.to_rfc3339()),
                last_remap_date: attrs.last_remap_date.as_ref().map(|d| d.to_rfc3339()),
            },
            Ok(None) => db::get_character_attributes(&pool, character_id)
                .await
                .map_err(|e| format!("Failed to get character attributes: {}", e))?
                .ok_or_else(|| {
                    "Character attributes not found. Please refresh your character data."
                        .to_string()
                })?,
            Err(e) => {
                eprintln!("Failed to fetch attributes from ESI: {}", e);
                db::get_character_attributes(&pool, character_id)
                    .await
                    .map_err(|e| format!("Failed to get character attributes: {}", e))?
                    .ok_or_else(|| {
                        "Character attributes not found. Please refresh your character data."
                            .to_string()
                    })?
            }
        };

    let current_implants =
        get_cached_character_implants(&pool, &client, character_id, &rate_limits)
            .await
            .map_err(|e| format!("Failed to fetch implants: {}", e))?
            .unwrap_or_default();

    let implant_bonuses = if current_implants.is_empty() {
        HashMap::new()
    } else {
        db::get_implant_attribute_bonuses(&pool, &current_implants)
            .await
            .map_err(|e| format!("Failed to get implant bonuses: {}", e))?
    };

    let attribute_totals = [
        attributes.charisma,
        attributes.intelligence,
        attributes.memory,
        attributes.perception,
        attributes.willpower,
    ];

    let mut implant_totals = [0i64; 5];
    let mut remainders = [0i64; 5];

    // Map implant bonus attribute IDs (175-179) to character attribute IDs (164-168)
    // 175 = charismaBonus, 176 = intelligenceBonus, 177 = memoryBonus, 178 = perceptionBonus, 179 = willpowerBonus
    const IMPLANT_BONUS_ATTR_IDS: [i64; 5] = [175, 176, 177, 178, 179];

    for (idx, (_, _)) in ATTRIBUTE_IDS.iter().enumerate() {
        let implant_bonus_attr_id = IMPLANT_BONUS_ATTR_IDS[idx];
        let mut implant_bonus = 0i64;
        for implant_id in &current_implants {
            if let Some(implant_attrs) = implant_bonuses.get(implant_id) {
                if let Some(&bonus) = implant_attrs.get(&implant_bonus_attr_id) {
                    implant_bonus += bonus;
                }
            }
        }
        implant_totals[idx] = implant_bonus;
        remainders[idx] = attribute_totals[idx] - BASE_ATTRIBUTE - implant_bonus;
    }

    let remainder_sum: i64 = remainders.iter().sum();
    let accelerator = (remainder_sum - REMAP_TOTAL) / 5;

    let mut remaps = [0i64; 5];
    for (idx, remainder) in remainders.iter().enumerate() {
        remaps[idx] = remainder - accelerator;
    }

    Ok(CharacterAttributesBreakdown {
        charisma: AttributeBreakdown {
            base: BASE_ATTRIBUTE,
            implants: implant_totals[0],
            remap: remaps[0],
            accelerator,
            total: attribute_totals[0],
        },
        intelligence: AttributeBreakdown {
            base: BASE_ATTRIBUTE,
            implants: implant_totals[1],
            remap: remaps[1],
            accelerator,
            total: attribute_totals[1],
        },
        memory: AttributeBreakdown {
            base: BASE_ATTRIBUTE,
            implants: implant_totals[2],
            remap: remaps[2],
            accelerator,
            total: attribute_totals[2],
        },
        perception: AttributeBreakdown {
            base: BASE_ATTRIBUTE,
            implants: implant_totals[3],
            remap: remaps[3],
            accelerator,
            total: attribute_totals[3],
        },
        willpower: AttributeBreakdown {
            base: BASE_ATTRIBUTE,
            implants: implant_totals[4],
            remap: remaps[4],
            accelerator,
            total: attribute_totals[4],
        },
    })
}

#[tauri::command]
async fn get_notifications(
    pool: State<'_, db::Pool>,
    character_id: Option<i64>,
    status: Option<String>,
) -> Result<Vec<NotificationResponse>, String> {
    let notifications = db::get_notifications(&pool, character_id, status.as_deref())
        .await
        .map_err(|e| format!("Failed to get notifications: {}", e))?;

    Ok(notifications
        .into_iter()
        .map(NotificationResponse::from)
        .collect())
}

#[tauri::command]
async fn dismiss_notification(
    pool: State<'_, db::Pool>,
    notification_id: i64,
) -> Result<(), String> {
    db::dismiss_notification(&pool, notification_id)
        .await
        .map_err(|e| format!("Failed to dismiss notification: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_notification_settings(
    pool: State<'_, db::Pool>,
    character_id: i64,
) -> Result<Vec<NotificationSettingResponse>, String> {
    let settings = db::get_notification_settings(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get notification settings: {}", e))?;

    Ok(settings
        .into_iter()
        .map(NotificationSettingResponse::from)
        .collect())
}

#[tauri::command]
async fn upsert_notification_setting(
    pool: State<'_, db::Pool>,
    character_id: i64,
    notification_type: String,
    enabled: bool,
    config: Option<String>,
) -> Result<(), String> {
    let config_value = config
        .as_ref()
        .map(|c| serde_json::from_str::<serde_json::Value>(c))
        .transpose()
        .map_err(|e| format!("Invalid config JSON: {}", e))?;

    let config_str = config_value
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    db::upsert_notification_setting(
        &pool,
        character_id,
        &notification_type,
        enabled,
        config_str.as_deref(),
    )
    .await
    .map_err(|e| format!("Failed to upsert notification setting: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_character_skills_with_groups(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<CharacterSkillsResponse, String> {
    const SKILL_CATEGORY_ID: i64 = 16;

    // Get all skill groups for the Skill category
    let skill_groups = db::get_skill_groups_for_category(&pool, SKILL_CATEGORY_ID)
        .await
        .map_err(|e| format!("Failed to get skill groups: {}", e))?;

    // Get character's trained skills
    let character_skills = db::get_character_skills(&pool, character_id)
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
        if let Ok(access_token) = auth::ensure_valid_access_token(&pool, character_id).await {
            if let Ok(client) = create_authenticated_client(&access_token) {
                if let Ok(Some(queue_data)) =
                    get_cached_skill_queue(&pool, &client, character_id, &rate_limits).await
                {
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
        let skills_in_group = skills_by_group
            .get(&group.group_id)
            .cloned()
            .unwrap_or_default();
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
                is_in_queue,
                queue_level,
                is_injected,
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

    let client_id = get_eve_client_id()?;
    let token_response =
        auth::exchange_code_for_tokens(&client_id, &code, &code_verifier, callback_url)
            .await
            .context("Failed to exchange code for tokens")?;

    let character_info = auth::extract_character_from_jwt(&token_response.access_token)
        .context("Failed to extract character info from JWT")?;

    let scopes = auth::extract_scopes_from_jwt(&token_response.access_token)
        .context("Failed to extract scopes from JWT")?;

    let expires_at = Utc::now().timestamp() + token_response.expires_in;

    let existing_character = db::get_character(&pool, character_info.character_id).await?;

    if existing_character.is_none() {
        db::add_character(
            &pool,
            character_info.character_id,
            &character_info.character_name,
        )
        .await
        .context("Failed to add character")?;
    } else {
        db::update_character(
            &pool,
            character_info.character_id,
            &character_info.character_name,
        )
        .await
        .context("Failed to update character")?;
    }

    let existing_tokens = db::get_tokens(&pool, character_info.character_id).await?;

    if existing_tokens.is_none() {
        db::set_tokens(
            &pool,
            character_info.character_id,
            &token_response.access_token,
            &token_response.refresh_token,
            expires_at,
            Some(&scopes),
        )
        .await
        .context("Failed to set tokens")?;
    } else {
        db::update_tokens(
            &pool,
            character_info.character_id,
            &token_response.access_token,
            &token_response.refresh_token,
            expires_at,
            Some(&scopes),
        )
        .await
        .context("Failed to update tokens")?;
    }

    cache::clear_character_cache(&pool, character_info.character_id)
        .await
        .context("Failed to clear character cache")?;

    // Small delay to ensure frontend listeners are ready
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Emit to all windows
    match app.emit("auth-success", character_info.character_id) {
        Ok(_) => {}
        Err(e) => {
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
                let pool = db::init_db(app.handle()).await?;
                app.manage(pool);
                app.manage(AuthStateMap::default());
                app.manage(Arc::new(tokio::sync::RwLock::new(HashMap::<
                    i64,
                    HashMap<String, esi::RateLimitInfo>,
                >::new())));

                // Initialize startup state: 1 = in progress, 0 = complete
                let startup_state: StartupState = Arc::new(AtomicU8::new(1));
                app.manage(startup_state.clone());

                // Startup routine: sequential and declarative
                let pool = app.state::<db::Pool>().inner().clone();
                let rate_limits = app.state::<esi::RateLimitStore>().inner().clone();
                let app_handle = app.handle().clone();
                let startup_state_clone = startup_state.clone();
                tauri::async_runtime::spawn(async move {
                    // Step 1: Check for SDE updates and import if needed
                    match sde::ensure_latest(&app_handle, &pool).await {
                        Ok(_) => eprintln!("SDE import completed successfully"),
                        Err(err) => eprintln!("SDE import failed: {:#}", err),
                    }

                    // Step 2: Refresh all character data from ESI
                    refresh_all_skill_queues(&pool, &rate_limits).await;

                    // Mark startup as complete and notify frontend
                    startup_state_clone.store(0, Ordering::SeqCst);
                    let _ = app_handle.emit("startup-complete", ());
                });

                // Start HTTP callback server for dev mode (if using HTTP callback)
                let callback_url = std::env::var("EVE_CALLBACK_URL").unwrap_or_else(|_| {
                    if tauri::is_dev() {
                        "http://localhost:1421/callback".to_string()
                    } else {
                        "eveauth-skillmon://callback".to_string()
                    }
                });

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
            is_startup_complete,
            get_characters,
            logout_character,
            get_skill_queues,
            get_skill_queue_for_character,
            force_refresh_skill_queue,
            get_character_skills_with_groups,
            refresh_sde,
            get_clones,
            update_clone_name,
            get_type_names,
            get_character_attributes_breakdown,
            get_rate_limits,
            get_notifications,
            dismiss_notification,
            get_notification_settings,
            upsert_notification_setting
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
