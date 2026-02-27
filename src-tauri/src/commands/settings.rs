use crate::db;
use crate::esi::EsiScope;
use crate::features::{self, FeatureId, OptionalFeature};
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
pub struct CharacterFeatureScopeStatus {
    pub character_id: i64,
    pub character_name: String,
    pub feature_has_scopes: Vec<(String, bool)>,
}

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

#[tauri::command]
pub async fn get_character_feature_scope_status(
    pool: State<'_, db::Pool>,
) -> Result<Vec<CharacterFeatureScopeStatus>, String> {
    // Get enabled feature IDs
    let enabled_features = db::get_enabled_features(&pool)
        .await
        .map_err(|e| format!("Failed to get enabled features: {}", e))?;

    // Get all optional features and build a map of FeatureId -> scopes for enabled features
    let all_optional_features = features::get_optional_features();
    let enabled_feature_scopes: HashMap<FeatureId, Vec<EsiScope>> = all_optional_features
        .into_iter()
        .filter(|f| enabled_features.contains(&f.id))
        .map(|f| (f.id, f.scopes))
        .collect();

    // Get all characters
    let characters = db::get_all_characters(&pool)
        .await
        .map_err(|e| format!("Failed to get characters: {}", e))?;

    let mut result = Vec::new();

    for character in characters {
        let tokens = db::get_tokens(&pool, character.character_id)
            .await
            .map_err(|e| {
                format!(
                    "Failed to get tokens for {}: {}",
                    character.character_name, e
                )
            })?;

        let mut feature_has_scopes: Vec<(String, bool)> = Vec::new();

        if let Some(tokens) = tokens {
            // Parse scopes from JSON string
            let token_scopes: Vec<String> = if let Some(scopes_json) = &tokens.scopes {
                serde_json::from_str(scopes_json).unwrap_or_else(|_| Vec::new())
            } else {
                Vec::new()
            };

            // For each enabled feature, check if all required scopes are present
            for (feature_id, required_scopes) in &enabled_feature_scopes {
                let has_all_scopes = required_scopes
                    .iter()
                    .all(|scope| token_scopes.contains(&scope.as_str().to_string()));
                feature_has_scopes.push((feature_id.as_str().to_string(), has_all_scopes));
            }
        } else {
            // No tokens = no scopes for any feature
            for feature_id in enabled_feature_scopes.keys() {
                feature_has_scopes.push((feature_id.as_str().to_string(), false));
            }
        }

        result.push(CharacterFeatureScopeStatus {
            character_id: character.character_id,
            character_name: character.character_name,
            feature_has_scopes,
        });
    }

    Ok(result)
}
