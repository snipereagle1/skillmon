use std::fs;

use anyhow::{Context, Result};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    SqlitePool,
};
use tauri::Manager;

pub mod character_attributes;
pub mod character_skills;
pub mod characters;
pub mod clones;
pub mod locations;
pub mod notifications;
pub mod sde;
pub mod tokens;

pub use character_attributes::{
    get_character_attributes, set_character_attributes, CharacterAttributes,
};
pub use character_skills::{get_character_skills, set_character_skills, CharacterSkill};
pub use characters::{
    add_character, delete_character, get_all_characters, get_character,
    set_character_unallocated_sp, update_character, Character,
};
pub use clones::{
    find_clone_by_implants, get_character_clones, get_clone_implants,
    get_implant_attribute_bonuses, set_character_clones, update_clone_name,
};
pub use locations::{get_station, get_structure, upsert_station, upsert_structure};
pub use notifications::{
    clear_notification, create_notification, dismiss_notification, get_notification_setting,
    get_notification_settings, get_notifications, upsert_notification_setting, Notification,
    NotificationSetting,
};
pub use sde::get_skill_groups_for_category;
pub use tokens::{get_tokens, set_tokens, update_tokens};

pub type Pool = SqlitePool;

pub async fn init_db(app: &tauri::AppHandle) -> Result<Pool> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve app data directory")?;

    fs::create_dir_all(&app_data_dir).context("failed to create app data directory")?;

    let db_path = app_data_dir.join("database.sqlite");

    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal);

    let pool = SqlitePoolOptions::new()
        .connect_with(options)
        .await
        .with_context(|| format!("failed to create sqlite pool at {}", db_path.display()))?;

    match sqlx::migrate!("./migrations").run(&pool).await {
        Ok(_) => {}
        Err(e) => {
            eprintln!("Migration error details: {:#}", e);
            return Err(anyhow::anyhow!(
                "failed to run database migrations. Database path: {}. Error: {}",
                db_path.display(),
                e
            ));
        }
    }

    Ok(pool)
}
