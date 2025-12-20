use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;
use serde::Serialize;
use std::io::Cursor;
use tauri::State;

use crate::db;
use crate::utils;

use super::skill_plans_utils;

#[derive(Debug, Clone, Serialize)]
pub struct SkillPlanResponse {
    pub plan_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl From<db::skill_plans::SkillPlan> for SkillPlanResponse {
    fn from(p: db::skill_plans::SkillPlan) -> Self {
        SkillPlanResponse {
            plan_id: p.plan_id,
            name: p.name,
            description: p.description,
            created_at: p.created_at,
            updated_at: p.updated_at,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillPlanEntryResponse {
    pub entry_id: i64,
    pub plan_id: i64,
    pub skill_type_id: i64,
    pub skill_name: String,
    pub planned_level: i64,
    pub sort_order: i64,
    pub entry_type: String,
    pub notes: Option<String>,
    pub rank: Option<i64>,
    pub skillpoints_for_level: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillPlanWithEntriesResponse {
    pub plan: SkillPlanResponse,
    pub entries: Vec<SkillPlanEntryResponse>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillSearchResult {
    pub skill_type_id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlanComparisonResponse {
    pub plan: SkillPlanResponse,
    pub character_id: i64,
    pub entries: Vec<PlanComparisonEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlanComparisonEntry {
    pub entry_id: i64,
    pub skill_type_id: i64,
    pub skill_name: String,
    pub planned_level: i64,
    pub trained_level: i64,
    pub active_level: i64,
    pub entry_type: String,
    pub sort_order: i64,
    pub rank: Option<i64>,
    pub skillpoints_for_planned_level: i64,
    pub current_skillpoints: i64,
    pub missing_skillpoints: i64,
    pub status: String,
}

#[tauri::command]
pub async fn create_skill_plan(
    pool: State<'_, db::Pool>,
    name: String,
    description: Option<String>,
) -> Result<i64, String> {
    db::skill_plans::create_skill_plan(&pool, &name, description.as_deref())
        .await
        .map_err(|e| format!("Failed to create skill plan: {}", e))
}

#[tauri::command]
pub async fn get_all_skill_plans(
    pool: State<'_, db::Pool>,
) -> Result<Vec<SkillPlanResponse>, String> {
    let plans = db::skill_plans::get_all_skill_plans(&pool)
        .await
        .map_err(|e| format!("Failed to get skill plans: {}", e))?;

    Ok(plans.into_iter().map(SkillPlanResponse::from).collect())
}

#[tauri::command]
pub async fn get_skill_plan(
    pool: State<'_, db::Pool>,
    plan_id: i64,
) -> Result<Option<SkillPlanResponse>, String> {
    let plan = db::skill_plans::get_skill_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get skill plan: {}", e))?;

    Ok(plan.map(SkillPlanResponse::from))
}

#[tauri::command]
pub async fn get_skill_plan_with_entries(
    pool: State<'_, db::Pool>,
    plan_id: i64,
) -> Result<Option<SkillPlanWithEntriesResponse>, String> {
    let plan = db::skill_plans::get_skill_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get skill plan: {}", e))?;

    let plan = match plan {
        Some(p) => p,
        None => return Ok(None),
    };

    let entries = db::skill_plans::get_plan_entries(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get plan entries: {}", e))?;

    let skill_type_ids: Vec<i64> = entries.iter().map(|e| e.skill_type_id).collect();
    let skill_attributes = utils::get_skill_attributes(&pool, &skill_type_ids)
        .await
        .map_err(|e| format!("Failed to get skill attributes: {}", e))?;

    let mut entry_responses = Vec::new();
    for entry in entries {
        let skill_name =
            sqlx::query_scalar::<_, String>("SELECT name FROM sde_types WHERE type_id = ?")
                .bind(entry.skill_type_id)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| format!("Failed to get skill name: {}", e))?
                .unwrap_or_else(|| format!("Unknown Skill ({})", entry.skill_type_id));

        let skill_attr = skill_attributes.get(&entry.skill_type_id);
        let rank = skill_attr.and_then(|attr| attr.rank);
        let skillpoints_for_level = if let Some(rank_val) = rank {
            utils::calculate_sp_for_level(rank_val, entry.planned_level as i32)
        } else {
            0
        };

        entry_responses.push(SkillPlanEntryResponse {
            entry_id: entry.entry_id,
            plan_id: entry.plan_id,
            skill_type_id: entry.skill_type_id,
            skill_name,
            planned_level: entry.planned_level,
            sort_order: entry.sort_order,
            entry_type: entry.entry_type,
            notes: entry.notes,
            rank,
            skillpoints_for_level,
        });
    }

    Ok(Some(SkillPlanWithEntriesResponse {
        plan: SkillPlanResponse::from(plan),
        entries: entry_responses,
    }))
}

#[tauri::command]
pub async fn update_skill_plan(
    pool: State<'_, db::Pool>,
    plan_id: i64,
    name: String,
    description: Option<String>,
) -> Result<(), String> {
    db::skill_plans::update_skill_plan(&pool, plan_id, &name, description.as_deref())
        .await
        .map_err(|e| format!("Failed to update skill plan: {}", e))
}

#[tauri::command]
pub async fn delete_skill_plan(pool: State<'_, db::Pool>, plan_id: i64) -> Result<(), String> {
    db::skill_plans::delete_skill_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to delete skill plan: {}", e))
}

async fn resolve_and_add_prerequisites(
    pool: &db::Pool,
    plan_id: i64,
    skill_type_id: i64,
) -> Result<(), String> {
    let prerequisites = db::skill_plans::get_prerequisites_recursive(pool, skill_type_id)
        .await
        .map_err(|e| format!("Failed to get prerequisites: {}", e))?;

    for prereq in prerequisites {
        for level in 1..=prereq.required_level {
            let existing_type: Option<String> = sqlx::query_scalar(
                "SELECT entry_type FROM skill_plan_entries
                 WHERE plan_id = ? AND skill_type_id = ? AND planned_level = ?",
            )
            .bind(plan_id)
            .bind(prereq.required_skill_id)
            .bind(level)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to check existing entry: {}", e))?;

            if let Some(entry_type) = existing_type {
                if entry_type == "Planned" {
                    continue;
                }
            }

            let higher_level_exists = sqlx::query_scalar::<_, Option<i64>>(
                "SELECT planned_level FROM skill_plan_entries
                 WHERE plan_id = ? AND skill_type_id = ? AND planned_level > ?",
            )
            .bind(plan_id)
            .bind(prereq.required_skill_id)
            .bind(level)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to check higher level entry: {}", e))?;

            if higher_level_exists.is_some() {
                continue;
            }

            db::skill_plans::add_plan_entry(
                pool,
                plan_id,
                prereq.required_skill_id,
                level,
                "Prerequisite",
                None,
            )
            .await
            .map_err(|e| format!("Failed to add prerequisite entry: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn add_plan_entry(
    pool: State<'_, db::Pool>,
    plan_id: i64,
    skill_type_id: i64,
    planned_level: i64,
    notes: Option<String>,
) -> Result<SkillPlanWithEntriesResponse, String> {
    if !(1..=5).contains(&planned_level) {
        return Err("Planned level must be between 1 and 5".to_string());
    }

    let planned_entries = vec![(skill_type_id, planned_level)];

    let graph_result =
        skill_plans_utils::build_dependency_graph_for_entries(&pool, planned_entries).await?;

    let sorted_skill_ids = skill_plans_utils::topological_sort_skills(
        &graph_result.dependency_graph,
        &graph_result.all_skill_ids,
        &[(skill_type_id, planned_level)],
    );

    let sorted_entries = skill_plans_utils::build_sorted_entry_list(
        &sorted_skill_ids,
        &graph_result.all_entries,
        &[(skill_type_id, planned_level)],
    );

    let start_sort_order: i64 = {
        let max: Option<i64> =
            sqlx::query_scalar("SELECT MAX(sort_order) FROM skill_plan_entries WHERE plan_id = ?")
                .bind(plan_id)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| format!("Failed to get max sort order: {}", e))?;
        max.unwrap_or(-1) + 1
    };

    skill_plans_utils::insert_entries_with_sort_order(
        &pool,
        plan_id,
        &sorted_entries,
        start_sort_order,
    )
    .await?;

    if let Some(notes_val) = notes {
        if !notes_val.trim().is_empty() {
            sqlx::query(
                "UPDATE skill_plan_entries SET notes = ?
                 WHERE plan_id = ? AND skill_type_id = ? AND planned_level = ? AND entry_type = 'Planned'",
            )
            .bind(notes_val.trim())
            .bind(plan_id)
            .bind(skill_type_id)
            .bind(planned_level)
            .execute(&*pool)
            .await
            .map_err(|e| format!("Failed to update notes: {}", e))?;
        }
    }

    get_skill_plan_with_entries(pool, plan_id)
        .await?
        .ok_or_else(|| "Failed to retrieve updated plan after adding entry".to_string())
}

#[tauri::command]
pub async fn update_plan_entry(
    pool: State<'_, db::Pool>,
    entry_id: i64,
    planned_level: Option<i64>,
    entry_type: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    if let Some(level) = planned_level {
        if !(1..=5).contains(&level) {
            return Err("Planned level must be between 1 and 5".to_string());
        }
    }

    if let Some(ref etype) = entry_type {
        if etype != "Planned" && etype != "Prerequisite" {
            return Err("Entry type must be 'Planned' or 'Prerequisite'".to_string());
        }
    }

    // If updating planned_level, check if we need to handle level increase specially
    if let Some(new_level) = planned_level {
        // Fetch current entry details
        let current_entry: Option<(i64, i64, i64, String)> =
            sqlx::query_as::<_, (i64, i64, i64, String)>(
                "SELECT plan_id, skill_type_id, planned_level, entry_type
                 FROM skill_plan_entries
                 WHERE entry_id = ?",
            )
            .bind(entry_id)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| format!("Failed to get current entry: {}", e))?;

        if let Some((plan_id, skill_type_id, old_level, old_entry_type)) = current_entry {
            // If it's a "Planned" entry and we're increasing the level, preserve the old level
            if old_entry_type == "Planned" && new_level > old_level {
                // Delete the old planned entry
                db::skill_plans::delete_plan_entry(&pool, entry_id)
                    .await
                    .map_err(|e| format!("Failed to delete old entry: {}", e))?;

                // Add the new planned entry using the same logic as add_plan_entry
                let planned_entries = vec![(skill_type_id, new_level)];

                let graph_result =
                    skill_plans_utils::build_dependency_graph_for_entries(&pool, planned_entries)
                        .await?;

                let sorted_skill_ids = skill_plans_utils::topological_sort_skills(
                    &graph_result.dependency_graph,
                    &graph_result.all_skill_ids,
                    &[(skill_type_id, new_level)],
                );

                let sorted_entries = skill_plans_utils::build_sorted_entry_list(
                    &sorted_skill_ids,
                    &graph_result.all_entries,
                    &[(skill_type_id, new_level)],
                );

                let start_sort_order: i64 = {
                    let max: Option<i64> = sqlx::query_scalar(
                        "SELECT MAX(sort_order) FROM skill_plan_entries WHERE plan_id = ?",
                    )
                    .bind(plan_id)
                    .fetch_optional(&*pool)
                    .await
                    .map_err(|e| format!("Failed to get max sort order: {}", e))?;
                    max.unwrap_or(-1) + 1
                };

                skill_plans_utils::insert_entries_with_sort_order(
                    &pool,
                    plan_id,
                    &sorted_entries,
                    start_sort_order,
                )
                .await?;

                // Update notes if provided
                if let Some(notes_val) = notes {
                    if !notes_val.trim().is_empty() {
                        sqlx::query(
                            "UPDATE skill_plan_entries SET notes = ?
                             WHERE plan_id = ? AND skill_type_id = ? AND planned_level = ? AND entry_type = 'Planned'",
                        )
                        .bind(notes_val.trim())
                        .bind(plan_id)
                        .bind(skill_type_id)
                        .bind(new_level)
                        .execute(&*pool)
                        .await
                        .map_err(|e| format!("Failed to update notes: {}", e))?;
                    }
                }

                return Ok(());
            }
        }
    }

    // For other cases (decreasing level, same level, or not a Planned entry), use standard update
    db::skill_plans::update_plan_entry(
        &pool,
        entry_id,
        planned_level,
        entry_type.as_deref(),
        notes.as_deref(),
    )
    .await
    .map_err(|e| format!("Failed to update plan entry: {}", e))
}

#[tauri::command]
pub async fn delete_plan_entry(pool: State<'_, db::Pool>, entry_id: i64) -> Result<(), String> {
    db::skill_plans::delete_plan_entry(&pool, entry_id)
        .await
        .map_err(|e| format!("Failed to delete plan entry: {}", e))
}

#[tauri::command]
pub async fn reorder_plan_entries(
    pool: State<'_, db::Pool>,
    plan_id: i64,
    entry_ids: Vec<i64>,
) -> Result<(), String> {
    db::skill_plans::reorder_plan_entries(&pool, plan_id, &entry_ids)
        .await
        .map_err(|e| format!("Failed to reorder plan entries: {}", e))
}

#[tauri::command]
pub async fn import_skill_plan_text(
    pool: State<'_, db::Pool>,
    plan_id: i64,
    text: String,
) -> Result<SkillPlanWithEntriesResponse, String> {
    let lines: Vec<&str> = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    // Step 1: Collect all planned entries from import text
    let mut planned_entries: Vec<(i64, i64)> = Vec::new();
    let mut unmatched_skills = Vec::new();

    for line in &lines {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let level_str = parts
            .last()
            .ok_or_else(|| "Invalid line format".to_string())?;
        let level: i64 = level_str
            .parse()
            .map_err(|_| format!("Invalid level in line: {}", line))?;

        if !(1..=5).contains(&level) {
            return Err(format!("Level must be between 1 and 5 in line: {}", line));
        }

        let skill_name = parts[..parts.len() - 1].join(" ");

        let skill_type_id = db::skill_plans::get_skill_type_id_by_name(&pool, &skill_name)
            .await
            .map_err(|e| format!("Failed to lookup skill: {}", e))?;

        match skill_type_id {
            Some(id) => {
                planned_entries.push((id, level));
            }
            None => {
                unmatched_skills.push(skill_name);
            }
        }
    }

    if !unmatched_skills.is_empty() {
        return Err(format!("Unmatched skills: {}", unmatched_skills.join(", ")));
    }

    if planned_entries.is_empty() {
        return Err("No valid entries found in text".to_string());
    }

    let graph_result =
        skill_plans_utils::build_dependency_graph_for_entries(&pool, planned_entries).await?;

    let sorted_skill_ids = skill_plans_utils::topological_sort_skills(
        &graph_result.dependency_graph,
        &graph_result.all_skill_ids,
        &graph_result.planned_entry_order,
    );

    let sorted_entries = skill_plans_utils::build_sorted_entry_list(
        &sorted_skill_ids,
        &graph_result.all_entries,
        &graph_result.planned_entry_order,
    );

    let start_sort_order: i64 = {
        let max: Option<i64> =
            sqlx::query_scalar("SELECT MAX(sort_order) FROM skill_plan_entries WHERE plan_id = ?")
                .bind(plan_id)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| format!("Failed to get max sort order: {}", e))?;
        max.unwrap_or(-1) + 1
    };

    skill_plans_utils::insert_entries_with_sort_order(
        &pool,
        plan_id,
        &sorted_entries,
        start_sort_order,
    )
    .await?;

    get_skill_plan_with_entries(pool, plan_id)
        .await?
        .ok_or_else(|| "Failed to retrieve plan after import".to_string())
}

#[tauri::command]
pub async fn import_skill_plan_xml(
    pool: State<'_, db::Pool>,
    plan_id: i64,
    xml: String,
) -> Result<SkillPlanWithEntriesResponse, String> {
    let mut reader = Reader::from_str(&xml);

    let mut entries = Vec::new();
    let mut buf = Vec::new();
    let mut current_entry: Option<(i64, i64, String, Option<String>)> = None;
    let mut in_notes = false;
    let mut notes_text = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                if e.name().as_ref() == b"entry" {
                    let mut skill_id: Option<i64> = None;
                    let mut level: Option<i64> = None;
                    let mut entry_type = "Planned".to_string();

                    for attr in e.attributes().flatten() {
                        let key = attr.key.as_ref();
                        let value = std::str::from_utf8(&attr.value)
                            .map_err(|e| format!("Invalid UTF-8 in XML: {}", e))?;

                        match key {
                            b"skillID" => {
                                skill_id = Some(
                                    value
                                        .parse()
                                        .map_err(|_| format!("Invalid skillID: {}", value))?,
                                );
                            }
                            b"level" => {
                                level = Some(
                                    value
                                        .parse()
                                        .map_err(|_| format!("Invalid level: {}", value))?,
                                );
                            }
                            b"type" => {
                                entry_type = value.to_string();
                            }
                            _ => {}
                        }
                    }

                    if let (Some(sid), Some(lvl)) = (skill_id, level) {
                        if !(1..=5).contains(&lvl) {
                            return Err(format!("Level must be between 1 and 5, got: {}", lvl));
                        }
                        current_entry = Some((sid, lvl, entry_type, None));
                    }
                } else if e.name().as_ref() == b"notes" {
                    in_notes = true;
                    notes_text.clear();
                }
            }
            Ok(Event::Text(e)) => {
                if in_notes {
                    notes_text.push_str(
                        e.unescape()
                            .map_err(|e| format!("Failed to unescape XML text: {}", e))?
                            .as_ref(),
                    );
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == b"entry" {
                    if let Some((skill_id, level, entry_type, _)) = current_entry.take() {
                        let notes = if notes_text.is_empty() {
                            None
                        } else {
                            Some(notes_text.clone())
                        };
                        entries.push((skill_id, level, entry_type, notes));
                        notes_text.clear();
                    }
                } else if e.name().as_ref() == b"notes" {
                    in_notes = false;
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parsing error: {}", e)),
            _ => {}
        }
    }

    if entries.is_empty() {
        return Err("No entries found in XML".to_string());
    }

    let mut sort_order: i64 = {
        let max: Option<i64> =
            sqlx::query_scalar("SELECT MAX(sort_order) FROM skill_plan_entries WHERE plan_id = ?")
                .bind(plan_id)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| format!("Failed to get max sort order: {}", e))?;
        max.unwrap_or(-1) + 1
    };

    for (skill_id, level, entry_type, notes) in entries.iter() {
        sqlx::query(
            "INSERT INTO skill_plan_entries (plan_id, skill_type_id, planned_level, sort_order, entry_type, notes)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, skill_type_id, planned_level) DO UPDATE SET
             entry_type = CASE
                 WHEN excluded.entry_type = 'Planned' THEN excluded.entry_type
                 WHEN skill_plan_entries.entry_type = 'Planned' THEN skill_plan_entries.entry_type
                 ELSE excluded.entry_type
             END,
             notes = excluded.notes,
             sort_order = excluded.sort_order",
        )
        .bind(plan_id)
        .bind(skill_id)
        .bind(level)
        .bind(sort_order)
        .bind(entry_type)
        .bind(notes.as_deref())
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to add entry: {}", e))?;

        if entry_type == "Planned" {
            resolve_and_add_prerequisites(&pool, plan_id, *skill_id).await?;
        }

        sort_order += 1;
    }

    // Verify prerequisites for all Planned entries to ensure completeness
    let planned_entries: Vec<(i64, i64)> = sqlx::query_as::<_, (i64, i64)>(
        "SELECT skill_type_id, planned_level
         FROM skill_plan_entries
         WHERE plan_id = ? AND entry_type = 'Planned'",
    )
    .bind(plan_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to get planned entries: {}", e))?;

    for (skill_type_id, _planned_level) in planned_entries {
        resolve_and_add_prerequisites(&pool, plan_id, skill_type_id).await?;
    }

    get_skill_plan_with_entries(pool, plan_id)
        .await?
        .ok_or_else(|| "Failed to retrieve plan after import".to_string())
}

#[tauri::command]
pub async fn export_skill_plan_text(
    pool: State<'_, db::Pool>,
    plan_id: i64,
) -> Result<String, String> {
    let entries = db::skill_plans::get_plan_entries(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get plan entries: {}", e))?;

    let mut lines = Vec::new();
    for entry in entries {
        let skill_name =
            sqlx::query_scalar::<_, String>("SELECT name FROM sde_types WHERE type_id = ?")
                .bind(entry.skill_type_id)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| format!("Failed to get skill name: {}", e))?
                .unwrap_or_else(|| format!("Unknown Skill ({})", entry.skill_type_id));

        lines.push(format!("{} {}", skill_name, entry.planned_level));
    }

    Ok(lines.join("\n"))
}

#[tauri::command]
pub async fn export_skill_plan_xml(
    pool: State<'_, db::Pool>,
    plan_id: i64,
) -> Result<String, String> {
    let plan = db::skill_plans::get_skill_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get skill plan: {}", e))?
        .ok_or_else(|| "Plan not found".to_string())?;

    let entries = db::skill_plans::get_plan_entries(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get plan entries: {}", e))?;

    let mut writer = Writer::new(Cursor::new(Vec::new()));

    let decl = BytesDecl::new("1.0", Some("UTF-8"), None);
    writer
        .write_event(Event::Decl(decl))
        .map_err(|e| format!("Failed to write XML declaration: {}", e))?;

    let mut plan_elem = BytesStart::new("plan");
    plan_elem.push_attribute(("name", plan.name.as_str()));
    plan_elem.push_attribute(("revision", "1"));
    writer
        .write_event(Event::Start(plan_elem))
        .map_err(|e| format!("Failed to write plan element: {}", e))?;

    let mut sorting_elem = BytesStart::new("sorting");
    sorting_elem.push_attribute(("criteria", "None"));
    sorting_elem.push_attribute(("order", "None"));
    sorting_elem.push_attribute(("groupByPriority", "false"));
    writer
        .write_event(Event::Empty(sorting_elem))
        .map_err(|e| format!("Failed to write sorting element: {}", e))?;

    for entry in entries {
        let skill_name =
            sqlx::query_scalar::<_, String>("SELECT name FROM sde_types WHERE type_id = ?")
                .bind(entry.skill_type_id)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| format!("Failed to get skill name: {}", e))?
                .unwrap_or_else(|| format!("Unknown Skill ({})", entry.skill_type_id));

        let skill_id_str = entry.skill_type_id.to_string();
        let level_str = entry.planned_level.to_string();
        let mut entry_elem = BytesStart::new("entry");
        entry_elem.push_attribute(("skillID", skill_id_str.as_str()));
        entry_elem.push_attribute(("skill", skill_name.as_str()));
        entry_elem.push_attribute(("level", level_str.as_str()));
        entry_elem.push_attribute(("priority", "1"));
        entry_elem.push_attribute(("type", entry.entry_type.as_str()));

        if entry.notes.is_some() {
            writer
                .write_event(Event::Start(entry_elem))
                .map_err(|e| format!("Failed to write entry start: {}", e))?;

            if let Some(notes) = &entry.notes {
                let notes_elem = BytesStart::new("notes");
                writer
                    .write_event(Event::Start(notes_elem))
                    .map_err(|e| format!("Failed to write notes start: {}", e))?;
                writer
                    .write_event(Event::Text(BytesText::new(notes)))
                    .map_err(|e| format!("Failed to write notes text: {}", e))?;
                writer
                    .write_event(Event::End(BytesEnd::new("notes")))
                    .map_err(|e| format!("Failed to write notes end: {}", e))?;
            }

            writer
                .write_event(Event::End(BytesEnd::new("entry")))
                .map_err(|e| format!("Failed to write entry end: {}", e))?;
        } else {
            writer
                .write_event(Event::Empty(entry_elem))
                .map_err(|e| format!("Failed to write entry: {}", e))?;
        }
    }

    writer
        .write_event(Event::End(BytesEnd::new("plan")))
        .map_err(|e| format!("Failed to write plan end: {}", e))?;

    let result = writer.into_inner().into_inner();
    String::from_utf8(result).map_err(|e| format!("Failed to convert XML to string: {}", e))
}

#[tauri::command]
pub async fn search_skills(
    pool: State<'_, db::Pool>,
    query: String,
) -> Result<Vec<SkillSearchResult>, String> {
    let search_pattern = format!("%{}%", query);
    let skills: Vec<(i64, String)> = sqlx::query_as::<_, (i64, String)>(
        "SELECT type_id, name FROM sde_types
         WHERE group_id IN (SELECT group_id FROM sde_groups WHERE category_id = 16)
         AND published = 1
         AND name LIKE ?
         ORDER BY name
         LIMIT 100",
    )
    .bind(&search_pattern)
    .fetch_all(&*pool)
    .await
    .map_err(|e| format!("Failed to search skills: {}", e))?;

    let results: Vec<SkillSearchResult> = skills
        .into_iter()
        .map(|(skill_type_id, name)| SkillSearchResult {
            skill_type_id,
            name,
        })
        .collect();

    Ok(results)
}

#[tauri::command]
pub async fn compare_skill_plan_with_character(
    pool: State<'_, db::Pool>,
    plan_id: i64,
    character_id: i64,
) -> Result<PlanComparisonResponse, String> {
    let plan = db::skill_plans::get_skill_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get skill plan: {}", e))?
        .ok_or_else(|| "Plan not found".to_string())?;

    let entries = db::skill_plans::get_plan_entries(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get plan entries: {}", e))?;

    let character_skills = db::get_character_skills(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get character skills: {}", e))?;

    let character_skills_map: std::collections::HashMap<i64, db::CharacterSkill> = character_skills
        .into_iter()
        .map(|s| (s.skill_id, s))
        .collect();

    let skill_type_ids: Vec<i64> = entries.iter().map(|e| e.skill_type_id).collect();
    let skill_attributes = utils::get_skill_attributes(&pool, &skill_type_ids)
        .await
        .map_err(|e| format!("Failed to get skill attributes: {}", e))?;

    let mut comparison_entries = Vec::new();
    for entry in entries {
        let skill_name =
            sqlx::query_scalar::<_, String>("SELECT name FROM sde_types WHERE type_id = ?")
                .bind(entry.skill_type_id)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| format!("Failed to get skill name: {}", e))?
                .unwrap_or_else(|| format!("Unknown Skill ({})", entry.skill_type_id));

        let char_skill = character_skills_map.get(&entry.skill_type_id);
        let trained_level = char_skill.map(|s| s.trained_skill_level).unwrap_or(0);
        let active_level = char_skill.map(|s| s.active_skill_level).unwrap_or(0);
        let current_skillpoints = char_skill.map(|s| s.skillpoints_in_skill).unwrap_or(0);

        let skill_attr = skill_attributes.get(&entry.skill_type_id);
        let rank = skill_attr.and_then(|attr| attr.rank);

        let skillpoints_for_planned_level = if let Some(rank_val) = rank {
            utils::calculate_sp_for_level(rank_val, entry.planned_level as i32)
        } else {
            0
        };

        let missing_skillpoints = if trained_level >= entry.planned_level {
            0
        } else {
            (skillpoints_for_planned_level - current_skillpoints).max(0)
        };

        let status = if trained_level >= entry.planned_level {
            "complete"
        } else if trained_level > 0 {
            "in_progress"
        } else {
            "not_started"
        };

        comparison_entries.push(PlanComparisonEntry {
            entry_id: entry.entry_id,
            skill_type_id: entry.skill_type_id,
            skill_name,
            planned_level: entry.planned_level,
            trained_level,
            active_level,
            entry_type: entry.entry_type,
            sort_order: entry.sort_order,
            rank,
            skillpoints_for_planned_level,
            current_skillpoints,
            missing_skillpoints,
            status: status.to_string(),
        });
    }

    Ok(PlanComparisonResponse {
        plan: SkillPlanResponse::from(plan),
        character_id,
        entries: comparison_entries,
    })
}
