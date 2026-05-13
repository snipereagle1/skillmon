---
paths:
  - "src-tauri/src/commands/**"
  - "src-tauri/src/lib.rs"
---

# Tauri Commands

## Location

Commands live in `src-tauri/src/commands/`, one file per domain. Each uses `#[tauri::command]`.

## Standard Command Signature

```rust
#[tauri::command]
async fn command_name(
    pool: State<'_, db::Pool>,
    rate_limits: State<'_, esi::RateLimitStore>, // only for commands that call ESI
    // additional parameters...
) -> Result<ReturnType, String> {
    db::some_operation(&*pool)
        .await
        .map_err(|e| format!("Failed to ...: {}", e))
}
```

## State Access

| State | Type | When to include |
|-------|------|----------------|
| Database pool | `State<'_, db::Pool>` | Almost all commands |
| Rate limits | `State<'_, esi::RateLimitStore>` | Commands making ESI requests |
| Auth state | `State<'_, AuthStateMap>` | Auth flow commands |
| App handle | `tauri::AppHandle` | Emitting events, path resolution |

## Error Handling

Always return `Result<T, String>`. Convert `anyhow::Result` at the boundary:

```rust
.map_err(|e| format!("Failed to load characters: {}", e))
```

## Adding a New Command

1. Identify the domain (characters, skills, notifications, settings, etc.)
2. Add `#[tauri::command] async fn` to `src-tauri/src/commands/<domain>.rs`
3. Ensure the module is exported in `commands/mod.rs`
4. Register it in `lib.rs` via `invoke_handler![]`:
   ```rust
   commands::domain::command_name,
   ```
5. Run `pnpm typegen` to regenerate frontend bindings
6. Create a custom hook in `src/hooks/tauri/` if it fetches data
7. Use the hook in components via the generated function from `@/generated/commands`

## Emitting Events

```rust
#[tauri::command]
async fn my_command(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("event-name", payload)
        .map_err(|e| format!("Failed to emit: {}", e))?;
    Ok(())
}
```

## ESI and Live Data

Live character ESI data (skill queue, skills, attributes, location, clones) is owned by `RefreshSupervisor` — never fetch it inside a command. The frontend receives live data via Tauri events and stores it in Zustand (`esiStore`), not via React Query polling commands.

Include `rate_limits: State<'_, esi::RateLimitStore>` only when a command genuinely makes an ESI request.

## Best Practices

- One command = one operation — keep commands focused
- Descriptive names matching their purpose
- Always `async` (db and HTTP are async)
- DB calls go through `db::` functions, never raw sqlx in a command
- ESI calls go through `esi::fetch_cached()`, never direct HTTP
- TypeScript bindings auto-generated — no manual type definitions needed
