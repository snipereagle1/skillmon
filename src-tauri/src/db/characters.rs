use anyhow::Result;
use serde::Serialize;
use sqlx::FromRow;

use super::Pool;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Character {
    pub character_id: i64,
    pub character_name: String,
    pub unallocated_sp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<i64>,
    pub sort_order: i64,
}

pub async fn get_character(pool: &Pool, character_id: i64) -> Result<Option<Character>> {
    let character = sqlx::query_as::<_, Character>(
        "SELECT character_id, character_name, unallocated_sp, account_id, sort_order FROM characters WHERE character_id = ?",
    )
    .bind(character_id)
    .fetch_optional(pool)
    .await?;

    Ok(character)
}

pub async fn get_all_characters(pool: &Pool) -> Result<Vec<Character>> {
    let characters = sqlx::query_as::<_, Character>(
        "SELECT character_id, character_name, unallocated_sp, account_id, sort_order FROM characters ORDER BY account_id, sort_order, character_name",
    )
    .fetch_all(pool)
    .await?;

    Ok(characters)
}

pub async fn add_character(pool: &Pool, character_id: i64, character_name: &str) -> Result<()> {
    sqlx::query("INSERT INTO characters (character_id, character_name, account_id, sort_order) VALUES (?, ?, NULL, 0)")
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
