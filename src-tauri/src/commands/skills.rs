use std::collections::HashMap;

use serde::Serialize;
use tauri::State;

use crate::auth;
use crate::db;
use crate::esi;
use crate::esi_helpers;
use crate::utils;

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

#[derive(Debug, Clone, Serialize)]
pub struct AttributeInfo {
    pub attribute_id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BonusAttribute {
    pub attribute_id: i64,
    pub attribute_name: String,
    pub value: f64,
    pub unit_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillAttributesDetails {
    pub primary_attribute: Option<AttributeInfo>,
    pub secondary_attribute: Option<AttributeInfo>,
    pub rank: Option<i64>,
    pub volume: Option<f64>,
    pub bonuses: Vec<BonusAttribute>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillRequirement {
    pub required_skill_id: i64,
    pub required_skill_name: String,
    pub required_level: i64,
    pub is_met: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct RequiredForItem {
    pub type_id: i64,
    pub type_name: String,
    pub required_level: i64,
    pub category_id: i64,
    pub category_name: Option<String>,
    pub group_id: i64,
    pub group_name: String,
    pub is_skill: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillDetailsResponse {
    pub skill_id: i64,
    pub skill_name: String,
    pub description: Option<String>,
    pub group_id: i64,
    pub group_name: String,
    pub category_id: i64,
    pub attributes: SkillAttributesDetails,
    pub prerequisites: Vec<SkillRequirement>,
    pub required_for: Vec<RequiredForItem>,
    pub requires_omega: bool,
}

type SkillInfoRow = (i64, String, Option<String>, i64, i64, Option<f64>);
type ReverseReqRow = (i64, i64, Option<i64>, Option<String>, Option<String>, i64); // (type_id, required_level, category_id, category_name, group_name, group_id)

#[tauri::command]
pub async fn get_skill_details(
    pool: State<'_, db::Pool>,
    skill_id: i64,
    character_id: Option<i64>,
) -> Result<SkillDetailsResponse, String> {
    const SKILL_CATEGORY_ID: i64 = 16;

    // Get skill basic info
    let skill_info: Option<SkillInfoRow> = sqlx::query_as(
        "SELECT type_id, name, description, group_id, category_id, volume FROM sde_types WHERE type_id = ? AND published = 1",
    )
    .bind(skill_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| format!("Failed to get skill info: {}", e))?;

    let (skill_id_val, skill_name, description, group_id, category_id, volume) =
        skill_info.ok_or_else(|| format!("Skill {} not found", skill_id))?;

    // Get group name
    let group_name: String = sqlx::query_scalar("SELECT name FROM sde_groups WHERE group_id = ?")
        .bind(group_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| format!("Failed to get group name: {}", e))?;

    // Get skill attributes
    let attributes_rows: Vec<(i64, f64)> = sqlx::query_as(
        "SELECT attribute_id, value FROM sde_type_dogma_attributes WHERE type_id = ?",
    )
    .bind(skill_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to get skill attributes: {}", e))?;

    let mut primary_attribute_id: Option<i64> = None;
    let mut secondary_attribute_id: Option<i64> = None;
    let mut rank: Option<i64> = None;
    let mut requires_omega: bool = false;
    let mut bonuses: Vec<BonusAttribute> = Vec::new();

    // First pass: extract primary/secondary attribute IDs
    for (attr_id, value) in &attributes_rows {
        match *attr_id {
            180 => {
                primary_attribute_id = Some(*value as i64);
            }
            181 => {
                secondary_attribute_id = Some(*value as i64);
            }
            275 => rank = Some(*value as i64),
            _ => {}
        }
    }

    // Get dogma attribute names and unit_id for bonuses and primary/secondary attributes
    // First, collect all attribute IDs we need to look up
    let mut dogma_attr_ids_to_query = Vec::new();
    // Add all attribute IDs from the skill's dogma attributes
    for (attr_id, _) in &attributes_rows {
        dogma_attr_ids_to_query.push(*attr_id);
    }
    // Add primary and secondary attribute IDs (the values from attributes 180 and 181)
    if let Some(id) = primary_attribute_id {
        if !dogma_attr_ids_to_query.contains(&id) {
            dogma_attr_ids_to_query.push(id);
        }
    }
    if let Some(id) = secondary_attribute_id {
        if !dogma_attr_ids_to_query.contains(&id) {
            dogma_attr_ids_to_query.push(id);
        }
    }

    let mut dogma_attr_map: HashMap<i64, (String, Option<i64>)> = HashMap::new();
    if !dogma_attr_ids_to_query.is_empty() {
        let placeholders = dogma_attr_ids_to_query
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "SELECT attribute_id, display_name, name, unit_id FROM sde_dogma_attributes WHERE attribute_id IN ({})",
            placeholders
        );
        let mut query_builder =
            sqlx::query_as::<_, (i64, Option<String>, String, Option<i64>)>(&query);
        for id in &dogma_attr_ids_to_query {
            query_builder = query_builder.bind(id);
        }
        let dogma_attr_rows: Vec<(i64, Option<String>, String, Option<i64>)> = query_builder
            .fetch_all(&*pool)
            .await
            .map_err(|e| format!("Failed to get dogma attribute names: {}", e))?;

        for (attr_id, display_name, name, unit_id) in dogma_attr_rows {
            let attr_name = display_name.unwrap_or(name);
            dogma_attr_map.insert(attr_id, (attr_name, unit_id));
        }
    }

    for (attr_id, value) in attributes_rows {
        #[allow(clippy::manual_range_patterns)]
        match attr_id {
            180 => {
                // Already handled
            }
            181 => {
                // Already handled
            }
            275 => {
                // Already handled
            }
            161 => {
                // Volume - already handled from sde_types
            }
            182 | 183 | 184 | 1285 | 1289 | 1290 => {
                // Primary/Secondary/Tertiary/Quaternary/Quinary/Senary Skill required - covered by prerequisites
            }
            277 | 278 | 279 | 1286 | 1287 | 1288 => {
                // requiredSkill1Level through requiredSkill6Level - covered by prerequisites
            }
            280 => {
                // Level - not a bonus attribute
            }
            1047 => {
                // canNotBeTrainedOnTrial - extract to requires_omega
                requires_omega = value == 1.0;
            }
            _ => {
                // Check if it's a bonus attribute (not primary/secondary/rank/volume)
                if let Some((attr_name, unit_id)) = dogma_attr_map.get(&attr_id) {
                    bonuses.push(BonusAttribute {
                        attribute_id: attr_id,
                        attribute_name: attr_name.clone(),
                        value,
                        unit_id: *unit_id,
                    });
                }
            }
        }
    }

    let primary_attribute = primary_attribute_id.and_then(|id| {
        dogma_attr_map.get(&id).map(|(name, _)| AttributeInfo {
            attribute_id: id,
            name: name.clone(),
        })
    });

    let secondary_attribute = secondary_attribute_id.and_then(|id| {
        dogma_attr_map.get(&id).map(|(name, _)| AttributeInfo {
            attribute_id: id,
            name: name.clone(),
        })
    });

    // Get prerequisites
    let prerequisites_rows: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT required_skill_id, required_level FROM sde_skill_requirements WHERE skill_type_id = ?",
    )
    .bind(skill_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to get prerequisites: {}", e))?;

    let mut prerequisite_skill_ids: Vec<i64> =
        prerequisites_rows.iter().map(|(id, _)| *id).collect();
    prerequisite_skill_ids.sort();
    prerequisite_skill_ids.dedup();

    let skill_names = utils::get_skill_names(&pool, &prerequisite_skill_ids)
        .await
        .map_err(|e| format!("Failed to get prerequisite skill names: {}", e))?;

    // Get character's trained skill levels if character_id is provided
    let mut character_skill_levels: HashMap<i64, i64> = HashMap::new();
    if let Some(char_id) = character_id {
        let char_skills = db::get_character_skills(&pool, char_id)
            .await
            .map_err(|e| format!("Failed to get character skills: {}", e))?;
        for skill in char_skills {
            character_skill_levels.insert(skill.skill_id, skill.trained_skill_level);
        }
    }

    let mut prerequisites: Vec<SkillRequirement> = Vec::new();
    for (required_skill_id, required_level) in prerequisites_rows {
        let required_skill_name = skill_names
            .get(&required_skill_id)
            .cloned()
            .unwrap_or_else(|| format!("Unknown Skill {}", required_skill_id));
        let trained_level = character_skill_levels
            .get(&required_skill_id)
            .copied()
            .unwrap_or(0);
        let is_met = trained_level >= required_level;

        prerequisites.push(SkillRequirement {
            required_skill_id,
            required_skill_name,
            required_level,
            is_met,
        });
    }

    // Get reverse requirements (what requires this skill)
    // Use LEFT JOINs to get both category and group names
    // If type.category_id is NULL, use group.category_id to get the category
    let reverse_req_rows: Vec<ReverseReqRow> = sqlx::query_as(
        r#"
            SELECT
                sr.skill_type_id,
                sr.required_level,
                COALESCE(t.category_id, g.category_id) AS category_id,
                COALESCE(c.name, cg.name) AS category_name,
                g.name AS group_name,
                t.group_id
            FROM sde_skill_requirements sr
            JOIN sde_types t ON sr.skill_type_id = t.type_id
            LEFT JOIN sde_groups g ON t.group_id = g.group_id
            LEFT JOIN sde_categories c ON t.category_id = c.category_id
            LEFT JOIN sde_categories cg ON g.category_id = cg.category_id
            WHERE sr.required_skill_id = ? AND t.published = 1
            "#,
    )
    .bind(skill_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to get reverse requirements: {}", e))?;

    let mut required_for_type_ids: Vec<i64> = reverse_req_rows
        .iter()
        .map(|(type_id, _, _, _, _, _)| *type_id)
        .collect();
    required_for_type_ids.sort();
    required_for_type_ids.dedup();

    let type_names = utils::get_type_names_helper(&pool, &required_for_type_ids)
        .await
        .map_err(|e| format!("Failed to get type names: {}", e))?;

    let mut required_for: Vec<RequiredForItem> = Vec::new();
    for (
        type_id,
        required_level,
        category_id_val,
        category_name_from_query,
        group_name_from_query,
        group_id_val,
    ) in reverse_req_rows
    {
        let type_name = type_names
            .get(&type_id)
            .cloned()
            .unwrap_or_else(|| format!("Unknown Type {}", type_id));

        // Get category name from query, or use "Other" if missing
        // Don't fallback to group_name - categories and groups are different levels
        let category_name = category_name_from_query.or_else(|| Some("Other".to_string()));

        // Get group name from query, or use fallback if missing
        let group_name_val = group_name_from_query.unwrap_or_else(|| "Unknown Group".to_string());

        // Handle NULL category_id - use 0 as placeholder for serialization
        let category_id_final = category_id_val.unwrap_or(0);
        let is_skill = category_id_val == Some(SKILL_CATEGORY_ID);

        required_for.push(RequiredForItem {
            type_id,
            type_name,
            required_level,
            category_id: category_id_final,
            category_name,
            group_id: group_id_val,
            group_name: group_name_val,
            is_skill,
        });
    }

    Ok(SkillDetailsResponse {
        skill_id: skill_id_val,
        skill_name,
        description,
        group_id,
        group_name,
        category_id,
        attributes: SkillAttributesDetails {
            primary_attribute,
            secondary_attribute,
            rank,
            volume,
            bonuses,
        },
        prerequisites,
        required_for,
        requires_omega,
    })
}
