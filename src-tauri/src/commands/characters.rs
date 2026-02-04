use serde::Serialize;
use tauri::State;

use crate::db;
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
pub struct Character {
    pub character_id: i64,
    pub character_name: String,
    pub unallocated_sp: i64,
    pub account_id: Option<i64>,
    pub sort_order: i64,
    pub is_omega: bool,
}

impl From<db::Character> for Character {
    fn from(c: db::Character) -> Self {
        Character {
            character_id: c.character_id,
            character_name: c.character_name,
            unallocated_sp: c.unallocated_sp,
            account_id: c.account_id,
            sort_order: c.sort_order,
            is_omega: c.is_omega,
        }
    }
}

#[tauri::command]
pub async fn logout_character(pool: State<'_, db::Pool>, character_id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM tokens WHERE character_id = ?")
        .bind(character_id)
        .execute(&*pool)
        .await
        .map_err(|e| format!("Failed to delete tokens: {}", e))?;

    db::delete_character(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to delete character: {}", e))
}
