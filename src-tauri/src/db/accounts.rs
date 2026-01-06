use anyhow::Result;
use serde::Serialize;
use sqlx::FromRow;

use super::{characters::Character, Pool};

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
}

pub async fn create_account(pool: &Pool, name: &str) -> Result<i64> {
    let max_sort_order: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM accounts")
        .fetch_optional(pool)
        .await?;

    let next_sort_order = max_sort_order.unwrap_or(-1) + 1;

    sqlx::query("INSERT INTO accounts (name, sort_order) VALUES (?, ?)")
        .bind(name)
        .bind(next_sort_order)
        .execute(pool)
        .await?;

    let account_id = sqlx::query_scalar::<_, i64>("SELECT last_insert_rowid()")
        .fetch_one(pool)
        .await?;

    Ok(account_id)
}

pub async fn get_all_accounts(pool: &Pool) -> Result<Vec<Account>> {
    let accounts = sqlx::query_as::<_, Account>(
        "SELECT id, name, sort_order FROM accounts ORDER BY sort_order",
    )
    .fetch_all(pool)
    .await?;

    Ok(accounts)
}

#[allow(dead_code)]
pub async fn get_account(pool: &Pool, id: i64) -> Result<Option<Account>> {
    let account =
        sqlx::query_as::<_, Account>("SELECT id, name, sort_order FROM accounts WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;

    Ok(account)
}

pub async fn update_account_name(pool: &Pool, id: i64, name: &str) -> Result<()> {
    sqlx::query("UPDATE accounts SET name = ? WHERE id = ?")
        .bind(name)
        .bind(id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn delete_account(pool: &Pool, id: i64) -> Result<()> {
    sqlx::query("DELETE FROM accounts WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn reorder_accounts(pool: &Pool, account_ids: &[i64]) -> Result<()> {
    let mut tx = pool.begin().await?;

    for (index, account_id) in account_ids.iter().enumerate() {
        sqlx::query("UPDATE accounts SET sort_order = ? WHERE id = ?")
            .bind(index as i64)
            .bind(account_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    Ok(())
}

pub async fn add_character_to_account(
    pool: &Pool,
    character_id: i64,
    account_id: i64,
) -> Result<()> {
    let max_sort_order: Option<i64> =
        sqlx::query_scalar("SELECT MAX(sort_order) FROM characters WHERE account_id = ?")
            .bind(account_id)
            .fetch_optional(pool)
            .await?;

    let next_sort_order = max_sort_order.unwrap_or(-1) + 1;

    sqlx::query("UPDATE characters SET account_id = ?, sort_order = ? WHERE character_id = ?")
        .bind(account_id)
        .bind(next_sort_order)
        .bind(character_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn remove_character_from_account(pool: &Pool, character_id: i64) -> Result<()> {
    sqlx::query("UPDATE characters SET account_id = NULL, sort_order = 0 WHERE character_id = ?")
        .bind(character_id)
        .execute(pool)
        .await?;

    Ok(())
}

pub async fn reorder_characters_in_account(
    pool: &Pool,
    account_id: i64,
    character_ids: &[i64],
) -> Result<()> {
    let mut tx = pool.begin().await?;

    for (index, character_id) in character_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE characters SET sort_order = ? WHERE character_id = ? AND account_id = ?",
        )
        .bind(index as i64)
        .bind(character_id)
        .bind(account_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}

pub async fn reorder_unassigned_characters(pool: &Pool, character_ids: &[i64]) -> Result<()> {
    let mut tx = pool.begin().await?;

    for (index, character_id) in character_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE characters SET sort_order = ? WHERE character_id = ? AND account_id IS NULL",
        )
        .bind(index as i64)
        .bind(character_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}

pub async fn get_characters_for_account(pool: &Pool, account_id: i64) -> Result<Vec<Character>> {
    let characters = sqlx::query_as::<_, Character>(
        "SELECT character_id, character_name, unallocated_sp, account_id, sort_order
         FROM characters
         WHERE account_id = ?
         ORDER BY sort_order, character_name",
    )
    .bind(account_id)
    .fetch_all(pool)
    .await?;

    Ok(characters)
}

pub async fn get_unassigned_characters(pool: &Pool) -> Result<Vec<Character>> {
    let characters = sqlx::query_as::<_, Character>(
        "SELECT character_id, character_name, unallocated_sp, account_id, sort_order
         FROM characters
         WHERE account_id IS NULL
         ORDER BY sort_order, character_name",
    )
    .fetch_all(pool)
    .await?;

    Ok(characters)
}
