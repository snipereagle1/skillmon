use tauri::menu::MenuItem;
use tauri::Runtime;

use crate::db;
use crate::esi;
use crate::esi_helpers;

pub async fn count_training_characters(
    pool: &db::Pool,
    rate_limits: &esi::RateLimitStore,
) -> Result<i32, String> {
    let characters = db::get_all_characters(pool)
        .await
        .map_err(|e| format!("Failed to get characters: {}", e))?;

    let mut count = 0;

    for character in characters {
        let access_token =
            match crate::auth::ensure_valid_access_token(pool, character.character_id).await {
                Ok(token) => token,
                Err(_) => continue,
            };

        let client = match esi_helpers::create_authenticated_client(&access_token) {
            Ok(client) => client,
            Err(_) => continue,
        };

        if let Ok(Some(queue_data)) =
            esi_helpers::get_cached_skill_queue(pool, &client, character.character_id, rate_limits)
                .await
        {
            let is_training = queue_data.iter().any(|item: &serde_json::Value| {
                if let Some(obj) = item.as_object() {
                    if let Some(queue_pos) = obj.get("queue_position").and_then(|v| v.as_i64()) {
                        if queue_pos == 0 {
                            return true;
                        }
                    }

                    if let (Some(start_str), Some(finish_str)) = (
                        obj.get("start_date").and_then(|v| v.as_str()),
                        obj.get("finish_date").and_then(|v| v.as_str()),
                    ) {
                        if let (Ok(start), Ok(finish)) = (
                            chrono::DateTime::parse_from_rfc3339(start_str),
                            chrono::DateTime::parse_from_rfc3339(finish_str),
                        ) {
                            let start_utc = start.with_timezone(&chrono::Utc);
                            let finish_utc = finish.with_timezone(&chrono::Utc);
                            let now = chrono::Utc::now();
                            if now >= start_utc && now < finish_utc {
                                return true;
                            }
                        }
                    }
                }
                false
            });

            if is_training {
                count += 1;
            }
        }
    }

    Ok(count)
}

pub async fn update_tray_menu<R: Runtime>(
    _app: &tauri::AppHandle<R>,
    pool: &db::Pool,
    rate_limits: &esi::RateLimitStore,
    training_count_item: &MenuItem<R>,
) {
    let count = count_training_characters(pool, rate_limits)
        .await
        .unwrap_or(-1);

    let text = if count < 0 {
        "? characters training".to_string()
    } else if count == 1 {
        "1 character training".to_string()
    } else {
        format!("{} characters training", count)
    };

    if let Err(e) = training_count_item.set_text(&text) {
        eprintln!("Failed to update tray menu text: {}", e);
    }
}
