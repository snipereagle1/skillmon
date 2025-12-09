use std::collections::HashMap;
use std::sync::Mutex;

use anyhow::{Context, Result};
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use reqwest::header::{ACCEPT_LANGUAGE, IF_NONE_MATCH};
use serde::Serialize;
use serde_plain;
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
    pub queue_position: i32,
    pub finished_level: i32,
    pub start_date: Option<String>,
    pub finish_date: Option<String>,
    pub training_start_sp: Option<i64>,
    pub level_start_sp: Option<i64>,
    pub level_end_sp: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterSkillQueue {
    pub character_id: i64,
    pub character_name: String,
    pub skill_queue: Vec<SkillQueueItem>,
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
        let header_value = HeaderValue::from_str(
            &serde_plain::to_string(&request.x_compatibility_date)?,
        )?;
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

#[tauri::command]
async fn get_skill_queues(pool: State<'_, db::Pool>) -> Result<Vec<CharacterSkillQueue>, String> {
    let characters = db::get_all_characters(&*pool)
        .await
        .map_err(|e| format!("Failed to get characters: {}", e))?;

    let mut results = Vec::new();

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

        match get_cached_skill_queue(&*pool, &client, character.character_id).await {
            Ok(Some(queue_data)) => {
                let skill_queue: Vec<SkillQueueItem> = queue_data
                    .into_iter()
                    .filter_map(|item| {
                        let obj = item.as_object()?;
                        Some(SkillQueueItem {
                            skill_id: obj.get("skill_id")?.as_i64()?,
                            queue_position: obj.get("queue_position")?.as_i64()? as i32,
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
                        })
                    })
                    .collect();

                results.push(CharacterSkillQueue {
                    character_id: character.character_id,
                    character_name: character.character_name,
                    skill_queue,
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
                    if let Err(err) = sde::ensure_latest(&app_handle_for_sde, &pool).await {
                        eprintln!("SDE import failed: {}", err);
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
