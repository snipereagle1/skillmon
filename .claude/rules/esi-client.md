---
paths:
  - "src-tauri/src/esi/**"
  - "src-tauri/src/cache/**"
---

# ESI Client System

## Overview

The ESI client (`src-tauri/src/esi/`) is auto-generated from the EVE Online OpenAPI schema. Use `./scripts/generate-esi.sh` to regenerate. Never edit `client.rs` or `types.rs` manually.

## Files

| File | Description |
|------|-------------|
| `mod.rs` | Module exports, `BASE_URL`, `BASE_SCOPES` |
| `client.rs` | **Generated** — do not edit |
| `types.rs` | **Generated** — do not edit |
| `scopes.rs` | `EsiScope` enum, `BASE_SCOPES` constant |
| `cached.rs` | `fetch_cached()` — unified caching + rate limit tracking |
| `openapi.json` | Cached OpenAPI schema |

## Primary Function: `esi::fetch_cached()`

Always use this for ESI requests — never call ESI endpoints directly.

```rust
use esi::{fetch_cached, RateLimitStore};
use crate::{cache, db};

async fn get_skill_queue(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &RateLimitStore,
) -> Result<Option<SkillQueueResponse>> {
    let endpoint_path = format!("characters/{}/skillqueue", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    fetch_cached::<SkillQueueResponse>(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    ).await
}
```

`fetch_cached()` handles:
1. Cache lookup
2. ETag conditional requests (`If-None-Match`)
3. `304 Not Modified` → return cached data
4. Rate limit tracking from response headers
5. Storing response with expiration

## Rate Limiting

Tracked per character via `esi::RateLimitStore` (`Arc<RwLock<HashMap<i64, HashMap<String, RateLimitInfo>>>>`).

From response headers:
- `x-ratelimit-group` — rate limit group name
- `x-ratelimit-limit` — format `{limit}/{window}m` (e.g. `100/60m`)
- `x-ratelimit-remaining` — remaining requests

Include `rate_limits: State<'_, esi::RateLimitStore>` in any Tauri command that calls ESI.

## Cache Helpers (`src-tauri/src/cache/mod.rs`)

```rust
cache::build_cache_key(&endpoint_path, character_id)
cache::get_cached_response(pool, &cache_key)
cache::set_cached_response(pool, &cache_key, etag, expires_at, &body)
cache::extract_etag(&headers)
cache::extract_expires(&headers)
cache::clear_character_cache(pool, character_id)  // use when forcing refresh
```

## Authenticated Client

```rust
fn create_authenticated_client(access_token: &str) -> Result<reqwest::Client> {
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", access_token))?);
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(Into::into)
}
```

The access token comes from the `tokens` table.

## ESI Cache Table (`esi_cache`)

| Column | Description |
|--------|-------------|
| `cache_key` | e.g. `"characters/12345/skillqueue"` |
| `etag` | For conditional requests |
| `expires_at` | Unix timestamp |
| `response_body` | JSON response |
