use futures_util::future::join_all;
use serde::Serialize;
use tauri::State;

use crate::auth;
use crate::db;
use crate::esi::{self, EsiScope};
use crate::esi_helpers;
use crate::utils;

#[derive(Debug, Clone, Serialize)]
pub struct CharacterLocation {
    pub solar_system_id: i64,
    pub solar_system_name: String,
    pub station_id: Option<i64>,
    pub station_name: Option<String>,
    pub structure_id: Option<i64>,
    pub structure_name: Option<String>,
    pub ship_type_id: i64,
    pub ship_type_name: String,
    pub ship_name: String,
    pub is_online: bool,
    pub last_login: Option<String>,
    pub last_logout: Option<String>,
}

#[tauri::command]
pub async fn get_character_location(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
    character_id: i64,
) -> Result<CharacterLocation, String> {
    let required_scopes = [
        EsiScope::ReadLocationV1,
        EsiScope::ReadOnlineV1,
        EsiScope::ReadShipTypeV1,
    ];

    let missing_scopes = auth::check_token_scopes(&pool, character_id, &required_scopes)
        .await
        .map_err(|e| format!("Auth error: {}", e))?;

    if !missing_scopes.is_empty() {
        return Err("Character is missing ESI scopes for Locations.".to_string());
    }

    let access_token = auth::ensure_valid_access_token(&pool, character_id)
        .await
        .map_err(|e| format!("Failed to get access token: {}", e))?;

    let client = esi_helpers::create_authenticated_client(&access_token)
        .map_err(|e| format!("Failed to create client: {}", e))?;

    // Fetch all three pieces of data in parallel
    let (location_res, ship_res, online_res) = tokio::join!(
        esi_helpers::get_cached_character_location(&pool, &client, character_id, &rate_limits),
        esi_helpers::get_cached_character_ship(&pool, &client, character_id, &rate_limits),
        esi_helpers::get_cached_character_online(&pool, &client, character_id, &rate_limits),
    );

    let location = location_res
        .map_err(|e| format!("Failed to fetch location: {}", e))?
        .ok_or_else(|| "No location data found".to_string())?;
    let ship = ship_res
        .map_err(|e| format!("Failed to fetch ship: {}", e))?
        .ok_or_else(|| "No ship data found".to_string())?;
    let online = online_res
        .map_err(|e| format!("Failed to fetch online status: {}", e))?
        .ok_or_else(|| "No online status data found".to_string())?;

    // Resolve system name
    let system_info = esi_helpers::get_cached_solar_system_info(
        &pool,
        &client,
        location.solar_system_id,
        &rate_limits,
    )
    .await
    .map_err(|e| format!("Failed to fetch system info: {}", e))?
    .ok_or_else(|| "No system info found".to_string())?;

    // Resolve ship type name
    let type_names = utils::get_type_names(&pool, &[ship.ship_type_id]).await?;
    let ship_type_name = type_names
        .get(&ship.ship_type_id)
        .cloned()
        .unwrap_or_else(|| "Unknown Ship Type".to_string());

    // Resolve station/structure name
    let mut station_name = None;
    if let Some(station_id) = location.station_id {
        if let Ok(Some(station)) = db::get_station(&pool, station_id).await {
            station_name = Some(station.name);
        } else if let Ok(Some(station_info)) =
            esi_helpers::get_cached_station_info(&pool, &client, station_id, &rate_limits).await
        {
            station_name = Some(station_info.name.clone());
            let _ = db::upsert_station(
                &pool,
                station_id,
                &station_info.name,
                station_info.system_id,
                Some(station_info.type_id),
                station_info.owner,
            )
            .await;
        }
    }

    let mut structure_name = None;
    if let Some(structure_id) = location.structure_id {
        if let Ok(Some(structure)) = db::get_structure(&pool, structure_id).await {
            structure_name = Some(structure.name);
        } else if let Ok(Some(structure_info)) =
            esi_helpers::get_cached_structure_info(&pool, &client, structure_id, &rate_limits).await
        {
            structure_name = Some(structure_info.name.clone());
            let _ = db::upsert_structure(
                &pool,
                structure_id,
                &structure_info.name,
                structure_info.solar_system_id,
                structure_info.type_id,
                structure_info.owner_id,
            )
            .await;
        }
    }

    Ok(CharacterLocation {
        solar_system_id: location.solar_system_id,
        solar_system_name: system_info.name,
        station_id: location.station_id,
        station_name,
        structure_id: location.structure_id,
        structure_name,
        ship_type_id: ship.ship_type_id,
        ship_type_name,
        ship_name: ship.ship_name,
        is_online: online.online,
        last_login: online.last_login.map(|d| d.to_rfc3339()),
        last_logout: online.last_logout.map(|d| d.to_rfc3339()),
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct ImplantInfo {
    pub type_id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CharacterLocationOverview {
    pub character_id: i64,
    pub character_name: String,
    pub has_location_scope: bool,
    pub is_online: Option<bool>,
    pub is_docked: Option<bool>,
    pub solar_system_name: Option<String>,
    pub region_name: Option<String>,
    pub station_id: Option<i64>,
    pub station_name: Option<String>,
    pub structure_id: Option<i64>,
    pub structure_name: Option<String>,
    /// The type_id of the station or structure the character is docked in (for image rendering)
    pub structure_type_id: Option<i64>,
    pub ship_type_id: Option<i64>,
    pub ship_type_name: Option<String>,
    pub ship_name: Option<String>,
    pub implants: Vec<ImplantInfo>,
}

const LOCATION_SCOPES: [EsiScope; 3] = [
    EsiScope::ReadLocationV1,
    EsiScope::ReadOnlineV1,
    EsiScope::ReadShipTypeV1,
];

#[tauri::command]
pub async fn get_all_characters_locations(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>,
) -> Result<Vec<CharacterLocationOverview>, String> {
    let characters = db::get_all_characters(&pool)
        .await
        .map_err(|e| format!("Failed to get characters: {}", e))?;

    let mut tasks = Vec::new();

    for character in characters {
        let pool = pool.inner().clone();
        let rate_limits = rate_limits.inner().clone();
        let char_id = character.character_id;
        let character_name = character.character_name.clone();

        tasks.push(tokio::spawn(async move {
            // Check if character has location scopes
            let missing_scopes = auth::check_token_scopes(&pool, char_id, &LOCATION_SCOPES)
                .await
                .map_err(|e| format!("Auth error for {}: {}", character_name, e))?;

            if !missing_scopes.is_empty() {
                return Ok(CharacterLocationOverview {
                    character_id: char_id,
                    character_name,
                    has_location_scope: false,
                    is_online: None,
                    is_docked: None,
                    solar_system_name: None,
                    region_name: None,
                    station_id: None,
                    station_name: None,
                    structure_id: None,
                    structure_name: None,
                    structure_type_id: None,
                    ship_type_id: None,
                    ship_type_name: None,
                    ship_name: None,
                    implants: vec![],
                });
            }

            let access_token = auth::ensure_valid_access_token(&pool, char_id)
                .await
                .map_err(|e| format!("Failed to get token for {}: {}", character_name, e))?;

            let client = esi_helpers::create_authenticated_client(&access_token)
                .map_err(|e| format!("Failed to create client for {}: {}", character_name, e))?;

            // Fetch location, ship, online status, and implants in parallel
            let (location_res, ship_res, online_res, implants_res) = tokio::join!(
                esi_helpers::get_cached_character_location(&pool, &client, char_id, &rate_limits),
                esi_helpers::get_cached_character_ship(&pool, &client, char_id, &rate_limits),
                esi_helpers::get_cached_character_online(&pool, &client, char_id, &rate_limits),
                esi_helpers::get_cached_character_implants(&pool, &client, char_id, &rate_limits),
            );

            let location = location_res
                .map_err(|e| format!("Failed to fetch location for {}: {}", character_name, e))?
                .ok_or_else(|| format!("No location data for {}", character_name))?;
            let ship = ship_res
                .map_err(|e| format!("Failed to fetch ship for {}: {}", character_name, e))?
                .ok_or_else(|| format!("No ship data for {}", character_name))?;
            let online = online_res
                .map_err(|e| {
                    format!(
                        "Failed to fetch online status for {}: {}",
                        character_name, e
                    )
                })?
                .ok_or_else(|| format!("No online status for {}", character_name))?;
            let implant_ids = implants_res
                .map_err(|e| format!("Failed to fetch implants for {}: {}", character_name, e))?
                .unwrap_or_default();

            // Resolve system → constellation → region
            let system_info = esi_helpers::get_cached_solar_system_info(
                &pool,
                &client,
                location.solar_system_id,
                &rate_limits,
            )
            .await
            .map_err(|e| format!("Failed to fetch system info for {}: {}", character_name, e))?
            .ok_or_else(|| format!("No system info for {}", character_name))?;

            let region_name = if let Ok(Some(constellation)) =
                esi_helpers::get_cached_constellation_info(
                    &pool,
                    &client,
                    system_info.constellation_id,
                    &rate_limits,
                )
                .await
            {
                if let Ok(Some(region)) = esi_helpers::get_cached_region_info(
                    &pool,
                    &client,
                    constellation.region_id,
                    &rate_limits,
                )
                .await
                {
                    Some(region.name)
                } else {
                    None
                }
            } else {
                None
            };

            // Resolve ship type name
            let type_names = utils::get_type_names(&pool, &[ship.ship_type_id]).await?;
            let ship_type_name = type_names.get(&ship.ship_type_id).cloned();

            // Resolve station or structure name
            let mut station_name = None;
            let mut structure_type_id: Option<i64> = None;
            if let Some(station_id) = location.station_id {
                if let Ok(Some(station)) = db::get_station(&pool, station_id).await {
                    station_name = Some(station.name);
                    structure_type_id = station.type_id;
                } else if let Ok(Some(station_info)) =
                    esi_helpers::get_cached_station_info(&pool, &client, station_id, &rate_limits)
                        .await
                {
                    station_name = Some(station_info.name.clone());
                    structure_type_id = Some(station_info.type_id);
                    let _ = db::upsert_station(
                        &pool,
                        station_id,
                        &station_info.name,
                        station_info.system_id,
                        Some(station_info.type_id),
                        station_info.owner,
                    )
                    .await;
                }
            }

            let mut structure_name = None;
            if let Some(structure_id) = location.structure_id {
                if let Ok(Some(structure)) = db::get_structure(&pool, structure_id).await {
                    structure_name = Some(structure.name);
                    structure_type_id = structure.type_id;
                } else if let Ok(Some(structure_info)) = esi_helpers::get_cached_structure_info(
                    &pool,
                    &client,
                    structure_id,
                    &rate_limits,
                )
                .await
                {
                    structure_name = Some(structure_info.name.clone());
                    structure_type_id = structure_info.type_id;
                    let _ = db::upsert_structure(
                        &pool,
                        structure_id,
                        &structure_info.name,
                        structure_info.solar_system_id,
                        structure_info.type_id,
                        structure_info.owner_id,
                    )
                    .await;
                }
            }

            // Resolve implant names
            let implant_names = utils::get_type_names(&pool, &implant_ids).await?;
            let implants = implant_ids
                .iter()
                .map(|&type_id| ImplantInfo {
                    type_id,
                    name: implant_names
                        .get(&type_id)
                        .cloned()
                        .unwrap_or_else(|| format!("Unknown Implant {}", type_id)),
                })
                .collect();

            let is_docked = location.station_id.is_some() || location.structure_id.is_some();

            Ok(CharacterLocationOverview {
                character_id: char_id,
                character_name,
                has_location_scope: true,
                is_online: Some(online.online),
                is_docked: Some(is_docked),
                solar_system_name: Some(system_info.name),
                region_name,
                station_id: location.station_id,
                station_name,
                structure_id: location.structure_id,
                structure_name,
                structure_type_id,
                ship_type_id: Some(ship.ship_type_id),
                ship_type_name,
                ship_name: Some(ship.ship_name),
                implants,
            })
        }));
    }

    let task_results = join_all(tasks).await;
    let mut results = Vec::new();

    for task_res in task_results {
        match task_res {
            Ok(Ok(overview)) => results.push(overview),
            Ok(Err(e)) => return Err(e),
            Err(e) => return Err(format!("Task panicked: {}", e)),
        }
    }

    results.sort_by(|a, b| {
        let group = |c: &CharacterLocationOverview| -> u8 {
            if !c.has_location_scope {
                3
            } else if c.is_online == Some(true) {
                0
            } else if c.is_docked == Some(false) {
                1
            } else {
                2
            }
        };
        group(a)
            .cmp(&group(b))
            .then_with(|| a.character_name.cmp(&b.character_name))
    });

    Ok(results)
}
