use anyhow::{Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::Utc;
use serde_json::Value;
use std::collections::HashSet;

use super::pkce::generate_pkce_pair;
use super::types::{CharacterInfo, TokenResponse};
use crate::db::{self, Pool};

#[allow(dead_code)]
const EVE_SSO_BASE_URL: &str = "https://login.eveonline.com/v2/oauth";
const EVE_SSO_TOKEN_URL: &str = "https://login.eveonline.com/v2/oauth/token";
const EVE_SSO_AUTHORIZE_URL: &str = "https://login.eveonline.com/v2/oauth/authorize";

pub struct AuthState {
    pub code_verifier: String,
    pub state: String,
}

pub fn generate_auth_url(
    client_id: &str,
    scopes: &[&str],
    callback_url: &str,
) -> (String, AuthState) {
    let pkce = generate_pkce_pair();
    let state = super::pkce::generate_state();

    let scope_string = scopes.join(" ");

    let url = format!(
        "{}?response_type=code&redirect_uri={}&client_id={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}",
        EVE_SSO_AUTHORIZE_URL,
        urlencoding::encode(callback_url),
        urlencoding::encode(client_id),
        urlencoding::encode(&scope_string),
        urlencoding::encode(&pkce.code_challenge),
        urlencoding::encode(&state)
    );

    (
        url,
        AuthState {
            code_verifier: pkce.code_verifier,
            state,
        },
    )
}

pub async fn exchange_code_for_tokens(
    client_id: &str,
    code: &str,
    code_verifier: &str,
    callback_url: &str,
) -> Result<TokenResponse> {
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("client_id", client_id),
        ("code_verifier", code_verifier),
        ("redirect_uri", callback_url),
    ];

    let client = reqwest::Client::new();
    let response = client
        .post(EVE_SSO_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .context("Failed to send token exchange request")?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        anyhow::bail!("Token exchange failed with status {}: {}", status, text);
    }

    let token_response: TokenResponse = response
        .json()
        .await
        .context("Failed to parse token response")?;

    Ok(token_response)
}

pub async fn refresh_access_token(client_id: &str, refresh_token: &str) -> Result<TokenResponse> {
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client_id),
    ];

    let client = reqwest::Client::new();
    let response = client
        .post(EVE_SSO_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .context("Failed to send token refresh request")?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        anyhow::bail!("Token refresh failed with status {}: {}", status, text);
    }

    let token_response: TokenResponse = response
        .json()
        .await
        .context("Failed to parse token refresh response")?;

    Ok(token_response)
}

pub async fn ensure_valid_access_token(pool: &Pool, character_id: i64) -> Result<String> {
    let tokens = db::get_tokens(pool, character_id)
        .await
        .context("Failed to retrieve tokens from database")?;

    let tokens = tokens
        .ok_or_else(|| anyhow::anyhow!("No tokens found for character_id: {}", character_id))?;

    let now = Utc::now().timestamp();
    let is_expired = tokens.expires_at <= now;

    if is_expired {
        let client_id = crate::commands::auth::get_eve_client_id()?;
        let token_response = refresh_access_token(&client_id, &tokens.refresh_token)
            .await
            .context("Failed to refresh access token")?;

        let new_expires_at = Utc::now().timestamp() + token_response.expires_in;

        // Extract scopes from the new access token
        let scopes =
            extract_scopes_from_jwt(&token_response.access_token).unwrap_or_else(|_| Vec::new());

        db::update_tokens(
            pool,
            character_id,
            &token_response.access_token,
            &token_response.refresh_token,
            new_expires_at,
            Some(&scopes),
        )
        .await
        .context("Failed to update tokens in database")?;

        Ok(token_response.access_token)
    } else {
        Ok(tokens.access_token)
    }
}

fn decode_jwt_payload(access_token: &str) -> Result<Value> {
    let jwt_parts: Vec<&str> = access_token.split('.').collect();
    if jwt_parts.len() != 3 {
        anyhow::bail!(
            "Invalid JWT format: expected 3 parts, got {}",
            jwt_parts.len()
        );
    }

    let payload = jwt_parts[1];
    let decoded = URL_SAFE_NO_PAD
        .decode(payload)
        .context(format!("Failed to decode JWT payload: {}", payload))?;

    let decoded_str = String::from_utf8_lossy(&decoded);

    let json: Value = serde_json::from_str(&decoded_str).context(format!(
        "Failed to parse JWT payload. Decoded: {}",
        decoded_str
    ))?;

    Ok(json)
}

pub fn extract_scopes_from_jwt(access_token: &str) -> Result<Vec<String>> {
    let json = decode_jwt_payload(access_token)?;

    // EVE JWT uses "scp" for scopes, which can be either an array or a single string
    let scopes = match json.get("scp") {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect(),
        Some(Value::String(s)) => {
            // If it's a single string, split by spaces
            s.split_whitespace().map(|s| s.to_string()).collect()
        }
        Some(_) => {
            anyhow::bail!("Invalid 'scp' field format in JWT");
        }
        None => {
            // If scp is missing, return empty vector (older tokens might not have it)
            Vec::new()
        }
    };

    Ok(scopes)
}

pub fn extract_character_from_jwt(access_token: &str) -> Result<CharacterInfo> {
    let json = decode_jwt_payload(access_token)?;

    // EVE JWT uses "sub" for character ID in format "CHARACTER:EVE:12345678"
    let sub_str = json["sub"].as_str().context("Missing 'sub' field in JWT")?;

    // Parse character ID from "CHARACTER:EVE:12345678" format
    let character_id = if sub_str.starts_with("CHARACTER:EVE:") {
        sub_str
            .strip_prefix("CHARACTER:EVE:")
            .and_then(|s| s.parse::<i64>().ok())
            .context(format!(
                "Failed to parse character ID from sub: {}",
                sub_str
            ))?
    } else if sub_str.starts_with("CHARACTER:") {
        // Fallback for other formats like "CHARACTER:12345678"
        sub_str
            .strip_prefix("CHARACTER:")
            .and_then(|s| s.split(':').next_back())
            .and_then(|s| s.parse::<i64>().ok())
            .context(format!(
                "Failed to parse character ID from sub: {}",
                sub_str
            ))?
    } else {
        // Try parsing directly as number
        sub_str.parse::<i64>().context(format!(
            "Failed to parse character ID from sub: {}",
            sub_str
        ))?
    };

    // EVE JWT uses "name" for character name
    let character_name = json["name"]
        .as_str()
        .context(format!(
            "Missing 'name' field in JWT. Available fields: {:?}",
            json.as_object().map(|o| o.keys().collect::<Vec<_>>())
        ))?
        .to_string();

    Ok(CharacterInfo {
        character_id,
        character_name,
    })
}

/// Check if a token has the required scopes.
/// Returns a list of missing scopes, or empty vector if all required scopes are present.
/// Logs missing scopes for graceful degradation.
#[allow(dead_code)]
pub async fn check_token_scopes(
    pool: &Pool,
    character_id: i64,
    required_scopes: &[&str],
) -> Result<Vec<String>> {
    let tokens = db::get_tokens(pool, character_id)
        .await
        .context("Failed to retrieve tokens from database")?;

    let tokens = tokens
        .ok_or_else(|| anyhow::anyhow!("No tokens found for character_id: {}", character_id))?;

    // Parse scopes from JSON string
    let token_scopes: Vec<String> = if let Some(scopes_json) = &tokens.scopes {
        serde_json::from_str(scopes_json).unwrap_or_else(|_| Vec::new())
    } else {
        // No scopes stored (old token)
        Vec::new()
    };

    let token_scopes_set: HashSet<String> = token_scopes.iter().cloned().collect();
    let required_scopes_set: HashSet<String> =
        required_scopes.iter().map(|s| s.to_string()).collect();

    let missing_scopes: Vec<String> = required_scopes_set
        .difference(&token_scopes_set)
        .cloned()
        .collect();

    Ok(missing_scopes)
}
