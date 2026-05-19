use std::sync::Arc;

use anyhow::Result;
use tauri::{AppHandle, Emitter};

use crate::commands::notifications::NotificationResponse;
use crate::db;
use crate::esi;

pub mod checkers;

pub struct NotificationContext<'a> {
    pub app: &'a AppHandle,
    pub pool: &'a db::Pool,
    #[allow(dead_code)] // May be used by future notification checkers
    pub rate_limits: &'a esi::RateLimitStore,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataType {
    SkillQueue,
    Skills,
    Attributes,
    Clones,
    Location,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct DataUpdatedPayload {
    pub data_type: DataType,
    pub character_id: i64,
}

#[async_trait::async_trait]
pub trait NotificationChecker: Send + Sync {
    fn notification_type(&self) -> &'static str;
    fn data_triggers(&self) -> &[DataType];
    async fn check(&self, ctx: &NotificationContext<'_>, character_id: i64) -> Result<()>;
}

pub struct NotificationProcessor {
    checkers: Vec<Arc<dyn NotificationChecker>>,
}

impl NotificationProcessor {
    pub fn new() -> Self {
        let mut processor = Self {
            checkers: Vec::new(),
        };
        processor.register_checkers();
        processor
    }

    fn register_checkers(&mut self) {
        self.checkers.push(Arc::new(checkers::SkillQueueLowChecker));
    }

    pub async fn process_data_updated(
        &self,
        ctx: &NotificationContext<'_>,
        data_type: DataType,
        character_id: i64,
    ) -> Result<()> {
        for checker in &self.checkers {
            if checker.data_triggers().contains(&data_type) {
                if let Err(e) = checker.check(ctx, character_id).await {
                    eprintln!(
                        "Notification check failed for {} (character {}): {}",
                        checker.notification_type(),
                        character_id,
                        e
                    );
                }
            }
        }
        Ok(())
    }
}

impl Default for NotificationProcessor {
    fn default() -> Self {
        Self::new()
    }
}

pub const EVENT_DATA_UPDATED: &str = "notification:data-updated";
pub const EVENT_NOTIFICATIONS_CHANGED: &str = "notifications:changed";

pub async fn emit_snapshot(app: &AppHandle, pool: &db::Pool) -> Result<()> {
    let notifications = db::get_notifications(pool, None, None).await?;
    let payload: Vec<NotificationResponse> = notifications
        .into_iter()
        .map(NotificationResponse::from)
        .collect();
    app.emit(EVENT_NOTIFICATIONS_CHANGED, payload)
        .map_err(|e| anyhow::anyhow!("Failed to emit notifications snapshot: {}", e))?;
    Ok(())
}
