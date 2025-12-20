use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc,
};

use tauri::{Emitter, Listener, Manager, WindowEvent};

mod auth;
mod cache;
mod commands;
mod db;
mod esi;
mod esi_helpers;
mod sde;
mod skill_queue;
mod tray;
mod utils;

pub use commands::auth::AuthStateMap;
pub use skill_queue::NOTIFICATION_TYPE_SKILL_QUEUE_LOW;

type StartupState = Arc<AtomicU8>;

#[tauri::command]
async fn is_startup_complete(
    startup_state: tauri::State<'_, StartupState>,
) -> Result<bool, String> {
    Ok(startup_state.load(Ordering::SeqCst) == 0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            tauri::async_runtime::block_on(async {
                let pool = db::init_db(app.handle()).await?;
                app.manage(pool);
                app.manage(AuthStateMap::default());
                app.manage(Arc::new(tokio::sync::RwLock::new(
                    std::collections::HashMap::<
                        i64,
                        std::collections::HashMap<String, esi::RateLimitInfo>,
                    >::new(),
                )));

                let startup_state: StartupState = Arc::new(AtomicU8::new(1));
                app.manage(startup_state.clone());

                let pool_for_tray = app.state::<db::Pool>().inner().clone();
                let rate_limits_for_tray = app.state::<esi::RateLimitStore>().inner().clone();

                let training_count_item = tauri::menu::MenuItem::with_id(
                    app,
                    "training_count",
                    "0 characters training",
                    true,
                    None::<&str>,
                )?;
                let show_item =
                    tauri::menu::MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
                let quit_item =
                    tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

                let menu = tauri::menu::Menu::with_items(
                    app,
                    &[&training_count_item, &show_item, &quit_item],
                )?;

                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
                    .map_err(|e| anyhow::anyhow!("Failed to load tray icon: {}", e))?;

                let _tray = tauri::tray::TrayIconBuilder::new()
                    .icon(icon)
                    .menu(&menu)
                    .tooltip("skillmon")
                    .build(app)?;

                let training_count_item_clone = training_count_item.clone();
                let app_handle_for_updates = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    tray::update_tray_menu(
                        &app_handle_for_updates,
                        &pool_for_tray,
                        &rate_limits_for_tray,
                        &training_count_item_clone,
                    )
                    .await;

                    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
                    loop {
                        interval.tick().await;
                        tray::update_tray_menu(
                            &app_handle_for_updates,
                            &pool_for_tray,
                            &rate_limits_for_tray,
                            &training_count_item_clone,
                        )
                        .await;
                    }
                });

                let pool = app.state::<db::Pool>().inner().clone();
                let rate_limits = app.state::<esi::RateLimitStore>().inner().clone();
                let app_handle = app.handle().clone();
                let startup_state_clone = startup_state.clone();
                tauri::async_runtime::spawn(async move {
                    match sde::ensure_latest(&app_handle, &pool).await {
                        Ok(_) => eprintln!("SDE import completed successfully"),
                        Err(err) => eprintln!("SDE import failed: {:#}", err),
                    }

                    skill_queue::refresh_all_skill_queues(&app_handle, &pool, &rate_limits).await;

                    startup_state_clone.store(0, Ordering::SeqCst);
                    let _ = app_handle.emit("startup-complete", ());
                });

                let callback_url = std::env::var("EVE_CALLBACK_URL").unwrap_or_else(|_| {
                    if tauri::is_dev() {
                        "http://localhost:1421/callback".to_string()
                    } else {
                        "eveauth-skillmon://callback".to_string()
                    }
                });

                if callback_url.starts_with("http://") {
                    let app_handle = app.handle().clone();
                    let port = callback_url
                        .strip_prefix("http://localhost:")
                        .and_then(|s| s.split('/').next())
                        .and_then(|s| s.parse::<u16>().ok())
                        .unwrap_or(1421);

                    tauri::async_runtime::spawn(async move {
                        if let Err(e) =
                            auth::callback_server::CallbackServer::start(port, app_handle).await
                        {
                            eprintln!(
                                "Callback server error (this is OK if server already running): {}",
                                e
                            );
                        }
                    });
                }

                let app_handle = app.handle().clone();
                app_handle
                    .clone()
                    .listen("deep-link://new-url", move |event| {
                        let url_str = event.payload();
                        if url_str.starts_with("eveauth-skillmon://callback") {
                            let url = url::Url::parse(url_str).ok();
                            if let Some(url) = url {
                                let code = url
                                    .query_pairs()
                                    .find(|(key, _)| key == "code")
                                    .map(|(_, value)| value.to_string());
                                let state = url
                                    .query_pairs()
                                    .find(|(key, _)| key == "state")
                                    .map(|(_, value)| value.to_string());

                                if let (Some(code), Some(state)) = (code, state) {
                                    let app_handle = app_handle.clone();
                                    let callback_url = "eveauth-skillmon://callback".to_string();
                                    tauri::async_runtime::spawn(async move {
                                        if let Err(e) = commands::auth::handle_oauth_callback(
                                            app_handle.clone(),
                                            code,
                                            state,
                                            &callback_url,
                                        )
                                        .await
                                        {
                                            let _ = app_handle.emit("auth-error", e.to_string());
                                        }
                                    });
                                }
                            }
                        }
                    });

                Ok(())
            })
        })
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for arg in argv {
                if arg.starts_with("eveauth-skillmon://callback") {
                    if let Ok(url) = url::Url::parse(&arg) {
                        let code = url
                            .query_pairs()
                            .find(|(k, _)| k == "code")
                            .map(|(_, v)| v.to_string());
                        let state = url
                            .query_pairs()
                            .find(|(k, _)| k == "state")
                            .map(|(_, v)| v.to_string());

                        if let (Some(code), Some(state)) = (code, state) {
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = commands::auth::handle_oauth_callback(
                                    app_handle.clone(),
                                    code,
                                    state,
                                    "eveauth-skillmon://callback",
                                )
                                .await
                                {
                                    let _ = app_handle.emit("auth-error", e.to_string());
                                }
                            });
                        }
                    }
                    break;
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap_or_default();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::start_eve_login,
            is_startup_complete,
            commands::characters::logout_character,
            commands::accounts::get_accounts_and_characters,
            commands::accounts::create_account,
            commands::accounts::update_account_name,
            commands::accounts::delete_account,
            commands::accounts::add_character_to_account,
            commands::accounts::remove_character_from_account,
            commands::accounts::reorder_accounts,
            commands::accounts::reorder_characters_in_account,
            commands::skill_queues::get_skill_queues,
            commands::skill_queues::get_training_characters_count,
            commands::skill_queues::get_skill_queue_for_character,
            commands::skill_queues::force_refresh_skill_queue,
            commands::skills::get_character_skills_with_groups,
            commands::sde::refresh_sde,
            commands::clones::get_clones,
            commands::clones::update_clone_name,
            commands::sde::get_type_names,
            commands::attributes::get_character_attributes_breakdown,
            commands::rate_limits::get_rate_limits,
            commands::notifications::get_notifications,
            commands::notifications::dismiss_notification,
            commands::notifications::get_notification_settings,
            commands::notifications::upsert_notification_setting,
            commands::skill_plans::create_skill_plan,
            commands::skill_plans::get_all_skill_plans,
            commands::skill_plans::get_skill_plan,
            commands::skill_plans::get_skill_plan_with_entries,
            commands::skill_plans::update_skill_plan,
            commands::skill_plans::delete_skill_plan,
            commands::skill_plans::add_plan_entry,
            commands::skill_plans::update_plan_entry,
            commands::skill_plans::delete_plan_entry,
            commands::skill_plans::reorder_plan_entries,
            commands::skill_plans::import_skill_plan_text,
            commands::skill_plans::import_skill_plan_xml,
            commands::skill_plans::export_skill_plan_text,
            commands::skill_plans::export_skill_plan_xml,
            commands::skill_plans::search_skills,
            commands::skill_plans::compare_skill_plan_with_character
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
