use anyhow::Result;
use chrono::{DateTime, Utc};
use tauri_plugin_notification::NotificationExt;

use crate::cache;
use crate::db;
use crate::notifications::{self, DataType, NotificationChecker, NotificationContext};

pub const NOTIFICATION_TYPE_SKILL_QUEUE_LOW: &str = "skill_queue_low";

pub struct SkillQueueLowChecker;

#[async_trait::async_trait]
impl NotificationChecker for SkillQueueLowChecker {
    fn notification_type(&self) -> &'static str {
        NOTIFICATION_TYPE_SKILL_QUEUE_LOW
    }

    fn data_triggers(&self) -> &[DataType] {
        &[DataType::SkillQueue]
    }

    async fn check(&self, ctx: &NotificationContext<'_>, character_id: i64) -> Result<()> {
        let setting =
            db::get_notification_setting(ctx.pool, character_id, NOTIFICATION_TYPE_SKILL_QUEUE_LOW)
                .await?;

        if let Some(setting) = setting {
            if !setting.enabled {
                let cleared = db::clear_notification(
                    ctx.pool,
                    character_id,
                    NOTIFICATION_TYPE_SKILL_QUEUE_LOW,
                )
                .await?;
                if cleared {
                    if let Err(e) = notifications::emit_snapshot(ctx.app, ctx.pool).await {
                        eprintln!("Failed to emit notifications snapshot: {}", e);
                    }
                }
                return Ok(());
            }

            let threshold_hours: f64 = if let Some(config_str) = &setting.config {
                if let Ok(config) = serde_json::from_str::<serde_json::Value>(config_str) {
                    config
                        .get("threshold_hours")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(24.0)
                } else {
                    24.0
                }
            } else {
                24.0
            };

            let total_hours = match get_cached_queue_hours(ctx.pool, character_id).await? {
                Some(hours) => hours,
                None => return Ok(()), // Paused queue or missing cache - skip this notification
            };

            let has_active = db::has_active_notification(
                ctx.pool,
                character_id,
                NOTIFICATION_TYPE_SKILL_QUEUE_LOW,
            )
            .await?;

            if total_hours < threshold_hours {
                if !has_active {
                    let hours_str = if total_hours < 1.0 {
                        format!("{:.1} hours", total_hours)
                    } else {
                        format!("{:.0} hours", total_hours)
                    };
                    let title = "Skill Queue Low";
                    let message = format!(
                        "Skill queue has {} remaining (below {} hour threshold)",
                        hours_str, threshold_hours
                    );

                    let character_name = db::get_character(ctx.pool, character_id)
                        .await
                        .ok()
                        .flatten()
                        .map(|c| c.character_name)
                        .unwrap_or_else(|| format!("Character {}", character_id));

                    db::create_notification(
                        ctx.pool,
                        character_id,
                        NOTIFICATION_TYPE_SKILL_QUEUE_LOW,
                        title,
                        &message,
                    )
                    .await?;

                    if let Err(e) = notifications::emit_snapshot(ctx.app, ctx.pool).await {
                        eprintln!("Failed to emit notifications snapshot: {}", e);
                    }

                    let notification_title = format!("{} - {}", character_name, title);
                    if let Err(e) = ctx
                        .app
                        .notification()
                        .builder()
                        .title(&notification_title)
                        .body(&message)
                        .show()
                    {
                        eprintln!("Failed to send system notification: {}", e);
                    }
                }
            } else if has_active {
                let cleared = db::clear_notification(
                    ctx.pool,
                    character_id,
                    NOTIFICATION_TYPE_SKILL_QUEUE_LOW,
                )
                .await?;
                if cleared {
                    if let Err(e) = notifications::emit_snapshot(ctx.app, ctx.pool).await {
                        eprintln!("Failed to emit notifications snapshot: {}", e);
                    }
                }
            }
        }

        Ok(())
    }
}

async fn get_cached_queue_hours(pool: &db::Pool, character_id: i64) -> Result<Option<f64>> {
    let endpoint_path = format!("characters/{}/skillqueue", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    let queue_data = match cache::get_cached_response(pool, &cache_key).await? {
        Some(entry) => serde_json::from_str::<Vec<serde_json::Value>>(&entry.response_body)?,
        None => return Ok(None), // No cache = skip notification check
    };

    let now = Utc::now();
    let mut has_skills = false;
    let mut has_finish_dates = false;
    let mut last_finish: Option<DateTime<Utc>> = None;

    for item in &queue_data {
        has_skills = true;
        if let Some(finish_str) = item.get("finish_date").and_then(|v| v.as_str()) {
            has_finish_dates = true;
            if let Ok(finish_dt) = DateTime::parse_from_rfc3339(finish_str) {
                let finish_utc = finish_dt.with_timezone(&Utc);
                if now < finish_utc && last_finish.is_none_or(|prev| finish_utc > prev) {
                    last_finish = Some(finish_utc);
                }
            }
        }
    }

    // Paused queue (skills exist but no finish dates) - skip
    if has_skills && !has_finish_dates {
        return Ok(None);
    }

    Ok(Some(last_finish.map_or(0.0, |finish| {
        (finish - now).num_seconds() as f64 / 3600.0
    })))
}
