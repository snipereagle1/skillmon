use anyhow::Result;
use serde::Serialize;
use tauri::State;

use crate::db;
use crate::esi;
use crate::esi_helpers;

#[derive(Debug, Clone, Serialize)]
pub struct CloneImplantResponse {
    pub implant_type_id: i64,
    pub slot: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CloneResponse {
    pub id: i64,
    pub character_id: i64,
    pub clone_id: Option<i64>,
    pub name: Option<String>,
    pub location_type: String,
    pub location_id: i64,
    pub location_name: String,
    pub is_current: bool,
    pub implants: Vec<CloneImplantResponse>,
}

async fn resolve_clone_location(
    pool: &db::Pool,
    client: &reqwest::Client,
    location_type: &str,
    location_id: i64,
    _character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<String> {
    match location_type {
        "station" => {
            if let Some(station) = db::get_station(pool, location_id).await? {
                return Ok(station.name);
            }

            if let Some(station) =
                esi_helpers::get_cached_station_info(pool, client, location_id, rate_limits).await?
            {
                let name = if !station.name.is_empty() {
                    station.name
                } else {
                    format!("Unknown Location {}", location_id)
                };

                db::upsert_station(pool, location_id, &name, station.system_id, station.owner)
                    .await?;

                Ok(name)
            } else {
                let name = format!("Unknown Location {}", location_id);
                db::upsert_station(pool, location_id, &name, 0, None).await?;
                Ok(name)
            }
        }
        "structure" => {
            if let Some(structure) = db::get_structure(pool, location_id).await? {
                return Ok(structure.name);
            }

            match esi_helpers::get_cached_structure_info(pool, client, location_id, rate_limits)
                .await
            {
                Ok(Some(structure)) => {
                    let name = if !structure.name.is_empty() {
                        structure.name
                    } else {
                        format!("Unknown Location {}", location_id)
                    };

                    db::upsert_structure(
                        pool,
                        location_id,
                        &name,
                        structure.solar_system_id,
                        structure.type_id,
                        structure.owner_id,
                    )
                    .await?;

                    Ok(name)
                }
                Ok(None) => {
                    let name = "Inaccessible Structure".to_string();
                    db::upsert_structure(pool, location_id, &name, 0, None, 0).await?;
                    Ok(name)
                }
                Err(_) => {
                    let name = "Inaccessible Structure".to_string();
                    db::upsert_structure(pool, location_id, &name, 0, None, 0).await?;
                    Ok(name)
                }
            }
        }
        _ => Ok(format!("Unknown Location {}", location_id)),
    }
}

#[tauri::command]
pub async fn get_clones(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<Vec<CloneResponse>, String> {
    let access_token = crate::auth::ensure_valid_access_token(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get valid token: {}", e))?;

    let client = esi_helpers::create_authenticated_client(&access_token)
        .map_err(|e| format!("Failed to create client: {}", e))?;

    let clones_data =
        esi_helpers::get_cached_character_clones(&pool, &client, character_id, &rate_limits)
            .await
            .map_err(|e| format!("Failed to fetch clones: {}", e))?
            .ok_or_else(|| "No clones data returned".to_string())?;

    let current_implants =
        esi_helpers::get_cached_character_implants(&pool, &client, character_id, &rate_limits)
            .await
            .map_err(|e| format!("Failed to fetch implants: {}", e))?
            .unwrap_or_default();

    let mut clones_to_store = Vec::new();
    let mut matched_clone_id_for_current: Option<i64> = None;
    let mut matched_clone_location_update: Option<(String, i64)> = None;

    for jump_clone in &clones_data.jump_clones {
        if let Some(obj) = jump_clone.as_object() {
            let clone_id = obj.get("jump_clone_id").and_then(|v| v.as_i64());
            let location_id = obj.get("location_id").and_then(|v| v.as_i64()).unwrap_or(0);
            let location_type_str = obj
                .get("location_type")
                .and_then(|v| v.as_str())
                .unwrap_or("station");
            let implants = obj
                .get("implants")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_i64()).collect::<Vec<_>>())
                .unwrap_or_default();

            let _location_name = resolve_clone_location(
                &pool,
                &client,
                location_type_str,
                location_id,
                character_id,
                &rate_limits,
            )
            .await
            .unwrap_or_else(|_| "Unknown Location".to_string());

            clones_to_store.push((
                clone_id,
                None,
                location_type_str.to_string(),
                location_id,
                false,
                implants,
            ));
        }
    }

    let mut current_implants_sorted = current_implants.clone();
    current_implants_sorted.sort();

    if !current_implants_sorted.is_empty() {
        let matched_clone_id =
            db::find_clone_by_implants(&pool, character_id, &current_implants_sorted)
                .await
                .map_err(|e| format!("Failed to find clone by implants: {}", e))?;

        if let Some(matched_id) = matched_clone_id {
            matched_clone_id_for_current = Some(matched_id);

            if let Some(home_location) = &clones_data.home_location {
                if let (Some(location_id), Some(location_type)) = (
                    home_location.location_id,
                    home_location.location_type.as_ref(),
                ) {
                    let location_type_str = match location_type {
                        esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Station => {
                            "station"
                        }
                        esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Structure => {
                            "structure"
                        }
                    };

                    let _location_name = resolve_clone_location(
                        &pool,
                        &client,
                        location_type_str,
                        location_id,
                        character_id,
                        &rate_limits,
                    )
                    .await
                    .unwrap_or_else(|_| "Unknown Location".to_string());

                    matched_clone_location_update =
                        Some((location_type_str.to_string(), location_id));
                }
            }
        } else if let Some(home_location) = &clones_data.home_location {
            let existing_null_clone =
                db::find_clone_by_implants(&pool, character_id, &current_implants_sorted)
                    .await
                    .ok()
                    .flatten();

            let null_clone_id = if let Some(id) = existing_null_clone {
                sqlx::query_scalar::<_, Option<i64>>(
                    "SELECT clone_id FROM clones WHERE id = ? AND clone_id IS NULL",
                )
                .bind(id)
                .fetch_optional(&*pool)
                .await
                .ok()
                .flatten()
                .map(|_| id)
            } else {
                None
            };

            if let Some(existing_id) = null_clone_id {
                matched_clone_id_for_current = Some(existing_id);
                if let (Some(location_id), Some(location_type)) = (
                    home_location.location_id,
                    home_location.location_type.as_ref(),
                ) {
                    let location_type_str = match location_type {
                        esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Station => {
                            "station"
                        }
                        esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Structure => {
                            "structure"
                        }
                    };

                    let _location_name = resolve_clone_location(
                        &pool,
                        &client,
                        location_type_str,
                        location_id,
                        character_id,
                        &rate_limits,
                    )
                    .await
                    .unwrap_or_else(|_| "Unknown Location".to_string());

                    matched_clone_location_update =
                        Some((location_type_str.to_string(), location_id));
                }
            } else if let (Some(location_id), Some(location_type)) = (
                home_location.location_id,
                home_location.location_type.as_ref(),
            ) {
                let location_type_str = match location_type {
                    esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Station => {
                        "station"
                    }
                    esi::CharactersCharacterIdClonesGetHomeLocationLocationType::Structure => {
                        "structure"
                    }
                };

                let _location_name = resolve_clone_location(
                    &pool,
                    &client,
                    location_type_str,
                    location_id,
                    character_id,
                    &rate_limits,
                )
                .await
                .unwrap_or_else(|_| "Unknown Location".to_string());

                clones_to_store.push((
                    None,
                    None,
                    location_type_str.to_string(),
                    location_id,
                    true,
                    current_implants_sorted,
                ));
            }
        }
    }

    db::set_character_clones(&pool, character_id, &clones_to_store)
        .await
        .map_err(|e| format!("Failed to store clones: {}", e))?;

    if let Some(matched_id) = matched_clone_id_for_current {
        if let Some((location_type, location_id)) = matched_clone_location_update {
            sqlx::query(
                "UPDATE clones SET location_type = ?, location_id = ?, is_current = 1 WHERE id = ?",
            )
            .bind(location_type)
            .bind(location_id)
            .bind(matched_id)
            .execute(&*pool)
            .await
            .map_err(|e| format!("Failed to update matched clone: {}", e))?;
        } else {
            sqlx::query("UPDATE clones SET is_current = 1 WHERE id = ?")
                .bind(matched_id)
                .execute(&*pool)
                .await
                .map_err(|e| format!("Failed to update matched clone: {}", e))?;
        }
    }

    let stored_clones = db::get_character_clones(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get stored clones: {}", e))?;

    let mut result = Vec::new();
    for clone in stored_clones {
        let implants: Vec<CloneImplantResponse> = db::get_clone_implants(&pool, clone.id)
            .await
            .map_err(|e| format!("Failed to get clone implants: {}", e))?
            .into_iter()
            .map(|i| CloneImplantResponse {
                implant_type_id: i.implant_type_id,
                slot: i.slot,
            })
            .collect();

        result.push(CloneResponse {
            id: clone.id,
            character_id: clone.character_id,
            clone_id: clone.clone_id,
            name: clone.name,
            location_type: clone.location_type,
            location_id: clone.location_id,
            location_name: clone.location_name.unwrap_or_else(|| "Unknown".to_string()),
            is_current: clone.is_current,
            implants,
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn update_clone_name(
    pool: State<'_, db::Pool>,
    clone_id: i64,
    name: Option<String>,
) -> Result<(), String> {
    db::update_clone_name(&pool, clone_id, name.as_deref())
        .await
        .map_err(|e| format!("Failed to update clone name: {}", e))?;
    Ok(())
}
