use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use super::Pool;
use crate::skill_plans::Attributes;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Remap {
    pub remap_id: i64,
    pub character_id: Option<i64>,
    pub plan_id: Option<i64>,
    pub after_skill_type_id: Option<i64>,
    pub after_skill_level: Option<i64>,
    pub intelligence: i64,
    pub perception: i64,
    pub charisma: i64,
    pub willpower: i64,
    pub memory: i64,
    pub created_at: i64,
}

impl Remap {
    pub fn attributes(&self) -> Attributes {
        Attributes {
            intelligence: self.intelligence,
            perception: self.perception,
            charisma: self.charisma,
            willpower: self.willpower,
            memory: self.memory,
        }
    }
}

pub async fn save_remap<'a, E>(
    executor: E,
    character_id: Option<i64>,
    plan_id: Option<i64>,
    after_skill_type_id: Option<i64>,
    after_skill_level: Option<i64>,
    attributes: &Attributes,
) -> Result<i64>
where
    E: sqlx::Executor<'a, Database = sqlx::Sqlite>,
{
    let result = sqlx::query(
        "INSERT INTO remaps (
            character_id, plan_id, after_skill_type_id, after_skill_level,
            intelligence, perception, charisma, willpower, memory
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(character_id)
    .bind(plan_id)
    .bind(after_skill_type_id)
    .bind(after_skill_level)
    .bind(attributes.intelligence)
    .bind(attributes.perception)
    .bind(attributes.charisma)
    .bind(attributes.willpower)
    .bind(attributes.memory)
    .execute(executor)
    .await?;

    Ok(result.last_insert_rowid())
}

pub async fn get_plan_remaps(pool: &Pool, plan_id: i64) -> Result<Vec<Remap>> {
    let remaps = sqlx::query_as::<_, Remap>(
        "SELECT remap_id, character_id, plan_id, after_skill_type_id, after_skill_level,
                intelligence, perception, charisma, willpower, memory, created_at
         FROM remaps WHERE plan_id = ? ORDER BY created_at ASC",
    )
    .bind(plan_id)
    .fetch_all(pool)
    .await?;
    Ok(remaps)
}

pub async fn get_character_remaps(pool: &Pool, character_id: i64) -> Result<Vec<Remap>> {
    let remaps = sqlx::query_as::<_, Remap>(
        "SELECT remap_id, character_id, plan_id, after_skill_type_id, after_skill_level,
                intelligence, perception, charisma, willpower, memory, created_at
         FROM remaps WHERE character_id = ? ORDER BY created_at ASC",
    )
    .bind(character_id)
    .fetch_all(pool)
    .await?;
    Ok(remaps)
}

pub async fn delete_remap(pool: &Pool, remap_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM remaps WHERE remap_id = ?")
        .bind(remap_id)
        .execute(pool)
        .await?;
    Ok(())
}
#[allow(dead_code)]
pub async fn delete_plan_remaps(pool: &Pool, plan_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM remaps WHERE plan_id = ?")
        .bind(plan_id)
        .execute(pool)
        .await?;
    Ok(())
}
