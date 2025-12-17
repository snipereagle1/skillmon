use anyhow::Result;
use serde::Serialize;
use sqlx::FromRow;

use super::Pool;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CharacterSkill {
    pub character_id: i64,
    pub skill_id: i64,
    pub active_skill_level: i64,
    pub skillpoints_in_skill: i64,
    pub trained_skill_level: i64,
}

pub async fn set_character_skills(
    pool: &Pool,
    character_id: i64,
    skills: &[(i64, i64, i64, i64)],
) -> Result<()> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM character_skills WHERE character_id = ?")
        .bind(character_id)
        .execute(&mut *tx)
        .await?;

    for (skill_id, active_skill_level, skillpoints_in_skill, trained_skill_level) in skills {
        sqlx::query(
            r#"
            INSERT INTO character_skills
            (character_id, skill_id, active_skill_level, skillpoints_in_skill, trained_skill_level, updated_at)
            VALUES (?, ?, ?, ?, ?, strftime('%s','now'))
            "#,
        )
        .bind(character_id)
        .bind(skill_id)
        .bind(active_skill_level)
        .bind(skillpoints_in_skill)
        .bind(trained_skill_level)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}

#[allow(dead_code)]
pub async fn get_character_skill(
    pool: &Pool,
    character_id: i64,
    skill_id: i64,
) -> Result<Option<CharacterSkill>> {
    let skill = sqlx::query_as::<_, CharacterSkill>(
        "SELECT character_id, skill_id, active_skill_level, skillpoints_in_skill, trained_skill_level FROM character_skills WHERE character_id = ? AND skill_id = ?",
    )
    .bind(character_id)
    .bind(skill_id)
    .fetch_optional(pool)
    .await?;

    Ok(skill)
}

pub async fn get_character_skills(pool: &Pool, character_id: i64) -> Result<Vec<CharacterSkill>> {
    let skills = sqlx::query_as::<_, CharacterSkill>(
        "SELECT character_id, skill_id, active_skill_level, skillpoints_in_skill, trained_skill_level FROM character_skills WHERE character_id = ?",
    )
    .bind(character_id)
    .fetch_all(pool)
    .await?;

    Ok(skills)
}
