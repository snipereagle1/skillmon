use std::collections::HashMap;

use anyhow::Result;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::auth;
use crate::cache;
use crate::db;
use crate::esi;
use crate::esi_helpers;
use crate::utils;

use crate::commands::attributes::CharacterAttributesResponse;
use crate::commands::skill_queues::{CharacterSkillQueue, SkillQueueItem};

pub const NOTIFICATION_TYPE_SKILL_QUEUE_LOW: &str = "skill_queue_low";

fn calculate_total_queue_hours(skill_queue: &[SkillQueueItem]) -> f64 {
    let mut total_hours = 0.0;
    for skill in skill_queue {
        if let Some(sp_per_min) = skill.sp_per_minute {
            if sp_per_min > 0.0 {
                if let (Some(level_start), Some(level_end)) =
                    (skill.level_start_sp, skill.level_end_sp)
                {
                    let current_sp = skill.current_sp.unwrap_or(level_start);
                    let remaining_sp = level_end - current_sp;
                    if remaining_sp > 0 {
                        let sp_per_hour = sp_per_min * 60.0;
                        total_hours += remaining_sp as f64 / sp_per_hour;
                    }
                }
            }
        }
    }
    total_hours
}

pub async fn check_skill_queue_notifications(
    app: &AppHandle,
    pool: &db::Pool,
    character_id: i64,
    skill_queue: &[SkillQueueItem],
) -> Result<()> {
    let setting =
        db::get_notification_setting(pool, character_id, NOTIFICATION_TYPE_SKILL_QUEUE_LOW).await?;

    if let Some(setting) = setting {
        if !setting.enabled {
            db::clear_notification(pool, character_id, NOTIFICATION_TYPE_SKILL_QUEUE_LOW)
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

        let total_hours = calculate_total_queue_hours(skill_queue);

        let all_notifications = db::get_notifications(pool, Some(character_id), None)
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

                let character_name = db::get_character(pool, character_id)
                    .await
                    .ok()
                    .flatten()
                    .map(|c| c.character_name)
                    .unwrap_or_else(|| format!("Character {}", character_id));

                db::create_notification(
                    pool,
                    character_id,
                    NOTIFICATION_TYPE_SKILL_QUEUE_LOW,
                    title,
                    &message,
                )
                .await?;

                let notification_title = format!("{} - {}", character_name, title);
                if let Err(e) = app
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
            db::clear_notification(pool, character_id, NOTIFICATION_TYPE_SKILL_QUEUE_LOW).await?;
        }
    }

    Ok(())
}

pub async fn refresh_all_skill_queues(
    app: &AppHandle,
    pool: &db::Pool,
    rate_limits: &esi::RateLimitStore,
) {
    let characters = match db::get_all_characters(pool).await {
        Ok(chars) => chars,
        Err(e) => {
            eprintln!("Failed to get characters for startup refresh: {}", e);
            return;
        }
    };

    for character in characters {
        let _ = build_character_skill_queue(
            app,
            pool,
            rate_limits,
            character.character_id,
            &character.character_name,
        )
        .await;
    }
}

pub async fn build_character_skill_queue(
    app: &AppHandle,
    pool: &db::Pool,
    rate_limits: &esi::RateLimitStore,
    character_id: i64,
    character_name: &str,
) -> Result<Option<CharacterSkillQueue>, String> {
    let access_token = match auth::ensure_valid_access_token(pool, character_id).await {
        Ok(token) => token,
        Err(e) => {
            eprintln!(
                "Failed to get valid token for character {}: {}",
                character_id, e
            );
            return Ok(None);
        }
    };

    let client = esi_helpers::create_authenticated_client(&access_token)
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let character_attributes = match esi_helpers::get_cached_character_attributes(
        pool,
        &client,
        character_id,
        rate_limits,
    )
    .await
    {
        Ok(Some(attrs)) => Some(CharacterAttributesResponse {
            charisma: attrs.charisma,
            intelligence: attrs.intelligence,
            memory: attrs.memory,
            perception: attrs.perception,
            willpower: attrs.willpower,
        }),
        Ok(None) => {
            if let Ok(Some(cached_attrs)) = db::get_character_attributes(pool, character_id).await {
                Some(CharacterAttributesResponse {
                    charisma: cached_attrs.charisma,
                    intelligence: cached_attrs.intelligence,
                    memory: cached_attrs.memory,
                    perception: cached_attrs.perception,
                    willpower: cached_attrs.willpower,
                })
            } else {
                None
            }
        }
        Err(e) => {
            eprintln!(
                "Failed to fetch attributes for character {}: {}",
                character_id, e
            );
            if let Ok(Some(cached_attrs)) = db::get_character_attributes(pool, character_id).await {
                Some(CharacterAttributesResponse {
                    charisma: cached_attrs.charisma,
                    intelligence: cached_attrs.intelligence,
                    memory: cached_attrs.memory,
                    perception: cached_attrs.perception,
                    willpower: cached_attrs.willpower,
                })
            } else {
                None
            }
        }
    };

    esi_helpers::get_cached_character_skills(pool, &client, character_id, rate_limits)
        .await
        .ok();
    let mut skill_sp_map: HashMap<i64, i64> = HashMap::new();
    if let Ok(skills) = db::get_character_skills(pool, character_id).await {
        for skill in skills {
            skill_sp_map.insert(skill.skill_id, skill.skillpoints_in_skill);
        }
    }

    let updated_character = db::get_character(pool, character_id)
        .await
        .ok()
        .flatten()
        .unwrap_or(db::Character {
            character_id,
            character_name: character_name.to_string(),
            unallocated_sp: 0,
        });

    let queue_data = match esi_helpers::get_cached_skill_queue(
        pool,
        &client,
        character_id,
        rate_limits,
    )
    .await
    {
        Ok(Some(data)) => {
            let should_refresh = data.iter().any(|item: &serde_json::Value| {
                if let Some(obj) = item.as_object() {
                    if let (Some(queue_pos), Some(finish_str)) = (
                        obj.get("queue_position").and_then(|v| v.as_i64()),
                        obj.get("finish_date").and_then(|v| v.as_str()),
                    ) {
                        if queue_pos == 0 {
                            if let Ok(finish) = chrono::DateTime::parse_from_rfc3339(finish_str) {
                                let finish_utc = finish.with_timezone(&chrono::Utc);
                                let now = chrono::Utc::now();
                                return now >= finish_utc;
                            }
                        }
                    }
                }
                false
            });

            if should_refresh {
                cache::clear_character_cache(pool, character_id).await.ok();
                match esi_helpers::get_cached_skill_queue(pool, &client, character_id, rate_limits)
                    .await
                {
                    Ok(Some(fresh_data)) => fresh_data,
                    Ok(None) => {
                        eprintln!(
                            "Failed to fetch skill queue for character {}: No data returned after refresh",
                            character_id
                        );
                        return Ok(None);
                    }
                    Err(e) => {
                        eprintln!(
                            "Failed to fetch skill queue for character {} after refresh: {}",
                            character_id, e
                        );
                        return Ok(None);
                    }
                }
            } else {
                data
            }
        }
        Ok(None) => {
            eprintln!(
                "Failed to fetch skill queue for character {}: No data returned",
                character_id
            );
            return Ok(None);
        }
        Err(e) => {
            eprintln!(
                "Failed to fetch skill queue for character {}: {}",
                character_id, e
            );
            return Ok(None);
        }
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

    let skill_names = utils::get_skill_names(pool, &skill_ids)
        .await
        .map_err(|e| format!("Failed to get skill names: {}", e))?;
    let skill_attributes = utils::get_skill_attributes(pool, &skill_ids)
        .await
        .map_err(|e| format!("Failed to get skill attributes: {}", e))?;

    let char_attrs = &character_attributes;
    let mut skill_progress_map: HashMap<i64, i64> = HashMap::new();

    for skill_item in &mut skill_queue {
        if let Some(name) = skill_names.get(&skill_item.skill_id) {
            skill_item.skill_name = Some(name.clone());
        }

        let known_sp = skill_sp_map.get(&skill_item.skill_id).copied();
        let current_tracker = skill_progress_map.get(&skill_item.skill_id).copied();

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

        if let Some(level_end) = skill_item.level_end_sp {
            let next_progress = std::cmp::max(progress_sp, level_end);
            skill_progress_map.insert(skill_item.skill_id, next_progress);
        } else {
            skill_progress_map.insert(skill_item.skill_id, progress_sp);
        }

        if let Some(skill_attr) = skill_attributes.get(&skill_item.skill_id) {
            skill_item.primary_attribute = skill_attr.primary_attribute;
            skill_item.secondary_attribute = skill_attr.secondary_attribute;
            skill_item.rank = skill_attr.rank;

            if let Some(attrs) = char_attrs {
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
                    let sp_per_min = utils::calculate_sp_per_minute(primary_value, secondary_value);
                    skill_item.sp_per_minute = Some(sp_per_min);
                }
            }
        }
    }

    let is_paused = if skill_queue.is_empty() {
        false
    } else {
        skill_queue.iter().all(|item| item.finish_date.is_none())
    };

    let queue_result = CharacterSkillQueue {
        character_id: updated_character.character_id,
        character_name: updated_character.character_name.clone(),
        skill_queue: skill_queue.clone(),
        attributes: character_attributes,
        unallocated_sp: updated_character.unallocated_sp,
        is_paused,
    };

    if let Err(e) = check_skill_queue_notifications(app, pool, character_id, &skill_queue).await {
        eprintln!(
            "Failed to check skill queue notifications for character {}: {}",
            character_id, e
        );
    }

    Ok(Some(queue_result))
}
