use anyhow::Result;
use super::Pool;
use crate::features::FeatureId;
use std::str::FromStr;

pub async fn get_enabled_features(pool: &Pool) -> Result<Vec<FeatureId>> {
    let features = sqlx::query_scalar::<_, String>(
        "SELECT feature_id FROM enabled_features"
    )
    .fetch_all(pool)
    .await?;

    Ok(features.into_iter()
        .filter_map(|s| FeatureId::from_str(&s).ok())
        .collect())
}

pub async fn set_feature_enabled(pool: &Pool, feature_id: FeatureId, enabled: bool) -> Result<()> {
    let feature_id_str = feature_id.as_str();
    if enabled {
        sqlx::query(
            "INSERT OR IGNORE INTO enabled_features (feature_id) VALUES (?)"
        )
        .bind(feature_id_str)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            "DELETE FROM enabled_features WHERE feature_id = ?"
        )
        .bind(feature_id_str)
        .execute(pool)
        .await?;
    }

    Ok(())
}
