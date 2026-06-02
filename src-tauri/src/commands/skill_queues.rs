use std::sync::Mutex;

use tauri::State;

use crate::cache;
use crate::db;
use crate::refresh;

#[tauri::command]
pub async fn force_refresh_skill_queue(
    pool: State<'_, db::Pool>,
    supervisor: State<'_, Mutex<refresh::RefreshSupervisor>>,
    character_id: i64,
) -> Result<(), String> {
    cache::clear_character_cache(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to clear cache: {}", e))?;

    if let Ok(sup) = supervisor.lock() {
        sup.poke(character_id);
    }

    Ok(())
}
