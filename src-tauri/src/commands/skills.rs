use std::collections::HashMap;

use serde::Serialize;
use tauri::State;

use crate::auth;
use crate::db;
use crate::esi;
use crate::esi_helpers;

#[derive(Debug, Clone, Serialize)]
pub struct CharacterSkillResponse {
    pub skill_id: i64,
    pub skill_name: String,
    pub group_id: i64,
    pub group_name: String,
    pub trained_skill_level: i64,
    pub active_skill_level: i64,
    pub skillpoints_in_skill: i64,
    pub is_in_queue: bool,
    pub queue_level: Option<i64>,
    pub is_injected: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillGroupResponse {
    pub group_id: i64,
    pub group_name: String,
    pub total_levels: i64,
    pub trained_levels: i64,
    pub has_trained_skills: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterSkillsResponse {
    pub character_id: i64,
    pub skills: Vec<CharacterSkillResponse>,
    pub groups: Vec<SkillGroupResponse>,
}

#[tauri::command]
pub async fn get_character_skills_with_groups(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<CharacterSkillsResponse, String> {
    const SKILL_CATEGORY_ID: i64 = 16;

    let skill_groups = db::get_skill_groups_for_category(&pool, SKILL_CATEGORY_ID)
        .await
        .map_err(|e| format!("Failed to get skill groups: {}", e))?;

    let character_skills = db::get_character_skills(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get character skills: {}", e))?;
    let character_skills_map: HashMap<i64, db::CharacterSkill> = character_skills
        .into_iter()
        .map(|s| (s.skill_id, s))
        .collect();

    let (queued_skills, trained_from_queue): (HashMap<i64, i64>, HashMap<i64, i64>) = {
        let mut queued = HashMap::new();
        let mut trained = HashMap::new();
        if let Ok(access_token) = auth::ensure_valid_access_token(&pool, character_id).await {
            if let Ok(client) = esi_helpers::create_authenticated_client(&access_token) {
                if let Ok(Some(queue_data)) =
                    esi_helpers::get_cached_skill_queue(&pool, &client, character_id, &rate_limits)
                        .await
                {
                    let now = chrono::Utc::now();
                    for item in queue_data {
                        if let Some(obj) = item.as_object() {
                            if let (Some(skill_id), Some(finished_level), finish_date_opt) = (
                                obj.get("skill_id").and_then(|v| v.as_i64()),
                                obj.get("finished_level").and_then(|v| v.as_i64()),
                                obj.get("finish_date").and_then(|v| v.as_str()),
                            ) {
                                if let Some(finish_str) = finish_date_opt {
                                    if let Ok(finish) =
                                        chrono::DateTime::parse_from_rfc3339(finish_str)
                                    {
                                        let finish_utc = finish.with_timezone(&chrono::Utc);
                                        if now >= finish_utc {
                                            trained.insert(skill_id, finished_level);
                                            continue;
                                        }
                                    }
                                }
                                queued.insert(skill_id, finished_level);
                            }
                        }
                    }
                }
            }
        }
        (queued, trained)
    };

    let mut all_skill_ids = Vec::new();
    let mut skills_by_group: HashMap<i64, Vec<(i64, String)>> = HashMap::new();

    for group in &skill_groups {
        let skills_in_group: Vec<(i64, String)> = sqlx::query_as::<_, (i64, String)>(
            "SELECT type_id, name FROM sde_types WHERE group_id = ? AND published = 1 ORDER BY name",
        )
        .bind(group.group_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| format!("Failed to get skills for group {}: {}", group.group_id, e))?;

        for (skill_id, _) in &skills_in_group {
            all_skill_ids.push(*skill_id);
        }
        skills_by_group.insert(group.group_id, skills_in_group);
    }

    let mut skills_response = Vec::new();
    let mut groups_response = Vec::new();

    for group in &skill_groups {
        let skills_in_group = skills_by_group
            .get(&group.group_id)
            .cloned()
            .unwrap_or_default();
        let mut total_levels = 0i64;
        let mut trained_levels = 0i64;
        let mut has_trained_skills = false;

        for (skill_id, skill_name) in &skills_in_group {
            total_levels += 5;

            let char_skill = character_skills_map.get(skill_id);
            let db_trained_level = char_skill.map(|s| s.trained_skill_level).unwrap_or(0);
            let trained_level =
                db_trained_level.max(trained_from_queue.get(skill_id).copied().unwrap_or(0));
            let active_level = char_skill.map(|s| s.active_skill_level).unwrap_or(0);
            let skillpoints = char_skill.map(|s| s.skillpoints_in_skill).unwrap_or(0);
            let is_injected = char_skill.is_some();
            let is_in_queue = queued_skills.contains_key(skill_id);
            let queue_level = queued_skills.get(skill_id).copied();

            if trained_level > 0 {
                trained_levels += trained_level;
                has_trained_skills = true;
            }

            skills_response.push(CharacterSkillResponse {
                skill_id: *skill_id,
                skill_name: skill_name.clone(),
                group_id: group.group_id,
                group_name: group.group_name.clone(),
                trained_skill_level: trained_level,
                active_skill_level: active_level,
                skillpoints_in_skill: skillpoints,
                is_in_queue,
                queue_level,
                is_injected,
            });
        }

        groups_response.push(SkillGroupResponse {
            group_id: group.group_id,
            group_name: group.group_name.clone(),
            total_levels,
            trained_levels,
            has_trained_skills,
        });
    }

    Ok(CharacterSkillsResponse {
        character_id,
        skills: skills_response,
        groups: groups_response,
    })
}
