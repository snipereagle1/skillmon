use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result};
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_LANGUAGE, IF_NONE_MATCH};
use serde::Serialize;
use tokio::sync::RwLock;

use crate::cache;
use crate::db;

#[derive(Debug, Clone, Serialize)]
pub struct RateLimitInfo {
    pub group: String,
    pub limit: i32,
    pub remaining: i32,
    pub window_minutes: i32,
    pub updated_at: chrono::DateTime<Utc>,
}

pub type RateLimitStore = Arc<RwLock<HashMap<i64, HashMap<String, RateLimitInfo>>>>;

pub fn extract_rate_limit_info(headers: &HeaderMap) -> Option<RateLimitInfo> {
    let group = headers.get("x-ratelimit-group")?.to_str().ok()?.to_string();
    let limit_str = headers.get("x-ratelimit-limit")?.to_str().ok()?;
    let remaining = headers
        .get("x-ratelimit-remaining")?
        .to_str()
        .ok()?
        .parse::<i32>()
        .ok()?;

    let (limit, window_minutes) = parse_limit_str(limit_str)?;

    Some(RateLimitInfo {
        group,
        limit,
        remaining,
        window_minutes,
        updated_at: Utc::now(),
    })
}

fn parse_limit_str(limit_str: &str) -> Option<(i32, i32)> {
    let parts: Vec<&str> = limit_str.split('/').collect();
    if parts.len() != 2 {
        return None;
    }

    let limit = parts[0].parse::<i32>().ok()?;
    let window_str = parts[1].trim_end_matches('m');

    let window_minutes = window_str.parse::<i32>().ok()?;

    Some((limit, window_minutes))
}

pub async fn fetch_cached<T: serde::de::DeserializeOwned>(
    pool: &db::Pool,
    client: &reqwest::Client,
    endpoint_path: &str,
    cache_key: &str,
    rate_limits: &RateLimitStore,
    character_id: i64,
) -> Result<Option<T>> {
    let cached_entry = cache::get_cached_response(pool, cache_key).await?;

    if let Some((cached_body, _)) = &cached_entry {
        let data: T =
            serde_json::from_str(cached_body).context("Failed to deserialize cached response")?;
        return Ok(Some(data));
    }

    let url = super::BASE_URL
        .parse::<reqwest::Url>()
        .context("Invalid base URL")?
        .join(endpoint_path)
        .context("Failed to construct request URL")?;

    let mut req_builder = client.get(url);
    req_builder = req_builder.header(ACCEPT_LANGUAGE, "en");
    req_builder = req_builder.header("x-compatibility-date", "2020-01-01");
    req_builder = req_builder.header("x-tenant", "tranquility");

    if let Some((_, Some(etag))) = &cached_entry {
        let header_value = HeaderValue::from_str(etag.as_str())?;
        req_builder = req_builder.header(IF_NONE_MATCH, header_value);
    }

    let response = req_builder.send().await?;
    let status = response.status();
    let headers = response.headers().clone();

    if let Some(info) = extract_rate_limit_info(&headers) {
        let mut store = rate_limits.write().await;
        store
            .entry(character_id)
            .or_insert_with(HashMap::new)
            .insert(info.group.clone(), info);
    }

    if status.as_u16() == 304 {
        if let Some((cached_body, _)) = cache::get_cached_response(pool, cache_key).await? {
            let data: T = serde_json::from_str(&cached_body)
                .context("Failed to deserialize cached response")?;
            return Ok(Some(data));
        }
    }

    if status.is_success() {
        let body_bytes = response.bytes().await?;
        let body_str = String::from_utf8_lossy(&body_bytes);

        let etag = cache::extract_etag(&headers);
        let expires_at = cache::extract_expires(&headers);

        cache::set_cached_response(pool, cache_key, etag.as_deref(), expires_at, &body_str).await?;

        let data: T = serde_json::from_str(&body_str).context("Failed to deserialize response")?;
        return Ok(Some(data));
    }

    Ok(None)
}
