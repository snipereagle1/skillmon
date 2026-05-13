use futures_util::future::join_all;
use serde::{Deserialize, Serialize};
use tauri::State;
use typeshare::typeshare;

use crate::db;
use crate::refresh::enrichment;
use crate::refresh::events;
use crate::ts_types::i64_ts;

#[typeshare]
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterSnapshot {
    pub character_id: i64_ts,
    pub character_name: String,
    pub queue: Option<events::QueuePayload>,
    pub skills: Option<events::SkillsPayload>,
    pub attributes: Option<events::AttributesPayload>,
    pub clones: Vec<events::CloneInfo>,
    pub location: Option<events::LocationPayload>,
    pub remaps: Vec<db::remaps::Remap>,
}

#[tauri::command]
pub async fn get_esi_snapshot(pool: State<'_, db::Pool>) -> Result<Vec<CharacterSnapshot>, String> {
    let characters = db::get_all_characters(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let futures = characters.into_iter().map(|character| {
        let pool = pool.inner().clone();
        async move {
            let character_id = character.character_id;
            let character_name = character.character_name.clone();

            let (queue, skills, attributes, clones_payload, location, remaps) = tokio::join!(
                enrichment::enrich_queue_from_db(&pool, character_id),
                enrichment::enrich_skills_from_db(&pool, character_id),
                enrichment::enrich_attributes_from_db(&pool, character_id),
                enrichment::enrich_clones(&pool, character_id),
                enrichment::enrich_location_db_only(&pool, character_id),
                db::remaps::get_character_remaps(&pool, character_id),
            );

            let remaps = remaps.unwrap_or_else(|e| {
                eprintln!(
                    "esi_snapshot: remaps fetch error for {}: {}",
                    character_id, e
                );
                vec![]
            });

            CharacterSnapshot {
                character_id,
                character_name,
                queue,
                skills,
                attributes,
                clones: clones_payload.clones,
                location,
                remaps,
            }
        }
    });

    Ok(join_all(futures).await)
}
