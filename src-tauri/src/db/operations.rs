use anyhow::Result;
use serde::Serialize;
use sqlx::FromRow;

use super::Pool;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Character {
    pub character_id: i64,
    pub character_name: String,
}

#[derive(Debug, FromRow)]
pub struct Tokens {
    pub character_id: i64,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

pub async fn get_character(pool: &Pool, character_id: i64) -> Result<Option<Character>> {
    let character = sqlx::query_as::<_, Character>(
        "SELECT character_id, character_name FROM characters WHERE character_id = ?",
    )
    .bind(character_id)
    .fetch_optional(pool)
    .await?;

    Ok(character)
}

pub async fn get_all_characters(pool: &Pool) -> Result<Vec<Character>> {
    let characters = sqlx::query_as::<_, Character>(
        "SELECT character_id, character_name FROM characters ORDER BY character_name",
    )
    .fetch_all(pool)
    .await?;

    Ok(characters)
}

pub async fn add_character(pool: &Pool, character_id: i64, character_name: &str) -> Result<()> {
    sqlx::query("INSERT INTO characters (character_id, character_name) VALUES (?, ?)")
        .bind(character_id)
        .bind(character_name)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn update_character(pool: &Pool, character_id: i64, character_name: &str) -> Result<()> {
    sqlx::query("UPDATE characters SET character_name = ? WHERE character_id = ?")
        .bind(character_name)
        .bind(character_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn delete_character(pool: &Pool, character_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM characters WHERE character_id = ?")
        .bind(character_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn get_tokens(pool: &Pool, character_id: i64) -> Result<Option<Tokens>> {
    let tokens = sqlx::query_as::<_, Tokens>(
    "SELECT character_id, access_token, refresh_token, expires_at FROM tokens WHERE character_id = ?",
  )
  .bind(character_id)
  .fetch_optional(pool)
  .await?;

    Ok(tokens)
}

pub async fn set_tokens(
    pool: &Pool,
    character_id: i64,
    access_token: &str,
    refresh_token: &str,
    expires_at: i64,
) -> Result<()> {
    sqlx::query(
        r#"
      INSERT INTO tokens (character_id, access_token, refresh_token, expires_at)
      VALUES (?, ?, ?, ?)
    "#,
    )
    .bind(character_id)
    .bind(access_token)
    .bind(refresh_token)
    .bind(expires_at)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn update_tokens(
    pool: &Pool,
    character_id: i64,
    access_token: &str,
    refresh_token: &str,
    expires_at: i64,
) -> Result<()> {
    sqlx::query(
        r#"
      UPDATE tokens
      SET access_token = ?, refresh_token = ?, expires_at = ?
      WHERE character_id = ?
    "#,
    )
    .bind(access_token)
    .bind(refresh_token)
    .bind(expires_at)
    .bind(character_id)
    .execute(pool)
    .await?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CharacterAttributes {
    pub character_id: i64,
    pub charisma: i64,
    pub intelligence: i64,
    pub memory: i64,
    pub perception: i64,
    pub willpower: i64,
    pub bonus_remaps: Option<i64>,
    pub accrued_remap_cooldown_date: Option<String>,
    pub last_remap_date: Option<String>,
}

pub async fn get_character_attributes(pool: &Pool, character_id: i64) -> Result<Option<CharacterAttributes>> {
    let attributes = sqlx::query_as::<_, CharacterAttributes>(
        "SELECT character_id, charisma, intelligence, memory, perception, willpower, bonus_remaps, accrued_remap_cooldown_date, last_remap_date FROM character_attributes WHERE character_id = ?",
    )
    .bind(character_id)
    .fetch_optional(pool)
    .await?;

    Ok(attributes)
}

pub async fn set_character_attributes(
    pool: &Pool,
    character_id: i64,
    charisma: i64,
    intelligence: i64,
    memory: i64,
    perception: i64,
    willpower: i64,
    bonus_remaps: Option<i64>,
    accrued_remap_cooldown_date: Option<String>,
    last_remap_date: Option<String>,
) -> Result<()> {
    sqlx::query(
        r#"
      INSERT OR REPLACE INTO character_attributes
      (character_id, charisma, intelligence, memory, perception, willpower, bonus_remaps, accrued_remap_cooldown_date, last_remap_date, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
    "#,
    )
    .bind(character_id)
    .bind(charisma)
    .bind(intelligence)
    .bind(memory)
    .bind(perception)
    .bind(willpower)
    .bind(bonus_remaps)
    .bind(accrued_remap_cooldown_date.as_deref())
    .bind(last_remap_date.as_deref())
    .execute(pool)
    .await?;

    Ok(())
}

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
