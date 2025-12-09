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

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SkillGroupInfo {
    pub group_id: i64,
    pub group_name: String,
    pub category_id: i64,
}

pub async fn get_skill_groups_for_category(pool: &Pool, category_id: i64) -> Result<Vec<SkillGroupInfo>> {
    let groups = sqlx::query_as::<_, SkillGroupInfo>(
        "SELECT group_id, name as group_name, category_id FROM sde_groups WHERE category_id = ? AND published = 1 ORDER BY name",
    )
    .bind(category_id)
    .fetch_all(pool)
    .await?;

    Ok(groups)
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Clone {
    pub id: i64,
    pub character_id: i64,
    pub clone_id: Option<i64>,
    pub name: Option<String>,
    pub location_type: String,
    pub location_id: i64,
    pub location_name: Option<String>,
    pub is_current: bool,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CloneImplant {
    pub clone_id: i64,
    pub implant_type_id: i64,
    pub slot: Option<i64>,
}

pub async fn get_character_clones(pool: &Pool, character_id: i64) -> Result<Vec<Clone>> {
    let clones = sqlx::query_as::<_, Clone>(
        "SELECT id, character_id, clone_id, name, location_type, location_id, location_name, is_current, updated_at FROM clones WHERE character_id = ? ORDER BY is_current DESC, updated_at DESC",
    )
    .bind(character_id)
    .fetch_all(pool)
    .await?;

    Ok(clones)
}

pub async fn get_clone_implants(pool: &Pool, clone_db_id: i64) -> Result<Vec<CloneImplant>> {
    let implants = sqlx::query_as::<_, CloneImplant>(
        "SELECT clone_id, implant_type_id, slot FROM clone_implants WHERE clone_id = ? ORDER BY slot, implant_type_id",
    )
    .bind(clone_db_id)
    .fetch_all(pool)
    .await?;

    Ok(implants)
}

pub async fn set_character_clones(
    pool: &Pool,
    character_id: i64,
    clones: &[(Option<i64>, Option<String>, String, i64, Option<String>, bool, Vec<i64>)],
) -> Result<()> {
    let mut tx = pool.begin().await?;

    sqlx::query("UPDATE clones SET is_current = 0 WHERE character_id = ?")
        .bind(character_id)
        .execute(&mut *tx)
        .await?;

    for (clone_id, name, location_type, location_id, location_name, is_current, implant_type_ids) in clones {
        let now = chrono::Utc::now().timestamp();

        let clone_db_id = if let Some(esi_clone_id) = clone_id {
            let existing = sqlx::query_scalar::<_, Option<i64>>(
                "SELECT id FROM clones WHERE character_id = ? AND clone_id = ?",
            )
            .bind(character_id)
            .bind(esi_clone_id)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some(id) = existing {
                sqlx::query(
                    "UPDATE clones SET name = ?, location_type = ?, location_id = ?, location_name = ?, is_current = ?, updated_at = ? WHERE id = ?",
                )
                .bind(name)
                .bind(location_type)
                .bind(location_id)
                .bind(location_name)
                .bind(*is_current as i64)
                .bind(now)
                .bind(id)
                .execute(&mut *tx)
                .await?;
                id
            } else {
                sqlx::query(
                    "INSERT INTO clones (character_id, clone_id, name, location_type, location_id, location_name, is_current, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(character_id)
                .bind(esi_clone_id)
                .bind(name)
                .bind(location_type)
                .bind(location_id)
                .bind(location_name)
                .bind(*is_current as i64)
                .bind(now)
                .execute(&mut *tx)
                .await?;
                let id = sqlx::query_scalar::<_, i64>("SELECT last_insert_rowid()")
                    .fetch_one(&mut *tx)
                    .await?;
                id
            }
        } else {
            sqlx::query(
                "INSERT INTO clones (character_id, clone_id, name, location_type, location_id, location_name, is_current, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(character_id)
            .bind::<Option<i64>>(None)
            .bind(name)
            .bind(location_type)
            .bind(location_id)
            .bind(location_name)
            .bind(*is_current as i64)
            .bind(now)
            .execute(&mut *tx)
            .await?;
            let id = sqlx::query_scalar::<_, i64>("SELECT last_insert_rowid()")
                .fetch_one(&mut *tx)
                .await?;
            id
        };

        sqlx::query("DELETE FROM clone_implants WHERE clone_id = ?")
            .bind(clone_db_id)
            .execute(&mut *tx)
            .await?;

        for (slot_idx, implant_type_id) in implant_type_ids.iter().enumerate() {
            sqlx::query(
                "INSERT INTO clone_implants (clone_id, implant_type_id, slot) VALUES (?, ?, ?)",
            )
            .bind(clone_db_id)
            .bind(implant_type_id)
            .bind(slot_idx as i64)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(())
}

pub async fn update_clone_name(pool: &Pool, clone_db_id: i64, name: Option<&str>) -> Result<()> {
    sqlx::query("UPDATE clones SET name = ? WHERE id = ?")
        .bind(name)
        .bind(clone_db_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn find_clone_by_implants(
    pool: &Pool,
    character_id: i64,
    implant_type_ids: &[i64],
) -> Result<Option<i64>> {
    if implant_type_ids.is_empty() {
        return Ok(None);
    }

    let implant_count = implant_type_ids.len() as i64;

    let mut query_builder: sqlx::QueryBuilder<sqlx::Sqlite> = sqlx::QueryBuilder::new(
        "SELECT c.id FROM clones c
         WHERE c.character_id = ?
         AND (SELECT COUNT(*) FROM clone_implants ci WHERE ci.clone_id = c.id) = "
    );
    query_builder.push_bind(character_id);
    query_builder.push_bind(implant_count);
    query_builder.push(" AND (SELECT COUNT(*) FROM clone_implants ci WHERE ci.clone_id = c.id AND ci.implant_type_id IN (");

    let mut separated = query_builder.separated(", ");
    for implant_id in implant_type_ids {
        separated.push_bind(implant_id);
    }
    separated.push_unseparated(")) = ");
    query_builder.push_bind(implant_count);
    query_builder.push(" ORDER BY c.updated_at DESC LIMIT 1");

    let query = query_builder.build();
    let result = query
        .fetch_optional(pool)
        .await?;

    Ok(result.map(|row| row.get(0)))
}
