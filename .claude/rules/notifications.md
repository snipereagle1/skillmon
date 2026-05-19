---
paths:
  - "src-tauri/src/notifications/**"
---

# Notifications System

Plugin-based architecture: individual checkers register and trigger when relevant data updates.

## Components

- **`NotificationProcessor`** (`notifications/mod.rs`) — manages checkers, dispatches on `DataType`
- **`NotificationChecker` trait** — interface all checkers implement
- **`NotificationContext`** — provides `app`, `pool`, `rate_limits`
- **`DataType` enum** (`notifications/mod.rs`) — typed identifiers for what changed (`SkillQueue`, `Skills`, `Attributes`, `Clones`, `Location`)
- **`emit_snapshot`** (`notifications/mod.rs`) — broadcasts the full notification list to the frontend via `notifications:changed`. Call after any create/clear.
- **`checkers/`** — individual checker implementations

## Flow

1. Data updated → emit `EVENT_DATA_UPDATED` with `DataUpdatedPayload { data_type: DataType, character_id }`
2. `NotificationProcessor` runs every checker whose `data_triggers()` contains the `DataType`
3. Each checker's `check()` runs async, creates/clears notifications, and calls `emit_snapshot` only when state changed

## Adding a New Checker

1. Create `src-tauri/src/notifications/checkers/<type>.rs` — mirror the structure of `skill_queue_low.rs` (the canonical reference). Key rules:
   - Bail early if the setting is missing or disabled (clear any existing notification first; emit snapshot only if `clear_notification` returned `true`)
   - Use `db::has_active_notification` to deduplicate, not in-memory filtering
   - Call `notifications::emit_snapshot(ctx.app, ctx.pool)` after every successful create or clear — log emit errors, don't fail the check
2. Export from `checkers/mod.rs`:
   ```rust
   pub mod your_type;
   pub use your_type::YourChecker;
   ```
3. Register in `NotificationProcessor::register_checkers()` (`notifications/mod.rs`)
4. Add the frontend constant to `src/lib/notificationTypes.ts` — must match the Rust `NOTIFICATION_TYPE_*` value

## Triggering Checks

Emit `EVENT_DATA_UPDATED` after updating data — use the typed `DataType`, not strings:

```rust
use crate::notifications::{DataUpdatedPayload, DataType, EVENT_DATA_UPDATED};

app.emit(EVENT_DATA_UPDATED, DataUpdatedPayload {
    data_type: DataType::SkillQueue,
    character_id,
})?;
```

Add new variants to `DataType` in `notifications/mod.rs` when a new data category needs to trigger checks.

## Frontend Wiring

- Backend emits `notifications:changed` with the full snapshot whenever notifications change
- `src/lib/esiEvents.ts` listens once at bootstrap and calls `invoke('request_notifications_snapshot')` to hydrate
- Snapshot lands in `useNotificationsStore` (Zustand); components read via `useActiveNotifications`, `useNotificationsForCharacter`, `useUnreadCount`
- Mutations (`useDismissNotification`) update the store optimistically in `onMutate` — the authoritative refresh arrives via the next `notifications:changed`

## Best Practices

- Check the notification setting first — bail early if disabled
- Use cached ESI data; avoid extra API calls in checkers
- Always include character name in the OS-level notification title
- Always call `emit_snapshot` after a create or clear — but only when the DB actually changed (gate on `cleared: bool` or the `if !has_active` create branch)
- Log emit errors with `eprintln!`; never fail the check on emit failure
- Use `db::has_active_notification` for deduplication
