use anyhow::Result;
use serde::Serialize;
use sqlx::FromRow;
use typeshare::typeshare;

use super::Pool;
use crate::ts_types::i64_ts;

#[typeshare]
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CompletedSkill {
    pub character_id: i64_ts,
    pub character_name: String,
    pub skill_id: i64_ts,
    pub skill_name: Option<String>,
    pub finished_level: i64_ts,
    /// Unix seconds.
    pub completed_at: i64_ts,
}

/// Records `(skill_id, finished_level, completed_at)` entries; re-recording a level is a no-op.
pub async fn record_completed_skills(
    pool: &Pool,
    character_id: i64,
    entries: &[(i64, i64, i64)],
) -> Result<()> {
    if entries.is_empty() {
        return Ok(());
    }
    let mut tx = pool.begin().await?;
    for (skill_id, finished_level, completed_at) in entries {
        sqlx::query(
            "INSERT OR IGNORE INTO skill_training_history
             (character_id, skill_id, finished_level, completed_at)
             VALUES (?, ?, ?, ?)",
        )
        .bind(character_id)
        .bind(skill_id)
        .bind(finished_level)
        .bind(completed_at)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Most recent completions first; `character_id = None` returns all characters.
pub async fn get_skill_history(
    pool: &Pool,
    character_id: Option<i64>,
    limit: i64,
) -> Result<Vec<CompletedSkill>> {
    let rows = sqlx::query_as::<_, CompletedSkill>(
        "SELECT h.character_id, c.character_name, h.skill_id, t.name AS skill_name,
                h.finished_level, h.completed_at
         FROM skill_training_history h
         JOIN characters c ON c.character_id = h.character_id
         LEFT JOIN sde_types t ON t.type_id = h.skill_id
         WHERE ?1 IS NULL OR h.character_id = ?1
         ORDER BY h.completed_at DESC, h.finished_level DESC
         LIMIT ?2",
    )
    .bind(character_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdata::TestDb;

    #[tokio::test]
    async fn records_once_and_lists_newest_first() {
        let db = TestDb::new().await.unwrap();
        crate::db::add_character(&db.pool, 1, "Alpha")
            .await
            .unwrap();
        crate::db::add_character(&db.pool, 2, "Beta").await.unwrap();

        record_completed_skills(&db.pool, 1, &[(3300, 1, 100), (3300, 2, 200)])
            .await
            .unwrap();
        // Same level seen again on a later refresh keeps the original time.
        record_completed_skills(&db.pool, 1, &[(3300, 2, 999)])
            .await
            .unwrap();
        record_completed_skills(&db.pool, 2, &[(3301, 1, 150)])
            .await
            .unwrap();

        let all = get_skill_history(&db.pool, None, 10).await.unwrap();
        let summary: Vec<_> = all
            .iter()
            .map(|r| (r.character_id, r.finished_level, r.completed_at))
            .collect();
        assert_eq!(summary, vec![(1, 2, 200), (2, 1, 150), (1, 1, 100)]);
        assert_eq!(all[1].character_name, "Beta");

        let one = get_skill_history(&db.pool, Some(2), 10).await.unwrap();
        assert_eq!(one.len(), 1);
        assert_eq!(get_skill_history(&db.pool, None, 1).await.unwrap().len(), 1);
    }
}
