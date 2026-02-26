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
        return Err(format!("MISSING_SCOPE: {}", missing_scopes[0].as_str()));
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

    let location = location_res.map_err(|e| format!("Failed to fetch location: {}", e))?
        .ok_or_else(|| "No location data found".to_string())?;
    let ship = ship_res.map_err(|e| format!("Failed to fetch ship: {}", e))?
        .ok_or_else(|| "No ship data found".to_string())?;
    let online = online_res.map_err(|e| format!("Failed to fetch online status: {}", e))?
        .ok_or_else(|| "No online status data found".to_string())?;

    // Resolve system name
    let system_info = esi_helpers::get_cached_solar_system_info(&pool, &client, location.solar_system_id, &rate_limits)
        .await
        .map_err(|e| format!("Failed to fetch system info: {}", e))?
        .ok_or_else(|| "No system info found".to_string())?;

    // Resolve ship type name
    let type_names = utils::get_type_names(&pool, &[ship.ship_type_id])
        .await?;
    let ship_type_name = type_names.get(&ship.ship_type_id)
        .cloned()
        .unwrap_or_else(|| "Unknown Ship Type".to_string());

    // Resolve station/structure name
    let mut station_name = None;
    if let Some(station_id) = location.station_id {
        if let Ok(Some(station)) = db::get_station(&pool, station_id).await {
            station_name = Some(station.name);
        } else if let Ok(Some(station_info)) = esi_helpers::get_cached_station_info(&pool, &client, station_id, &rate_limits).await {
            station_name = Some(station_info.name.clone());
            let _ = db::upsert_station(&pool, station_id, &station_info.name, station_info.system_id, station_info.owner).await;
        }
    }

    let mut structure_name = None;
    if let Some(structure_id) = location.structure_id {
        if let Ok(Some(structure)) = db::get_structure(&pool, structure_id).await {
            structure_name = Some(structure.name);
        } else if let Ok(Some(structure_info)) = esi_helpers::get_cached_structure_info(&pool, &client, structure_id, &rate_limits).await {
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
