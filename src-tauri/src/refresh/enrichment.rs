use std::collections::HashMap;

use sqlx::{QueryBuilder, Row, Sqlite};

use crate::{cache, db, esi, utils};

use super::events;

const BASE_ATTRIBUTE: i64 = 17;

// EVE attribute IDs: charisma=164, intelligence=165, memory=166, perception=167, willpower=168
// Implant bonus attribute IDs: charisma_bonus=175, intelligence_bonus=176, memory_bonus=177, perception_bonus=178, willpower_bonus=179
const ATTRIBUTE_ORDER: [(i64, i64); 5] = [
    (164, 175), // charisma, charisma_bonus
    (165, 176), // intelligence, intelligence_bonus
    (166, 177), // memory, memory_bonus
    (167, 178), // perception, perception_bonus
    (168, 179), // willpower, willpower_bonus
];

async fn get_skill_group_info(pool: &db::Pool, skill_ids: &[i64]) -> HashMap<i64, (i64, String)> {
    if skill_ids.is_empty() {
        return HashMap::new();
    }

    let mut result = HashMap::new();

    for chunk in skill_ids.chunks(100) {
        let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
            "SELECT st.type_id, st.group_id, sg.name FROM sde_types st JOIN sde_groups sg ON st.group_id = sg.group_id WHERE st.type_id IN (",
        );
        let mut sep = qb.separated(", ");
        for id in chunk {
            sep.push_bind(id);
        }
        sep.push_unseparated(")");

        if let Ok(rows) = qb.build().fetch_all(pool).await {
            for row in rows {
                let type_id: i64 = row.get(0);
                let group_id: i64 = row.get(1);
                let group_name: String = row.get(2);
                result.insert(type_id, (group_id, group_name));
            }
        }
    }

    result
}

fn attr_value_from_id(attrs: &db::CharacterAttributes, attr_id: i64) -> i64 {
    match attr_id {
        164 => attrs.charisma,
        165 => attrs.intelligence,
        166 => attrs.memory,
        167 => attrs.perception,
        168 => attrs.willpower,
        _ => 0,
    }
}

fn compute_breakdown_from_db_attrs(
    attrs: &db::CharacterAttributes,
    implant_ids: &[i64],
    implant_bonuses: &HashMap<i64, HashMap<i64, i64>>,
) -> [events::AttributeBreakdown; 5] {
    let base_values = [
        attrs.charisma,
        attrs.intelligence,
        attrs.memory,
        attrs.perception,
        attrs.willpower,
    ];

    let mut implant_totals = [0i64; 5];
    for (idx, (_, bonus_attr_id)) in ATTRIBUTE_ORDER.iter().enumerate() {
        let mut bonus = 0i64;
        for implant_id in implant_ids {
            if let Some(implant_attrs) = implant_bonuses.get(implant_id) {
                if let Some(&b) = implant_attrs.get(bonus_attr_id) {
                    bonus += b;
                }
            }
        }
        implant_totals[idx] = bonus;
    }

    let remainders: [i64; 5] =
        std::array::from_fn(|i| base_values[i] - BASE_ATTRIBUTE - implant_totals[i]);

    const MAX_REMAP_PER_ATTR: i64 = 10;
    const MAX_REMAP_TOTAL: i64 = 14;

    let min_accelerator = remainders
        .iter()
        .map(|&r| (r - MAX_REMAP_PER_ATTR).max(0))
        .max()
        .unwrap_or(0);
    let max_accelerator = *remainders.iter().min().unwrap_or(&0);

    let mut accelerator = min_accelerator;
    let mut remaps = [0i64; 5];

    for test_acc in min_accelerator..=max_accelerator {
        let mut test_remaps = [0i64; 5];
        let mut remap_sum = 0i64;
        for (idx, &remainder) in remainders.iter().enumerate() {
            let r = (remainder - test_acc).clamp(0, MAX_REMAP_PER_ATTR);
            test_remaps[idx] = r;
            remap_sum += r;
        }
        if remap_sum == MAX_REMAP_TOTAL {
            accelerator = test_acc;
            remaps = test_remaps;
            break;
        }
    }

    std::array::from_fn(|i| events::AttributeBreakdown {
        base: BASE_ATTRIBUTE,
        implants: implant_totals[i],
        remap: remaps[i],
        accelerator,
        total: base_values[i],
    })
}

fn compute_current_sp_for_item(
    item: &esi::CharactersSkillqueueSkill,
    known_sp: Option<i64>,
    progress_tracker: Option<i64>,
) -> i64 {
    let is_training = if let (Some(start), Some(finish)) = (item.start_date, item.finish_date) {
        let now = chrono::Utc::now();
        now >= start && now < finish
    } else {
        false
    };

    let base_sp = known_sp
        .or(item.training_start_sp)
        .or(item.level_start_sp)
        .unwrap_or(0);

    let mut progress_sp = if is_training {
        if let (Some(start), Some(finish)) = (item.start_date, item.finish_date) {
            let now = chrono::Utc::now();
            let total_duration = (finish - start).num_seconds() as f64;
            let elapsed = (now - start).num_seconds() as f64;

            if total_duration > 0.0 && elapsed > 0.0 {
                let total_sp_needed =
                    item.level_end_sp.unwrap_or(0) - item.level_start_sp.unwrap_or(0);
                let sp_gained = (total_sp_needed as f64 * (elapsed / total_duration)) as i64;
                let calculated = base_sp + sp_gained;
                if let Some(end) = item.level_end_sp {
                    calculated.min(end)
                } else {
                    calculated
                }
            } else {
                base_sp
            }
        } else {
            base_sp
        }
    } else {
        progress_tracker
            .or(known_sp)
            .or(item.training_start_sp)
            .or(item.level_start_sp)
            .unwrap_or(0)
    };

    if is_training {
        if let Some(end) = item.level_end_sp {
            progress_sp = progress_sp.min(end);
        }
    } else {
        if let Some(start) = item.level_start_sp {
            progress_sp = progress_sp.max(start);
        }
        if let Some(end) = item.level_end_sp {
            progress_sp = progress_sp.min(end);
        }
    }

    progress_sp
}

pub async fn enrich_queue(
    pool: &db::Pool,
    character_id: i64,
    raw_queue: Vec<esi::CharactersSkillqueueSkill>,
) -> events::QueuePayload {
    let character = db::get_character(pool, character_id)
        .await
        .ok()
        .flatten()
        .unwrap_or(db::Character {
            character_id,
            character_name: format!("{}", character_id),
            unallocated_sp: 0,
            account_id: None,
            sort_order: 0,
            is_omega: true,
        });

    let db_attrs = db::get_character_attributes(pool, character_id)
        .await
        .ok()
        .flatten();

    let skill_sp_map: HashMap<i64, i64> = db::get_character_skills(pool, character_id)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|s| (s.skill_id, s.skillpoints_in_skill))
        .collect();

    let skill_ids: Vec<i64> = raw_queue.iter().map(|item| item.skill_id).collect();
    let unique_ids: Vec<i64> = {
        let mut v: Vec<i64> = skill_ids
            .iter()
            .copied()
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();
        v.sort();
        v
    };

    let skill_names = utils::get_type_names(pool, &unique_ids)
        .await
        .unwrap_or_default();
    let skill_attrs = utils::get_skill_attributes(pool, &unique_ids)
        .await
        .unwrap_or_default();

    let is_paused =
        !raw_queue.is_empty() && raw_queue.iter().all(|item| item.finish_date.is_none());

    let now = chrono::Utc::now();
    let mut progress_map: HashMap<i64, i64> = HashMap::new();

    let queue: Vec<events::SkillQueueItem> = raw_queue
        .iter()
        .filter(|item| item.finish_date.map(|fd| now < fd).unwrap_or(true))
        .map(|item| {
            let known_sp = skill_sp_map.get(&item.skill_id).copied();
            let tracker = progress_map.get(&item.skill_id).copied();
            let current_sp = compute_current_sp_for_item(item, known_sp, tracker);

            if let Some(end) = item.level_end_sp {
                progress_map.insert(item.skill_id, current_sp.max(end));
            } else {
                progress_map.insert(item.skill_id, current_sp);
            }

            let (sp_per_minute, primary_attribute, secondary_attribute, rank) =
                if let Some(sa) = skill_attrs.get(&item.skill_id) {
                    let spm = if let (Some(p_id), Some(s_id), Some(attrs)) = (
                        sa.primary_attribute,
                        sa.secondary_attribute,
                        db_attrs.as_ref(),
                    ) {
                        let pv = attr_value_from_id(attrs, p_id);
                        let sv = attr_value_from_id(attrs, s_id);
                        Some(utils::calculate_sp_per_minute(pv, sv, character.is_omega))
                    } else {
                        None
                    };
                    (spm, sa.primary_attribute, sa.secondary_attribute, sa.rank)
                } else {
                    (None, None, None, None)
                };

            events::SkillQueueItem {
                skill_id: item.skill_id as i32,
                finished_level: item.finished_level as i32,
                queue_position: item.queue_position as i32,
                start_date: item.start_date.map(|d| d.to_rfc3339()),
                finish_date: item.finish_date.map(|d| d.to_rfc3339()),
                training_start_sp: item.training_start_sp.map(|v| v as i32),
                level_start_sp: item.level_start_sp.map(|v| v as i32),
                level_end_sp: item.level_end_sp.map(|v| v as i32),
                skill_name: skill_names.get(&item.skill_id).cloned(),
                primary_attribute,
                secondary_attribute,
                rank,
                sp_per_minute,
                current_sp: Some(current_sp),
            }
        })
        .collect();

    let attributes = db_attrs.as_ref().map(|a| events::AttributesData {
        charisma: a.charisma as i32,
        intelligence: a.intelligence as i32,
        memory: a.memory as i32,
        perception: a.perception as i32,
        willpower: a.willpower as i32,
        bonus_remaps: a.bonus_remaps.map(|v| v as i32),
        last_remap_date: a.last_remap_date.clone(),
        accrued_remap_cooldown_date: a.accrued_remap_cooldown_date.clone(),
    });

    events::QueuePayload {
        character_id: character_id as i32,
        queue,
        character_name: character.character_name,
        unallocated_sp: character.unallocated_sp,
        is_paused,
        is_omega: character.is_omega,
        attributes,
    }
}

pub async fn enrich_queue_from_db(
    pool: &db::Pool,
    character_id: i64,
) -> Option<events::QueuePayload> {
    let endpoint_path = format!("characters/{}/skillqueue", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    let entry = cache::get_cached_response(pool, &cache_key)
        .await
        .ok()
        .flatten()?;

    let raw_queue: Vec<esi::CharactersSkillqueueSkill> =
        serde_json::from_str(&entry.response_body).ok()?;

    Some(enrich_queue(pool, character_id, raw_queue).await)
}

pub async fn enrich_skills(
    pool: &db::Pool,
    character_id: i64,
    raw_skills: &esi::CharactersSkills,
    queue_skill_ids: &[i64],
) -> events::SkillsPayload {
    let character = db::get_character(pool, character_id)
        .await
        .ok()
        .flatten()
        .unwrap_or(db::Character {
            character_id,
            character_name: format!("{}", character_id),
            unallocated_sp: 0,
            account_id: None,
            sort_order: 0,
            is_omega: true,
        });

    let skill_ids: Vec<i64> = raw_skills.skills.iter().map(|s| s.skill_id).collect();
    let skill_names = utils::get_type_names(pool, &skill_ids)
        .await
        .unwrap_or_default();
    let group_info = get_skill_group_info(pool, &skill_ids).await;

    let queue_set: std::collections::HashSet<i64> = queue_skill_ids.iter().copied().collect();

    let skills: Vec<events::SkillItem> = raw_skills
        .skills
        .iter()
        .map(|s| events::SkillItem {
            skill_id: s.skill_id as i32,
            active_skill_level: s.active_skill_level as i32,
            skillpoints_in_skill: s.skillpoints_in_skill as i32,
            trained_skill_level: s.trained_skill_level as i32,
            skill_name: skill_names.get(&s.skill_id).cloned(),
            group_id: group_info.get(&s.skill_id).map(|(gid, _)| *gid),
            group_name: group_info.get(&s.skill_id).map(|(_, gname)| gname.clone()),
            is_in_queue: queue_set.contains(&s.skill_id),
            is_injected: true,
        })
        .collect();

    events::SkillsPayload {
        character_id: character_id as i32,
        character_name: character.character_name,
        total_sp: raw_skills.total_sp,
        unallocated_sp: raw_skills.unallocated_sp,
        skills,
    }
}

pub async fn enrich_skills_from_db(
    pool: &db::Pool,
    character_id: i64,
) -> Option<events::SkillsPayload> {
    let character = db::get_character(pool, character_id).await.ok().flatten()?;

    let db_skills = db::get_character_skills(pool, character_id).await.ok()?;

    if db_skills.is_empty() {
        return None;
    }

    let skill_ids: Vec<i64> = db_skills.iter().map(|s| s.skill_id).collect();
    let skill_names = utils::get_type_names(pool, &skill_ids)
        .await
        .unwrap_or_default();
    let group_info = get_skill_group_info(pool, &skill_ids).await;

    // Get queued skill IDs from cache
    let queue_skill_ids: std::collections::HashSet<i64> = {
        let endpoint_path = format!("characters/{}/skillqueue", character_id);
        let cache_key = cache::build_cache_key(&endpoint_path, character_id);
        if let Ok(Some(entry)) = cache::get_cached_response(pool, &cache_key).await {
            if let Ok(raw_queue) =
                serde_json::from_str::<Vec<esi::CharactersSkillqueueSkill>>(&entry.response_body)
            {
                let now = chrono::Utc::now();
                raw_queue
                    .into_iter()
                    .filter(|item| item.finish_date.map(|fd| now < fd).unwrap_or(true))
                    .map(|item| item.skill_id)
                    .collect()
            } else {
                std::collections::HashSet::new()
            }
        } else {
            std::collections::HashSet::new()
        }
    };

    let total_sp: i64 = db_skills.iter().map(|s| s.skillpoints_in_skill).sum();
    let unallocated_sp = Some(character.unallocated_sp);

    let skills: Vec<events::SkillItem> = db_skills
        .iter()
        .map(|s| events::SkillItem {
            skill_id: s.skill_id as i32,
            active_skill_level: s.active_skill_level as i32,
            skillpoints_in_skill: s.skillpoints_in_skill as i32,
            trained_skill_level: s.trained_skill_level as i32,
            skill_name: skill_names.get(&s.skill_id).cloned(),
            group_id: group_info.get(&s.skill_id).map(|(gid, _)| *gid),
            group_name: group_info.get(&s.skill_id).map(|(_, gname)| gname.clone()),
            is_in_queue: queue_skill_ids.contains(&s.skill_id),
            is_injected: true,
        })
        .collect();

    Some(events::SkillsPayload {
        character_id: character_id as i32,
        character_name: character.character_name,
        total_sp,
        unallocated_sp,
        skills,
    })
}

pub async fn enrich_attributes(
    pool: &db::Pool,
    character_id: i64,
    raw_attrs: &crate::esi::CharactersCharacterIdAttributesGet,
) -> events::AttributesPayload {
    let character = db::get_character(pool, character_id)
        .await
        .ok()
        .flatten()
        .unwrap_or(db::Character {
            character_id,
            character_name: format!("{}", character_id),
            unallocated_sp: 0,
            account_id: None,
            sort_order: 0,
            is_omega: true,
        });

    let db_attrs = db::CharacterAttributes {
        character_id,
        charisma: raw_attrs.charisma,
        intelligence: raw_attrs.intelligence,
        memory: raw_attrs.memory,
        perception: raw_attrs.perception,
        willpower: raw_attrs.willpower,
        bonus_remaps: raw_attrs.bonus_remaps,
        last_remap_date: raw_attrs.last_remap_date.as_ref().map(|d| d.to_rfc3339()),
        accrued_remap_cooldown_date: raw_attrs
            .accrued_remap_cooldown_date
            .as_ref()
            .map(|d| d.to_rfc3339()),
    };

    let implant_ids = get_active_clone_implant_ids(pool, character_id).await;
    let implant_bonuses = if implant_ids.is_empty() {
        HashMap::new()
    } else {
        db::get_implant_attribute_bonuses(pool, &implant_ids)
            .await
            .unwrap_or_default()
    };

    let breakdown = compute_breakdown_from_db_attrs(&db_attrs, &implant_ids, &implant_bonuses);

    events::AttributesPayload {
        character_id: character_id as i32,
        character_name: character.character_name,
        charisma: breakdown[0].clone(),
        intelligence: breakdown[1].clone(),
        memory: breakdown[2].clone(),
        perception: breakdown[3].clone(),
        willpower: breakdown[4].clone(),
        bonus_remaps: raw_attrs.bonus_remaps.map(|v| v as i32),
        last_remap_date: raw_attrs.last_remap_date.as_ref().map(|d| d.to_rfc3339()),
        accrued_remap_cooldown_date: raw_attrs
            .accrued_remap_cooldown_date
            .as_ref()
            .map(|d| d.to_rfc3339()),
    }
}

pub async fn enrich_attributes_from_db(
    pool: &db::Pool,
    character_id: i64,
) -> Option<events::AttributesPayload> {
    let character = db::get_character(pool, character_id).await.ok().flatten()?;

    let db_attrs = db::get_character_attributes(pool, character_id)
        .await
        .ok()
        .flatten()?;

    let implant_ids = get_active_clone_implant_ids(pool, character_id).await;
    let implant_bonuses = if implant_ids.is_empty() {
        HashMap::new()
    } else {
        db::get_implant_attribute_bonuses(pool, &implant_ids)
            .await
            .unwrap_or_default()
    };

    let breakdown = compute_breakdown_from_db_attrs(&db_attrs, &implant_ids, &implant_bonuses);

    Some(events::AttributesPayload {
        character_id: character_id as i32,
        character_name: character.character_name,
        charisma: breakdown[0].clone(),
        intelligence: breakdown[1].clone(),
        memory: breakdown[2].clone(),
        perception: breakdown[3].clone(),
        willpower: breakdown[4].clone(),
        bonus_remaps: db_attrs.bonus_remaps.map(|v| v as i32),
        last_remap_date: db_attrs.last_remap_date.clone(),
        accrued_remap_cooldown_date: db_attrs.accrued_remap_cooldown_date.clone(),
    })
}

async fn get_active_clone_implant_ids(pool: &db::Pool, character_id: i64) -> Vec<i64> {
    let clones = db::get_character_clones(pool, character_id)
        .await
        .unwrap_or_default();

    let active_clone = clones.into_iter().find(|c| c.is_current);
    if let Some(clone) = active_clone {
        db::get_clone_implants(pool, clone.id)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|i| i.implant_type_id)
            .collect()
    } else {
        vec![]
    }
}

// ── Task 002: Location and clones enrichment ──────────────────────────────

use crate::esi_helpers;

#[derive(Clone)]
pub struct LocationIds {
    pub solar_system_id: Option<i64>,
    pub station_id: Option<i64>,
    pub structure_id: Option<i64>,
}

impl LocationIds {
    pub fn none() -> Self {
        Self {
            solar_system_id: None,
            station_id: None,
            structure_id: None,
        }
    }
}

pub async fn enrich_location(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
    last_ids: &LocationIds,
) -> Option<events::LocationPayload> {
    let character = db::get_character(pool, character_id).await.ok().flatten()?;

    let (location_res, ship_res, online_res, implants_res) = tokio::join!(
        esi_helpers::get_cached_character_location(pool, client, character_id, rate_limits),
        esi_helpers::get_cached_character_ship(pool, client, character_id, rate_limits),
        esi_helpers::get_cached_character_online(pool, client, character_id, rate_limits),
        esi_helpers::get_cached_character_implants(pool, client, character_id, rate_limits),
    );

    let location = location_res.ok().flatten()?;
    let ship = ship_res.ok().flatten();
    let online = online_res.ok().flatten();
    let implant_ids = implants_res.ok().flatten().unwrap_or_default();

    let solar_system_id = location.solar_system_id;

    // Resolve solar system name, only call ESI if ID changed
    let solar_system_name = if last_ids.solar_system_id != Some(solar_system_id) {
        esi_helpers::get_cached_solar_system_info(pool, client, solar_system_id, rate_limits)
            .await
            .ok()
            .flatten()
            .map(|info| info.name)
            .unwrap_or_else(|| format!("{}", solar_system_id))
    } else {
        // Re-read cached name from DB via sde or cache
        esi_helpers::get_cached_solar_system_info(pool, client, solar_system_id, rate_limits)
            .await
            .ok()
            .flatten()
            .map(|info| info.name)
            .unwrap_or_else(|| format!("{}", solar_system_id))
    };

    // Resolve region via constellation
    let region_name = {
        if let Ok(Some(sys_info)) =
            esi_helpers::get_cached_solar_system_info(pool, client, solar_system_id, rate_limits)
                .await
        {
            if let Ok(Some(constellation)) = esi_helpers::get_cached_constellation_info(
                pool,
                client,
                sys_info.constellation_id,
                rate_limits,
            )
            .await
            {
                esi_helpers::get_cached_region_info(
                    pool,
                    client,
                    constellation.region_id,
                    rate_limits,
                )
                .await
                .ok()
                .flatten()
                .map(|r| r.name)
            } else {
                None
            }
        } else {
            None
        }
    };

    // Resolve station name
    let (station_name, station_type_id) = if let Some(station_id) = location.station_id {
        let should_resolve = last_ids.station_id != Some(station_id);
        if should_resolve {
            if let Ok(Some(station)) = db::get_station(pool, station_id).await {
                (Some(station.name), station.type_id)
            } else if let Ok(Some(station_info)) =
                esi_helpers::get_cached_station_info(pool, client, station_id, rate_limits).await
            {
                let _ = db::upsert_station(
                    pool,
                    station_id,
                    &station_info.name,
                    station_info.system_id,
                    Some(station_info.type_id),
                    station_info.owner,
                )
                .await;
                (Some(station_info.name), Some(station_info.type_id))
            } else {
                (None, None)
            }
        } else if let Ok(Some(station)) = db::get_station(pool, station_id).await {
            (Some(station.name), station.type_id)
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    // Resolve structure name
    let (structure_name, structure_type_id) = if let Some(structure_id) = location.structure_id {
        let should_resolve = last_ids.structure_id != Some(structure_id);
        if should_resolve {
            if let Ok(Some(structure)) = db::get_structure(pool, structure_id).await {
                (Some(structure.name), structure.type_id)
            } else if let Ok(Some(structure_info)) =
                esi_helpers::get_cached_structure_info(pool, client, structure_id, rate_limits)
                    .await
            {
                let _ = db::upsert_structure(
                    pool,
                    structure_id,
                    &structure_info.name,
                    structure_info.solar_system_id,
                    structure_info.type_id,
                    structure_info.owner_id,
                )
                .await;
                (Some(structure_info.name), structure_info.type_id)
            } else {
                (None, None)
            }
        } else if let Ok(Some(structure)) = db::get_structure(pool, structure_id).await {
            (Some(structure.name), structure.type_id)
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    let docked_type_id = station_type_id.or(structure_type_id);

    // Resolve ship type name; when manning a structure the ship endpoint returns
    // non-200, so fall back to the structure type so the UI shows something useful.
    let (ship_type_id, ship_type_name, ship_name) = if let Some(ship) = ship {
        let names = utils::get_type_names(pool, &[ship.ship_type_id])
            .await
            .unwrap_or_default();
        let type_name = names.get(&ship.ship_type_id).cloned();
        (Some(ship.ship_type_id), type_name, Some(ship.ship_name))
    } else if let Some(type_id) = docked_type_id {
        let names = utils::get_type_names(pool, &[type_id])
            .await
            .unwrap_or_default();
        let type_name = names.get(&type_id).cloned();
        (Some(type_id), type_name, Some(String::new()))
    } else {
        (None, None, None)
    };

    // Resolve implant names
    let implant_names = utils::get_type_names(pool, &implant_ids)
        .await
        .unwrap_or_default();
    let implants: Vec<events::ImplantInfo> = implant_ids
        .iter()
        .map(|&type_id| events::ImplantInfo {
            type_id,
            name: implant_names
                .get(&type_id)
                .cloned()
                .unwrap_or_else(|| format!("{}", type_id)),
        })
        .collect();

    let is_online = online.as_ref().map(|o| o.online);
    let is_docked = Some(location.station_id.is_some() || location.structure_id.is_some());

    Some(events::LocationPayload {
        character_id: character_id as i32,
        has_location_scope: true,
        solar_system_id,
        solar_system_name,
        region_name,
        station_id: location.station_id,
        station_name,
        structure_id: location.structure_id,
        structure_name,
        structure_type_id: docked_type_id,
        ship_type_id,
        ship_type_name,
        ship_name,
        is_online,
        is_docked,
        implants,
        character_name: character.character_name,
    })
}

pub async fn enrich_location_db_only(
    pool: &db::Pool,
    character_id: i64,
) -> Option<events::LocationPayload> {
    let character = db::get_character(pool, character_id).await.ok().flatten()?;

    // Try to read last-known location from DB cache
    let endpoint_path = format!("characters/{}/location", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    let location = {
        let entry = cache::get_cached_response(pool, &cache_key)
            .await
            .ok()
            .flatten()?;
        serde_json::from_str::<crate::esi::CharactersCharacterIdLocationGet>(&entry.response_body)
            .ok()?
    };

    let solar_system_id = location.solar_system_id;

    // DB-only name resolution: read from cached system/constellation/region in esi_cache
    let solar_system_name = {
        let ep = format!("universe/systems/{}", solar_system_id);
        let ck = format!("{}:0", ep);
        if let Ok(Some(e)) = cache::get_cached_response(pool, &ck).await {
            serde_json::from_str::<crate::esi::UniverseSystemsSystemIdGet>(&e.response_body)
                .ok()
                .map(|s| s.name)
                .unwrap_or_else(|| format!("{}", solar_system_id))
        } else {
            format!("{}", solar_system_id)
        }
    };

    let region_name: Option<String> = {
        let ep = format!("universe/systems/{}", solar_system_id);
        let ck = format!("{}:0", ep);
        if let Ok(Some(e)) = cache::get_cached_response(pool, &ck).await {
            if let Ok(sys) =
                serde_json::from_str::<crate::esi::UniverseSystemsSystemIdGet>(&e.response_body)
            {
                let constellation_id = sys.constellation_id;
                let cep = format!("universe/constellations/{}", constellation_id);
                let cck = format!("{}:0", cep);
                if let Ok(Some(ce)) = cache::get_cached_response(pool, &cck).await {
                    if let Ok(constellation) = serde_json::from_str::<
                        crate::esi::UniverseConstellationsConstellationIdGet,
                    >(&ce.response_body)
                    {
                        let rep = format!("universe/regions/{}", constellation.region_id);
                        let rck = format!("{}:0", rep);
                        if let Ok(Some(re)) = cache::get_cached_response(pool, &rck).await {
                            serde_json::from_str::<crate::esi::UniverseRegionsRegionIdGet>(
                                &re.response_body,
                            )
                            .ok()
                            .map(|r| r.name)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        }
    };

    let (station_name, station_type_id) = if let Some(station_id) = location.station_id {
        if let Ok(Some(station)) = db::get_station(pool, station_id).await {
            (Some(station.name), station.type_id)
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    let (structure_name, structure_type_id) = if let Some(structure_id) = location.structure_id {
        if let Ok(Some(structure)) = db::get_structure(pool, structure_id).await {
            (Some(structure.name), structure.type_id)
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    let docked_type_id = station_type_id.or(structure_type_id);

    // Implants from active clone in DB
    let implant_ids = get_active_clone_implant_ids(pool, character_id).await;
    let implant_names = utils::get_type_names(pool, &implant_ids)
        .await
        .unwrap_or_default();
    let implants: Vec<events::ImplantInfo> = implant_ids
        .iter()
        .map(|&type_id| events::ImplantInfo {
            type_id,
            name: implant_names
                .get(&type_id)
                .cloned()
                .unwrap_or_else(|| format!("{}", type_id)),
        })
        .collect();

    let is_docked = Some(location.station_id.is_some() || location.structure_id.is_some());

    Some(events::LocationPayload {
        character_id: character_id as i32,
        has_location_scope: true,
        solar_system_id,
        solar_system_name,
        region_name,
        station_id: location.station_id,
        station_name,
        structure_id: location.structure_id,
        structure_name,
        structure_type_id: docked_type_id,
        ship_type_id: docked_type_id,
        ship_type_name: if let Some(type_id) = docked_type_id {
            utils::get_type_names(pool, &[type_id])
                .await
                .unwrap_or_default()
                .get(&type_id)
                .cloned()
        } else {
            None
        },
        ship_name: docked_type_id.map(|_| String::new()),
        is_online: None,
        is_docked,
        implants,
        character_name: character.character_name,
    })
}

pub async fn enrich_clones(pool: &db::Pool, character_id: i64) -> events::ClonesPayload {
    let db_clones = db::get_character_clones(pool, character_id)
        .await
        .unwrap_or_default();

    let mut all_implant_ids: Vec<i64> = Vec::new();
    let mut clone_implants_map: HashMap<i64, Vec<i64>> = HashMap::new();

    for clone in &db_clones {
        let implants = db::get_clone_implants(pool, clone.id)
            .await
            .unwrap_or_default();
        let ids: Vec<i64> = implants.iter().map(|i| i.implant_type_id).collect();
        all_implant_ids.extend(&ids);
        clone_implants_map.insert(clone.id, ids);
    }

    all_implant_ids.sort();
    all_implant_ids.dedup();

    let implant_names = utils::get_type_names(pool, &all_implant_ids)
        .await
        .unwrap_or_default();

    let clones: Vec<events::CloneInfo> = db_clones
        .iter()
        .map(|clone| {
            let implant_type_ids = clone_implants_map
                .get(&clone.id)
                .cloned()
                .unwrap_or_default();
            let implants: Vec<events::ImplantInfo> = implant_type_ids
                .iter()
                .map(|&type_id| events::ImplantInfo {
                    type_id,
                    name: implant_names
                        .get(&type_id)
                        .cloned()
                        .unwrap_or_else(|| format!("{}", type_id)),
                })
                .collect();

            events::CloneInfo {
                id: clone.id,
                clone_id: clone.clone_id,
                name: clone.name.clone(),
                location_type: clone.location_type.clone(),
                location_id: clone.location_id,
                location_name: clone.location_name.clone(),
                is_current: clone.is_current,
                implants,
            }
        })
        .collect();

    events::ClonesPayload {
        character_id: character_id as i32,
        clones,
    }
}

pub async fn compute_overview_row(
    pool: &db::Pool,
    character_id: i64,
) -> Option<events::OverviewRow> {
    let queue_payload = enrich_queue_from_db(pool, character_id).await?;
    if queue_payload.is_paused || queue_payload.queue.is_empty() {
        return None;
    }

    let current = &queue_payload.queue[0];

    let queue_time_remaining_seconds = queue_payload
        .queue
        .last()
        .and_then(|q| q.finish_date.as_deref())
        .and_then(|finish| chrono::DateTime::parse_from_rfc3339(finish).ok())
        .map(|finish_dt| {
            (finish_dt.with_timezone(&chrono::Utc) - chrono::Utc::now())
                .num_seconds()
                .max(0)
        });

    let sp_per_hour = current.sp_per_minute.unwrap_or(0.0) * 60.0;

    let has_implants = !get_active_clone_implant_ids(pool, character_id)
        .await
        .is_empty();

    let has_booster = enrich_attributes_from_db(pool, character_id)
        .await
        .map(|a| {
            a.charisma.accelerator > 0
                || a.intelligence.accelerator > 0
                || a.memory.accelerator > 0
                || a.perception.accelerator > 0
                || a.willpower.accelerator > 0
        })
        .unwrap_or(false);

    let character = db::get_character(pool, character_id).await.ok().flatten();

    let account_name = if let Some(account_id) = character.as_ref().and_then(|c| c.account_id) {
        db::get_account(pool, account_id)
            .await
            .ok()
            .flatten()
            .map(|a| a.name)
    } else {
        None
    };

    Some(events::OverviewRow {
        character_id: character_id as i32,
        character_name: queue_payload.character_name,
        account_name,
        queue_time_remaining_seconds,
        current_skill_name: current.skill_name.clone(),
        current_skill_level: Some(current.finished_level),
        sp_per_hour,
        is_omega: queue_payload.is_omega,
        has_implants,
        has_booster,
    })
}
