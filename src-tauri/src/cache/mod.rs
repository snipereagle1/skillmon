use anyhow::Result;
use chrono::Utc;
use reqwest::header::HeaderMap;
use sqlx::FromRow;

use super::db::Pool;

#[derive(Debug, FromRow)]
struct CacheEntry {
    etag: Option<String>,
    expires_at: i64,
    response_body: String,
}

pub fn build_cache_key(endpoint: &str, character_id: i64) -> String {
    format!("{}:{}", endpoint, character_id)
}

pub async fn get_cached_response(
    pool: &Pool,
    cache_key: &str,
) -> Result<Option<(String, Option<String>)>> {
    let now = Utc::now().timestamp();

    let entry = sqlx::query_as::<_, CacheEntry>(
        "SELECT etag, expires_at, response_body FROM esi_cache WHERE cache_key = ? AND expires_at > ?",
    )
    .bind(cache_key)
    .bind(now)
    .fetch_optional(pool)
    .await?;

    Ok(entry.map(|e| (e.response_body, e.etag)))
}

pub async fn set_cached_response(
    pool: &Pool,
    cache_key: &str,
    etag: Option<&str>,
    expires_at: i64,
    response_body: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT OR REPLACE INTO esi_cache (cache_key, etag, expires_at, response_body) VALUES (?, ?, ?, ?)",
    )
    .bind(cache_key)
    .bind(etag)
    .bind(expires_at)
    .bind(response_body)
    .execute(pool)
    .await?;

    Ok(())
}

pub fn extract_etag(headers: &HeaderMap) -> Option<String> {
    headers
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim_matches('"').to_string())
}

pub fn extract_expires(headers: &HeaderMap) -> i64 {
    headers
        .get("expires")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            chrono::DateTime::parse_from_rfc2822(s)
                .ok()
                .map(|dt| dt.timestamp())
        })
        .or_else(|| {
            headers
                .get("cache-control")
                .and_then(|v| v.to_str().ok())
                .and_then(|cache_control| {
                    cache_control.split(',').find_map(|part| {
                        let part = part.trim();
                        if part.starts_with("max-age=") {
                            part.strip_prefix("max-age=")
                                .and_then(|s| s.parse::<i64>().ok())
                                .map(|max_age| Utc::now().timestamp() + max_age)
                        } else {
                            None
                        }
                    })
                })
        })
        .unwrap_or_else(|| Utc::now().timestamp() + 300)
}

pub async fn clear_character_cache(pool: &Pool, character_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM esi_cache WHERE cache_key LIKE ?")
        .bind(format!("%:{}", character_id))
        .execute(pool)
        .await?;

    Ok(())
}
