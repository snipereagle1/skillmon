use std::fs;

use anyhow::{Context, Result};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    SqlitePool,
};
use tauri::Manager;
pub mod operations;
pub use operations::{
    add_character, delete_character, get_character, get_tokens, set_tokens, update_character,
    update_tokens, Character, Tokens,
};

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

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .context("failed to run database migrations")?;

    Ok(pool)
}
