use anyhow::Result;
use serde::Serialize;
use sqlx::FromRow;

use super::Pool;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SkillPlan {
    pub plan_id: i64,
    pub name: String,
    pub description: Option<String>,
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

#[derive(Debug, Clone)]
pub struct SkillPrerequisite {
    pub required_skill_id: i64,
    pub required_level: i64,
}

pub async fn create_skill_plan(pool: &Pool, name: &str, description: Option<&str>) -> Result<i64> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO skill_plans (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)",
    )
    .bind(name)
    .bind(description)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    let plan_id = sqlx::query_scalar::<_, i64>("SELECT last_insert_rowid()")
        .fetch_one(pool)
        .await?;

    Ok(plan_id)
}

pub async fn get_all_skill_plans(pool: &Pool) -> Result<Vec<SkillPlan>> {
    let plans = sqlx::query_as::<_, SkillPlan>(
        "SELECT plan_id, name, description, created_at, updated_at FROM skill_plans ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(plans)
}

pub async fn get_skill_plan(pool: &Pool, plan_id: i64) -> Result<Option<SkillPlan>> {
    let plan = sqlx::query_as::<_, SkillPlan>(
        "SELECT plan_id, name, description, created_at, updated_at FROM skill_plans WHERE plan_id = ?",
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
) -> Result<()> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "UPDATE skill_plans SET name = ?, description = ?, updated_at = ? WHERE plan_id = ?",
    )
    .bind(name)
    .bind(description)
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

pub async fn add_plan_entry(
    pool: &Pool,
    plan_id: i64,
    skill_type_id: i64,
    planned_level: i64,
    entry_type: &str,
    notes: Option<&str>,
) -> Result<i64> {
    let max_sort_order: Option<i64> =
        sqlx::query_scalar("SELECT MAX(sort_order) FROM skill_plan_entries WHERE plan_id = ?")
            .bind(plan_id)
            .fetch_optional(pool)
            .await?;

    let next_sort_order = max_sort_order.unwrap_or(-1) + 1;

    sqlx::query(
        "INSERT INTO skill_plan_entries (plan_id, skill_type_id, planned_level, sort_order, entry_type, notes)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(plan_id, skill_type_id, planned_level) DO UPDATE SET
         entry_type = CASE
             WHEN excluded.entry_type = 'Planned' THEN excluded.entry_type
             WHEN skill_plan_entries.entry_type = 'Planned' THEN skill_plan_entries.entry_type
             ELSE excluded.entry_type
         END,
         notes = excluded.notes",
    )
    .bind(plan_id)
    .bind(skill_type_id)
    .bind(planned_level)
    .bind(next_sort_order)
    .bind(entry_type)
    .bind(notes)
    .execute(pool)
    .await?;

    let entry_id = sqlx::query_scalar::<_, i64>(
        "SELECT entry_id FROM skill_plan_entries WHERE plan_id = ? AND skill_type_id = ? AND planned_level = ?",
    )
    .bind(plan_id)
    .bind(skill_type_id)
    .bind(planned_level)
    .fetch_one(pool)
    .await?;

    Ok(entry_id)
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

pub async fn get_prerequisites_recursive(
    pool: &Pool,
    skill_type_id: i64,
    target_level: i64,
) -> Result<Vec<SkillPrerequisite>> {
    let mut prerequisites = Vec::new();
    let mut visited = std::collections::HashSet::new();
    let mut stack = vec![skill_type_id];

    while let Some(skill_id) = stack.pop() {
        if visited.contains(&skill_id) {
            continue;
        }
        visited.insert(skill_id);

        let reqs: Vec<(i64, i64)> = sqlx::query_as::<_, (i64, i64)>(
            "SELECT required_skill_id, required_level
             FROM sde_skill_requirements
             WHERE skill_type_id = ?",
        )
        .bind(skill_id)
        .fetch_all(pool)
        .await?;

        for (required_skill_id, required_level) in reqs {
            if required_level <= target_level {
                prerequisites.push(SkillPrerequisite {
                    required_skill_id,
                    required_level,
                });

                if !visited.contains(&required_skill_id) {
                    stack.push(required_skill_id);
                }
            }
        }
    }

    Ok(prerequisites)
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
