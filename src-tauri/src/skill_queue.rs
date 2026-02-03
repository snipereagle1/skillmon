use futures_util::future::join_all;
use std::collections::HashMap;

use anyhow::Result;
use tauri::{AppHandle, Emitter};

use crate::auth;
use crate::cache;
use crate::db;
use crate::esi;
use crate::esi_helpers;
use crate::utils;

use crate::commands::attributes::CharacterAttributesResponse;
use crate::commands::skill_queues::{
    is_skill_actively_training, CharacterSkillQueue, SkillQueueItem,
};

#[allow(dead_code)]
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

    let mut tasks = Vec::new();
    for character in characters {
        let app = app.clone();
        let pool = pool.clone();
        let rate_limits = rate_limits.clone();
        let char_id = character.character_id;
        let char_name = character.character_name.clone();

        tasks.push(tokio::spawn(async move {
            let _ =
                build_character_skill_queue(&app, &pool, &rate_limits, char_id, &char_name).await;
        }));
    }

    join_all(tasks).await;
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
            account_id: None,
            sort_order: 0,
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
            let should_refresh = data.iter().any(|item| {
                if let Some(finish_utc) = item.finish_date {
                    let now = chrono::Utc::now();
                    return now >= finish_utc;
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
        .filter_map(|item| {
            let skill_id = item.skill_id;
            let queue_pos = item.queue_position as i32;

            if let Some(finish_utc) = item.finish_date {
                if now >= finish_utc {
                    return None;
                }
            }

            skill_ids.push(skill_id);
            Some(SkillQueueItem {
                skill_id,
                skill_name: None,
                queue_position: queue_pos,
                finished_level: item.finished_level as i32,
                start_date: item.start_date.map(|d| d.to_rfc3339()),
                finish_date: item.finish_date.map(|d| d.to_rfc3339()),
                training_start_sp: item.training_start_sp,
                level_start_sp: item.level_start_sp,
                level_end_sp: item.level_end_sp,
                current_sp: None,
                sp_per_minute: None,
                primary_attribute: None,
                secondary_attribute: None,
                rank: None,
            })
        })
        .collect();

    let skill_names = utils::get_type_names(pool, &skill_ids)
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

        let is_currently_training = is_skill_actively_training(skill_item);

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

    let _ = app.emit(
        crate::notifications::EVENT_DATA_UPDATED,
        crate::notifications::DataUpdatedPayload {
            data_type: "skill_queue".to_string(),
            character_id,
        },
    );

    Ok(Some(queue_result))
}
