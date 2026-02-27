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

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SkillInfo {
    pub type_id: i64,
    pub name: String,
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

pub async fn get_skills_for_group(pool: &Pool, group_id: i64) -> Result<Vec<SkillInfo>> {
    let skills = sqlx::query_as::<_, SkillInfo>(
        "SELECT type_id, name FROM sde_types WHERE group_id = ? AND published = 1 ORDER BY name",
    )
    .bind(group_id)
    .fetch_all(pool)
    .await?;

    Ok(skills)
}

pub async fn get_skill_group_id(pool: &Pool, type_id: i64) -> Result<Option<i64>> {
    let group_id: Option<i64> =
        sqlx::query_scalar("SELECT group_id FROM sde_types WHERE type_id = ? AND published = 1")
            .bind(type_id)
            .fetch_optional(pool)
            .await?;

    Ok(group_id)
}
