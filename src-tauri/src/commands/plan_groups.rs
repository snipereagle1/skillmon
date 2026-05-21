use tauri::State;

use crate::db;
use crate::db::plan_groups::PlanGroup;

#[tauri::command]
pub async fn list_plan_groups(pool: State<'_, db::Pool>) -> Result<Vec<PlanGroup>, String> {
    db::plan_groups::list(&pool)
        .await
        .map_err(|e| format!("Failed to list plan groups: {}", e))
}

#[tauri::command]
pub async fn create_plan_group(
    pool: State<'_, db::Pool>,
    name: String,
    parent_group_id: Option<i64>,
) -> Result<i64, String> {
    db::plan_groups::create(&pool, &name, parent_group_id)
        .await
        .map_err(|e| format!("{}", e))
}

#[tauri::command]
pub async fn rename_plan_group(
    pool: State<'_, db::Pool>,
    group_id: i64,
    name: String,
) -> Result<(), String> {
    db::plan_groups::rename(&pool, group_id, &name)
        .await
        .map_err(|e| format!("{}", e))
}
