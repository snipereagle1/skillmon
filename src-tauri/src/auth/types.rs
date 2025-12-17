use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CharacterInfo {
    pub character_id: i64,
    pub character_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtPayload {
    pub sub: String,
    pub name: String,
    #[serde(rename = "scp")]
    pub scopes: Vec<String>,
    #[serde(rename = "exp")]
    pub expires_at: i64,
}
