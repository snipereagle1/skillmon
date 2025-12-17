use anyhow::Result;
use sqlx::FromRow;

use super::Pool;

#[derive(Debug, FromRow)]
pub struct Tokens {
    #[allow(dead_code)]
    pub character_id: i64,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    #[allow(dead_code)]
    pub scopes: Option<String>,
}

pub async fn get_tokens(pool: &Pool, character_id: i64) -> Result<Option<Tokens>> {
    let tokens = sqlx::query_as::<_, Tokens>(
    "SELECT character_id, access_token, refresh_token, expires_at, scopes FROM tokens WHERE character_id = ?",
  )
  .bind(character_id)
  .fetch_optional(pool)
  .await?;

    Ok(tokens)
}

pub async fn set_tokens(
    pool: &Pool,
    character_id: i64,
    access_token: &str,
    refresh_token: &str,
    expires_at: i64,
    scopes: Option<&[String]>,
) -> Result<()> {
    let scopes_json = scopes
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| anyhow::anyhow!("Failed to serialize scopes: {}", e))?;

    sqlx::query(
        r#"
      INSERT INTO tokens (character_id, access_token, refresh_token, expires_at, scopes)
      VALUES (?, ?, ?, ?, ?)
    "#,
    )
    .bind(character_id)
    .bind(access_token)
    .bind(refresh_token)
    .bind(expires_at)
    .bind(scopes_json.as_deref())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_tokens(
    pool: &Pool,
    character_id: i64,
    access_token: &str,
    refresh_token: &str,
    expires_at: i64,
    scopes: Option<&[String]>,
) -> Result<()> {
    let scopes_json = scopes
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| anyhow::anyhow!("Failed to serialize scopes: {}", e))?;

    sqlx::query(
        r#"
      UPDATE tokens
      SET access_token = ?, refresh_token = ?, expires_at = ?, scopes = ?
      WHERE character_id = ?
    "#,
    )
    .bind(access_token)
    .bind(refresh_token)
    .bind(expires_at)
    .bind(scopes_json.as_deref())
    .bind(character_id)
    .execute(pool)
    .await?;

    Ok(())
}
