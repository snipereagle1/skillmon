---
paths:
  - "src-tauri/src/notifications/**"
---

# Notifications System

Plugin-based architecture: individual checkers register and trigger when relevant data updates.

## Components

- **`NotificationProcessor`** (`notifications/mod.rs`) — manages checkers, listens for `EVENT_DATA_UPDATED`
- **`NotificationChecker` trait** — interface all checkers implement
- **`NotificationContext`** — provides `app`, `pool`, `rate_limits`
- **`checkers/`** — individual checker implementations

## Flow

1. Data updated → emit `EVENT_DATA_UPDATED` with `{ data_type, character_id }`
2. `NotificationProcessor` identifies checkers whose `data_triggers()` match `data_type`
3. Each matching checker's `check()` runs async
4. Checkers create or clear notifications as needed

## Adding a New Checker

### 1. Create `src-tauri/src/notifications/checkers/<type>.rs`

```rust
use anyhow::Result;
use tauri_plugin_notification::NotificationExt;
use crate::{db, notifications::{NotificationChecker, NotificationContext}};

pub const NOTIFICATION_TYPE_YOUR_TYPE: &str = "your_notification_type";

pub struct YourNotificationChecker;

#[async_trait::async_trait]
impl NotificationChecker for YourNotificationChecker {
    fn notification_type(&self) -> &'static str {
        NOTIFICATION_TYPE_YOUR_TYPE
    }

    fn data_triggers(&self) -> &[&'static str] {
        &["skill_queue"] // data types that trigger this checker
    }

    async fn check(&self, ctx: &NotificationContext<'_>, character_id: i64) -> Result<()> {
        let setting = db::get_notification_setting(
            ctx.pool, character_id, NOTIFICATION_TYPE_YOUR_TYPE
        ).await?;

        let Some(setting) = setting else { return Ok(()); };

        if !setting.enabled {
            db::clear_notification(ctx.pool, character_id, NOTIFICATION_TYPE_YOUR_TYPE).await.ok();
            return Ok(());
        }

        // Check condition
        let condition_met = /* your logic */;

        let has_active = db::get_notifications(ctx.pool, Some(character_id), None)
            .await.ok()
            .map(|n| n.iter().any(|notif|
                notif.notification_type == NOTIFICATION_TYPE_YOUR_TYPE
                    && notif.status == "active"
            ))
            .unwrap_or(false);

        if condition_met && !has_active {
            let character_name = db::get_character(ctx.pool, character_id)
                .await.ok().flatten()
                .map(|c| c.character_name)
                .unwrap_or_else(|| format!("Character {}", character_id));

            db::create_notification(
                ctx.pool, character_id, NOTIFICATION_TYPE_YOUR_TYPE,
                "Title", "Message",
            ).await?;

            let _ = ctx.app.notification().builder()
                .title(&format!("{} - Title", character_name))
                .body("Message")
                .show();
        } else if !condition_met && has_active {
            db::clear_notification(ctx.pool, character_id, NOTIFICATION_TYPE_YOUR_TYPE).await?;
        }

        Ok(())
    }
}
```

### 2. Export from `checkers/mod.rs`

```rust
pub mod your_notification_type;
pub use your_notification_type::YourNotificationChecker;
```

### 3. Register in `NotificationProcessor::register_checkers()`

```rust
self.checkers.push(Arc::new(checkers::YourNotificationChecker));
```

### 4. Add frontend constant to `src/lib/notificationTypes.ts`

```typescript
export const NOTIFICATION_TYPES = {
  SKILL_QUEUE_LOW: 'skill_queue_low',
  YOUR_TYPE: 'your_notification_type', // must match NOTIFICATION_TYPE_YOUR_TYPE
} as const;
```

## Triggering Checks

Emit `EVENT_DATA_UPDATED` after updating data:

```rust
use crate::notifications::{EVENT_DATA_UPDATED, DataUpdatedPayload};

app.emit(EVENT_DATA_UPDATED, DataUpdatedPayload {
    data_type: "skill_queue".to_string(),
    character_id,
})?;
```

### Data Type Strings

- `"skill_queue"` — skill queue refreshed
- `"skills"` — character skills updated

## Best Practices

- Check notification setting first — bail early if disabled
- Use cached ESI data where possible; avoid extra API calls in checkers
- Always include character name in the system notification title
- Check for existing active notifications before creating duplicates
- Clear when condition is no longer met
- Log errors, don't fail silently
