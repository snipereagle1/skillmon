use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Sqlite, Transaction};
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

#[typeshare]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Plan,
    Group,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveNodePayload {
    pub kind: NodeKind,
    pub id: i64_ts,
    pub new_parent_group_id: Option<i64_ts>,
    pub new_sort_order: i64_ts,
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

pub async fn delete(pool: &Pool, group_id: i64, cascade_plans: bool) -> Result<()> {
    let mut tx = pool.begin().await?;

    let parent_row: Option<(Option<i64>,)> =
        sqlx::query_as("SELECT parent_group_id FROM plan_groups WHERE group_id = ?")
            .bind(group_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (deleted_parent,) = parent_row.ok_or_else(|| anyhow!("Folder {} not found", group_id))?;

    if cascade_plans {
        // Collect every group in the subtree (including the root).
        let subtree_ids: Vec<i64> = sqlx::query_scalar(
            "WITH RECURSIVE subtree(group_id) AS (
                 SELECT group_id FROM plan_groups WHERE group_id = ?
                 UNION ALL
                 SELECT pg.group_id FROM plan_groups pg
                   JOIN subtree s ON pg.parent_group_id = s.group_id
             )
             SELECT group_id FROM subtree",
        )
        .bind(group_id)
        .fetch_all(&mut *tx)
        .await?;

        for gid in &subtree_ids {
            sqlx::query("DELETE FROM skill_plans WHERE group_id = ?")
                .bind(gid)
                .execute(&mut *tx)
                .await?;
        }
        // Delete deepest first to avoid temporarily orphaning children if FKs are on.
        for gid in subtree_ids.iter().rev() {
            sqlx::query("DELETE FROM plan_groups WHERE group_id = ?")
                .bind(gid)
                .execute(&mut *tx)
                .await?;
        }
    } else {
        // Reparent direct children (groups + plans) to the deleted folder's parent.
        sqlx::query("UPDATE plan_groups SET parent_group_id = ? WHERE parent_group_id = ?")
            .bind(deleted_parent)
            .bind(group_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE skill_plans SET group_id = ? WHERE group_id = ?")
            .bind(deleted_parent)
            .bind(group_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM plan_groups WHERE group_id = ?")
            .bind(group_id)
            .execute(&mut *tx)
            .await?;
    }

    // Renumber the parent the deleted folder lived in (NULL = root).
    renumber_with_insertion(&mut tx, deleted_parent, None).await?;

    tx.commit().await?;
    Ok(())
}

pub async fn move_node(pool: &Pool, payload: MoveNodePayload) -> Result<()> {
    let mut tx = pool.begin().await?;

    let MoveNodePayload {
        kind,
        id,
        new_parent_group_id: new_parent,
        new_sort_order,
    } = payload;
    let kind_is_group = matches!(kind, NodeKind::Group);

    if new_sort_order < 0 {
        return Err(anyhow!("new_sort_order must be non-negative"));
    }

    // Verify new parent exists (if specified) and compute its depth.
    let new_parent_depth: i64 = match new_parent {
        None => -1,
        Some(pid) => {
            let depth: Option<i64> = sqlx::query_scalar(
                "WITH RECURSIVE chain(group_id, parent_group_id, depth) AS (
                     SELECT group_id, parent_group_id, 0
                     FROM plan_groups WHERE group_id = ?
                     UNION ALL
                     SELECT pg.group_id, pg.parent_group_id, c.depth + 1
                     FROM chain c JOIN plan_groups pg ON pg.group_id = c.parent_group_id
                 )
                 SELECT MAX(depth) FROM chain",
            )
            .bind(pid)
            .fetch_one(&mut *tx)
            .await?;
            depth.ok_or_else(|| anyhow!("Parent folder {} not found", pid))?
        }
    };

    let current_parent: Option<i64> = if kind_is_group {
        let row: Option<(Option<i64>,)> =
            sqlx::query_as("SELECT parent_group_id FROM plan_groups WHERE group_id = ?")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
        let (parent,) = row.ok_or_else(|| anyhow!("Folder {} not found", id))?;
        parent
    } else {
        let row: Option<(Option<i64>,)> =
            sqlx::query_as("SELECT group_id FROM skill_plans WHERE plan_id = ?")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
        let (parent,) = row.ok_or_else(|| anyhow!("Plan {} not found", id))?;
        parent
    };

    if kind_is_group {
        if let Some(pid) = new_parent {
            if pid == id {
                return Err(anyhow!("Cannot move a folder into itself"));
            }
            // Cycle check: new parent must not be a descendant of the moved group.
            let descendant: Option<i64> = sqlx::query_scalar(
                "WITH RECURSIVE descendants(group_id) AS (
                     SELECT group_id FROM plan_groups WHERE group_id = ?
                     UNION ALL
                     SELECT pg.group_id FROM plan_groups pg
                       JOIN descendants d ON pg.parent_group_id = d.group_id
                 )
                 SELECT group_id FROM descendants WHERE group_id = ? LIMIT 1",
            )
            .bind(id)
            .bind(pid)
            .fetch_optional(&mut *tx)
            .await?;
            if descendant.is_some() {
                return Err(anyhow!(
                    "Cannot move folder: would create a cycle in the folder tree"
                ));
            }
        }

        // Depth check: subtree-depth of moved group + (new parent depth + 1) <= MAX_DEPTH.
        let subtree_depth: i64 = sqlx::query_scalar(
            "WITH RECURSIVE subtree(group_id, depth) AS (
                 SELECT group_id, 0 FROM plan_groups WHERE group_id = ?
                 UNION ALL
                 SELECT pg.group_id, s.depth + 1 FROM plan_groups pg
                   JOIN subtree s ON pg.parent_group_id = s.group_id
             )
             SELECT COALESCE(MAX(depth), 0) FROM subtree",
        )
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;

        let moved_depth = new_parent_depth + 1;
        if moved_depth + subtree_depth > MAX_DEPTH {
            return Err(anyhow!(
                "Cannot move folder: would exceed maximum nesting depth of {} levels",
                MAX_DEPTH + 1
            ));
        }
    }

    // Re-parent the moved node with a temporary high sort_order so renumbering
    // can place it cleanly. Use a value larger than any plausible sibling.
    let parking_sort: i64 = 1_000_000_000;
    if kind_is_group {
        sqlx::query(
            "UPDATE plan_groups SET parent_group_id = ?, sort_order = ? WHERE group_id = ?",
        )
        .bind(new_parent)
        .bind(parking_sort)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query("UPDATE skill_plans SET group_id = ?, sort_order = ? WHERE plan_id = ?")
            .bind(new_parent)
            .bind(parking_sort)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }

    // Renumber the new parent's children, placing the moved node at new_sort_order.
    renumber_with_insertion(
        &mut tx,
        new_parent,
        Some((id, kind_is_group, new_sort_order)),
    )
    .await?;

    // If the old parent differs from the new parent, renumber it densely too.
    if current_parent != new_parent {
        renumber_with_insertion(&mut tx, current_parent, None).await?;
    }

    tx.commit().await?;
    Ok(())
}

/// Renumber sibling sort_order densely across plan_groups + skill_plans sharing
/// the same parent. If `place_moved` is set, the named node is positioned at the
/// requested index and the rest fill in around it.
async fn renumber_with_insertion(
    tx: &mut Transaction<'_, Sqlite>,
    parent: Option<i64>,
    place_moved: Option<(i64, bool, i64)>,
) -> Result<()> {
    // (id, is_group, current_sort_order)
    let mut siblings: Vec<(i64, bool, i64)> = Vec::new();

    let group_rows: Vec<(i64, i64)> = match parent {
        Some(pid) => {
            sqlx::query_as("SELECT group_id, sort_order FROM plan_groups WHERE parent_group_id = ?")
                .bind(pid)
                .fetch_all(&mut **tx)
                .await?
        }
        None => {
            sqlx::query_as(
                "SELECT group_id, sort_order FROM plan_groups WHERE parent_group_id IS NULL",
            )
            .fetch_all(&mut **tx)
            .await?
        }
    };
    for (gid, sort) in group_rows {
        siblings.push((gid, true, sort));
    }

    let plan_rows: Vec<(i64, i64)> = match parent {
        Some(pid) => {
            sqlx::query_as("SELECT plan_id, sort_order FROM skill_plans WHERE group_id = ?")
                .bind(pid)
                .fetch_all(&mut **tx)
                .await?
        }
        None => {
            sqlx::query_as("SELECT plan_id, sort_order FROM skill_plans WHERE group_id IS NULL")
                .fetch_all(&mut **tx)
                .await?
        }
    };
    for (pid, sort) in plan_rows {
        siblings.push((pid, false, sort));
    }

    if let Some((moved_id, moved_is_group, target)) = place_moved {
        // Remove moved from the list so we can re-insert at the requested index.
        siblings.retain(|(id, is_group, _)| !(*id == moved_id && *is_group == moved_is_group));
        // Stable order: by current sort_order then by id (group vs plan id are disjoint enough
        // for deterministic ordering within each kind; we add `is_group` as a final tiebreak).
        siblings.sort_by(|a, b| a.2.cmp(&b.2).then(a.1.cmp(&b.1)).then(a.0.cmp(&b.0)));
        let idx = target.clamp(0, siblings.len() as i64) as usize;
        siblings.insert(idx, (moved_id, moved_is_group, target));
    } else {
        siblings.sort_by(|a, b| a.2.cmp(&b.2).then(a.1.cmp(&b.1)).then(a.0.cmp(&b.0)));
    }

    for (i, (id, is_group, _)) in siblings.iter().enumerate() {
        let new_sort = i as i64;
        if *is_group {
            sqlx::query("UPDATE plan_groups SET sort_order = ? WHERE group_id = ?")
                .bind(new_sort)
                .bind(id)
                .execute(&mut **tx)
                .await?;
        } else {
            sqlx::query("UPDATE skill_plans SET sort_order = ? WHERE plan_id = ?")
                .bind(new_sort)
                .bind(id)
                .execute(&mut **tx)
                .await?;
        }
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
pub async fn create_plan_for_test(
    pool: &Pool,
    name: &str,
    group_id: Option<i64>,
    sort_order: i64,
) -> Result<i64> {
    let now = chrono::Utc::now().timestamp();
    let result = sqlx::query(
        "INSERT INTO skill_plans (name, description, auto_prerequisites, created_at, updated_at, group_id, sort_order) \
         VALUES (?, NULL, 0, ?, ?, ?, ?)",
    )
    .bind(name)
    .bind(now)
    .bind(now)
    .bind(group_id)
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

    async fn group_sort_orders(
        pool: &Pool,
        parent: Option<i64>,
    ) -> std::collections::HashMap<i64, i64> {
        let groups = list(pool).await.unwrap();
        groups
            .iter()
            .filter(|g| g.parent_group_id == parent)
            .map(|g| (g.group_id, g.sort_order))
            .collect()
    }

    async fn plan_sort(pool: &Pool, plan_id: i64) -> (Option<i64>, i64) {
        let row: (Option<i64>, i64) =
            sqlx::query_as("SELECT group_id, sort_order FROM skill_plans WHERE plan_id = ?")
                .bind(plan_id)
                .fetch_one(pool)
                .await
                .unwrap();
        row
    }

    async fn group_row(pool: &Pool, group_id: i64) -> (Option<i64>, i64) {
        let row: (Option<i64>, i64) = sqlx::query_as(
            "SELECT parent_group_id, sort_order FROM plan_groups WHERE group_id = ?",
        )
        .bind(group_id)
        .fetch_one(pool)
        .await
        .unwrap();
        row
    }

    #[tokio::test]
    async fn move_node_reorders_siblings_within_parent() {
        let db = TestDb::new().await.unwrap();
        let a = create_for_test(&db.pool, "A", None, 0).await.unwrap();
        let b = create_for_test(&db.pool, "B", None, 1).await.unwrap();
        let c = create_for_test(&db.pool, "C", None, 2).await.unwrap();

        // Move A to position 2 (end).
        move_node(
            &db.pool,
            MoveNodePayload {
                kind: NodeKind::Group,
                id: a,
                new_parent_group_id: None,
                new_sort_order: 2,
            },
        )
        .await
        .unwrap();

        let orders = group_sort_orders(&db.pool, None).await;
        assert_eq!(orders[&b], 0);
        assert_eq!(orders[&c], 1);
        assert_eq!(orders[&a], 2);
    }

    #[tokio::test]
    async fn move_node_reparents_plan_to_new_group() {
        let db = TestDb::new().await.unwrap();
        let g = create(&db.pool, "Group", None).await.unwrap();
        let p = create_plan_for_test(&db.pool, "P", None, 0).await.unwrap();

        move_node(
            &db.pool,
            MoveNodePayload {
                kind: NodeKind::Plan,
                id: p,
                new_parent_group_id: Some(g),
                new_sort_order: 0,
            },
        )
        .await
        .unwrap();

        let (parent, sort) = plan_sort(&db.pool, p).await;
        assert_eq!(parent, Some(g));
        assert_eq!(sort, 0);
    }

    #[tokio::test]
    async fn move_node_reparents_group_with_descendants() {
        let db = TestDb::new().await.unwrap();
        // root_a (depth 0) > child (depth 1) > leaf (depth 2)
        let root_a = create(&db.pool, "RootA", None).await.unwrap();
        let child = create(&db.pool, "Child", Some(root_a)).await.unwrap();
        let _leaf = create(&db.pool, "Leaf", Some(child)).await.unwrap();
        let root_b = create(&db.pool, "RootB", None).await.unwrap();
        let plan_in_child = create_plan_for_test(&db.pool, "P", Some(child), 0)
            .await
            .unwrap();

        // Move child under root_b — leaf and plan must still be inside child.
        move_node(
            &db.pool,
            MoveNodePayload {
                kind: NodeKind::Group,
                id: child,
                new_parent_group_id: Some(root_b),
                new_sort_order: 0,
            },
        )
        .await
        .unwrap();

        let (parent, _) = group_row(&db.pool, child).await;
        assert_eq!(parent, Some(root_b));
        let (plan_parent, _) = plan_sort(&db.pool, plan_in_child).await;
        assert_eq!(plan_parent, Some(child));
    }

    #[tokio::test]
    async fn move_node_rejects_self_reference() {
        let db = TestDb::new().await.unwrap();
        let g = create(&db.pool, "G", None).await.unwrap();
        let err = move_node(
            &db.pool,
            MoveNodePayload {
                kind: NodeKind::Group,
                id: g,
                new_parent_group_id: Some(g),
                new_sort_order: 0,
            },
        )
        .await
        .unwrap_err();
        assert!(
            err.to_string().to_lowercase().contains("itself")
                || err.to_string().to_lowercase().contains("cycle")
        );
    }

    #[tokio::test]
    async fn move_node_rejects_indirect_cycle() {
        let db = TestDb::new().await.unwrap();
        let a = create(&db.pool, "A", None).await.unwrap();
        let b = create(&db.pool, "B", Some(a)).await.unwrap();
        // Try to move A under B → would create A → B → A cycle.
        let err = move_node(
            &db.pool,
            MoveNodePayload {
                kind: NodeKind::Group,
                id: a,
                new_parent_group_id: Some(b),
                new_sort_order: 0,
            },
        )
        .await
        .unwrap_err();
        assert!(err.to_string().to_lowercase().contains("cycle"));
    }

    #[tokio::test]
    async fn move_node_rejects_depth_violation_for_subtree() {
        let db = TestDb::new().await.unwrap();
        // Build:
        //   root_a (0) > child (1) > leaf (2)   ← subtree of depth 2 rooted at child
        //   root_b (0) > inner (1)              ← inner sits at depth 1
        let root_a = create(&db.pool, "RootA", None).await.unwrap();
        let child = create(&db.pool, "Child", Some(root_a)).await.unwrap();
        let _leaf = create(&db.pool, "Leaf", Some(child)).await.unwrap();
        let root_b = create(&db.pool, "RootB", None).await.unwrap();
        let inner = create(&db.pool, "Inner", Some(root_b)).await.unwrap();

        // Moving child (subtree depth 1) under inner (depth 1) → leaf would land at depth 3.
        let err = move_node(
            &db.pool,
            MoveNodePayload {
                kind: NodeKind::Group,
                id: child,
                new_parent_group_id: Some(inner),
                new_sort_order: 0,
            },
        )
        .await
        .unwrap_err();
        let msg = err.to_string().to_lowercase();
        assert!(msg.contains("depth") || msg.contains("nesting"));

        // Tree must be unchanged.
        let (parent_after, _) = group_row(&db.pool, child).await;
        assert_eq!(parent_after, Some(root_a));
    }

    async fn group_exists(pool: &Pool, group_id: i64) -> bool {
        let row: Option<(i64,)> =
            sqlx::query_as("SELECT group_id FROM plan_groups WHERE group_id = ?")
                .bind(group_id)
                .fetch_optional(pool)
                .await
                .unwrap();
        row.is_some()
    }

    async fn plan_exists(pool: &Pool, plan_id: i64) -> bool {
        let row: Option<(i64,)> =
            sqlx::query_as("SELECT plan_id FROM skill_plans WHERE plan_id = ?")
                .bind(plan_id)
                .fetch_optional(pool)
                .await
                .unwrap();
        row.is_some()
    }

    #[tokio::test]
    async fn delete_root_folder_reparents_children_to_null() {
        let db = TestDb::new().await.unwrap();
        let root = create(&db.pool, "Root", None).await.unwrap();
        let child_group = create(&db.pool, "ChildGroup", Some(root)).await.unwrap();
        let child_plan = create_plan_for_test(&db.pool, "P", Some(root), 0)
            .await
            .unwrap();

        delete(&db.pool, root, false).await.unwrap();

        assert!(!group_exists(&db.pool, root).await);
        let (gp, _) = group_row(&db.pool, child_group).await;
        assert_eq!(gp, None);
        let (pp, _) = plan_sort(&db.pool, child_plan).await;
        assert_eq!(pp, None);
    }

    #[tokio::test]
    async fn delete_non_root_folder_reparents_children_to_grandparent() {
        let db = TestDb::new().await.unwrap();
        let root = create(&db.pool, "Root", None).await.unwrap();
        let mid = create(&db.pool, "Mid", Some(root)).await.unwrap();
        let leaf = create(&db.pool, "Leaf", Some(mid)).await.unwrap();
        let plan = create_plan_for_test(&db.pool, "P", Some(mid), 0)
            .await
            .unwrap();

        delete(&db.pool, mid, false).await.unwrap();

        assert!(!group_exists(&db.pool, mid).await);
        let (lp, _) = group_row(&db.pool, leaf).await;
        assert_eq!(lp, Some(root));
        let (pp, _) = plan_sort(&db.pool, plan).await;
        assert_eq!(pp, Some(root));
    }

    #[tokio::test]
    async fn delete_cascade_removes_entire_subtree() {
        let db = TestDb::new().await.unwrap();
        let root = create(&db.pool, "Root", None).await.unwrap();
        let mid = create(&db.pool, "Mid", Some(root)).await.unwrap();
        let leaf = create(&db.pool, "Leaf", Some(mid)).await.unwrap();
        let plan_in_mid = create_plan_for_test(&db.pool, "P1", Some(mid), 0)
            .await
            .unwrap();
        let plan_in_leaf = create_plan_for_test(&db.pool, "P2", Some(leaf), 0)
            .await
            .unwrap();
        let sibling_plan = create_plan_for_test(&db.pool, "Outside", None, 0)
            .await
            .unwrap();

        delete(&db.pool, mid, true).await.unwrap();

        assert!(!group_exists(&db.pool, mid).await);
        assert!(!group_exists(&db.pool, leaf).await);
        assert!(!plan_exists(&db.pool, plan_in_mid).await);
        assert!(!plan_exists(&db.pool, plan_in_leaf).await);
        // Unrelated nodes untouched.
        assert!(group_exists(&db.pool, root).await);
        assert!(plan_exists(&db.pool, sibling_plan).await);
    }

    #[tokio::test]
    async fn delete_renumbers_old_parent_densely() {
        let db = TestDb::new().await.unwrap();
        // Root siblings: a (0), target (1), b (2).
        let a = create_for_test(&db.pool, "A", None, 0).await.unwrap();
        let target = create_for_test(&db.pool, "T", None, 1).await.unwrap();
        let b = create_for_test(&db.pool, "B", None, 2).await.unwrap();
        // Plan parented to target so reparenting kicks in.
        let plan = create_plan_for_test(&db.pool, "P", Some(target), 0)
            .await
            .unwrap();

        delete(&db.pool, target, false).await.unwrap();

        // a, b, and the reparented plan now share the root in sort order.
        let groups = list(&db.pool).await.unwrap();
        let by_id: std::collections::HashMap<i64, &PlanGroup> =
            groups.iter().map(|g| (g.group_id, g)).collect();
        let (_, plan_so) = plan_sort(&db.pool, plan).await;
        let mut all: Vec<(i64, &'static str)> = vec![
            (by_id[&a].sort_order, "a"),
            (by_id[&b].sort_order, "b"),
            (plan_so, "plan"),
        ];
        all.sort();
        // Dense and unique: 0, 1, 2.
        assert_eq!(
            all.iter().map(|(s, _)| *s).collect::<Vec<_>>(),
            vec![0, 1, 2]
        );
    }

    #[tokio::test]
    async fn delete_rejects_unknown_group() {
        let db = TestDb::new().await.unwrap();
        let err = delete(&db.pool, 99_999, false).await.unwrap_err();
        assert!(err.to_string().to_lowercase().contains("not found"));
    }

    #[tokio::test]
    async fn move_node_renumbers_old_and_new_parent_densely() {
        let db = TestDb::new().await.unwrap();
        let g1 = create(&db.pool, "G1", None).await.unwrap();
        let g2 = create(&db.pool, "G2", None).await.unwrap();
        // G1 children: p1, p2, p3
        let p1 = create_plan_for_test(&db.pool, "P1", Some(g1), 0)
            .await
            .unwrap();
        let p2 = create_plan_for_test(&db.pool, "P2", Some(g1), 1)
            .await
            .unwrap();
        let p3 = create_plan_for_test(&db.pool, "P3", Some(g1), 2)
            .await
            .unwrap();
        // G2 children: q1
        let q1 = create_plan_for_test(&db.pool, "Q1", Some(g2), 0)
            .await
            .unwrap();

        // Move p2 to G2 at index 0.
        move_node(
            &db.pool,
            MoveNodePayload {
                kind: NodeKind::Plan,
                id: p2,
                new_parent_group_id: Some(g2),
                new_sort_order: 0,
            },
        )
        .await
        .unwrap();

        // G1 densely renumbered: p1=0, p3=1
        assert_eq!(plan_sort(&db.pool, p1).await, (Some(g1), 0));
        assert_eq!(plan_sort(&db.pool, p3).await, (Some(g1), 1));
        // G2 has p2=0, q1=1
        assert_eq!(plan_sort(&db.pool, p2).await, (Some(g2), 0));
        assert_eq!(plan_sort(&db.pool, q1).await, (Some(g2), 1));
    }
}
