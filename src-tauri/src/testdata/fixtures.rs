use crate::db::{self, Pool};
use crate::skill_plans::Attributes;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
struct JsonSkillPlan {
    name: String,
    entries: Vec<JsonSkillPlanEntry>,
}

#[derive(Deserialize)]
struct JsonSkillPlanEntry {
    skill_type_id: i64,
    level: i64,
    entry_type: String,
}

pub async fn create_skill_plan(pool: &Pool, name: &str) -> i64 {
    db::skill_plans::create_skill_plan(pool, name, None, false)
        .await
        .unwrap()
}

pub async fn add_plan_entry(
    pool: &Pool,
    plan_id: i64,
    skill_type_id: i64,
    level: i64,
    entry_type: &str,
) -> i64 {
    sqlx::query(
        "INSERT INTO skill_plan_entries (plan_id, skill_type_id, planned_level, sort_order, entry_type)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM skill_plan_entries WHERE plan_id = ?), ?)"
    )
    .bind(plan_id)
    .bind(skill_type_id)
    .bind(level)
    .bind(plan_id)
    .bind(entry_type)
    .execute(pool)
    .await
    .unwrap()
    .last_insert_rowid()
}

pub async fn load_plan_from_json(pool: &Pool, json_path: &str) -> i64 {
    let json_content = std::fs::read_to_string(json_path).unwrap();
    let plan: JsonSkillPlan = serde_json::from_str(&json_content).unwrap();

    let plan_id = create_skill_plan(pool, &plan.name).await;

    for entry in plan.entries {
        add_plan_entry(
            pool,
            plan_id,
            entry.skill_type_id,
            entry.level,
            &entry.entry_type,
        )
        .await;
    }

    plan_id
}

pub fn create_sp_map(skills: &[(i64, i64)]) -> HashMap<i64, i64> {
    skills.iter().cloned().collect()
}

pub fn create_attributes(int: i64, mem: i64, per: i64, wil: i64, cha: i64) -> Attributes {
    Attributes {
        intelligence: int,
        memory: mem,
        perception: per,
        willpower: wil,
        charisma: cha,
    }
}
