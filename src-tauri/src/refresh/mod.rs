use std::collections::HashMap;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Notify;
use tokio::time::Duration;
use tokio_util::sync::CancellationToken;

use crate::{auth, cache, db, esi, esi_helpers, notifications};

pub mod events;

pub struct RefresherHandle {
    pub handle: tokio::task::JoinHandle<()>,
    pub cancel: CancellationToken,
    pub poke: Arc<Notify>,
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

                // Queue
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
                        let payload = events::QueuePayload {
                            character_id: character_id as i32,
                            queue: queue_data
                                .into_iter()
                                .map(|item| events::SkillQueueItem {
                                    skill_id: item.skill_id as i32,
                                    finished_level: item.finished_level as i32,
                                    queue_position: item.queue_position as i32,
                                    start_date: item.start_date.map(|d| d.to_rfc3339()),
                                    finish_date: item.finish_date.map(|d| d.to_rfc3339()),
                                    training_start_sp: item.training_start_sp.map(|v| v as i32),
                                    level_start_sp: item.level_start_sp.map(|v| v as i32),
                                    level_end_sp: item.level_end_sp.map(|v| v as i32),
                                })
                                .collect(),
                        };
                        if let Err(e) =
                            app_handle.emit(&format!("character:{}:queue", character_id), &payload)
                        {
                            eprintln!("refresh: emit error queue {}: {}", character_id, e);
                        }
                    }
                    Ok(None) => {}
                    Err(e) => eprintln!("refresh: fetch error queue {}: {}", character_id, e),
                }

                // Skills
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
                        let payload = events::SkillsPayload {
                            character_id: character_id as i32,
                            skills: events::SkillsData {
                                skills: skills_data
                                    .skills
                                    .into_iter()
                                    .map(|s| events::SkillItem {
                                        skill_id: s.skill_id as i32,
                                        active_skill_level: s.active_skill_level as i32,
                                        skillpoints_in_skill: s.skillpoints_in_skill as i32,
                                        trained_skill_level: s.trained_skill_level as i32,
                                    })
                                    .collect(),
                                total_sp: skills_data.total_sp as i32,
                                unallocated_sp: skills_data.unallocated_sp.map(|v| v as i32),
                            },
                        };
                        if let Err(e) =
                            app_handle.emit(&format!("character:{}:skills", character_id), &payload)
                        {
                            eprintln!("refresh: emit error skills {}: {}", character_id, e);
                        }
                    }
                    Ok(None) => {}
                    Err(e) => eprintln!("refresh: fetch error skills {}: {}", character_id, e),
                }

                // Attributes
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
                        let payload = events::AttributesPayload {
                            character_id: character_id as i32,
                            attributes: events::AttributesData {
                                charisma: attrs.charisma as i32,
                                intelligence: attrs.intelligence as i32,
                                memory: attrs.memory as i32,
                                perception: attrs.perception as i32,
                                willpower: attrs.willpower as i32,
                                bonus_remaps: attrs.bonus_remaps.map(|v| v as i32),
                                last_remap_date: attrs.last_remap_date.map(|d| d.to_rfc3339()),
                                accrued_remap_cooldown_date: attrs
                                    .accrued_remap_cooldown_date
                                    .map(|d| d.to_rfc3339()),
                            },
                        };
                        if let Err(e) = app_handle
                            .emit(&format!("character:{}:attributes", character_id), &payload)
                        {
                            eprintln!("refresh: emit error attributes {}: {}", character_id, e);
                        }
                    }
                    Ok(None) => {}
                    Err(e) => eprintln!("refresh: fetch error attributes {}: {}", character_id, e),
                }

                // Location
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
                        let payload = events::LocationPayload {
                            character_id: character_id as i32,
                            location: events::LocationData {
                                solar_system_id: loc.solar_system_id as i32,
                                station_id: loc.station_id.map(|v| v as i32),
                                structure_id: loc.structure_id.map(|v| v as i32),
                            },
                        };
                        if let Err(e) = app_handle
                            .emit(&format!("character:{}:location", character_id), &payload)
                        {
                            eprintln!("refresh: emit error location {}: {}", character_id, e);
                        }
                    }
                    Ok(None) => {}
                    Err(e) => eprintln!("refresh: fetch error location {}: {}", character_id, e),
                }

                // Clones
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
                        let payload = events::ClonesPayload {
                            character_id: character_id as i32,
                            clones: events::ClonesData {
                                home_location: clones_data.home_location.map(|hl| {
                                    events::HomeLocationData {
                                        location_id: hl.location_id.map(|v| v as i32),
                                        location_type: hl
                                            .location_type
                                            .map(|lt| format!("{:?}", lt)),
                                    }
                                }),
                                last_clone_jump_date: clones_data
                                    .last_clone_jump_date
                                    .map(|d| d.to_rfc3339()),
                                last_station_change_date: clones_data
                                    .last_station_change_date
                                    .map(|d| d.to_rfc3339()),
                            },
                        };
                        if let Err(e) =
                            app_handle.emit(&format!("character:{}:clones", character_id), &payload)
                        {
                            eprintln!("refresh: emit error clones {}: {}", character_id, e);
                        }
                    }
                    Ok(None) => {}
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
                let data_types = ["queue", "skills", "attributes", "clones", "location"];
                let ctx = notifications::NotificationContext {
                    app: &app_handle,
                    pool: &pool,
                    rate_limits: &rate_limits,
                };
                for data_type in &data_types {
                    if let Err(e) = notification_processor
                        .process_data_updated(&ctx, data_type, character_id)
                        .await
                    {
                        eprintln!(
                            "refresh: notification error for {} ({}): {}",
                            character_id, data_type, e
                        );
                    }
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
                let secs_until = (min_expires - now).max(30).min(3600);
                let jitter_range = secs_until / 10;
                let jitter =
                    rand::random::<i64>().abs() % (jitter_range.max(1) * 2) - jitter_range.max(1);
                let sleep_secs = (secs_until + jitter).max(30).min(3600) as u64;

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
                handle,
                cancel,
                poke,
            },
        );
    }

    pub fn cancel_character(&mut self, character_id: i64) {
        if let Some(handle) = self.handles.remove(&character_id) {
            handle.cancel.cancel();
        }
    }

    pub fn cancel_all(&mut self) {
        for (_, handle) in self.handles.drain() {
            handle.cancel.cancel();
        }
    }

    pub fn poke(&self, character_id: i64) {
        if let Some(handle) = self.handles.get(&character_id) {
            handle.poke.notify_one();
        }
    }
}
