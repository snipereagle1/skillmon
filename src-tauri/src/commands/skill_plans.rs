use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;
use serde::Serialize;
use std::collections::HashSet;
use std::io::Cursor;
use tauri::State;

use crate::db;
use crate::skill_plans::graph::{PlanDag, PlanNode};
use crate::skill_plans::{SkillmonPlan, SkillmonPlanEntry};
use crate::utils;

#[tauri::command]
pub async fn export_skill_plan_json(
    pool: State<'_, db::Pool>,
    plan_id: i64,
) -> Result<SkillmonPlan, String> {
    let plan = db::skill_plans::get_skill_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get plan: {}", e))?
        .ok_or_else(|| "Plan not found".to_string())?;

    let entries = db::skill_plans::get_plan_entries(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get entries: {}", e))?;

    let json_entries = entries
        .into_iter()
        .map(|e| SkillmonPlanEntry {
            skill_type_id: e.skill_type_id,
            level: e.planned_level,
            entry_type: e.entry_type,
            notes: e.notes,
        })
        .collect();

    Ok(SkillmonPlan {
        version: SkillmonPlan::CURRENT_VERSION,
        name: plan.name,
        description: plan.description,
        auto_prerequisites: plan.auto_prerequisites != 0,
        entries: json_entries,
    })
}

#[tauri::command]
pub async fn import_skill_plan_json(
    pool: State<'_, db::Pool>,
    plan: SkillmonPlan,
) -> Result<i64, String> {
    // 1. Validate the plan first
    let mut dag = PlanDag::new();
    let mut proposed_nodes = Vec::new();
    for entry in &plan.entries {
        let node = PlanNode {
            skill_type_id: entry.skill_type_id,
            level: entry.level,
        };
        dag.add_node(&pool, node)
            .await
            .map_err(|e| format!("Failed to build DAG for validation: {}", e))?;
        proposed_nodes.push(node);
    }

    let validation = dag.validate(&proposed_nodes);
    if !validation.is_valid {
        let mut all_type_ids = HashSet::new();
        for err in &validation.errors {
            match err {
                crate::skill_plans::graph::ValidationEntry::Cycle(nodes) => {
                    for n in nodes {
                        all_type_ids.insert(n.skill_type_id);
                    }
                }
                crate::skill_plans::graph::ValidationEntry::MissingPrerequisite {
                    node,
                    missing,
                } => {
                    all_type_ids.insert(node.skill_type_id);
                    all_type_ids.insert(missing.skill_type_id);
                }
                crate::skill_plans::graph::ValidationEntry::OrderingViolation {
                    node,
                    prerequisite,
                } => {
                    all_type_ids.insert(node.skill_type_id);
                    all_type_ids.insert(prerequisite.skill_type_id);
                }
            }
        }

        let type_names = if !all_type_ids.is_empty() {
            utils::get_type_names_helper(&pool, &all_type_ids.into_iter().collect::<Vec<_>>())
                .await?
        } else {
            std::collections::HashMap::new()
        };

        let error_msgs: Vec<String> = validation
            .errors
            .into_iter()
            .map(|err| {
                let mapped = map_validation_entry(err, &type_names);
                if mapped.variant == "Cycle" {
                    "Circular dependency detected".to_string()
                } else if mapped.variant == "MissingPrerequisite" {
                    format!(
                        "{} {} is missing prerequisite {} {}",
                        mapped.node_skill_name,
                        mapped.node_level,
                        mapped.other_skill_name,
                        mapped.other_level
                    )
                } else {
                    format!(
                        "{} {} would be trained before its prerequisite {} {}",
                        mapped.node_skill_name,
                        mapped.node_level,
                        mapped.other_skill_name,
                        mapped.other_level
                    )
                }
            })
            .collect();

        return Err(format!("Invalid plan: {}", error_msgs.join(", ")));
    }

    // 2. If valid, proceed with import
    let plan_id = db::skill_plans::create_skill_plan(
        &pool,
        &plan.name,
        plan.description.as_deref(),
        plan.auto_prerequisites,
    )
    .await
    .map_err(|e| format!("Failed to create plan: {}", e))?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Transaction failed: {}", e))?;

    for (index, entry) in plan.entries.iter().enumerate() {
        sqlx::query(
            "INSERT INTO skill_plan_entries (plan_id, skill_type_id, planned_level, sort_order, entry_type, notes)
             VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(plan_id)
        .bind(entry.skill_type_id)
        .bind(entry.level)
        .bind(index as i64)
        .bind(&entry.entry_type)
        .bind(&entry.notes)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to insert entry: {}", e))?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit: {}", e))?;

    Ok(plan_id)
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillPlanResponse {
    pub plan_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub auto_prerequisites: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl From<db::skill_plans::SkillPlan> for SkillPlanResponse {
    fn from(p: db::skill_plans::SkillPlan) -> Self {
        SkillPlanResponse {
            plan_id: p.plan_id,
            name: p.name,
            description: p.description,
            auto_prerequisites: p.auto_prerequisites != 0,
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
    db::skill_plans::create_skill_plan(&pool, &name, description.as_deref(), true)
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
        let skill_name = db::skill_plans::get_skill_name(&pool, entry.skill_type_id)
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
    auto_prerequisites: bool,
) -> Result<(), String> {
    db::skill_plans::update_skill_plan(
        &pool,
        plan_id,
        &name,
        description.as_deref(),
        auto_prerequisites,
    )
    .await
    .map_err(|e| format!("Failed to update skill plan: {}", e))
}

#[tauri::command]
pub async fn delete_skill_plan(pool: State<'_, db::Pool>, plan_id: i64) -> Result<(), String> {
    db::skill_plans::delete_skill_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to delete skill plan: {}", e))
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

    // 1. Build DAG and get current nodes
    let (mut dag, current_nodes) = PlanDag::build_from_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to build DAG: {}", e))?;

    let plan = db::skill_plans::get_skill_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get plan: {}", e))?
        .ok_or_else(|| "Plan not found".to_string())?;

    // 2. Add new node (recursively if enabled)
    let new_node = PlanNode {
        skill_type_id,
        level: planned_level,
    };

    if plan.auto_prerequisites != 0 {
        dag.add_recursive(&pool, new_node)
            .await
            .map_err(|e| format!("Failed to add prerequisites: {}", e))?;
    } else {
        dag.add_node(&pool, new_node)
            .await
            .map_err(|e| format!("Failed to add node: {}", e))?;
    }

    // 3. Topological sort to get new order
    let sorted_nodes = dag.topological_sort(&current_nodes);

    // 4. Update database
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Transaction failed: {}", e))?;

    for (index, node) in sorted_nodes.iter().enumerate() {
        let entry_type = if node.skill_type_id == skill_type_id && node.level == planned_level {
            "Planned"
        } else {
            // Check if it already exists as Planned
            let existing =
                db::skill_plans::get_entry_type(&pool, plan_id, node.skill_type_id, node.level)
                    .await
                    .map_err(|e| format!("DB Error: {}", e))?;

            if let Some(et) = existing {
                if et == "Planned" {
                    "Planned"
                } else {
                    "Prerequisite"
                }
            } else {
                "Prerequisite"
            }
        };

        sqlx::query(
            "INSERT INTO skill_plan_entries (plan_id, skill_type_id, planned_level, sort_order, entry_type, notes)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, skill_type_id, planned_level) DO UPDATE SET
             sort_order = excluded.sort_order,
             entry_type = CASE
                WHEN excluded.entry_type = 'Planned' THEN 'Planned'
                ELSE skill_plan_entries.entry_type
             END"
        )
        .bind(plan_id)
        .bind(node.skill_type_id)
        .bind(node.level)
        .bind(index as i64)
        .bind(entry_type)
        .bind(if node == &new_node { notes.as_deref() } else { None })
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to insert entry: {}", e))?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit: {}", e))?;

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
        let current_entry = db::skill_plans::get_entry_details_by_id(&pool, entry_id)
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
                add_plan_entry(pool, plan_id, skill_type_id, new_level, notes).await?;

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

#[derive(Debug, Clone, Serialize)]
pub struct ValidationEntryResponse {
    pub variant: String,
    pub node_skill_type_id: i64,
    pub node_skill_name: String,
    pub node_level: i64,
    pub other_skill_type_id: i64,
    pub other_skill_name: String,
    pub other_level: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValidationResponse {
    pub is_valid: bool,
    pub errors: Vec<ValidationEntryResponse>,
    pub warnings: Vec<ValidationEntryResponse>,
}

#[tauri::command]
pub async fn validate_skill_plan(
    pool: State<'_, db::Pool>,
    plan_id: i64,
) -> Result<ValidationResponse, String> {
    let entries = db::skill_plans::get_plan_nodes_in_order(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get plan nodes: {}", e))?;

    let mut dag = PlanDag::new();
    let mut nodes = Vec::new();
    for (skill_type_id, planned_level) in entries {
        let node = PlanNode {
            skill_type_id,
            level: planned_level,
        };
        dag.add_node(&pool, node)
            .await
            .map_err(|e| format!("Failed to build DAG: {}", e))?;
        nodes.push(node);
    }

    let validation = dag.validate(&nodes);

    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    let mut type_names = std::collections::HashMap::new();
    let all_type_ids: HashSet<i64> = validation
        .errors
        .iter()
        .chain(validation.warnings.iter())
        .flat_map(|e| match e {
            crate::skill_plans::graph::ValidationEntry::Cycle(nodes) => {
                nodes.iter().map(|n| n.skill_type_id).collect::<Vec<_>>()
            }
            crate::skill_plans::graph::ValidationEntry::MissingPrerequisite { node, missing } => {
                vec![node.skill_type_id, missing.skill_type_id]
            }
            crate::skill_plans::graph::ValidationEntry::OrderingViolation {
                node,
                prerequisite,
            } => vec![node.skill_type_id, prerequisite.skill_type_id],
        })
        .collect();

    if !all_type_ids.is_empty() {
        let names =
            utils::get_type_names_helper(&pool, &all_type_ids.into_iter().collect::<Vec<_>>())
                .await?;
        type_names = names;
    }

    for err in validation.errors {
        errors.push(map_validation_entry(err, &type_names));
    }

    for warn in validation.warnings {
        warnings.push(map_validation_entry(warn, &type_names));
    }

    Ok(ValidationResponse {
        is_valid: validation.is_valid,
        errors,
        warnings,
    })
}

fn map_validation_entry(
    entry: crate::skill_plans::graph::ValidationEntry,
    names: &std::collections::HashMap<i64, String>,
) -> ValidationEntryResponse {
    match entry {
        crate::skill_plans::graph::ValidationEntry::Cycle(_) => ValidationEntryResponse {
            variant: "Cycle".to_string(),
            node_skill_type_id: 0,
            node_skill_name: "".to_string(),
            node_level: 0,
            other_skill_type_id: 0,
            other_skill_name: "".to_string(),
            other_level: 0,
        },
        crate::skill_plans::graph::ValidationEntry::MissingPrerequisite { node, missing } => {
            ValidationEntryResponse {
                variant: "MissingPrerequisite".to_string(),
                node_skill_type_id: node.skill_type_id,
                node_skill_name: names
                    .get(&node.skill_type_id)
                    .cloned()
                    .unwrap_or_else(|| node.skill_type_id.to_string()),
                node_level: node.level,
                other_skill_type_id: missing.skill_type_id,
                other_skill_name: names
                    .get(&missing.skill_type_id)
                    .cloned()
                    .unwrap_or_else(|| missing.skill_type_id.to_string()),
                other_level: missing.level,
            }
        }
        crate::skill_plans::graph::ValidationEntry::OrderingViolation { node, prerequisite } => {
            ValidationEntryResponse {
                variant: "OrderingViolation".to_string(),
                node_skill_type_id: node.skill_type_id,
                node_skill_name: names
                    .get(&node.skill_type_id)
                    .cloned()
                    .unwrap_or_else(|| node.skill_type_id.to_string()),
                node_level: node.level,
                other_skill_type_id: prerequisite.skill_type_id,
                other_skill_name: names
                    .get(&prerequisite.skill_type_id)
                    .cloned()
                    .unwrap_or_else(|| prerequisite.skill_type_id.to_string()),
                other_level: prerequisite.level,
            }
        }
    }
}

#[tauri::command]
pub async fn validate_reorder(
    pool: State<'_, db::Pool>,
    plan_id: i64,
    entry_ids: Vec<i64>,
) -> Result<ValidationResponse, String> {
    let entries = db::skill_plans::get_plan_entries(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get entries: {}", e))?;

    let entry_map: std::collections::HashMap<i64, &db::skill_plans::SkillPlanEntry> =
        entries.iter().map(|e| (e.entry_id, e)).collect();

    let mut proposed_nodes = Vec::new();
    for id in &entry_ids {
        let entry = entry_map
            .get(id)
            .ok_or_else(|| format!("Entry {} not found", id))?;
        proposed_nodes.push(PlanNode {
            skill_type_id: entry.skill_type_id,
            level: entry.planned_level,
        });
    }

    let mut dag = PlanDag::new();
    for &node in &proposed_nodes {
        dag.add_node(&pool, node)
            .await
            .map_err(|e| format!("Failed to build DAG: {}", e))?;
    }

    let validation = dag.validate(&proposed_nodes);

    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    let mut type_names = std::collections::HashMap::new();
    let all_type_ids: HashSet<i64> = validation
        .errors
        .iter()
        .chain(validation.warnings.iter())
        .flat_map(|e| match e {
            crate::skill_plans::graph::ValidationEntry::Cycle(nodes) => {
                nodes.iter().map(|n| n.skill_type_id).collect::<Vec<_>>()
            }
            crate::skill_plans::graph::ValidationEntry::MissingPrerequisite { node, missing } => {
                vec![node.skill_type_id, missing.skill_type_id]
            }
            crate::skill_plans::graph::ValidationEntry::OrderingViolation {
                node,
                prerequisite,
            } => vec![node.skill_type_id, prerequisite.skill_type_id],
        })
        .collect();

    if !all_type_ids.is_empty() {
        let names =
            utils::get_type_names_helper(&pool, &all_type_ids.into_iter().collect::<Vec<_>>())
                .await?;
        type_names = names;
    }

    for err in validation.errors {
        errors.push(map_validation_entry(err, &type_names));
    }

    for warn in validation.warnings {
        warnings.push(map_validation_entry(warn, &type_names));
    }

    Ok(ValidationResponse {
        is_valid: validation.is_valid,
        errors,
        warnings,
    })
}

#[tauri::command]
pub async fn reorder_plan_entries(
    pool: State<'_, db::Pool>,
    plan_id: i64,
    entry_ids: Vec<i64>,
) -> Result<(), String> {
    // 1. Validate first
    let validation = validate_reorder(pool.clone(), plan_id, entry_ids.clone()).await?;

    if !validation.is_valid {
        let error_msgs: Vec<String> = validation
            .errors
            .into_iter()
            .map(|err| {
                if err.variant == "Cycle" {
                    "Circular dependency detected".to_string()
                } else if err.variant == "MissingPrerequisite" {
                    format!(
                        "{} {} is missing prerequisite {} {}",
                        err.node_skill_name, err.node_level, err.other_skill_name, err.other_level
                    )
                } else {
                    format!(
                        "{} {} would be trained before its prerequisite {} {}",
                        err.node_skill_name, err.node_level, err.other_skill_name, err.other_level
                    )
                }
            })
            .collect();

        return Err(format!("Invalid order: {}", error_msgs.join(", ")));
    }

    // 2. Persist
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

    // 1. Build DAG and get current nodes
    let (mut dag, current_nodes) = PlanDag::build_from_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to build DAG: {}", e))?;

    // 2. Add all imported entries recursively
    for (skill_type_id, level) in &planned_entries {
        dag.add_recursive(
            &pool,
            PlanNode {
                skill_type_id: *skill_type_id,
                level: *level,
            },
        )
        .await
        .map_err(|e| {
            format!(
                "Failed to add prerequisites for skill {}: {}",
                skill_type_id, e
            )
        })?;
    }

    // 3. Topological sort to get new order
    let sorted_nodes = dag.topological_sort(&current_nodes);

    // 4. Update database
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Transaction failed: {}", e))?;

    for (index, node) in sorted_nodes.iter().enumerate() {
        let is_originally_planned = planned_entries.contains(&(node.skill_type_id, node.level));

        let entry_type = if is_originally_planned {
            "Planned"
        } else {
            let existing =
                db::skill_plans::get_entry_type(&pool, plan_id, node.skill_type_id, node.level)
                    .await
                    .map_err(|e| format!("DB Error: {}", e))?;

            if let Some(et) = existing {
                if et == "Planned" {
                    "Planned"
                } else {
                    "Prerequisite"
                }
            } else {
                "Prerequisite"
            }
        };

        sqlx::query(
            "INSERT INTO skill_plan_entries (plan_id, skill_type_id, planned_level, sort_order, entry_type, notes)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, skill_type_id, planned_level) DO UPDATE SET
             sort_order = excluded.sort_order,
             entry_type = CASE
                WHEN excluded.entry_type = 'Planned' THEN 'Planned'
                ELSE skill_plan_entries.entry_type
             END"
        )
        .bind(plan_id)
        .bind(node.skill_type_id)
        .bind(node.level)
        .bind(index as i64)
        .bind(entry_type)
        .bind(None::<String>)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to insert entry: {}", e))?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit: {}", e))?;

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

    // 1. Build DAG and get current nodes
    let (mut dag, current_nodes) = PlanDag::build_from_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to build DAG: {}", e))?;

    // 2. Add all imported entries recursively
    for (skill_id, level, _entry_type, _notes) in &entries {
        dag.add_recursive(
            &pool,
            PlanNode {
                skill_type_id: *skill_id,
                level: *level,
            },
        )
        .await
        .map_err(|e| format!("Failed to add prerequisites for skill {}: {}", skill_id, e))?;
    }

    // 3. Topological sort to get new order
    let sorted_nodes = dag.topological_sort(&current_nodes);

    // 4. Update database
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Transaction failed: {}", e))?;

    let imported_planned_nodes: HashSet<PlanNode> = entries
        .iter()
        .filter(|(_, _, et, _)| et == "Planned")
        .map(|(sid, lvl, _, _)| PlanNode {
            skill_type_id: *sid,
            level: *lvl,
        })
        .collect();

    for (index, node) in sorted_nodes.iter().enumerate() {
        let is_originally_planned = imported_planned_nodes.contains(node);

        let entry_type = if is_originally_planned {
            "Planned"
        } else {
            let existing =
                db::skill_plans::get_entry_type(&pool, plan_id, node.skill_type_id, node.level)
                    .await
                    .map_err(|e| format!("DB Error: {}", e))?;

            if let Some(et) = existing {
                if et == "Planned" {
                    "Planned"
                } else {
                    "Prerequisite"
                }
            } else {
                "Prerequisite"
            }
        };

        // Find notes if available in imported entries
        let notes = entries
            .iter()
            .find(|(sid, lvl, _, _)| *sid == node.skill_type_id && *lvl == node.level)
            .and_then(|(_, _, _, n)| n.clone());

        sqlx::query(
            "INSERT INTO skill_plan_entries (plan_id, skill_type_id, planned_level, sort_order, entry_type, notes)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(plan_id, skill_type_id, planned_level) DO UPDATE SET
             sort_order = excluded.sort_order,
             entry_type = CASE
                WHEN excluded.entry_type = 'Planned' THEN 'Planned'
                ELSE skill_plan_entries.entry_type
             END,
             notes = CASE WHEN excluded.notes IS NOT NULL THEN excluded.notes ELSE skill_plan_entries.notes END"
        )
        .bind(plan_id)
        .bind(node.skill_type_id)
        .bind(node.level)
        .bind(index as i64)
        .bind(entry_type)
        .bind(notes)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to insert entry: {}", e))?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit: {}", e))?;

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
        let skill_name = db::skill_plans::get_skill_name(&pool, entry.skill_type_id)
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
        let skill_name = db::skill_plans::get_skill_name(&pool, entry.skill_type_id)
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
    let skills = db::skill_plans::search_skills(&pool, &query)
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

#[derive(Debug, Clone, Serialize)]
pub struct PlanComparisonSummary {
    pub character_id: i64,
    pub character_name: String,
    pub completed_sp: i64,
    pub missing_sp: i64,
    pub time_to_completion_seconds: i64,
    pub has_prerequisites: bool,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MultiPlanComparisonResponse {
    pub plan: SkillPlanResponse,
    pub comparisons: Vec<PlanComparisonSummary>,
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
        let skill_name = db::skill_plans::get_skill_name(&pool, entry.skill_type_id)
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

#[tauri::command]
pub async fn compare_skill_plan_with_all_characters(
    pool: State<'_, db::Pool>,
    plan_id: i64,
) -> Result<MultiPlanComparisonResponse, String> {
    let plan = db::skill_plans::get_skill_plan(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get skill plan: {}", e))?
        .ok_or_else(|| "Plan not found".to_string())?;

    let entries = db::skill_plans::get_plan_entries(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get plan entries: {}", e))?;

    let characters = db::get_all_characters(&pool)
        .await
        .map_err(|e| format!("Failed to get characters: {}", e))?;

    let skill_type_ids: Vec<i64> = entries.iter().map(|e| e.skill_type_id).collect();
    let skill_attributes = utils::get_skill_attributes(&pool, &skill_type_ids)
        .await
        .map_err(|e| format!("Failed to get skill attributes: {}", e))?;

    let mut comparisons = Vec::new();

    for character in characters {
        let character_skills = db::get_character_skills(&pool, character.character_id)
            .await
            .map_err(|e| {
                format!(
                    "Failed to get skills for character {}: {}",
                    character.character_name, e
                )
            })?;

        let character_skills_map: std::collections::HashMap<i64, db::CharacterSkill> =
            character_skills
                .into_iter()
                .map(|s| (s.skill_id, s))
                .collect();

        let attributes = db::get_character_attributes(&pool, character.character_id)
            .await
            .map_err(|e| {
                format!(
                    "Failed to get attributes for character {}: {}",
                    character.character_name, e
                )
            })?;

        let mut completed_sp = 0;
        let mut missing_sp = 0;
        let mut total_time_seconds = 0.0;
        let mut has_prerequisites = true;

        for entry in &entries {
            let char_skill = character_skills_map.get(&entry.skill_type_id);
            let trained_level = char_skill.map(|s| s.trained_skill_level).unwrap_or(0);
            let current_skillpoints = char_skill.map(|s| s.skillpoints_in_skill).unwrap_or(0);

            let skill_attr = skill_attributes.get(&entry.skill_type_id);
            let rank = skill_attr.and_then(|attr| attr.rank);

            if let Some(rank_val) = rank {
                let sp_for_planned =
                    utils::calculate_sp_for_level(rank_val, entry.planned_level as i32);

                if trained_level >= entry.planned_level {
                    completed_sp += sp_for_planned;
                } else {
                    completed_sp += current_skillpoints;
                    let missing = (sp_for_planned - current_skillpoints).max(0);
                    missing_sp += missing;

                    if let Some(attr) = attributes.as_ref() {
                        if let Some(s_attr) = skill_attr {
                            if let (Some(primary), Some(secondary)) =
                                (s_attr.primary_attribute, s_attr.secondary_attribute)
                            {
                                let p_val = match primary {
                                    164 => attr.charisma,
                                    165 => attr.intelligence,
                                    166 => attr.memory,
                                    167 => attr.perception,
                                    168 => attr.willpower,
                                    _ => 17, // default base
                                };
                                let s_val = match secondary {
                                    164 => attr.charisma,
                                    165 => attr.intelligence,
                                    166 => attr.memory,
                                    167 => attr.perception,
                                    168 => attr.willpower,
                                    _ => 17, // default base
                                };
                                let sp_per_min = utils::calculate_sp_per_minute(p_val, s_val);
                                if sp_per_min > 0.0 {
                                    total_time_seconds += (missing as f64 / sp_per_min) * 60.0;
                                }
                            }
                        }
                    }
                }
            }

            // Check SDE prerequisites if not already failed
            if has_prerequisites {
                let prereqs: Vec<(i64, i64)> = sqlx::query_as::<_, (i64, i64)>(
                    "SELECT required_skill_id, required_level FROM sde_skill_requirements WHERE skill_type_id = ?"
                )
                .bind(entry.skill_type_id)
                .fetch_all(&*pool)
                .await
                .map_err(|e| format!("Failed to fetch prereqs: {}", e))?;

                for (req_id, req_level) in prereqs {
                    let char_req_skill = character_skills_map.get(&req_id);
                    let trained_req_level =
                        char_req_skill.map(|s| s.trained_skill_level).unwrap_or(0);
                    if trained_req_level < req_level {
                        // Check if it's in the plan *before* this entry
                        let in_plan = entries
                            .iter()
                            .take_while(|e| e.entry_id != entry.entry_id)
                            .any(|e| e.skill_type_id == req_id && e.planned_level >= req_level);

                        if !in_plan {
                            has_prerequisites = false;
                            break;
                        }
                    }
                }
            }
        }

        let status = if missing_sp == 0 {
            "complete"
        } else if completed_sp > 0 {
            "in_progress"
        } else {
            "not_started"
        };

        comparisons.push(PlanComparisonSummary {
            character_id: character.character_id,
            character_name: character.character_name,
            completed_sp,
            missing_sp,
            time_to_completion_seconds: total_time_seconds as i64,
            has_prerequisites,
            status: status.to_string(),
        });
    }

    Ok(MultiPlanComparisonResponse {
        plan: SkillPlanResponse::from(plan),
        comparisons,
    })
}
