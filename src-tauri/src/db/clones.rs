use std::collections::HashMap;

use anyhow::Result;
use serde::Serialize;
use sqlx::{FromRow, Row};

use super::Pool;

pub type CloneRow = (Option<i64>, Option<String>, String, i64, bool, Vec<i64>);

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
    clones: &[CloneRow],
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
            let existing_null_clone: Option<i64> = if !implant_type_ids.is_empty() {
                let candidates = sqlx::query_scalar::<_, i64>(
                    "SELECT c.id FROM clones c
                     WHERE c.character_id = ? AND c.clone_id IS NULL
                     AND (SELECT COUNT(*) FROM clone_implants ci WHERE ci.clone_id = c.id) = ?",
                )
                .bind(character_id)
                .bind(implant_type_ids.len() as i64)
                .fetch_all(&mut *tx)
                .await?;

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
                .or_default()
                .insert(attribute_id, value_int);
        }
    }

    Ok(result)
}
