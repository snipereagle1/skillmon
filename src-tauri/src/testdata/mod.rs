use crate::db::Pool;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous},
    SqlitePool,
};
use std::path::PathBuf;
use tempfile::NamedTempFile;

pub mod fixtures;
pub mod sde_cache;

pub struct TestDb {
    pub pool: Pool,
    _temp_file: NamedTempFile,
}

impl TestDb {
    pub async fn new() -> anyhow::Result<Self> {
        let temp_file = NamedTempFile::new()?;
        let db_path = temp_file.path().to_str().unwrap();

        let options = SqliteConnectOptions::new()
            .filename(db_path)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal);

        let pool = SqlitePool::connect_with(options).await?;

        // Run migrations
        // sqlx 0.7 migrate! macro is relative to the crate root if it doesn't start with ..
        // But since src/db/mod.rs uses ./migrations, we should be able to as well.
        sqlx::migrate!("./migrations").run(&pool).await?;

        Ok(Self {
            pool,
            _temp_file: temp_file,
        })
    }

    pub async fn new_with_sde() -> anyhow::Result<Self> {
        let db = Self::new().await?;

        // Ensure SDE is cached and import it
        let cache_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/sde_cache");

        let paths = sde_cache::ensure_sde_cached(&cache_dir).await?;

        crate::sde::import_from_files_for_test(&db.pool, &paths).await?;

        Ok(db)
    }
}
