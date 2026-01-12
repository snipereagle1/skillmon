use anyhow::Result;
use serde::Serialize;
use sqlx::FromRow;

use super::Pool;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SkillPlan {
    pub plan_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub auto_prerequisites: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SkillPlanEntry {
    pub entry_id: i64,
    pub plan_id: i64,
    pub skill_type_id: i64,
    pub planned_level: i64,
    pub sort_order: i64,
    pub entry_type: String,
    pub notes: Option<String>,
}

pub async fn create_skill_plan(
    pool: &Pool,
    name: &str,
    description: Option<&str>,
    auto_prerequisites: bool,
) -> Result<i64> {
    let now = chrono::Utc::now().timestamp();
    let result = sqlx::query(
        "INSERT INTO skill_plans (name, description, auto_prerequisites, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(name)
    .bind(description)
    .bind(if auto_prerequisites { 1 } else { 0 })
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    let plan_id = result.last_insert_rowid();

    Ok(plan_id)
}

pub async fn get_all_skill_plans(pool: &Pool) -> Result<Vec<SkillPlan>> {
    let plans = sqlx::query_as::<_, SkillPlan>(
        "SELECT plan_id, name, description, auto_prerequisites, created_at, updated_at FROM skill_plans ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(plans)
}

pub async fn get_skill_plan(pool: &Pool, plan_id: i64) -> Result<Option<SkillPlan>> {
    let plan = sqlx::query_as::<_, SkillPlan>(
        "SELECT plan_id, name, description, auto_prerequisites, created_at, updated_at FROM skill_plans WHERE plan_id = ?",
    )
    .bind(plan_id)
    .fetch_optional(pool)
    .await?;

    Ok(plan)
}

pub async fn update_skill_plan(
    pool: &Pool,
    plan_id: i64,
    name: &str,
    description: Option<&str>,
    auto_prerequisites: bool,
) -> Result<()> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "UPDATE skill_plans SET name = ?, description = ?, auto_prerequisites = ?, updated_at = ? WHERE plan_id = ?",
    )
    .bind(name)
    .bind(description)
    .bind(if auto_prerequisites { 1 } else { 0 })
    .bind(now)
    .bind(plan_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn delete_skill_plan(pool: &Pool, plan_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM skill_plans WHERE plan_id = ?")
        .bind(plan_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn get_plan_entries(pool: &Pool, plan_id: i64) -> Result<Vec<SkillPlanEntry>> {
    let entries = sqlx::query_as::<_, SkillPlanEntry>(
        "SELECT entry_id, plan_id, skill_type_id, planned_level, sort_order, entry_type, notes
         FROM skill_plan_entries
         WHERE plan_id = ?
         ORDER BY sort_order",
    )
    .bind(plan_id)
    .fetch_all(pool)
    .await?;

    Ok(entries)
}

pub async fn get_plan_nodes_in_order(pool: &Pool, plan_id: i64) -> Result<Vec<(i64, i64)>> {
    let nodes = sqlx::query_as::<_, (i64, i64)>(
        "SELECT skill_type_id, planned_level
         FROM skill_plan_entries
         WHERE plan_id = ?
         ORDER BY sort_order",
    )
    .bind(plan_id)
    .fetch_all(pool)
    .await?;

    Ok(nodes)
}

pub async fn update_plan_entry(
    pool: &Pool,
    entry_id: i64,
    planned_level: Option<i64>,
    entry_type: Option<&str>,
    notes: Option<&str>,
) -> Result<()> {
    let mut updates = Vec::new();

    if planned_level.is_some() {
        updates.push("planned_level = ?");
    }

    if entry_type.is_some() {
        updates.push("entry_type = ?");
    }

    if notes.is_some() {
        updates.push("notes = ?");
    }

    if updates.is_empty() {
        return Ok(());
    }

    let query = format!(
        "UPDATE skill_plan_entries SET {} WHERE entry_id = ?",
        updates.join(", ")
    );

    let mut query_builder = sqlx::query(&query);

    if let Some(level) = planned_level {
        query_builder = query_builder.bind(level);
    }

    if let Some(etype) = entry_type {
        query_builder = query_builder.bind(etype);
    }

    if let Some(notes_val) = notes {
        query_builder = query_builder.bind(notes_val);
    }

    query_builder = query_builder.bind(entry_id);

    query_builder.execute(pool).await?;

    Ok(())
}

pub async fn delete_plan_entry(pool: &Pool, entry_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM skill_plan_entries WHERE entry_id = ?")
        .bind(entry_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn reorder_plan_entries(pool: &Pool, plan_id: i64, entry_ids: &[i64]) -> Result<()> {
    let mut tx = pool.begin().await?;

    for (index, entry_id) in entry_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE skill_plan_entries SET sort_order = ? WHERE entry_id = ? AND plan_id = ?",
        )
        .bind(index as i64)
        .bind(entry_id)
        .bind(plan_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}

pub async fn get_skill_type_id_by_name(pool: &Pool, skill_name: &str) -> Result<Option<i64>> {
    let type_id = sqlx::query_scalar::<_, i64>(
        "SELECT type_id FROM sde_types WHERE name = ? AND published = 1",
    )
    .bind(skill_name)
    .fetch_optional(pool)
    .await?;

    Ok(type_id)
}

pub async fn get_skill_name(pool: &Pool, type_id: i64) -> Result<Option<String>> {
    let name = sqlx::query_scalar::<_, String>("SELECT name FROM sde_types WHERE type_id = ?")
        .bind(type_id)
        .fetch_optional(pool)
        .await?;

    Ok(name)
}

pub async fn search_skills(pool: &Pool, query: &str) -> Result<Vec<(i64, String)>> {
    let search_pattern = format!("%{}%", query);
    let skills = sqlx::query_as::<_, (i64, String)>(
        "SELECT type_id, name FROM sde_types
         WHERE group_id IN (SELECT group_id FROM sde_groups WHERE category_id = 16)
         AND published = 1
         AND name LIKE ?
         ORDER BY name
         LIMIT 100",
    )
    .bind(&search_pattern)
    .fetch_all(pool)
    .await?;

    Ok(skills)
}

pub async fn get_entry_type(
    pool: &Pool,
    plan_id: i64,
    skill_id: i64,
    level: i64,
) -> Result<Option<String>> {
    let entry_type = sqlx::query_scalar::<_, String>(
        "SELECT entry_type FROM skill_plan_entries WHERE plan_id = ? AND skill_type_id = ? AND planned_level = ?",
    )
    .bind(plan_id)
    .bind(skill_id)
    .bind(level)
    .fetch_optional(pool)
    .await?;

    Ok(entry_type)
}

pub async fn get_entry_details_by_id(
    pool: &Pool,
    entry_id: i64,
) -> Result<Option<(i64, i64, i64, String)>> {
    let details = sqlx::query_as::<_, (i64, i64, i64, String)>(
        "SELECT plan_id, skill_type_id, planned_level, entry_type
         FROM skill_plan_entries
         WHERE entry_id = ?",
    )
    .bind(entry_id)
    .fetch_optional(pool)
    .await?;

    Ok(details)
}
