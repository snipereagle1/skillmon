use serde::{Deserialize, Serialize};
use tauri::State;

use crate::cache;
use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotSkill {
    pub character_id: i64,
    pub skill_id: i64,
    pub active_skill_level: i64,
    pub skillpoints_in_skill: i64,
    pub trained_skill_level: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotAttributes {
    pub character_id: i64,
    pub charisma: i64,
    pub intelligence: i64,
    pub memory: i64,
    pub perception: i64,
    pub willpower: i64,
    pub bonus_remaps: Option<i64>,
    pub accrued_remap_cooldown_date: Option<String>,
    pub last_remap_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCloneImplant {
    pub implant_type_id: i64,
    pub slot: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotClone {
    pub id: i64,
    pub character_id: i64,
    pub clone_id: Option<i64>,
    pub name: Option<String>,
    pub location_type: String,
    pub location_id: i64,
    pub location_name: Option<String>,
    pub is_current: bool,
    pub implants: Vec<SnapshotCloneImplant>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EsiSnapshot {
    pub character_id: i64,
    /// Raw JSON string from esi_cache for the skill queue (may be null if not yet cached)
    pub queue_json: Option<String>,
    pub skills: Vec<SnapshotSkill>,
    pub attributes: Option<SnapshotAttributes>,
    pub clones: Vec<SnapshotClone>,
}

#[tauri::command]
pub async fn get_esi_snapshot(
    character_id: i64,
    pool: State<'_, db::Pool>,
) -> Result<EsiSnapshot, String> {
    // Read skills
    let skills = db::get_character_skills(&pool, character_id)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|s| SnapshotSkill {
            character_id: s.character_id,
            skill_id: s.skill_id,
            active_skill_level: s.active_skill_level,
            skillpoints_in_skill: s.skillpoints_in_skill,
            trained_skill_level: s.trained_skill_level,
        })
        .collect();

    // Read attributes
    let attributes = db::get_character_attributes(&pool, character_id)
        .await
        .ok()
        .flatten()
        .map(|a| SnapshotAttributes {
            character_id: a.character_id,
            charisma: a.charisma,
            intelligence: a.intelligence,
            memory: a.memory,
            perception: a.perception,
            willpower: a.willpower,
            bonus_remaps: a.bonus_remaps,
            accrued_remap_cooldown_date: a.accrued_remap_cooldown_date,
            last_remap_date: a.last_remap_date,
        });

    // Read clones
    let clones_raw = db::get_character_clones(&pool, character_id)
        .await
        .unwrap_or_default();

    let mut clones = Vec::with_capacity(clones_raw.len());
    for clone in clones_raw {
        let implants = db::get_clone_implants(&pool, clone.id)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|i| SnapshotCloneImplant {
                implant_type_id: i.implant_type_id,
                slot: i.slot,
            })
            .collect();

        clones.push(SnapshotClone {
            id: clone.id,
            character_id: clone.character_id,
            clone_id: clone.clone_id,
            name: clone.name,
            location_type: clone.location_type,
            location_id: clone.location_id,
            location_name: clone.location_name,
            is_current: clone.is_current,
            implants,
        });
    }

    // Read skill queue from esi_cache (raw JSON — already serialized by ESI fetch)
    let endpoint_path = format!("characters/{}/skillqueue", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);
    let queue_json = cache::get_cached_response(&pool, &cache_key)
        .await
        .ok()
        .flatten()
        .map(|entry| entry.response_body);

    Ok(EsiSnapshot {
        character_id,
        queue_json,
        skills,
        attributes,
        clones,
    })
}
