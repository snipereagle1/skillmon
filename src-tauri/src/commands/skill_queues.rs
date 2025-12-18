use std::collections::HashMap;

use serde::Serialize;
use tauri::State;

use crate::auth;
use crate::cache;
use crate::db;
use crate::esi;
use crate::esi_helpers;
use crate::skill_queue;
use crate::utils;

use super::attributes::CharacterAttributesResponse;

#[derive(Debug, Clone, Serialize)]
pub struct SkillQueueItem {
    pub skill_id: i64,
    pub skill_name: Option<String>,
    pub queue_position: i32,
    pub finished_level: i32,
    pub start_date: Option<String>,
    pub finish_date: Option<String>,
    pub training_start_sp: Option<i64>,
    pub level_start_sp: Option<i64>,
    pub level_end_sp: Option<i64>,
    pub current_sp: Option<i64>,
    pub sp_per_minute: Option<f64>,
    pub primary_attribute: Option<i64>,
    pub secondary_attribute: Option<i64>,
    pub rank: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterSkillQueue {
    pub character_id: i64,
    pub character_name: String,
    pub skill_queue: Vec<SkillQueueItem>,
    pub attributes: Option<CharacterAttributesResponse>,
    pub unallocated_sp: i64,
    pub is_paused: bool,
}

pub fn is_skill_actively_training(skill: &SkillQueueItem) -> bool {
    if skill.queue_position == 0 {
        return true;
    }

    if let (Some(start_str), Some(finish_str)) = (&skill.start_date, &skill.finish_date) {
        if let (Ok(start), Ok(finish)) = (
            chrono::DateTime::parse_from_rfc3339(start_str),
            chrono::DateTime::parse_from_rfc3339(finish_str),
        ) {
            let start_utc = start.with_timezone(&chrono::Utc);
            let finish_utc = finish.with_timezone(&chrono::Utc);
            let now = chrono::Utc::now();
            return now >= start_utc && now < finish_utc;
        }
    }

    false
}

#[tauri::command]
pub async fn get_skill_queues(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
) -> Result<Vec<CharacterSkillQueue>, String> {
    let characters = db::get_all_characters(&pool)
        .await
        .map_err(|e| format!("Failed to get characters: {}", e))?;

    let mut results = Vec::new();
    let mut all_skill_ids = Vec::new();
    let mut character_skill_sp: HashMap<i64, HashMap<i64, i64>> = HashMap::new();

    for character in characters {
        let access_token =
            match auth::ensure_valid_access_token(&pool, character.character_id).await {
                Ok(token) => token,
                Err(e) => {
                    eprintln!(
                        "Failed to get valid token for character {}: {}",
                        character.character_id, e
                    );
                    continue;
                }
            };

        let client = esi_helpers::create_authenticated_client(&access_token)
            .map_err(|e| format!("Failed to create client: {}", e))?;

        let character_attributes = match esi_helpers::get_cached_character_attributes(
            &pool,
            &client,
            character.character_id,
            &rate_limits,
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
                if let Ok(Some(cached_attrs)) =
                    db::get_character_attributes(&pool, character.character_id).await
                {
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
                    character.character_id, e
                );
                if let Ok(Some(cached_attrs)) =
                    db::get_character_attributes(&pool, character.character_id).await
                {
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

        esi_helpers::get_cached_character_skills(
            &pool,
            &client,
            character.character_id,
            &rate_limits,
        )
        .await
        .ok();
        let mut skill_sp_map: HashMap<i64, i64> = HashMap::new();
        if let Ok(skills) = db::get_character_skills(&pool, character.character_id).await {
            for skill in skills {
                skill_sp_map.insert(skill.skill_id, skill.skillpoints_in_skill);
            }
        }
        character_skill_sp.insert(character.character_id, skill_sp_map);

        let character_id = character.character_id;
        let character_name = character.character_name.clone();
        let updated_character = db::get_character(&pool, character_id)
            .await
            .ok()
            .flatten()
            .unwrap_or(db::Character {
                character_id,
                character_name: character_name.clone(),
                unallocated_sp: 0,
                account_id: None,
                sort_order: 0,
            });

        match esi_helpers::get_cached_skill_queue(&pool, &client, character_id, &rate_limits).await
        {
            Ok(Some(queue_data)) => {
                let now = chrono::Utc::now();
                let skill_queue: Vec<SkillQueueItem> = queue_data
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

                        all_skill_ids.push(skill_id);
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
                            training_start_sp: obj
                                .get("training_start_sp")
                                .and_then(|v| v.as_i64()),
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

                let is_paused = if skill_queue.is_empty() {
                    false
                } else {
                    skill_queue.iter().all(|item| item.finish_date.is_none())
                };

                results.push(CharacterSkillQueue {
                    character_id: updated_character.character_id,
                    character_name: updated_character.character_name,
                    skill_queue,
                    attributes: character_attributes,
                    unallocated_sp: updated_character.unallocated_sp,
                    is_paused,
                });
            }
            Ok(None) => {
                eprintln!(
                    "Failed to fetch skill queue for character {}: No data returned",
                    character.character_id
                );
            }
            Err(e) => {
                eprintln!(
                    "Failed to fetch skill queue for character {}: {}",
                    character.character_id, e
                );
            }
        }
    }

    let unique_skill_ids: Vec<i64> = all_skill_ids
        .iter()
        .copied()
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let skill_names = utils::get_skill_names(&pool, &unique_skill_ids)
        .await
        .map_err(|e| format!("Failed to get skill names: {}", e))?;
    let skill_attributes = utils::get_skill_attributes(&pool, &unique_skill_ids)
        .await
        .map_err(|e| format!("Failed to get skill attributes: {}", e))?;

    for result in &mut results {
        let char_attrs = &result.attributes;
        let mut skill_progress_map: HashMap<i64, i64> = HashMap::new();
        let skill_known_sp = character_skill_sp
            .get(&result.character_id)
            .cloned()
            .unwrap_or_default();
        for skill_item in &mut result.skill_queue {
            if let Some(name) = skill_names.get(&skill_item.skill_id) {
                skill_item.skill_name = Some(name.clone());
            }

            let known_sp = skill_known_sp.get(&skill_item.skill_id).copied();
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
                                let total_sp_needed = skill_item.level_end_sp.unwrap_or(0)
                                    - skill_item.level_start_sp.unwrap_or(0);
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
                        let sp_per_min =
                            utils::calculate_sp_per_minute(primary_value, secondary_value);
                        skill_item.sp_per_minute = Some(sp_per_min);
                    }
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_training_characters_count(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
) -> Result<i32, String> {
    let skill_queues = get_skill_queues(pool, rate_limits).await?;

    let count = skill_queues
        .iter()
        .filter(|queue| queue.skill_queue.iter().any(is_skill_actively_training))
        .count();

    Ok(count as i32)
}

#[tauri::command]
pub async fn get_skill_queue_for_character(
    app: tauri::AppHandle,
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<CharacterSkillQueue, String> {
    let character = db::get_character(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get character: {}", e))?
        .ok_or_else(|| format!("Character {} not found", character_id))?;

    skill_queue::build_character_skill_queue(
        &app,
        &pool,
        &rate_limits,
        character_id,
        &character.character_name,
    )
    .await
    .map_err(|e| format!("Failed to build skill queue: {}", e))?
    .ok_or_else(|| {
        format!(
            "No skill queue data available for character {}",
            character_id
        )
    })
}

#[tauri::command]
pub async fn force_refresh_skill_queue(
    app: tauri::AppHandle,
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<CharacterSkillQueue, String> {
    cache::clear_character_cache(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to clear cache: {}", e))?;

    let character = db::get_character(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get character: {}", e))?
        .ok_or_else(|| format!("Character {} not found", character_id))?;

    skill_queue::build_character_skill_queue(
        &app,
        &pool,
        &rate_limits,
        character_id,
        &character.character_name,
    )
    .await
    .map_err(|e| format!("Failed to build skill queue: {}", e))?
    .ok_or_else(|| {
        format!(
            "No skill queue data available for character {}",
            character_id
        )
    })
}
