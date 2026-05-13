use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use crate::cache;
use crate::db;
use crate::refresh;

#[derive(Debug, Clone, Serialize)]
pub struct CharacterAttributesResponse {
    pub charisma: i64,
    pub intelligence: i64,
    pub memory: i64,
    pub perception: i64,
    pub willpower: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillQueueItem {
    pub skill_id: i64,
    pub skill_name: Option<String>,
    pub queue_position: i32,
    pub finished_level: i32,
    pub start_date: Option<String>,
    pub finish_date: Option<String>,
    pub training_start_sp: Option<i64>,
    pub level_start_sp: Option<i64>,
    pub level_end_sp: Option<i64>,
    pub current_sp: Option<i64>,
    pub sp_per_minute: Option<f64>,
    pub primary_attribute: Option<i64>,
    pub secondary_attribute: Option<i64>,
    pub rank: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterSkillQueue {
    pub character_id: i64,
    pub character_name: String,
    pub skill_queue: Vec<SkillQueueItem>,
    pub attributes: Option<CharacterAttributesResponse>,
    pub unallocated_sp: i64,
    pub is_paused: bool,
    pub is_omega: bool,
}

pub fn is_skill_actively_training(skill: &SkillQueueItem) -> bool {
    if let (Some(start_str), Some(finish_str)) = (&skill.start_date, &skill.finish_date) {
        if let (Ok(start), Ok(finish)) = (
            chrono::DateTime::parse_from_rfc3339(start_str),
            chrono::DateTime::parse_from_rfc3339(finish_str),
        ) {
            let start_utc = start.with_timezone(&chrono::Utc);
            let finish_utc = finish.with_timezone(&chrono::Utc);
            let now = chrono::Utc::now();
            return now >= start_utc && now < finish_utc;
        }
    }

    false
}

#[tauri::command]
pub async fn force_refresh_skill_queue(
    pool: State<'_, db::Pool>,
    supervisor: State<'_, Mutex<refresh::RefreshSupervisor>>,
    character_id: i64,
) -> Result<(), String> {
    cache::clear_character_cache(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to clear cache: {}", e))?;

    if let Ok(sup) = supervisor.lock() {
        sup.poke(character_id);
    }

    Ok(())
}
