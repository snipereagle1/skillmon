use anyhow::Result;
use serde::Serialize;
use sqlx::{sqlite::SqliteRow, FromRow, Row};

use super::Pool;

#[derive(Debug, Clone, Serialize)]
pub struct NotificationSetting {
    pub id: i64,
    pub character_id: i64,
    pub notification_type: String,
    pub enabled: bool,
    pub config: Option<String>,
}

impl<'r> FromRow<'r, SqliteRow> for NotificationSetting {
    fn from_row(row: &'r SqliteRow) -> Result<Self, sqlx::Error> {
        Ok(NotificationSetting {
            id: row.get("id"),
            character_id: row.get("character_id"),
            notification_type: row.get("notification_type"),
            enabled: row.get::<i64, _>("enabled") != 0,
            config: row.get("config"),
        })
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Notification {
    pub id: i64,
    pub character_id: i64,
    pub notification_type: String,
    pub title: String,
    pub message: String,
    pub status: String,
    pub created_at: String,
}

pub async fn get_notification_settings(
    pool: &Pool,
    character_id: i64,
) -> Result<Vec<NotificationSetting>> {
    let settings = sqlx::query_as::<_, NotificationSetting>(
        "SELECT id, character_id, notification_type, enabled, config FROM notification_settings WHERE character_id = ?",
    )
    .bind(character_id)
    .fetch_all(pool)
    .await?;

    Ok(settings)
}

pub async fn get_notification_setting(
    pool: &Pool,
    character_id: i64,
    notification_type: &str,
) -> Result<Option<NotificationSetting>> {
    let setting = sqlx::query_as::<_, NotificationSetting>(
        "SELECT id, character_id, notification_type, enabled, config FROM notification_settings WHERE character_id = ? AND notification_type = ?",
    )
    .bind(character_id)
    .bind(notification_type)
    .fetch_optional(pool)
    .await?;

    Ok(setting)
}

pub async fn upsert_notification_setting(
    pool: &Pool,
    character_id: i64,
    notification_type: &str,
    enabled: bool,
    config: Option<&str>,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO notification_settings (character_id, notification_type, enabled, config)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(character_id, notification_type) DO UPDATE SET enabled = ?, config = ?",
    )
    .bind(character_id)
    .bind(notification_type)
    .bind(if enabled { 1 } else { 0 })
    .bind(config)
    .bind(if enabled { 1 } else { 0 })
    .bind(config)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_notifications(
    pool: &Pool,
    character_id: Option<i64>,
    status: Option<&str>,
) -> Result<Vec<Notification>> {
    let mut query_builder: sqlx::QueryBuilder<sqlx::Sqlite> = sqlx::QueryBuilder::new(
        "SELECT id, character_id, notification_type, title, message, status, created_at FROM notifications",
    );

    let mut has_where = false;
    if let Some(cid) = character_id {
        if !has_where {
            query_builder.push(" WHERE ");
            has_where = true;
        } else {
            query_builder.push(" AND ");
        }
        query_builder.push("character_id = ");
        query_builder.push_bind(cid);
    }
    if let Some(s) = status {
        if !has_where {
            query_builder.push(" WHERE ");
        } else {
            query_builder.push(" AND ");
        }
        query_builder.push("status = ");
        query_builder.push_bind(s);
    }

    query_builder.push(" ORDER BY created_at DESC");

    let query = query_builder.build_query_as::<Notification>();
    let notifications = query.fetch_all(pool).await?;

    Ok(notifications)
}

pub async fn create_notification(
    pool: &Pool,
    character_id: i64,
    notification_type: &str,
    title: &str,
    message: &str,
) -> Result<i64> {
    sqlx::query(
        "INSERT INTO notifications (character_id, notification_type, title, message, status)
         VALUES (?, ?, ?, ?, 'active')",
    )
    .bind(character_id)
    .bind(notification_type)
    .bind(title)
    .bind(message)
    .execute(pool)
    .await?;

    let id = sqlx::query_scalar::<_, i64>("SELECT last_insert_rowid()")
        .fetch_one(pool)
        .await?;

    Ok(id)
}

pub async fn dismiss_notification(pool: &Pool, notification_id: i64) -> Result<()> {
    sqlx::query("UPDATE notifications SET status = 'dismissed' WHERE id = ?")
        .bind(notification_id)
        .execute(pool)
        .await?;

    Ok(())
}

#[allow(dead_code)]
pub async fn has_active_notification(
    pool: &Pool,
    character_id: i64,
    notification_type: &str,
) -> Result<bool> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM notifications WHERE character_id = ? AND notification_type = ? AND status = 'active'",
    )
    .bind(character_id)
    .bind(notification_type)
    .fetch_one(pool)
    .await?;

    Ok(count > 0)
}

pub async fn clear_notification(
    pool: &Pool,
    character_id: i64,
    notification_type: &str,
) -> Result<()> {
    sqlx::query("UPDATE notifications SET status = 'dismissed' WHERE character_id = ? AND notification_type = ? AND status = 'active'")
        .bind(character_id)
        .bind(notification_type)
        .execute(pool)
        .await?;

    Ok(())
}
