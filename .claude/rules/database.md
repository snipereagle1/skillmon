---
paths:
  - "src-tauri/src/db/**"
  - "src-tauri/migrations/**"
---

# Database Operations

## Structure

- `src-tauri/src/db/mod.rs` — SQLite pool init (WAL mode), exports all db functions
- One file per domain: `characters.rs`, `tokens.rs`, `notifications.rs`, `skill_plans.rs`, etc.
- `db::Pool` is an alias for `SqlitePool`

## Access Pattern

Commands access the pool via Tauri State:

```rust
#[tauri::command]
async fn my_command(pool: State<'_, db::Pool>) -> Result<Vec<MyType>, String> {
    db::get_something(&*pool)
        .await
        .map_err(|e| format!("Failed: {}", e))
}
```

## Core Tables

### Application Data
- **characters** — `character_id`, `character_name`
- **tokens** — `character_id`, `access_token`, `refresh_token`, `expires_at`
- **character_attributes** — intelligence, memory, perception, willpower, charisma
- **enabled_features** — `feature_id TEXT PRIMARY KEY`

### Caching
- **esi_cache** — `cache_key`, `etag`, `expires_at`, `response_body`

SDE tables are documented in the `sde-system` rule.

## Query Patterns

```rust
// Type-safe single row
let character = sqlx::query_as!(Character,
    "SELECT * FROM characters WHERE character_id = ?",
    character_id
)
.fetch_optional(&*pool)
.await?;

// Multiple rows
let characters = sqlx::query_as!(Character, "SELECT * FROM characters")
    .fetch_all(&*pool)
    .await?;

// Mutation with transaction
let mut tx = pool.begin().await?;
sqlx::query!("INSERT INTO ...", ...).execute(&mut *tx).await?;
sqlx::query!("UPDATE ...", ...).execute(&mut *tx).await?;
tx.commit().await?;
```

## Migration Pattern

1. Create `src-tauri/migrations/NNN_description.sql` (next sequential number)
2. Use `CREATE TABLE IF NOT EXISTS` for new tables; `ALTER TABLE` for changes
3. Commit the file — migrations run automatically on startup via `sqlx::migrate!()`

## Best Practices

- Always use `query_as!` or `query_as::<_, Type>` for type-safe queries
- Use transactions for multi-step operations
- Use `fetch_optional()` when a row may or may not exist
- Use `fetch_all()` for multiple rows
- Bind parameters with `.bind()` — never string interpolation (SQL injection)
- Use `?` with `anyhow::Result` for error propagation inside db functions
