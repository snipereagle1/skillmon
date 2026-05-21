use super::Pool;
use anyhow::Result;

pub async fn get_app_setting(pool: &Pool, key: &str) -> Result<Option<String>> {
    let value = sqlx::query_scalar::<_, String>("SELECT value FROM app_settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(value)
}

pub async fn set_app_setting(pool: &Pool, key: &str, value: &str) -> Result<()> {
    sqlx::query("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)")
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_boolean_app_setting(pool: &Pool, key: &str) -> Result<bool> {
    Ok(get_app_setting(pool, key)
        .await?
        .map(|v| v == "true")
        .unwrap_or(false))
}

pub async fn set_boolean_app_setting(pool: &Pool, key: &str, value: bool) -> Result<()> {
    set_app_setting(pool, key, if value { "true" } else { "false" }).await
}

const EXPANDED_PLAN_GROUPS_KEY: &str = "expanded_plan_groups";

/// Returns the persisted list of expanded plan group ids, filtered to ids that
/// still exist in `plan_groups` so stale ids from another session are silently dropped.
/// Empty Vec = nothing expanded (also the default for a brand-new user).
pub async fn get_expanded_plan_groups(pool: &Pool) -> Result<Vec<i64>> {
    let Some(raw) = get_app_setting(pool, EXPANDED_PLAN_GROUPS_KEY).await? else {
        return Ok(Vec::new());
    };
    let existing = sqlx::query_scalar::<_, i64>(
        "SELECT group_id FROM plan_groups \
         WHERE group_id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))",
    )
    .bind(&raw)
    .fetch_all(pool)
    .await?;
    Ok(existing)
}

pub async fn set_expanded_plan_groups(pool: &Pool, group_ids: &[i64]) -> Result<()> {
    let json = serde_json::to_string(group_ids)?;
    set_app_setting(pool, EXPANDED_PLAN_GROUPS_KEY, &json).await
}
