use std::fs;

use anyhow::{Context, Result};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    SqlitePool,
};
use tauri::Manager;
pub mod operations;
pub use operations::{
    add_character, delete_character, find_clone_by_implants, get_all_characters, get_character,
    get_character_attributes, get_character_clones, get_character_skill, get_character_skills,
    get_clone_implants, get_skill_groups_for_category, get_tokens, set_character_attributes,
    set_character_clones, set_character_skills, set_tokens, update_character, update_clone_name,
    update_tokens, Character, CharacterAttributes, CharacterSkill, Clone, CloneImplant,
    SkillGroupInfo,
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
