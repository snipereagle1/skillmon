use crate::db;
use crate::skill_plans::simulation::{Attributes, PlannedRemap};
use crate::utils;
use std::collections::HashMap;

const TOTAL_REMAP_POINTS: i64 = 14;
const MAX_POINTS_PER_ATTR: i64 = 10;

#[derive(Debug, Clone, serde::Serialize)]
pub struct OptimizationResult {
    pub recommended_remap: PlannedRemap,
    pub original_seconds: i64,
    pub optimized_seconds: i64,
}

pub async fn optimize_plan_attributes(
    pool: &db::Pool,
    entries: &[crate::db::skill_plans::SkillPlanEntry],
    implants: &Attributes,
    current_sp_map: &HashMap<i64, i64>,
) -> anyhow::Result<OptimizationResult> {
    let skill_type_ids: Vec<i64> = entries.iter().map(|e| e.skill_type_id).collect();
    let skill_attributes = utils::get_skill_attributes(pool, &skill_type_ids)
        .await
        .map_err(|e| anyhow::anyhow!(e))?;

    // 1. Calculate SP demand per (primary, secondary) pair
    let mut demand_map: HashMap<(Option<i64>, Option<i64>), i64> = HashMap::new();
    let mut used_attributes = std::collections::HashSet::new();

    for entry in entries {
        let skill_attr = skill_attributes.get(&entry.skill_type_id).ok_or_else(|| {
            anyhow::anyhow!("Attributes not found for skill {}", entry.skill_type_id)
        })?;

        let rank = skill_attr.rank.unwrap_or(1);
        let total_sp_needed = utils::calculate_sp_for_level(rank, entry.planned_level as i32);
        let current_sp = *current_sp_map.get(&entry.skill_type_id).unwrap_or(&0);
        let sp_remaining = (total_sp_needed - current_sp).max(0);

        if sp_remaining > 0 {
            let key = (skill_attr.primary_attribute, skill_attr.secondary_attribute);
            *demand_map.entry(key).or_insert(0) += sp_remaining;

            if let Some(p) = skill_attr.primary_attribute {
                used_attributes.insert(p);
            }
            if let Some(s) = skill_attr.secondary_attribute {
                used_attributes.insert(s);
            }
        }
    }

    if demand_map.is_empty() {
        return Ok(OptimizationResult {
            recommended_remap: PlannedRemap {
                entry_index: 0,
                attributes: Attributes::default(),
            },
            original_seconds: 0,
            optimized_seconds: 0,
        });
    }

    // 2. Generate all valid attribute distributions (pruned by used_attributes)
    let distributions = generate_distributions(&used_attributes);

    let mut best_attributes = Attributes::default();
    let mut min_seconds = f64::MAX;

    // 3. Find distribution that minimizes total time
    for dist in distributions {
        let mut total_seconds = 0.0;
        for ((primary_id, secondary_id), sp) in &demand_map {
            let p_val = get_effective_attr_value(&dist, implants, *primary_id);
            let s_val = get_effective_attr_value(&dist, implants, *secondary_id);
            let sp_per_min = utils::calculate_sp_per_minute(p_val, s_val);
            if sp_per_min > 0.0 {
                total_seconds += (*sp as f64 / sp_per_min) * 60.0;
            }
        }

        if total_seconds < min_seconds {
            min_seconds = total_seconds;
            best_attributes = dist;
        }
    }

    // 4. Calculate baseline for comparison (base attributes + implants)
    let mut original_seconds = 0.0;
    let base_dist = Attributes::default();
    for ((primary_id, secondary_id), sp) in &demand_map {
        let p_val = get_effective_attr_value(&base_dist, implants, *primary_id);
        let s_val = get_effective_attr_value(&base_dist, implants, *secondary_id);
        let sp_per_min = utils::calculate_sp_per_minute(p_val, s_val);
        if sp_per_min > 0.0 {
            original_seconds += (*sp as f64 / sp_per_min) * 60.0;
        }
    }

    Ok(OptimizationResult {
        recommended_remap: PlannedRemap {
            entry_index: 0,
            attributes: best_attributes,
        },
        original_seconds: original_seconds.ceil() as i64,
        optimized_seconds: min_seconds.ceil() as i64,
    })
}

fn generate_distributions(used_ids: &std::collections::HashSet<i64>) -> Vec<Attributes> {
    let mut results = Vec::new();
    let mut current = [0i64; 5];

    // Attribute IDs in EVE:
    // Intelligence: 165
    // Memory: 166
    // Perception: 167
    // Willpower: 168
    // Charisma: 164
    let is_used = [
        used_ids.contains(&165),
        used_ids.contains(&166),
        used_ids.contains(&167),
        used_ids.contains(&168),
        used_ids.contains(&164),
    ];

    fn backtrack(
        idx: usize,
        remaining: i64,
        current: &mut [i64; 5],
        is_used: &[bool; 5],
        results: &mut Vec<Attributes>,
    ) {
        if idx == 5 {
            if remaining == 0 {
                results.push(Attributes {
                    intelligence: current[0],
                    memory: current[1],
                    perception: current[2],
                    willpower: current[3],
                    charisma: current[4],
                });
            }
            return;
        }

        // If this attribute is not used, it must be 0
        if !is_used[idx] {
            current[idx] = 0;
            backtrack(idx + 1, remaining, current, is_used, results);
            return;
        }

        let max_for_this = remaining.min(MAX_POINTS_PER_ATTR);
        for val in 0..=max_for_this {
            current[idx] = val;
            backtrack(idx + 1, remaining - val, current, is_used, results);
        }
    }

    backtrack(0, TOTAL_REMAP_POINTS, &mut current, &is_used, &mut results);
    results
}

fn get_effective_attr_value(
    remap: &Attributes,
    implants: &Attributes,
    attr_id: Option<i64>,
) -> i64 {
    const BASE: i64 = 17;
    match attr_id {
        Some(165) => BASE + remap.intelligence + implants.intelligence,
        Some(166) => BASE + remap.memory + implants.memory,
        Some(167) => BASE + remap.perception + implants.perception,
        Some(168) => BASE + remap.willpower + implants.willpower,
        Some(164) => BASE + remap.charisma + implants.charisma,
        _ => BASE,
    }
}
