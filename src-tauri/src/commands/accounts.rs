use serde::Serialize;
use tauri::State;

use crate::db;

#[derive(Debug, Clone, Serialize)]
pub struct Character {
    pub character_id: i64,
    pub character_name: String,
    pub unallocated_sp: i64,
    pub account_id: Option<i64>,
    pub sort_order: i64,
}

impl From<db::Character> for Character {
    fn from(c: db::Character) -> Self {
        Character {
            character_id: c.character_id,
            character_name: c.character_name,
            unallocated_sp: c.unallocated_sp,
            account_id: c.account_id,
            sort_order: c.sort_order,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AccountWithCharacters {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
    pub characters: Vec<Character>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccountsAndCharactersResponse {
    pub accounts: Vec<AccountWithCharacters>,
    pub unassigned_characters: Vec<Character>,
}

#[tauri::command]
pub async fn get_accounts_and_characters(
    pool: State<'_, db::Pool>,
) -> Result<AccountsAndCharactersResponse, String> {
    let accounts = db::get_all_accounts(&pool)
        .await
        .map_err(|e| format!("Failed to get accounts: {}", e))?;

    let mut accounts_with_characters = Vec::new();

    for account in accounts {
        let characters = db::get_characters_for_account(&pool, account.id)
            .await
            .map_err(|e| format!("Failed to get characters for account: {}", e))?;

        accounts_with_characters.push(AccountWithCharacters {
            id: account.id,
            name: account.name,
            sort_order: account.sort_order,
            characters: characters.into_iter().map(Character::from).collect(),
        });
    }

    let unassigned_characters = db::get_unassigned_characters(&pool)
        .await
        .map_err(|e| format!("Failed to get unassigned characters: {}", e))?;

    Ok(AccountsAndCharactersResponse {
        accounts: accounts_with_characters,
        unassigned_characters: unassigned_characters
            .into_iter()
            .map(Character::from)
            .collect(),
    })
}

#[tauri::command]
pub async fn create_account(pool: State<'_, db::Pool>, name: String) -> Result<i64, String> {
    db::create_account(&pool, &name)
        .await
        .map_err(|e| format!("Failed to create account: {}", e))
}

#[tauri::command]
pub async fn update_account_name(
    pool: State<'_, db::Pool>,
    account_id: i64,
    name: String,
) -> Result<(), String> {
    db::update_account_name(&pool, account_id, &name)
        .await
        .map_err(|e| format!("Failed to update account name: {}", e))
}

#[tauri::command]
pub async fn delete_account(pool: State<'_, db::Pool>, account_id: i64) -> Result<(), String> {
    db::delete_account(&pool, account_id)
        .await
        .map_err(|e| format!("Failed to delete account: {}", e))
}

#[tauri::command]
pub async fn add_character_to_account(
    pool: State<'_, db::Pool>,
    character_id: i64,
    account_id: i64,
) -> Result<(), String> {
    db::add_character_to_account(&pool, character_id, account_id)
        .await
        .map_err(|e| format!("Failed to add character to account: {}", e))
}

#[tauri::command]
pub async fn remove_character_from_account(
    pool: State<'_, db::Pool>,
    character_id: i64,
) -> Result<(), String> {
    db::remove_character_from_account(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to remove character from account: {}", e))
}

#[tauri::command]
pub async fn reorder_accounts(
    pool: State<'_, db::Pool>,
    account_ids: Vec<i64>,
) -> Result<(), String> {
    db::reorder_accounts(&pool, &account_ids)
        .await
        .map_err(|e| format!("Failed to reorder accounts: {}", e))
}

#[tauri::command]
pub async fn reorder_characters_in_account(
    pool: State<'_, db::Pool>,
    account_id: i64,
    character_ids: Vec<i64>,
) -> Result<(), String> {
    db::reorder_characters_in_account(&pool, account_id, &character_ids)
        .await
        .map_err(|e| format!("Failed to reorder characters in account: {}", e))
}
