use anyhow::Result;
use tauri_plugin_notification::NotificationExt;

use crate::commands::skill_queues::SkillQueueItem;
use crate::db;
use crate::notifications::{NotificationChecker, NotificationContext};
use crate::skill_queue::calculate_total_queue_hours;

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

            let skill_queue =
                get_character_skill_queue(ctx.pool, ctx.rate_limits, character_id).await?;
            let total_hours = calculate_total_queue_hours(&skill_queue);

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

async fn get_character_skill_queue(
    pool: &db::Pool,
    rate_limits: &crate::esi::RateLimitStore,
    character_id: i64,
) -> Result<Vec<SkillQueueItem>> {
    let queue_data = crate::esi_helpers::get_cached_skill_queue(
        pool,
        &crate::esi_helpers::create_authenticated_client(
            &crate::auth::ensure_valid_access_token(pool, character_id).await?,
        )?,
        character_id,
        rate_limits,
    )
    .await?;

    let queue_data = match queue_data {
        Some(data) => data,
        None => return Ok(Vec::new()),
    };

    let mut skill_ids = Vec::new();
    let now = chrono::Utc::now();
    let mut skill_queue: Vec<SkillQueueItem> = queue_data
        .into_iter()
        .filter_map(|item: serde_json::Value| {
            let obj = item.as_object()?;
            let skill_id = obj.get("skill_id")?.as_i64()?;
            let queue_pos = obj.get("queue_position")?.as_i64()? as i32;

            if let Some(finish_str) = obj.get("finish_date").and_then(|v| v.as_str()) {
                if let Ok(finish) = chrono::DateTime::parse_from_rfc3339(finish_str) {
                    let finish_utc = finish.with_timezone(&chrono::Utc);
                    if now >= finish_utc {
                        return None;
                    }
                }
            }

            skill_ids.push(skill_id);
            Some(SkillQueueItem {
                skill_id,
                skill_name: None,
                queue_position: queue_pos,
                finished_level: obj.get("finished_level")?.as_i64()? as i32,
                start_date: obj
                    .get("start_date")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                finish_date: obj
                    .get("finish_date")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                training_start_sp: obj.get("training_start_sp").and_then(|v| v.as_i64()),
                level_start_sp: obj.get("level_start_sp").and_then(|v| v.as_i64()),
                level_end_sp: obj.get("level_end_sp").and_then(|v| v.as_i64()),
                current_sp: None,
                sp_per_minute: None,
                primary_attribute: None,
                secondary_attribute: None,
                rank: None,
            })
        })
        .collect();

    let skill_names = crate::utils::get_skill_names(pool, &skill_ids)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get skill names: {}", e))?;
    let skill_attributes = crate::utils::get_skill_attributes(pool, &skill_ids)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get skill attributes: {}", e))?;

    let character_attributes = db::get_character_attributes(pool, character_id)
        .await
        .ok()
        .flatten();
    let mut skill_sp_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    if let Ok(skills) = db::get_character_skills(pool, character_id).await {
        for skill in skills {
            skill_sp_map.insert(skill.skill_id, skill.skillpoints_in_skill);
        }
    }

    for skill_item in &mut skill_queue {
        if let Some(name) = skill_names.get(&skill_item.skill_id) {
            skill_item.skill_name = Some(name.clone());
        }

        let known_sp = skill_sp_map.get(&skill_item.skill_id).copied();
        let current_tracker = None;

        let is_currently_training = skill_item.queue_position == 0 || {
            let now = chrono::Utc::now();
            if let (Some(start_str), Some(finish_str)) =
                (&skill_item.start_date, &skill_item.finish_date)
            {
                if let (Ok(start), Ok(finish)) = (
                    chrono::DateTime::parse_from_rfc3339(start_str),
                    chrono::DateTime::parse_from_rfc3339(finish_str),
                ) {
                    let start_utc = start.with_timezone(&chrono::Utc);
                    let finish_utc = finish.with_timezone(&chrono::Utc);
                    now >= start_utc && now < finish_utc
                } else {
                    false
                }
            } else {
                false
            }
        };

        let mut progress_sp = if is_currently_training {
            let base_sp = known_sp
                .or(skill_item.training_start_sp)
                .or(skill_item.level_start_sp)
                .unwrap_or(0);

            if let (Some(start_str), Some(finish_str)) =
                (&skill_item.start_date, &skill_item.finish_date)
            {
                if let (Ok(start), Ok(finish)) = (
                    chrono::DateTime::parse_from_rfc3339(start_str),
                    chrono::DateTime::parse_from_rfc3339(finish_str),
                ) {
                    let start_utc = start.with_timezone(&chrono::Utc);
                    let finish_utc = finish.with_timezone(&chrono::Utc);
                    let now = chrono::Utc::now();

                    if now >= start_utc && now < finish_utc {
                        let total_duration = (finish_utc - start_utc).num_seconds() as f64;
                        let elapsed_duration = (now - start_utc).num_seconds() as f64;

                        if total_duration > 0.0 && elapsed_duration > 0.0 {
                            let total_sp_needed = skill_item.level_end_sp.unwrap_or(0) - base_sp;
                            let progress_ratio = elapsed_duration / total_duration;
                            let sp_gained = (total_sp_needed as f64 * progress_ratio) as i64;
                            let calculated_sp = base_sp + sp_gained;

                            if let Some(level_end) = skill_item.level_end_sp {
                                if calculated_sp > level_end {
                                    level_end
                                } else {
                                    calculated_sp
                                }
                            } else {
                                calculated_sp
                            }
                        } else {
                            base_sp
                        }
                    } else {
                        base_sp
                    }
                } else {
                    base_sp
                }
            } else {
                base_sp
            }
        } else {
            current_tracker
                .or(known_sp)
                .or(skill_item.training_start_sp)
                .or(skill_item.level_start_sp)
                .unwrap_or(0)
        };

        if is_currently_training {
            if let Some(level_end) = skill_item.level_end_sp {
                if progress_sp > level_end {
                    progress_sp = level_end;
                }
            }
        } else {
            if let Some(level_start) = skill_item.level_start_sp {
                if progress_sp < level_start {
                    progress_sp = level_start;
                }
            }
            if let Some(level_end) = skill_item.level_end_sp {
                if progress_sp > level_end {
                    progress_sp = level_end;
                }
            }
        }

        skill_item.current_sp = Some(progress_sp);

        if let Some(skill_attr) = skill_attributes.get(&skill_item.skill_id) {
            skill_item.primary_attribute = skill_attr.primary_attribute;
            skill_item.secondary_attribute = skill_attr.secondary_attribute;
            skill_item.rank = skill_attr.rank;

            if let Some(attrs) = &character_attributes {
                if let (Some(primary_attr_id), Some(secondary_attr_id)) =
                    (skill_attr.primary_attribute, skill_attr.secondary_attribute)
                {
                    let primary_value = match primary_attr_id {
                        164 => attrs.charisma,
                        165 => attrs.intelligence,
                        166 => attrs.memory,
                        167 => attrs.perception,
                        168 => attrs.willpower,
                        _ => {
                            eprintln!(
                                "Unknown primary attribute ID: {} for skill {}",
                                primary_attr_id, skill_item.skill_id
                            );
                            0
                        }
                    };
                    let secondary_value = match secondary_attr_id {
                        164 => attrs.charisma,
                        165 => attrs.intelligence,
                        166 => attrs.memory,
                        167 => attrs.perception,
                        168 => attrs.willpower,
                        _ => {
                            eprintln!(
                                "Unknown secondary attribute ID: {} for skill {}",
                                secondary_attr_id, skill_item.skill_id
                            );
                            0
                        }
                    };
                    let sp_per_min =
                        crate::utils::calculate_sp_per_minute(primary_value, secondary_value);
                    skill_item.sp_per_minute = Some(sp_per_min);
                }
            }
        }
    }

    Ok(skill_queue)
}
