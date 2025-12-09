use anyhow::{Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::Value;

use super::pkce::generate_pkce_pair;
use super::types::{CharacterInfo, TokenResponse};

const EVE_SSO_BASE_URL: &str = "https://login.eveonline.com/v2/oauth";
const EVE_SSO_TOKEN_URL: &str = "https://login.eveonline.com/v2/oauth/token";
const EVE_SSO_AUTHORIZE_URL: &str = "https://login.eveonline.com/v2/oauth/authorize";

pub struct AuthState {
    pub code_verifier: String,
    pub state: String,
}

pub fn generate_auth_url(client_id: &str, scopes: &[&str], callback_url: &str) -> (String, AuthState) {
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

pub fn extract_character_from_jwt(access_token: &str) -> Result<CharacterInfo> {
    let jwt_parts: Vec<&str> = access_token.split('.').collect();
    if jwt_parts.len() != 3 {
        anyhow::bail!("Invalid JWT format: expected 3 parts, got {}", jwt_parts.len());
    }

    let payload = jwt_parts[1];
    let decoded = URL_SAFE_NO_PAD
        .decode(payload)
        .context(format!("Failed to decode JWT payload: {}", payload))?;

    let decoded_str = String::from_utf8_lossy(&decoded);
    eprintln!("JWT payload (decoded): {}", decoded_str);

    let json: Value = serde_json::from_str(&decoded_str)
        .context(format!("Failed to parse JWT payload. Decoded: {}", decoded_str))?;

    eprintln!("JWT JSON: {}", serde_json::to_string_pretty(&json).unwrap_or_default());

    // EVE JWT uses "sub" for character ID in format "CHARACTER:EVE:12345678"
    let sub_str = json["sub"]
        .as_str()
        .context("Missing 'sub' field in JWT")?;

    // Parse character ID from "CHARACTER:EVE:12345678" format
    let character_id = if sub_str.starts_with("CHARACTER:EVE:") {
        sub_str
            .strip_prefix("CHARACTER:EVE:")
            .and_then(|s| s.parse::<i64>().ok())
            .context(format!("Failed to parse character ID from sub: {}", sub_str))?
    } else if sub_str.starts_with("CHARACTER:") {
        // Fallback for other formats like "CHARACTER:12345678"
        sub_str
            .strip_prefix("CHARACTER:")
            .and_then(|s| s.split(':').last())
            .and_then(|s| s.parse::<i64>().ok())
            .context(format!("Failed to parse character ID from sub: {}", sub_str))?
    } else {
        // Try parsing directly as number
        sub_str
            .parse::<i64>()
            .context(format!("Failed to parse character ID from sub: {}", sub_str))?
    };

    // EVE JWT uses "name" for character name
    let character_name = json["name"]
        .as_str()
        .context(format!("Missing 'name' field in JWT. Available fields: {:?}", json.as_object().map(|o| o.keys().collect::<Vec<_>>())))?
        .to_string();

    Ok(CharacterInfo {
        character_id,
        character_name,
    })
}

