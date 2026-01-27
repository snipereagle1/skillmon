use serde::Serialize;
use tauri::{AppHandle, State};

use crate::commands::skill_queues::is_skill_actively_training;
use crate::db;
use crate::esi;
use crate::esi_helpers;
use crate::skill_queue;

#[derive(Debug, Clone, Serialize)]
pub struct TrainingCharacterOverview {
    pub character_id: i64,
    pub character_name: String,
    pub queue_time_remaining_seconds: Option<i64>,
    pub current_skill_name: Option<String>,
    pub current_skill_level: Option<i32>,
    pub sp_per_hour: f64,
    pub has_implants: bool,
    pub has_booster: bool,
}

#[tauri::command]
pub async fn get_training_characters_overview(
    app: AppHandle,
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
) -> Result<Vec<TrainingCharacterOverview>, String> {
    let characters = db::get_all_characters(&pool)
        .await
        .map_err(|e| format!("Failed to get characters: {}", e))?;

    let mut results = Vec::new();
    let now = chrono::Utc::now();

    for character in characters {
        let char_id = character.character_id;

        // 1. Get the skill queue
        let queue_res = skill_queue::build_character_skill_queue(
            &app,
            &pool,
            &rate_limits,
            char_id,
            &character.character_name,
        )
        .await
        .map_err(|e| {
            format!(
                "Failed to fetch skill queue for {}: {}",
                character.character_name, e
            )
        })?;

        if let Some(queue) = queue_res {
            // Check if character is actually training
            let active_skill = queue
                .skill_queue
                .iter()
                .find(|item| is_skill_actively_training(item));

            if let Some(skill) = active_skill {
                // Calculate queue time remaining
                let mut latest_finish: Option<chrono::DateTime<chrono::Utc>> = None;
                for item in &queue.skill_queue {
                    if let Some(finish_str) = &item.finish_date {
                        if let Ok(finish) = chrono::DateTime::parse_from_rfc3339(finish_str) {
                            let finish_utc = finish.with_timezone(&chrono::Utc);
                            if latest_finish.is_none() || finish_utc > latest_finish.unwrap() {
                                latest_finish = Some(finish_utc);
                            }
                        }
                    }
                }

                let queue_time_remaining_seconds = latest_finish.map(|finish| {
                    let diff = finish - now;
                    diff.num_seconds().max(0)
                });

                // 2. Determine implants and boosters
                let access_token = crate::auth::ensure_valid_access_token(&pool, char_id)
                    .await
                    .map_err(|e| {
                        format!(
                            "Failed to get token for {}: {}",
                            character.character_name, e
                        )
                    })?;

                let client =
                    esi_helpers::create_authenticated_client(&access_token).map_err(|e| {
                        format!(
                            "Failed to create client for {}: {}",
                            character.character_name, e
                        )
                    })?;

                let attributes = esi_helpers::get_cached_character_attributes(
                    &pool,
                    &client,
                    char_id,
                    &rate_limits,
                )
                .await
                .map_err(|e| {
                    format!(
                        "Failed to fetch attributes for {}: {}",
                        character.character_name, e
                    )
                })?
                .unwrap_or_default();

                let implants = esi_helpers::get_cached_character_implants(
                    &pool,
                    &client,
                    char_id,
                    &rate_limits,
                )
                .await
                .map_err(|e| {
                    format!(
                        "Failed to fetch implants for {}: {}",
                        character.character_name, e
                    )
                })?
                .unwrap_or_default();

                let has_implants = if implants.is_empty() {
                    false
                } else {
                    let bonuses = db::get_implant_attribute_bonuses(&pool, &implants)
                        .await
                        .map_err(|e| {
                            format!(
                                "Failed to get implant bonuses for {}: {}",
                                character.character_name, e
                            )
                        })?;

                    const ATTRIBUTE_BONUS_IDS: [i64; 5] = [175, 176, 177, 178, 179];
                    bonuses.values().any(|attr_map| {
                        ATTRIBUTE_BONUS_IDS
                            .iter()
                            .any(|&id| attr_map.contains_key(&id))
                    })
                };

                let mut implant_bonus_totals = [0i64; 5];
                if !implants.is_empty() {
                    let bonuses = db::get_implant_attribute_bonuses(&pool, &implants)
                        .await
                        .map_err(|e| {
                            format!(
                                "Failed to get implant bonuses for {}: {}",
                                character.character_name, e
                            )
                        })?;

                    const ATTRIBUTE_BONUS_IDS: [i64; 5] = [175, 176, 177, 178, 179];
                    for (idx, &bonus_id) in ATTRIBUTE_BONUS_IDS.iter().enumerate() {
                        for implant_id in &implants {
                            if let Some(attr_map) = bonuses.get(implant_id) {
                                if let Some(&bonus) = attr_map.get(&bonus_id) {
                                    implant_bonus_totals[idx] += bonus;
                                }
                            }
                        }
                    }
                }

                let total_remap_plus_accelerator =
                    (attributes.charisma - 17 - implant_bonus_totals[0])
                        + (attributes.intelligence - 17 - implant_bonus_totals[1])
                        + (attributes.memory - 17 - implant_bonus_totals[2])
                        + (attributes.perception - 17 - implant_bonus_totals[3])
                        + (attributes.willpower - 17 - implant_bonus_totals[4]);

                let has_booster = total_remap_plus_accelerator > 14;

                results.push(TrainingCharacterOverview {
                    character_id: char_id,
                    character_name: character.character_name.clone(),
                    queue_time_remaining_seconds,
                    current_skill_name: skill.skill_name.clone(),
                    current_skill_level: Some(skill.finished_level),
                    sp_per_hour: skill.sp_per_minute.unwrap_or(0.0) * 60.0,
                    has_implants,
                    has_booster,
                });
            }
        }
    }

    results.sort_by(|a, b| {
        match (
            a.queue_time_remaining_seconds,
            b.queue_time_remaining_seconds,
        ) {
            (Some(a_val), Some(b_val)) => a_val.cmp(&b_val),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => std::cmp::Ordering::Equal,
        }
    });

    Ok(results)
}
