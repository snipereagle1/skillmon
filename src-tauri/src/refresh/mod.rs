use std::collections::HashMap;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Notify;
use tokio::time::Duration;
use tokio_util::sync::CancellationToken;

use rand::Rng;

use crate::{auth, cache, db, esi, esi_helpers, notifications};

pub mod enrichment;
pub mod events;

pub struct RefresherHandle {
    pub cancel: CancellationToken,
    pub poke: Arc<Notify>,
    pub join_handle: tokio::task::JoinHandle<()>,
}

pub struct RefreshSupervisor {
    handles: HashMap<i64, RefresherHandle>,
}

impl RefreshSupervisor {
    pub fn new() -> Self {
        Self {
            handles: HashMap::new(),
        }
    }

    pub fn spawn_character(
        &mut self,
        character_id: i64,
        pool: db::Pool,
        app_handle: tauri::AppHandle,
        rate_limits: esi::RateLimitStore,
    ) {
        let cancel = CancellationToken::new();
        let poke = Arc::new(Notify::new());
        let cancel_clone = cancel.clone();
        let poke_clone = poke.clone();

        let handle = tokio::spawn(async move {
            let notification_processor = notifications::NotificationProcessor::new();

            // Per-character last-known location IDs for ESI name resolution gating
            let mut last_location_ids = enrichment::LocationIds::none();

            loop {
                if cancel_clone.is_cancelled() {
                    return;
                }

                let access_token = match auth::ensure_valid_access_token(&pool, character_id).await
                {
                    Ok(token) => token,
                    Err(e) => {
                        eprintln!("refresh: token error for {}: {}", character_id, e);
                        tokio::select! {
                            _ = tokio::time::sleep(Duration::from_secs(300)) => {}
                            _ = poke_clone.notified() => {}
                            _ = cancel_clone.cancelled() => { return; }
                        }
                        continue;
                    }
                };

                let client = match esi_helpers::create_authenticated_client(&access_token) {
                    Ok(c) => c,
                    Err(e) => {
                        eprintln!("refresh: client error for {}: {}", character_id, e);
                        tokio::select! {
                            _ = tokio::time::sleep(Duration::from_secs(300)) => {}
                            _ = poke_clone.notified() => {}
                            _ = cancel_clone.cancelled() => { return; }
                        }
                        continue;
                    }
                };

                let mut any_success = false;
                let mut queue_skill_ids: Vec<i64> = vec![];
                let queue_now = chrono::Utc::now();

                // ── Queue ─────────────────────────────────────────────────────
                match esi_helpers::get_cached_skill_queue(
                    &pool,
                    &client,
                    character_id,
                    &rate_limits,
                )
                .await
                {
                    Ok(Some(queue_data)) => {
                        any_success = true;
                        queue_skill_ids = queue_data
                            .iter()
                            .filter(|item| {
                                item.finish_date.map(|fd| queue_now < fd).unwrap_or(true)
                            })
                            .map(|item| item.skill_id)
                            .collect();
                        let payload =
                            enrichment::enrich_queue(&pool, character_id, queue_data).await;
                        if let Err(e) =
                            app_handle.emit(&format!("character:{}:queue", character_id), &payload)
                        {
                            eprintln!("refresh: emit error queue {}: {}", character_id, e);
                        }
                    }
                    Ok(None) => {
                        if let Some(payload) =
                            enrichment::enrich_queue_from_db(&pool, character_id).await
                        {
                            if let Err(e) = app_handle
                                .emit(&format!("character:{}:queue", character_id), &payload)
                            {
                                eprintln!(
                                    "refresh: emit error queue (cached) {}: {}",
                                    character_id, e
                                );
                            }
                        }
                    }
                    Err(e) => eprintln!("refresh: fetch error queue {}: {}", character_id, e),
                }

                // ── Skills ────────────────────────────────────────────────────
                match esi_helpers::get_cached_character_skills(
                    &pool,
                    &client,
                    character_id,
                    &rate_limits,
                )
                .await
                {
                    Ok(Some(skills_data)) => {
                        any_success = true;
                        let payload = enrichment::enrich_skills(
                            &pool,
                            character_id,
                            &skills_data,
                            &queue_skill_ids,
                        )
                        .await;
                        if let Err(e) =
                            app_handle.emit(&format!("character:{}:skills", character_id), &payload)
                        {
                            eprintln!("refresh: emit error skills {}: {}", character_id, e);
                        }
                    }
                    Ok(None) => {
                        if let Some(payload) =
                            enrichment::enrich_skills_from_db(&pool, character_id).await
                        {
                            if let Err(e) = app_handle
                                .emit(&format!("character:{}:skills", character_id), &payload)
                            {
                                eprintln!(
                                    "refresh: emit error skills (cached) {}: {}",
                                    character_id, e
                                );
                            }
                        }
                    }
                    Err(e) => eprintln!("refresh: fetch error skills {}: {}", character_id, e),
                }

                // ── Attributes ────────────────────────────────────────────────
                match esi_helpers::get_cached_character_attributes(
                    &pool,
                    &client,
                    character_id,
                    &rate_limits,
                )
                .await
                {
                    Ok(Some(attrs)) => {
                        any_success = true;
                        let payload =
                            enrichment::enrich_attributes(&pool, character_id, &attrs).await;
                        if let Err(e) = app_handle
                            .emit(&format!("character:{}:attributes", character_id), &payload)
                        {
                            eprintln!("refresh: emit error attributes {}: {}", character_id, e);
                        }
                    }
                    Ok(None) => {
                        if let Some(payload) =
                            enrichment::enrich_attributes_from_db(&pool, character_id).await
                        {
                            if let Err(e) = app_handle
                                .emit(&format!("character:{}:attributes", character_id), &payload)
                            {
                                eprintln!(
                                    "refresh: emit error attributes (cached) {}: {}",
                                    character_id, e
                                );
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("refresh: fetch error attributes {}: {}", character_id, e)
                    }
                }

                // ── Location ──────────────────────────────────────────────────
                match esi_helpers::get_cached_character_location(
                    &pool,
                    &client,
                    character_id,
                    &rate_limits,
                )
                .await
                {
                    Ok(Some(loc)) => {
                        any_success = true;
                        if let Some(payload) = enrichment::enrich_location(
                            &pool,
                            &client,
                            character_id,
                            &rate_limits,
                            &last_location_ids,
                        )
                        .await
                        {
                            last_location_ids = enrichment::LocationIds {
                                solar_system_id: Some(loc.solar_system_id),
                                station_id: loc.station_id,
                                structure_id: loc.structure_id,
                            };
                            if let Err(e) = app_handle
                                .emit(&format!("character:{}:location", character_id), &payload)
                            {
                                eprintln!("refresh: emit error location {}: {}", character_id, e);
                            }
                        }
                    }
                    Ok(None) => {
                        if let Some(payload) =
                            enrichment::enrich_location_db_only(&pool, character_id).await
                        {
                            if let Err(e) = app_handle
                                .emit(&format!("character:{}:location", character_id), &payload)
                            {
                                eprintln!(
                                    "refresh: emit error location (cached) {}: {}",
                                    character_id, e
                                );
                            }
                        }
                    }
                    Err(e) => eprintln!("refresh: fetch error location {}: {}", character_id, e),
                }

                // ── Clones ────────────────────────────────────────────────────
                match esi_helpers::get_cached_character_clones(
                    &pool,
                    &client,
                    character_id,
                    &rate_limits,
                )
                .await
                {
                    Ok(Some(clones_data)) => {
                        any_success = true;
                        if let Err(e) = crate::clone_sync::sync_character_clones_to_db(
                            &pool,
                            &client,
                            character_id,
                            &rate_limits,
                            &clones_data,
                        )
                        .await
                        {
                            eprintln!("refresh: clone DB sync {}: {}", character_id, e);
                        } else {
                            let payload = enrichment::enrich_clones(&pool, character_id).await;
                            if let Err(e) = app_handle
                                .emit(&format!("character:{}:clones", character_id), &payload)
                            {
                                eprintln!("refresh: emit error clones {}: {}", character_id, e);
                            }
                        }
                    }
                    Ok(None) => {
                        let payload = enrichment::enrich_clones(&pool, character_id).await;
                        if !payload.clones.is_empty() {
                            if let Err(e) = app_handle
                                .emit(&format!("character:{}:clones", character_id), &payload)
                            {
                                eprintln!(
                                    "refresh: emit error clones (cached) {}: {}",
                                    character_id, e
                                );
                            }
                        }
                    }
                    Err(e) => eprintln!("refresh: fetch error clones {}: {}", character_id, e),
                }

                if !any_success {
                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_secs(300)) => {}
                        _ = poke_clone.notified() => {}
                        _ = cancel_clone.cancelled() => { return; }
                    }
                    continue;
                }

                // Process notifications for each fetched resource type
                let data_types = [
                    notifications::DataType::SkillQueue,
                    notifications::DataType::Skills,
                    notifications::DataType::Attributes,
                    notifications::DataType::Clones,
                    notifications::DataType::Location,
                ];
                let ctx = notifications::NotificationContext {
                    app: &app_handle,
                    pool: &pool,
                    rate_limits: &rate_limits,
                };
                for data_type in data_types {
                    if let Err(e) = notification_processor
                        .process_data_updated(&ctx, data_type, character_id)
                        .await
                    {
                        eprintln!(
                            "refresh: notification error for {} ({:?}): {}",
                            character_id, data_type, e
                        );
                    }
                }

                // ── Overview ─────────────────────────────────────────────────
                let overview_row = enrichment::compute_overview_row(&pool, character_id).await;
                if let Err(e) = app_handle.emit(
                    &format!("character:{}:overview", character_id),
                    &overview_row,
                ) {
                    eprintln!("refresh: emit error overview {}: {}", character_id, e);
                }

                let endpoints = [
                    format!("characters/{}/skillqueue", character_id),
                    format!("characters/{}/attributes", character_id),
                    format!("characters/{}/skills", character_id),
                    format!("characters/{}/clones", character_id),
                    format!("characters/{}/location", character_id),
                ];

                let mut expires_list: Vec<i64> = Vec::new();
                for endpoint in &endpoints {
                    let key = cache::build_cache_key(endpoint, character_id);
                    if let Ok(Some(entry)) = cache::get_cached_response(&pool, &key).await {
                        expires_list.push(entry.expires_at);
                    }
                }

                let now = chrono::Utc::now().timestamp();
                let min_expires = expires_list.into_iter().min().unwrap_or(now + 300);
                let secs_until = (min_expires - now).clamp(30, 3600);
                let jitter_range = secs_until / 10;
                let jitter = rand::rng().random_range(-jitter_range.max(1)..=jitter_range.max(1));
                let sleep_secs = (secs_until + jitter).clamp(30, 3600) as u64;

                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(sleep_secs)) => {}
                    _ = poke_clone.notified() => {}
                    _ = cancel_clone.cancelled() => { return; }
                }
            }
        });

        self.handles.insert(
            character_id,
            RefresherHandle {
                cancel,
                poke,
                join_handle: handle,
            },
        );
    }

    pub fn cancel_character(&mut self, character_id: i64) -> Option<tokio::task::JoinHandle<()>> {
        self.handles.remove(&character_id).map(|h| {
            h.cancel.cancel();
            h.join_handle
        })
    }

    pub fn cancel_all(&mut self) -> Vec<tokio::task::JoinHandle<()>> {
        self.handles
            .drain()
            .map(|(_, h)| {
                h.cancel.cancel();
                h.join_handle
            })
            .collect()
    }

    pub fn poke(&self, character_id: i64) {
        if let Some(handle) = self.handles.get(&character_id) {
            handle.poke.notify_one();
        }
    }
}
