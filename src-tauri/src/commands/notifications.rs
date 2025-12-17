use chrono::NaiveDateTime;
use serde::Serialize;
use tauri::State;

use crate::db;

#[derive(Debug, Clone, Serialize)]
pub struct NotificationResponse {
    pub id: i64,
    pub character_id: i64,
    pub notification_type: String,
    pub title: String,
    pub message: String,
    pub status: String,
    pub created_at: String,
}

impl From<db::Notification> for NotificationResponse {
    fn from(n: db::Notification) -> Self {
        let created_at = if let Ok(naive_dt) =
            NaiveDateTime::parse_from_str(&n.created_at, "%Y-%m-%d %H:%M:%S")
        {
            let utc_dt = naive_dt.and_utc();
            utc_dt.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        } else {
            n.created_at
        };

        NotificationResponse {
            id: n.id,
            character_id: n.character_id,
            notification_type: n.notification_type,
            title: n.title,
            message: n.message,
            status: n.status,
            created_at,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct NotificationSettingResponse {
    pub id: i64,
    pub character_id: i64,
    pub notification_type: String,
    pub enabled: bool,
    pub config: Option<String>,
}

impl From<db::NotificationSetting> for NotificationSettingResponse {
    fn from(s: db::NotificationSetting) -> Self {
        NotificationSettingResponse {
            id: s.id,
            character_id: s.character_id,
            notification_type: s.notification_type,
            enabled: s.enabled,
            config: s.config,
        }
    }
}

#[tauri::command]
pub async fn get_notifications(
    pool: State<'_, db::Pool>,
    character_id: Option<i64>,
    status: Option<String>,
) -> Result<Vec<NotificationResponse>, String> {
    let notifications = db::get_notifications(&pool, character_id, status.as_deref())
        .await
        .map_err(|e| format!("Failed to get notifications: {}", e))?;

    Ok(notifications
        .into_iter()
        .map(NotificationResponse::from)
        .collect())
}

#[tauri::command]
pub async fn dismiss_notification(
    pool: State<'_, db::Pool>,
    notification_id: i64,
) -> Result<(), String> {
    db::dismiss_notification(&pool, notification_id)
        .await
        .map_err(|e| format!("Failed to dismiss notification: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_notification_settings(
    pool: State<'_, db::Pool>,
    character_id: i64,
) -> Result<Vec<NotificationSettingResponse>, String> {
    let settings = db::get_notification_settings(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get notification settings: {}", e))?;

    Ok(settings
        .into_iter()
        .map(NotificationSettingResponse::from)
        .collect())
}

#[tauri::command]
pub async fn upsert_notification_setting(
    pool: State<'_, db::Pool>,
    character_id: i64,
    notification_type: String,
    enabled: bool,
    config: Option<String>,
) -> Result<(), String> {
    let config_value = config
        .as_ref()
        .map(|c| serde_json::from_str::<serde_json::Value>(c))
        .transpose()
        .map_err(|e| format!("Invalid config JSON: {}", e))?;

    let config_str = config_value
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    db::upsert_notification_setting(
        &pool,
        character_id,
        &notification_type,
        enabled,
        config_str.as_deref(),
    )
    .await
    .map_err(|e| format!("Failed to upsert notification setting: {}", e))?;

    Ok(())
}
