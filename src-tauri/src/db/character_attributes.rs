use anyhow::Result;
use serde::Serialize;
use sqlx::FromRow;

use super::Pool;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CharacterAttributes {
    pub character_id: i64,
    pub charisma: i64,
    pub intelligence: i64,
    pub memory: i64,
    pub perception: i64,
    pub willpower: i64,
    pub bonus_remaps: Option<i64>,
    pub accrued_remap_cooldown_date: Option<String>,
    pub last_remap_date: Option<String>,
}

pub async fn get_character_attributes(
    pool: &Pool,
    character_id: i64,
) -> Result<Option<CharacterAttributes>> {
    let attributes = sqlx::query_as::<_, CharacterAttributes>(
        "SELECT character_id, charisma, intelligence, memory, perception, willpower, bonus_remaps, accrued_remap_cooldown_date, last_remap_date FROM character_attributes WHERE character_id = ?",
    )
    .bind(character_id)
    .fetch_optional(pool)
    .await?;

    Ok(attributes)
}

pub async fn set_character_attributes(pool: &Pool, attributes: &CharacterAttributes) -> Result<()> {
    sqlx::query(
        r#"
      INSERT OR REPLACE INTO character_attributes
      (character_id, charisma, intelligence, memory, perception, willpower, bonus_remaps, accrued_remap_cooldown_date, last_remap_date, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
    "#,
    )
    .bind(attributes.character_id)
    .bind(attributes.charisma)
    .bind(attributes.intelligence)
    .bind(attributes.memory)
    .bind(attributes.perception)
    .bind(attributes.willpower)
    .bind(attributes.bonus_remaps)
    .bind(attributes.accrued_remap_cooldown_date.as_deref())
    .bind(attributes.last_remap_date.as_deref())
    .execute(pool)
    .await?;

    Ok(())
}
