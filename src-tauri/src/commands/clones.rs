use tauri::State;

use crate::db;

#[tauri::command]
pub async fn update_clone_name(
    pool: State<'_, db::Pool>,
    clone_id: i64,
    name: Option<String>,
) -> Result<(), String> {
    db::update_clone_name(&pool, clone_id, name.as_deref())
        .await
        .map_err(|e| format!("Failed to update clone name: {}", e))?;
    Ok(())
}
