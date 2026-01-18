use tauri::State;

use crate::db;
use crate::db::remaps::Remap;
use crate::skill_plans::Attributes;

#[tauri::command]
pub async fn save_remap(
    pool: State<'_, db::Pool>,
    character_id: Option<i64>,
    plan_id: Option<i64>,
    after_skill_type_id: Option<i64>,
    after_skill_level: Option<i64>,
    attributes: Attributes,
) -> Result<i64, String> {
    db::remaps::save_remap(
        pool.inner(),
        character_id,
        plan_id,
        after_skill_type_id,
        after_skill_level,
        &attributes,
    )
    .await
    .map_err(|e| format!("Failed to save remap: {}", e))
}

#[tauri::command]
pub async fn get_plan_remaps(
    pool: State<'_, db::Pool>,
    plan_id: i64,
) -> Result<Vec<Remap>, String> {
    db::remaps::get_plan_remaps(&pool, plan_id)
        .await
        .map_err(|e| format!("Failed to get plan remaps: {}", e))
}

#[tauri::command]
pub async fn get_character_remaps(
    pool: State<'_, db::Pool>,
    character_id: i64,
) -> Result<Vec<Remap>, String> {
    db::remaps::get_character_remaps(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get character remaps: {}", e))
}

#[tauri::command]
pub async fn delete_remap(pool: State<'_, db::Pool>, remap_id: i64) -> Result<(), String> {
    db::remaps::delete_remap(&pool, remap_id)
        .await
        .map_err(|e| format!("Failed to delete remap: {}", e))
}
