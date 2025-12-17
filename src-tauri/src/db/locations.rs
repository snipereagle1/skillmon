use anyhow::Result;
use serde::Serialize;
use sqlx::FromRow;

use super::Pool;

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
