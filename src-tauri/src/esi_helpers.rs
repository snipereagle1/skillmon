use anyhow::{Context, Result};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};

use crate::cache;
use crate::db;
use crate::esi;

pub fn create_authenticated_client(access_token: &str) -> Result<reqwest::Client> {
    let mut headers = HeaderMap::new();
    let auth_value = HeaderValue::from_str(&format!("Bearer {}", access_token))
        .context("Invalid access token")?;
    headers.insert(AUTHORIZATION, auth_value);

    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .context("Failed to build HTTP client")
}

pub async fn get_cached_skill_queue(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<Vec<esi::CharactersSkillqueueSkill>>> {
    let endpoint_path = format!("characters/{}/skillqueue", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);
    esi::fetch_cached::<Vec<esi::CharactersSkillqueueSkill>>(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await
}

pub async fn get_cached_character_attributes(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdAttributesGet>> {
    let endpoint_path = format!("characters/{}/attributes", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    if let Some(data) = esi::fetch_cached::<esi::CharactersCharacterIdAttributesGet>(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await?
    {
        let attributes = db::CharacterAttributes {
            character_id,
            charisma: data.charisma,
            intelligence: data.intelligence,
            memory: data.memory,
            perception: data.perception,
            willpower: data.willpower,
            bonus_remaps: data.bonus_remaps,
            accrued_remap_cooldown_date: data
                .accrued_remap_cooldown_date
                .as_ref()
                .map(|d| d.to_rfc3339()),
            last_remap_date: data.last_remap_date.as_ref().map(|d| d.to_rfc3339()),
        };
        db::set_character_attributes(pool, &attributes).await.ok();

        Ok(Some(data))
    } else {
        Ok(None)
    }
}

pub async fn get_cached_character_skills(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersSkills>> {
    let endpoint_path = format!("characters/{}/skills", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);

    if let Some(data) = esi::fetch_cached::<esi::CharactersSkills>(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await?
    {
        let skills_data: Vec<(i64, i64, i64, i64)> = data
            .skills
            .iter()
            .map(|skill| {
                (
                    skill.skill_id,
                    skill.active_skill_level,
                    skill.skillpoints_in_skill,
                    skill.trained_skill_level,
                )
            })
            .collect();
        db::set_character_skills(pool, character_id, &skills_data)
            .await
            .ok();

        let unallocated_sp = data.unallocated_sp.unwrap_or(0);
        db::set_character_unallocated_sp(pool, character_id, unallocated_sp)
            .await
            .ok();

        Ok(Some(data))
    } else {
        Ok(None)
    }
}

pub async fn get_cached_character_clones(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdClonesGet>> {
    let endpoint_path = format!("characters/{}/clones", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);
    esi::fetch_cached(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await
}

pub async fn get_cached_character_implants(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdImplantsGet>> {
    let endpoint_path = format!("characters/{}/implants", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);
    esi::fetch_cached(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await
}

pub async fn get_cached_character_location(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdLocationGet>> {
    let endpoint_path = format!("characters/{}/location", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);
    esi::fetch_cached(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await
}

pub async fn get_cached_character_ship(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdShipGet>> {
    let endpoint_path = format!("characters/{}/ship", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);
    esi::fetch_cached(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await
}

pub async fn get_cached_character_online(
    pool: &db::Pool,
    client: &reqwest::Client,
    character_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::CharactersCharacterIdOnlineGet>> {
    let endpoint_path = format!("characters/{}/online", character_id);
    let cache_key = cache::build_cache_key(&endpoint_path, character_id);
    esi::fetch_cached(
        pool,
        client,
        &endpoint_path,
        &cache_key,
        rate_limits,
        character_id,
    )
    .await
}

pub async fn get_cached_solar_system_info(
    pool: &db::Pool,
    client: &reqwest::Client,
    solar_system_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::UniverseSystemsSystemIdGet>> {
    let endpoint_path = format!("universe/systems/{}", solar_system_id);
    let cache_key = format!("{}:0", endpoint_path);
    esi::fetch_cached(pool, client, &endpoint_path, &cache_key, rate_limits, 0).await
}

pub async fn get_cached_station_info(
    pool: &db::Pool,
    client: &reqwest::Client,
    station_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::UniverseStationsStationIdGet>> {
    let endpoint_path = format!("universe/stations/{}", station_id);
    let cache_key = format!("{}:0", endpoint_path);
    esi::fetch_cached(pool, client, &endpoint_path, &cache_key, rate_limits, 0).await
}

pub async fn get_cached_structure_info(
    pool: &db::Pool,
    client: &reqwest::Client,
    structure_id: i64,
    rate_limits: &esi::RateLimitStore,
) -> Result<Option<esi::UniverseStructuresStructureIdGet>> {
    let endpoint_path = format!("universe/structures/{}", structure_id);
    let cache_key = format!("{}:0", endpoint_path);
    esi::fetch_cached(pool, client, &endpoint_path, &cache_key, rate_limits, 0).await
}
