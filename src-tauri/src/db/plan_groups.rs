use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use typeshare::typeshare;

use super::Pool;
use crate::ts_types::i64_ts;

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
}
