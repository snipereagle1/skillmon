# Backend Context

Rust + Tauri v2 backend for skillmon. Always load `docs/context/eve.md` first for game domain vocabulary.

## Glossary

**Tauri command** — a `#[tauri::command]` async function in `src-tauri/src/commands/`. Registered in `lib.rs`; callable from the frontend via `invoke()`.

**ESI client** — the HTTP client in `src-tauri/src/esi/`. All ESI calls go through it; includes rate limiting and ETag-based caching.

**RefreshSupervisor** — the background task manager in `src-tauri/src/refresh/`. Spawns one loop per authenticated character; polls ESI on a timer and emits Tauri events to the frontend.

**Tauri event** — a message emitted from Rust to the frontend via `app_handle.emit()`. Channel naming: `character:{id}:{data-type}` (e.g. `character:12345:queue`).

**sqlx pool** — the SQLite connection pool managed as Tauri state. Accessed in commands via `State<'_, SqlitePool>`.

**SDE import** — the process of loading EVE Static Data Export JSONL files into the local SQLite DB. Handled by `src-tauri/src/sde/`.

**OAuth2 flow** — ESI authentication via `src-tauri/src/auth/`. Spawns a local callback server to capture the auth code.

**Skill plan engine** — DAG-based prerequisite validation, training simulation, and optimisation logic in `src-tauri/src/skill_plans/`.

**Cache** — ESI response cache in `src-tauri/src/cache/`. Stores ETags and expiration timestamps to avoid redundant API calls.

## Architectural rules

- Tauri commands return `Result<T, String>`; use `anyhow` internally and stringify errors at the command boundary.
- ESI calls must go through the rate-limiter in `src-tauri/src/esi/` — never call ESI directly from a command.
- DB queries live in `src-tauri/src/db/` per domain; commands call db functions, not raw sqlx.
- Struct changes that cross the Tauri boundary require running `pnpm typegen` to regenerate `src/generated/types.ts`.
