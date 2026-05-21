use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use typeshare::typeshare;

use super::Pool;
use crate::ts_types::i64_ts;

/// Maximum allowed folder depth (groups live at depths 0, 1, 2).
pub const MAX_DEPTH: i64 = 2;

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PlanGroup {
    pub group_id: i64_ts,
    pub name: String,
    pub parent_group_id: Option<i64_ts>,
    pub sort_order: i64_ts,
}

pub async fn list(pool: &Pool) -> Result<Vec<PlanGroup>> {
    let groups = sqlx::query_as::<_, PlanGroup>(
        "SELECT group_id, name, parent_group_id, sort_order
         FROM plan_groups
         ORDER BY COALESCE(parent_group_id, -1), sort_order, group_id",
    )
    .fetch_all(pool)
    .await?;
    Ok(groups)
}

pub async fn create(pool: &Pool, name: &str, parent_group_id: Option<i64>) -> Result<i64> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("Folder name cannot be empty"));
    }

    let mut tx = pool.begin().await?;

    let next_sort_order: i64 = if let Some(parent_id) = parent_group_id {
        let parent_depth: Option<i64> = sqlx::query_scalar(
            "WITH RECURSIVE chain(group_id, parent_group_id, depth) AS (
                 SELECT group_id, parent_group_id, 0
                 FROM plan_groups WHERE group_id = ?
                 UNION ALL
                 SELECT pg.group_id, pg.parent_group_id, c.depth + 1
                 FROM chain c JOIN plan_groups pg ON pg.group_id = c.parent_group_id
             )
             SELECT MAX(depth) FROM chain",
        )
        .bind(parent_id)
        .fetch_one(&mut *tx)
        .await?;

        let depth = parent_depth.ok_or_else(|| anyhow!("Parent folder {} not found", parent_id))?;

        if depth >= MAX_DEPTH {
            return Err(anyhow!(
                "Cannot create folder: maximum nesting depth of {} levels reached",
                MAX_DEPTH + 1
            ));
        }

        sqlx::query_scalar(
            "SELECT COALESCE(MAX(sort_order), -1) + 1
             FROM plan_groups WHERE parent_group_id = ?",
        )
        .bind(parent_id)
        .fetch_one(&mut *tx)
        .await?
    } else {
        sqlx::query_scalar(
            "SELECT COALESCE(MAX(sort_order), -1) + 1
             FROM plan_groups WHERE parent_group_id IS NULL",
        )
        .fetch_one(&mut *tx)
        .await?
    };

    let result =
        sqlx::query("INSERT INTO plan_groups (name, parent_group_id, sort_order) VALUES (?, ?, ?)")
            .bind(name)
            .bind(parent_group_id)
            .bind(next_sort_order)
            .execute(&mut *tx)
            .await?;

    tx.commit().await?;
    Ok(result.last_insert_rowid())
}

pub async fn rename(pool: &Pool, group_id: i64, name: &str) -> Result<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(anyhow!("Folder name cannot be empty"));
    }

    let result = sqlx::query("UPDATE plan_groups SET name = ? WHERE group_id = ?")
        .bind(name)
        .bind(group_id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(anyhow!("Folder {} not found", group_id));
    }
    Ok(())
}

#[cfg(test)]
pub async fn create_for_test(
    pool: &Pool,
    name: &str,
    parent_group_id: Option<i64>,
    sort_order: i64,
) -> Result<i64> {
    let result =
        sqlx::query("INSERT INTO plan_groups (name, parent_group_id, sort_order) VALUES (?, ?, ?)")
            .bind(name)
            .bind(parent_group_id)
            .bind(sort_order)
            .execute(pool)
            .await?;
    Ok(result.last_insert_rowid())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdata::TestDb;

    #[tokio::test]
    async fn list_returns_groups_with_parent_and_order() {
        let db = TestDb::new().await.unwrap();

        let root_a = create_for_test(&db.pool, "Doctrine", None, 0)
            .await
            .unwrap();
        let root_b = create_for_test(&db.pool, "Misc", None, 1).await.unwrap();
        let child = create_for_test(&db.pool, "Subcap", Some(root_a), 0)
            .await
            .unwrap();

        let groups = list(&db.pool).await.unwrap();
        assert_eq!(groups.len(), 3);

        let by_id: std::collections::HashMap<i64, &PlanGroup> =
            groups.iter().map(|g| (g.group_id, g)).collect();

        assert_eq!(by_id[&root_a].parent_group_id, None);
        assert_eq!(by_id[&root_a].name, "Doctrine");
        assert_eq!(by_id[&root_b].parent_group_id, None);
        assert_eq!(by_id[&child].parent_group_id, Some(root_a));
        assert_eq!(by_id[&child].name, "Subcap");
    }

    #[tokio::test]
    async fn list_empty_when_no_groups() {
        let db = TestDb::new().await.unwrap();
        let groups = list(&db.pool).await.unwrap();
        assert!(groups.is_empty());
    }

    #[tokio::test]
    async fn create_root_assigns_incrementing_sort_order() {
        let db = TestDb::new().await.unwrap();
        let a = create(&db.pool, "A", None).await.unwrap();
        let b = create(&db.pool, "B", None).await.unwrap();
        let c = create(&db.pool, "C", None).await.unwrap();

        let groups = list(&db.pool).await.unwrap();
        let by_id: std::collections::HashMap<i64, &PlanGroup> =
            groups.iter().map(|g| (g.group_id, g)).collect();
        assert_eq!(by_id[&a].sort_order, 0);
        assert_eq!(by_id[&b].sort_order, 1);
        assert_eq!(by_id[&c].sort_order, 2);
    }

    #[tokio::test]
    async fn create_under_parent_appends_to_siblings() {
        let db = TestDb::new().await.unwrap();
        let parent = create(&db.pool, "Parent", None).await.unwrap();
        // Existing sibling at index 0 placed via test helper.
        create_for_test(&db.pool, "Existing", Some(parent), 0)
            .await
            .unwrap();
        let new_child = create(&db.pool, "New", Some(parent)).await.unwrap();

        let groups = list(&db.pool).await.unwrap();
        let new_node = groups
            .iter()
            .find(|g| g.group_id == new_child)
            .expect("new child present");
        assert_eq!(new_node.sort_order, 1);
        assert_eq!(new_node.parent_group_id, Some(parent));
    }

    #[tokio::test]
    async fn create_trims_whitespace() {
        let db = TestDb::new().await.unwrap();
        let id = create(&db.pool, "  Spaced  ", None).await.unwrap();
        let groups = list(&db.pool).await.unwrap();
        assert_eq!(
            groups.iter().find(|g| g.group_id == id).unwrap().name,
            "Spaced"
        );
    }

    #[tokio::test]
    async fn create_rejects_empty_name() {
        let db = TestDb::new().await.unwrap();
        let err = create(&db.pool, "   ", None).await.unwrap_err();
        assert!(err.to_string().to_lowercase().contains("empty"));
    }

    #[tokio::test]
    async fn create_rejects_unknown_parent() {
        let db = TestDb::new().await.unwrap();
        let err = create(&db.pool, "Orphan", Some(99_999)).await.unwrap_err();
        assert!(err.to_string().to_lowercase().contains("not found"));
    }

    #[tokio::test]
    async fn create_enforces_max_depth() {
        let db = TestDb::new().await.unwrap();
        // Build a 3-level chain (depths 0, 1, 2) using the public API.
        let l0 = create(&db.pool, "L0", None).await.unwrap();
        let l1 = create(&db.pool, "L1", Some(l0)).await.unwrap();
        let l2 = create(&db.pool, "L2", Some(l1)).await.unwrap();

        // A 4th level (depth 3) must be rejected.
        let err = create(&db.pool, "L3", Some(l2)).await.unwrap_err();
        let msg = err.to_string().to_lowercase();
        assert!(msg.contains("depth") || msg.contains("nesting"));

        // The rejected insert must not leave a row behind.
        let groups = list(&db.pool).await.unwrap();
        assert_eq!(groups.len(), 3);
    }

    #[tokio::test]
    async fn rename_updates_name() {
        let db = TestDb::new().await.unwrap();
        let id = create(&db.pool, "Old", None).await.unwrap();
        rename(&db.pool, id, "New").await.unwrap();
        let groups = list(&db.pool).await.unwrap();
        assert_eq!(
            groups.iter().find(|g| g.group_id == id).unwrap().name,
            "New"
        );
    }

    #[tokio::test]
    async fn rename_trims_whitespace() {
        let db = TestDb::new().await.unwrap();
        let id = create(&db.pool, "Old", None).await.unwrap();
        rename(&db.pool, id, "  Trimmed  ").await.unwrap();
        let groups = list(&db.pool).await.unwrap();
        assert_eq!(
            groups.iter().find(|g| g.group_id == id).unwrap().name,
            "Trimmed"
        );
    }

    #[tokio::test]
    async fn rename_rejects_empty_name() {
        let db = TestDb::new().await.unwrap();
        let id = create(&db.pool, "Old", None).await.unwrap();
        let err = rename(&db.pool, id, "  ").await.unwrap_err();
        assert!(err.to_string().to_lowercase().contains("empty"));
    }

    #[tokio::test]
    async fn rename_rejects_unknown_group() {
        let db = TestDb::new().await.unwrap();
        let err = rename(&db.pool, 99_999, "Whatever").await.unwrap_err();
        assert!(err.to_string().to_lowercase().contains("not found"));
    }
}
