use std::collections::HashMap;

use sqlx::{QueryBuilder, Row, Sqlite};

use crate::db;

#[derive(Debug, Clone)]
pub struct SkillAttributes {
    pub primary_attribute: Option<i64>,
    pub secondary_attribute: Option<i64>,
    pub rank: Option<i64>,
}

pub async fn get_type_names(
    pool: &db::Pool,
    type_ids: &[i64],
) -> Result<HashMap<i64, String>, String> {
    if type_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut type_names = HashMap::new();

    for chunk in type_ids.chunks(100) {
        let mut query_builder: QueryBuilder<Sqlite> =
            QueryBuilder::new("SELECT type_id, name FROM sde_types WHERE type_id IN (");

        let mut separated = query_builder.separated(", ");
        for type_id in chunk {
            separated.push_bind(type_id);
        }
        separated.push_unseparated(")");

        let query = query_builder.build();
        let rows = query
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query type names: {}", e))?;

        for row in rows {
            let type_id: i64 = row.get(0);
            let name: String = row.get(1);
            type_names.insert(type_id, name);
        }
    }

    Ok(type_names)
}

pub async fn get_skill_attributes(
    pool: &db::Pool,
    skill_ids: &[i64],
) -> Result<HashMap<i64, SkillAttributes>, String> {
    if skill_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let mut skill_attrs = HashMap::new();

    for chunk in skill_ids.chunks(100) {
        let mut query_builder: QueryBuilder<Sqlite> = QueryBuilder::new(
            r#"
            SELECT
                tda.type_id,
                MAX(CASE WHEN tda.attribute_id = 180 THEN tda.value END) as primary_attribute,
                MAX(CASE WHEN tda.attribute_id = 181 THEN tda.value END) as secondary_attribute,
                MAX(CASE WHEN tda.attribute_id = 275 THEN tda.value END) as rank
            FROM sde_type_dogma_attributes tda
            WHERE tda.type_id IN (
            "#,
        );

        let mut separated = query_builder.separated(", ");
        for skill_id in chunk {
            separated.push_bind(skill_id);
        }
        separated.push_unseparated(") GROUP BY tda.type_id");

        let query = query_builder.build();
        let rows = query
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to query skill attributes: {}", e))?;

        for row in rows {
            let type_id: i64 = row.get(0);
            let primary: Option<f64> = row.get(1);
            let secondary: Option<f64> = row.get(2);
            let rank: Option<f64> = row.get(3);

            skill_attrs.insert(
                type_id,
                SkillAttributes {
                    primary_attribute: primary.map(|v| v as i64),
                    secondary_attribute: secondary.map(|v| v as i64),
                    rank: rank.map(|v| v as i64),
                },
            );
        }
    }

    Ok(skill_attrs)
}

pub fn calculate_sp_per_minute(primary: i64, secondary: i64) -> f64 {
    primary as f64 + (secondary as f64 / 2.0)
}

#[allow(dead_code)]
pub fn calculate_sp_for_level(rank: i64, level: i32) -> i64 {
    if !(1..=5).contains(&level) {
        return 0;
    }
    let base: f64 = 2.0;
    let exponent = 2.5 * (level as f64 - 1.0);
    // Ceiling the base SP before multiplying by rank matches EVE's behavior
    let base_sp = (base.powf(exponent) * 250.0).ceil();
    (base_sp * rank as f64) as i64
}
