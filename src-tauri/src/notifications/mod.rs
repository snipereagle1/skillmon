use std::sync::Arc;

use anyhow::Result;
use tauri::AppHandle;

use crate::db;
use crate::esi;

pub mod checkers;

pub struct NotificationContext<'a> {
    pub app: &'a AppHandle,
    pub pool: &'a db::Pool,
    #[allow(dead_code)] // May be used by future notification checkers
    pub rate_limits: &'a esi::RateLimitStore,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct DataUpdatedPayload {
    pub data_type: String,
    pub character_id: i64,
}

#[async_trait::async_trait]
pub trait NotificationChecker: Send + Sync {
    fn notification_type(&self) -> &'static str;
    fn data_triggers(&self) -> &[&'static str];
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
        data_type: &str,
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
