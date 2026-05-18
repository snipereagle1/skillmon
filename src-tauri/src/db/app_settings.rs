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
