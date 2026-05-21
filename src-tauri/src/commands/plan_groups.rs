use tauri::State;

use crate::db;
use crate::db::plan_groups::PlanGroup;

#[tauri::command]
pub async fn list_plan_groups(pool: State<'_, db::Pool>) -> Result<Vec<PlanGroup>, String> {
    db::plan_groups::list(&pool)
        .await
        .map_err(|e| format!("Failed to list plan groups: {}", e))
}
