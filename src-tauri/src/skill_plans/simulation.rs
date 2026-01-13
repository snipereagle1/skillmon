use crate::db;
use crate::utils;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const BASE_ATTRIBUTE: i64 = 17;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationProfile {
    pub implants: Attributes,
    pub remaps: Vec<PlannedRemap>,
    pub accelerators: Vec<PlannedAccelerator>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct Attributes {
    pub charisma: i64,
    pub intelligence: i64,
    pub memory: i64,
    pub perception: i64,
    pub willpower: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedRemap {
    pub entry_index: usize, // Index in the skill plan entries
    pub attributes: Attributes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedAccelerator {
    pub entry_index: usize, // Index in the skill plan entries
    pub bonus: i64,         // Additive bonus to all attributes
    pub duration_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationResult {
    pub total_seconds: i64,
    pub total_sp: i64,
    pub segments: Vec<SimulationSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationSegment {
    pub entry_index: usize,
    pub skill_type_id: i64,
    pub level: i64,
    pub duration_seconds: i64,
    pub start_time_seconds: i64,
    pub attributes: Attributes,
    pub sp_per_minute: f64,
    pub primary_attribute_id: Option<i64>,
    pub secondary_attribute_id: Option<i64>,
    pub sp_earned: i64,
    pub cumulative_sp: i64,
}

pub async fn simulate(
    pool: &db::Pool,
    entries: &[crate::db::skill_plans::SkillPlanEntry],
    profile: SimulationProfile,
    current_sp_map: Option<&HashMap<i64, i64>>,
) -> anyhow::Result<SimulationResult> {
    let skill_type_ids: Vec<i64> = entries.iter().map(|e| e.skill_type_id).collect();
    let skill_attributes = utils::get_skill_attributes(pool, &skill_type_ids)
        .await
        .map_err(|e| anyhow::anyhow!(e))?;

    let mut segments = Vec::new();
    let mut current_time: i64 = 0;
    let mut active_accelerators: Vec<(i64, i64)> = Vec::new(); // (end_time, bonus)

    // Track SP for each skill to handle partially trained skills
    // We only care about skills in the plan.
    let mut simulated_sp = HashMap::new();
    if let Some(map) = current_sp_map {
        simulated_sp = map.clone();
    }

    let mut current_remap_offsets = Attributes::default();
    let mut total_sp_earned: i64 = 0;

    // Sort remaps and accelerators by entry_index for easier processing
    let mut remaps = profile.remaps;
    remaps.sort_by_key(|r| r.entry_index);
    let mut next_remap_idx = 0;

    let mut accelerators = profile.accelerators;
    accelerators.sort_by_key(|a| a.entry_index);
    let mut next_accel_idx = 0;

    for (idx, entry) in entries.iter().enumerate() {
        // 1. Check for remap at this entry
        while next_remap_idx < remaps.len() && remaps[next_remap_idx].entry_index == idx {
            current_remap_offsets = remaps[next_remap_idx].attributes.clone();
            next_remap_idx += 1;
        }

        // 2. Check for new accelerator at this entry
        while next_accel_idx < accelerators.len() && accelerators[next_accel_idx].entry_index == idx
        {
            let accel = &accelerators[next_accel_idx];
            active_accelerators.push((current_time + accel.duration_seconds, accel.bonus));
            next_accel_idx += 1;
        }

        let skill_attr = skill_attributes.get(&entry.skill_type_id).ok_or_else(|| {
            anyhow::anyhow!("Attributes not found for skill {}", entry.skill_type_id)
        })?;

        let rank = skill_attr.rank.unwrap_or(1);
        let total_sp_needed = utils::calculate_sp_for_level(rank, entry.planned_level as i32);

        let mut current_sp = *simulated_sp.get(&entry.skill_type_id).unwrap_or(&0);
        let mut sp_remaining = (total_sp_needed - current_sp).max(0);

        while sp_remaining > 0 {
            // Calculate current effective attributes
            active_accelerators.retain(|(end_time, _)| *end_time > current_time);
            let accel_bonus: i64 = active_accelerators.iter().map(|(_, b)| *b).sum();

            let effective_attrs = Attributes {
                charisma: BASE_ATTRIBUTE
                    + current_remap_offsets.charisma
                    + profile.implants.charisma
                    + accel_bonus,
                intelligence: BASE_ATTRIBUTE
                    + current_remap_offsets.intelligence
                    + profile.implants.intelligence
                    + accel_bonus,
                memory: BASE_ATTRIBUTE
                    + current_remap_offsets.memory
                    + profile.implants.memory
                    + accel_bonus,
                perception: BASE_ATTRIBUTE
                    + current_remap_offsets.perception
                    + profile.implants.perception
                    + accel_bonus,
                willpower: BASE_ATTRIBUTE
                    + current_remap_offsets.willpower
                    + profile.implants.willpower
                    + accel_bonus,
            };

            let primary_val = get_attr_value(&effective_attrs, skill_attr.primary_attribute);
            let secondary_val = get_attr_value(&effective_attrs, skill_attr.secondary_attribute);
            let sp_per_min = utils::calculate_sp_per_minute(primary_val, secondary_val);
            let sp_per_sec = sp_per_min / 60.0;

            // Determine how long this segment lasts
            // Segment ends when:
            // - Skill is finished
            // - Next accelerator expires
            let mut duration = (sp_remaining as f64 / sp_per_sec).ceil() as i64;

            if let Some(next_expiry) = active_accelerators.iter().map(|(t, _)| *t).min() {
                let time_to_expiry = next_expiry - current_time;
                if time_to_expiry < duration {
                    duration = time_to_expiry;
                }
            }

            let sp_gained = (sp_per_sec * duration as f64) as i64;
            let actual_sp_gained = sp_gained.min(sp_remaining);

            // If we would finish the skill exactly, adjust duration
            let actual_duration = if actual_sp_gained == sp_remaining {
                (sp_remaining as f64 / sp_per_sec).ceil() as i64
            } else {
                duration
            };

            let segment_cumulative_sp = total_sp_earned;
            total_sp_earned += actual_sp_gained;

            segments.push(SimulationSegment {
                entry_index: idx,
                skill_type_id: entry.skill_type_id,
                level: entry.planned_level,
                duration_seconds: actual_duration,
                start_time_seconds: current_time,
                attributes: effective_attrs,
                sp_per_minute: sp_per_min,
                primary_attribute_id: skill_attr.primary_attribute,
                secondary_attribute_id: skill_attr.secondary_attribute,
                sp_earned: actual_sp_gained,
                cumulative_sp: segment_cumulative_sp,
            });

            current_time += actual_duration;
            sp_remaining -= actual_sp_gained;
            current_sp += actual_sp_gained;

            if sp_remaining <= 0 {
                break;
            }
        }
        simulated_sp.insert(entry.skill_type_id, current_sp);
    }

    Ok(SimulationResult {
        total_seconds: current_time,
        total_sp: total_sp_earned,
        segments,
    })
}

fn get_attr_value(attrs: &Attributes, attr_id: Option<i64>) -> i64 {
    match attr_id {
        Some(164) => attrs.charisma,
        Some(165) => attrs.intelligence,
        Some(166) => attrs.memory,
        Some(167) => attrs.perception,
        Some(168) => attrs.willpower,
        _ => BASE_ATTRIBUTE, // default
    }
}
