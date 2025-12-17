use serde::Serialize;
use tauri::State;

use crate::esi;

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

#[derive(Debug, Clone, Serialize)]
pub struct CharacterRateLimits {
    pub character_id: i64,
    pub limits: Vec<RateLimitResponse>,
}

#[tauri::command]
pub async fn get_rate_limits(
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
