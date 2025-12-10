use std::collections::HashMap;

use anyhow::Result;
use serde::Serialize;
use sqlx::{FromRow, Row};

use super::Pool;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Character {
    pub character_id: i64,
    pub character_name: String,
    pub unallocated_sp: i64,
}

#[derive(Debug, FromRow)]
pub struct Tokens {
    pub character_id: i64,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub scopes: Option<String>,
}

pub async fn get_character(pool: &Pool, character_id: i64) -> Result<Option<Character>> {
    let character = sqlx::query_as::<_, Character>(
        "SELECT character_id, character_name, unallocated_sp FROM characters WHERE character_id = ?",
    )
    .bind(character_id)
    .fetch_optional(pool)
    .await?;

    Ok(character)
}

pub async fn get_all_characters(pool: &Pool) -> Result<Vec<Character>> {
    let characters = sqlx::query_as::<_, Character>(
        "SELECT character_id, character_name, unallocated_sp FROM characters ORDER BY character_name",
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

pub async fn set_character_unallocated_sp(
    pool: &Pool,
    character_id: i64,
    unallocated_sp: i64,
) -> Result<()> {
    sqlx::query("UPDATE characters SET unallocated_sp = ? WHERE character_id = ?")
        .bind(unallocated_sp)
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
    "SELECT character_id, access_token, refresh_token, expires_at, scopes FROM tokens WHERE character_id = ?",
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
    scopes: Option<&[String]>,
) -> Result<()> {
    let scopes_json = scopes
        .map(|s| serde_json::to_string(s))
        .transpose()
        .map_err(|e| anyhow::anyhow!("Failed to serialize scopes: {}", e))?;

    sqlx::query(
        r#"
      INSERT INTO tokens (character_id, access_token, refresh_token, expires_at, scopes)
      VALUES (?, ?, ?, ?, ?)
    "#,
    )
    .bind(character_id)
    .bind(access_token)
    .bind(refresh_token)
    .bind(expires_at)
    .bind(scopes_json.as_deref())
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
    scopes: Option<&[String]>,
) -> Result<()> {
    let scopes_json = scopes
        .map(|s| serde_json::to_string(s))
        .transpose()
        .map_err(|e| anyhow::anyhow!("Failed to serialize scopes: {}", e))?;

    sqlx::query(
        r#"
      UPDATE tokens
      SET access_token = ?, refresh_token = ?, expires_at = ?, scopes = ?
      WHERE character_id = ?
    "#,
    )
    .bind(access_token)
    .bind(refresh_token)
    .bind(expires_at)
    .bind(scopes_json.as_deref())
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

pub async fn get_character_attributes(
    pool: &Pool,
    character_id: i64,
) -> Result<Option<CharacterAttributes>> {
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

pub async fn get_skill_groups_for_category(
    pool: &Pool,
    category_id: i64,
) -> Result<Vec<SkillGroupInfo>> {
    let groups = sqlx::query_as::<_, SkillGroupInfo>(
        "SELECT group_id, name as group_name, category_id FROM sde_groups WHERE category_id = ? AND published = 1 ORDER BY name",
    )
    .bind(category_id)
    .fetch_all(pool)
    .await?;

    Ok(groups)
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Station {
    pub station_id: i64,
    pub name: String,
    pub system_id: i64,
    pub owner: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Structure {
    pub structure_id: i64,
    pub name: String,
    pub solar_system_id: i64,
    pub type_id: Option<i64>,
    pub owner_id: i64,
    pub updated_at: i64,
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

pub async fn get_station(pool: &Pool, station_id: i64) -> Result<Option<Station>> {
    let station = sqlx::query_as::<_, Station>(
        "SELECT station_id, name, system_id, owner, updated_at FROM stations WHERE station_id = ?",
    )
    .bind(station_id)
    .fetch_optional(pool)
    .await?;

    Ok(station)
}

pub async fn get_structure(pool: &Pool, structure_id: i64) -> Result<Option<Structure>> {
    let structure = sqlx::query_as::<_, Structure>(
        "SELECT structure_id, name, solar_system_id, type_id, owner_id, updated_at FROM structures WHERE structure_id = ?",
    )
    .bind(structure_id)
    .fetch_optional(pool)
    .await?;

    Ok(structure)
}

pub async fn upsert_station(
    pool: &Pool,
    station_id: i64,
    name: &str,
    system_id: i64,
    owner: Option<i64>,
) -> Result<()> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO stations (station_id, name, system_id, owner, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(station_id) DO UPDATE SET name = ?, system_id = ?, owner = ?, updated_at = ?",
    )
    .bind(station_id)
    .bind(name)
    .bind(system_id)
    .bind(owner)
    .bind(now)
    .bind(name)
    .bind(system_id)
    .bind(owner)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn upsert_structure(
    pool: &Pool,
    structure_id: i64,
    name: &str,
    solar_system_id: i64,
    type_id: Option<i64>,
    owner_id: i64,
) -> Result<()> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT INTO structures (structure_id, name, solar_system_id, type_id, owner_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(structure_id) DO UPDATE SET name = ?, solar_system_id = ?, type_id = ?, owner_id = ?, updated_at = ?",
    )
    .bind(structure_id)
    .bind(name)
    .bind(solar_system_id)
    .bind(type_id)
    .bind(owner_id)
    .bind(now)
    .bind(name)
    .bind(solar_system_id)
    .bind(type_id)
    .bind(owner_id)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_character_clones(pool: &Pool, character_id: i64) -> Result<Vec<Clone>> {
    let rows = sqlx::query(
        "SELECT
            c.id,
            c.character_id,
            c.clone_id,
            c.name,
            c.location_type,
            c.location_id,
            COALESCE(s.name, st.name, 'Unknown Location') as location_name,
            c.is_current,
            c.updated_at
        FROM clones c
        LEFT JOIN stations s ON c.location_type = 'station' AND c.location_id = s.station_id
        LEFT JOIN structures st ON c.location_type = 'structure' AND c.location_id = st.structure_id
        WHERE c.character_id = ?
        ORDER BY c.is_current DESC, c.updated_at DESC",
    )
    .bind(character_id)
    .fetch_all(pool)
    .await?;

    let clones = rows
        .into_iter()
        .map(|row| Clone {
            id: row.get(0),
            character_id: row.get(1),
            clone_id: row.get(2),
            name: row.get(3),
            location_type: row.get(4),
            location_id: row.get(5),
            location_name: row.get(6),
            is_current: row.get::<i64, _>(7) != 0,
            updated_at: row.get(8),
        })
        .collect();

    Ok(clones)
}

pub async fn get_clone_implants(pool: &Pool, clone_db_id: i64) -> Result<Vec<CloneImplant>> {
    let implants = sqlx::query_as::<_, CloneImplant>(
        "SELECT clone_id, implant_type_id, slot FROM clone_implants WHERE clone_id = ? ORDER BY COALESCE(slot, 999), implant_type_id",
    )
    .bind(clone_db_id)
    .fetch_all(pool)
    .await?;

    Ok(implants)
}

pub async fn set_character_clones(
    pool: &Pool,
    character_id: i64,
    clones: &[(Option<i64>, Option<String>, String, i64, bool, Vec<i64>)],
) -> Result<()> {
    let mut tx = pool.begin().await?;

    sqlx::query("UPDATE clones SET is_current = 0 WHERE character_id = ?")
        .bind(character_id)
        .execute(&mut *tx)
        .await?;

    for (clone_id, name, location_type, location_id, is_current, implant_type_ids) in clones {
        let now = chrono::Utc::now().timestamp();

        let clone_db_id: i64 = if let Some(esi_clone_id) = clone_id {
            let existing = sqlx::query_scalar::<_, i64>(
                "SELECT id FROM clones WHERE character_id = ? AND clone_id = ?",
            )
            .bind(character_id)
            .bind(esi_clone_id)
            .fetch_optional(&mut *tx)
            .await?;

            if let Some(id) = existing {
                sqlx::query(
                    "UPDATE clones SET name = ?, location_type = ?, location_id = ?, is_current = ?, updated_at = ? WHERE id = ?",
                )
                .bind(name)
                .bind(location_type)
                .bind(location_id)
                .bind(*is_current as i64)
                .bind(now)
                .bind(id)
                .execute(&mut *tx)
                .await?;
                id
            } else {
                sqlx::query(
                    "INSERT INTO clones (character_id, clone_id, name, location_type, location_id, is_current, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(character_id)
                .bind(esi_clone_id)
                .bind(name)
                .bind(location_type)
                .bind(location_id)
                .bind(*is_current as i64)
                .bind(now)
                .execute(&mut *tx)
                .await?;
                sqlx::query_scalar::<_, i64>("SELECT last_insert_rowid()")
                    .fetch_one(&mut *tx)
                    .await?
            }
        } else {
            // For clones with NULL clone_id, check if one already exists with the same implants
            // to avoid creating duplicates. We match by checking if the implant sets are identical.
            let existing_null_clone: Option<i64> = if !implant_type_ids.is_empty() {
                // Find clones with NULL clone_id that have the same number of implants
                let candidates = sqlx::query_scalar::<_, i64>(
                    "SELECT c.id FROM clones c
                     WHERE c.character_id = ? AND c.clone_id IS NULL
                     AND (SELECT COUNT(*) FROM clone_implants ci WHERE ci.clone_id = c.id) = ?",
                )
                .bind(character_id)
                .bind(implant_type_ids.len() as i64)
                .fetch_all(&mut *tx)
                .await?;

                // Check each candidate to see if it has the exact same implants
                let mut sorted_implants = implant_type_ids.clone();
                sorted_implants.sort();

                let mut found_match = None;
                for candidate_id in candidates {
                    let candidate_implants: Vec<i64> = sqlx::query_scalar::<_, i64>(
                        "SELECT implant_type_id FROM clone_implants WHERE clone_id = ? ORDER BY implant_type_id"
                    )
                    .bind(candidate_id)
                    .fetch_all(&mut *tx)
                    .await?;

                    if candidate_implants == sorted_implants {
                        found_match = Some(candidate_id);
                        break;
                    }
                }
                found_match
            } else {
                None
            };

            if let Some(existing_id) = existing_null_clone {
                // Update existing clone instead of creating a new one
                sqlx::query(
                    "UPDATE clones SET name = ?, location_type = ?, location_id = ?, is_current = ?, updated_at = ? WHERE id = ?",
                )
                .bind(name)
                .bind(location_type)
                .bind(location_id)
                .bind(*is_current as i64)
                .bind(now)
                .bind(existing_id)
                .execute(&mut *tx)
                .await?;
                existing_id
            } else {
                sqlx::query(
                    "INSERT INTO clones (character_id, clone_id, name, location_type, location_id, is_current, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(character_id)
                .bind::<Option<i64>>(None)
                .bind(name)
                .bind(location_type)
                .bind(location_id)
                .bind(*is_current as i64)
                .bind(now)
                .execute(&mut *tx)
                .await?;
                sqlx::query_scalar::<_, i64>("SELECT last_insert_rowid()")
                    .fetch_one(&mut *tx)
                    .await?
            }
        };

        sqlx::query("DELETE FROM clone_implants WHERE clone_id = ?")
            .bind(clone_db_id)
            .execute(&mut *tx)
            .await?;

        // Get slot values from SDE for each implant type
        // Attribute ID 331 is "implantSlot" in EVE Online
        const IMPLANT_SLOT_ATTRIBUTE_ID: i64 = 331;

        for implant_type_id in implant_type_ids {
            let slot: Option<i64> = sqlx::query_scalar::<_, Option<f64>>(
                "SELECT value FROM sde_type_dogma_attributes WHERE type_id = ? AND attribute_id = ?"
            )
            .bind(implant_type_id)
            .bind(IMPLANT_SLOT_ATTRIBUTE_ID)
            .fetch_optional(&mut *tx)
            .await?
            .flatten()
            .map(|v| v as i64);

            sqlx::query(
                "INSERT INTO clone_implants (clone_id, implant_type_id, slot) VALUES (?, ?, ?)",
            )
            .bind(clone_db_id)
            .bind(implant_type_id)
            .bind(slot)
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

    // Build the IN clause for implant type IDs
    let mut query_builder: sqlx::QueryBuilder<sqlx::Sqlite> = sqlx::QueryBuilder::new(
        "SELECT c.id FROM clones c
         WHERE c.character_id = ",
    );
    query_builder.push_bind(character_id);
    query_builder.push(" AND (SELECT COUNT(*) FROM clone_implants ci WHERE ci.clone_id = c.id) = ");
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
    let result = query.fetch_optional(pool).await?;

    Ok(result.map(|row| row.get(0)))
}

pub async fn get_implant_attribute_bonuses(
    pool: &Pool,
    implant_type_ids: &[i64],
) -> Result<HashMap<i64, HashMap<i64, i64>>> {
    if implant_type_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut result: HashMap<i64, HashMap<i64, i64>> = HashMap::new();

    for chunk in implant_type_ids.chunks(100) {
        let mut query_builder: sqlx::QueryBuilder<sqlx::Sqlite> = sqlx::QueryBuilder::new(
            "SELECT type_id, attribute_id, value FROM sde_type_dogma_attributes WHERE type_id IN (",
        );

        let mut separated = query_builder.separated(", ");
        for implant_id in chunk {
            separated.push_bind(implant_id);
        }
        separated.push_unseparated(") AND attribute_id IN (175, 176, 177, 178, 179)");

        let query = query_builder.build();
        let rows = query.fetch_all(pool).await?;

        for row in rows {
            let type_id: i64 = row.get(0);
            let attribute_id: i64 = row.get(1);
            let value: f64 = row.get(2);
            let value_int = value as i64;

            result
                .entry(type_id)
                .or_insert_with(HashMap::new)
                .insert(attribute_id, value_int);
        }
    }

    Ok(result)
}
