use std::collections::HashMap;

use anyhow::Result;
use tauri_plugin_notification::NotificationExt;

use crate::cache;
use crate::db;
use crate::notifications::{NotificationChecker, NotificationContext};
use crate::utils;

pub const NOTIFICATION_TYPE_SKILL_QUEUE_LOW: &str = "skill_queue_low";

pub struct SkillQueueLowChecker;

#[async_trait::async_trait]
impl NotificationChecker for SkillQueueLowChecker {
    fn notification_type(&self) -> &'static str {
        NOTIFICATION_TYPE_SKILL_QUEUE_LOW
    }

    fn data_triggers(&self) -> &[&'static str] {
        &["skill_queue"]
    }

    async fn check(&self, ctx: &NotificationContext<'_>, character_id: i64) -> Result<()> {
        let setting =
            db::get_notification_setting(ctx.pool, character_id, NOTIFICATION_TYPE_SKILL_QUEUE_LOW)
                .await?;

        if let Some(setting) = setting {
            if !setting.enabled {
                db::clear_notification(ctx.pool, character_id, NOTIFICATION_TYPE_SKILL_QUEUE_LOW)
                    .await
                    .ok();
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

            let all_notifications = db::get_notifications(ctx.pool, Some(character_id), None)
                .await
                .ok();
            let active_count = all_notifications
                .as_ref()
                .map(|n| {
                    n.iter()
                        .filter(|notif| {
                            notif.notification_type == NOTIFICATION_TYPE_SKILL_QUEUE_LOW
                                && notif.status == "active"
                        })
                        .count()
                })
                .unwrap_or(0);
            let has_active = active_count > 0;

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
                db::clear_notification(ctx.pool, character_id, NOTIFICATION_TYPE_SKILL_QUEUE_LOW)
                    .await?;
            }
        }

        Ok(())
    }
}

fn calculate_hours_from_sp(
    queue_data: &[serde_json::Value],
    skill_sp_map: &HashMap<i64, i64>,
    skill_attributes: &HashMap<i64, utils::SkillAttributes>,
    char_attrs: Option<&db::CharacterAttributes>,
) -> Option<f64> {
    let mut total_hours = 0.0;
    let mut has_skills = false;
    let mut has_finish_dates = false;

    for item in queue_data {
        has_skills = true;
        if item.get("finish_date").and_then(|v| v.as_str()).is_some() {
            has_finish_dates = true;
        }

        let skill_id = item.get("skill_id")?.as_i64()?;
        let level_start_sp = item.get("level_start_sp")?.as_i64()?;
        let level_end_sp = item.get("level_end_sp")?.as_i64()?;

        // Get current SP (use training_start_sp if available, otherwise use current skill SP)
        let current_sp = item
            .get("training_start_sp")
            .and_then(|v| v.as_i64())
            .or_else(|| skill_sp_map.get(&skill_id).copied())
            .unwrap_or(level_start_sp);
        let current_sp = current_sp.max(level_start_sp);
        let remaining_sp = level_end_sp - current_sp;

        if remaining_sp <= 0 {
            continue;
        }

        // Calculate SP per minute
        if let Some(skill_attr) = skill_attributes.get(&skill_id) {
            if let (Some(primary_attr_id), Some(secondary_attr_id)) =
                (skill_attr.primary_attribute, skill_attr.secondary_attribute)
            {
                if let Some(attrs) = char_attrs {
                    let primary_value = match primary_attr_id {
                        164 => attrs.charisma,
                        165 => attrs.intelligence,
                        166 => attrs.memory,
                        167 => attrs.perception,
                        168 => attrs.willpower,
                        _ => continue,
                    };
                    let secondary_value = match secondary_attr_id {
                        164 => attrs.charisma,
                        165 => attrs.intelligence,
                        166 => attrs.memory,
                        167 => attrs.perception,
                        168 => attrs.willpower,
                        _ => continue,
                    };
                    let sp_per_min = utils::calculate_sp_per_minute(primary_value, secondary_value);
                    if sp_per_min > 0.0 {
                        let sp_per_hour = sp_per_min * 60.0;
                        total_hours += remaining_sp as f64 / sp_per_hour;
                    }
                }
            }
        }
    }

    // Paused queue (skills exist but no finish dates) - return None to skip
    if has_skills && !has_finish_dates {
        return None;
    }

    Some(total_hours)
}

async fn get_cached_queue_hours(pool: &db::Pool, character_id: i64) -> Result<Option<f64>> {
    let endpoint_path = format!("characters/{}/skillqueue", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    let queue_data = match cache::get_cached_response(pool, &cache_key).await? {
        Some(entry) => serde_json::from_str::<Vec<serde_json::Value>>(&entry.response_body)?,
        None => return Ok(None), // No cache = skip notification check (can't determine queue state reliably)
    };

    // Get character attributes
    let char_attrs = db::get_character_attributes(pool, character_id)
        .await
        .ok()
        .flatten();

    // Get skill SP map
    let mut skill_sp_map = HashMap::new();
    if let Ok(skills) = db::get_character_skills(pool, character_id).await {
        for skill in skills {
            skill_sp_map.insert(skill.skill_id, skill.skillpoints_in_skill);
        }
    }

    // Get skill IDs from queue
    let skill_ids: Vec<i64> = queue_data
        .iter()
        .filter_map(|item| item.get("skill_id")?.as_i64())
        .collect();

    // Get skill attributes
    let skill_attributes = utils::get_skill_attributes(pool, &skill_ids)
        .await
        .unwrap_or_default();

    Ok(calculate_hours_from_sp(
        &queue_data,
        &skill_sp_map,
        &skill_attributes,
        char_attrs.as_ref(),
    ))
}
