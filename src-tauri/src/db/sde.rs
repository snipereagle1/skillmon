use anyhow::Result;
use serde::Serialize;
use sqlx::FromRow;

use super::Pool;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SkillGroupInfo {
    pub group_id: i64,
    pub group_name: String,
    pub category_id: i64,
}

pub async fn get_skill_groups_for_category(
    pool: &Pool,
    category_id: i64,
) -> Result<Vec<SkillGroupInfo>> {
    let groups = sqlx::query_as::<_, SkillGroupInfo>(
        "SELECT group_id, name as group_name, category_id FROM sde_groups WHERE category_id = ? AND published = 1 ORDER BY name",
    )
    .bind(category_id)
    .fetch_all(pool)
    .await?;

    Ok(groups)
}
