use crate::db;
use crate::features::{self, FeatureId, OptionalFeature};
use tauri::State;

#[tauri::command]
pub async fn get_enabled_features(pool: State<'_, db::Pool>) -> Result<Vec<FeatureId>, String> {
    db::get_enabled_features(&pool)
        .await
        .map_err(|e| format!("Failed to get enabled features: {}", e))
}

#[tauri::command]
pub async fn set_feature_enabled(
    pool: State<'_, db::Pool>,
    feature_id: FeatureId,
    enabled: bool,
) -> Result<(), String> {
    db::set_feature_enabled(&pool, feature_id, enabled)
        .await
        .map_err(|e| format!("Failed to set feature enabled: {}", e))
}

#[tauri::command]
pub fn get_optional_features() -> Vec<OptionalFeature> {
    features::get_optional_features()
}
