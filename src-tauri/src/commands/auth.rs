use anyhow::{Context, Result};
use chrono::Utc;
use tauri::{Emitter, Manager, State};

use crate::auth;
use crate::cache;
use crate::db;

pub type AuthStateMap = std::sync::Mutex<std::collections::HashMap<String, auth::AuthState>>;

pub fn get_eve_client_id() -> Result<String> {
    if let Some(compile_time_id) = option_env!("EVE_CLIENT_ID") {
        return Ok(compile_time_id.to_string());
    }
    std::env::var("EVE_CLIENT_ID").context("EVE_CLIENT_ID environment variable not set")
}

#[tauri::command]
pub async fn start_eve_login(
    app: tauri::AppHandle,
    auth_states: State<'_, AuthStateMap>,
) -> Result<String, String> {
    let client_id = get_eve_client_id().map_err(|e| e.to_string())?;
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

    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    match app.emit("auth-success", character_info.character_id) {
        Ok(_) => {}
        Err(e) => {
            return Err(anyhow::anyhow!("Failed to emit auth success event: {}", e));
        }
    }

    Ok(())
}
