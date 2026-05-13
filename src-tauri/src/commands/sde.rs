use serde::Serialize;
use tauri::State;
use typeshare::typeshare;

use crate::db;
use crate::sde;
use crate::ts_types::i64_ts;
use crate::utils;

#[typeshare]
#[derive(Debug, Clone, Serialize)]
pub struct TypeNameEntry {
    pub type_id: i64_ts,
    pub name: String,
}

#[tauri::command]
pub async fn refresh_sde(app: tauri::AppHandle, pool: State<'_, db::Pool>) -> Result<(), String> {
    sde::force_refresh(&app, &pool)
        .await
        .map_err(|e| format!("Failed to refresh SDE: {}", e))
}

#[tauri::command]
pub async fn get_type_names(
    pool: State<'_, db::Pool>,
    type_ids: Vec<i64>,
) -> Result<Vec<TypeNameEntry>, String> {
    let map = utils::get_type_names(&pool, &type_ids).await?;
    Ok(map
        .into_iter()
        .map(|(type_id, name)| TypeNameEntry { type_id, name })
        .collect())
}
