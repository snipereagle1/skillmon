# skillmon

EVE Online skill monitoring/planning desktop app. Tauri v2 (Rust backend) + React 19 frontend.

## Stack

- **Frontend**: React 19, TypeScript, TanStack Router, TanStack Query, Tailwind v4, shadcn/ui, Zustand
- **Backend**: Rust (Tauri v2), SQLite via sqlx, EVE ESI API
- **Build**: pnpm, Vite, Cargo

## Commands

```bash
pnpm tauri:dev       # dev (runs typegen first)
pnpm tauri:build     # prod build (runs typegen first)
pnpm typegen         # generate TS types from Rust structs → src/generated/
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest (TZ=UTC)
pnpm lint            # eslint
pnpm lint:rust       # cargo clippy -D warnings
pnpm format          # prettier + cargo fmt
pnpm verify          # typegen + lint:full + format:check:all + typecheck
```

## Critical Rules

- **Never hand-edit `src/generated/`** — auto-generated from Rust structs. Run `pnpm typegen` after any Rust struct changes.
- **`routeTree.gen.ts` is generated** — run `pnpm generate-route-tree` or let Vite plugin handle it.
- Husky + lint-staged enforce eslint/prettier on TS and clippy/fmt on Rust pre-commit.

## Architecture

### Frontend (`src/`)

- `routes/` — TanStack Router file-based routes
- `components/` — React components; `ui/` = shadcn primitives
- `hooks/tauri/` — typed wrappers around Tauri commands (TanStack Query)
- `generated/` — Tauri typegen output, never edit manually
- `stores/` — Zustand stores
- `lib/` — shared utilities

### Backend (`src-tauri/src/`)

- `commands/` — Tauri invoke handlers (exposed to frontend)
- `db/` — sqlx queries per domain (accounts, characters, skill_plans, etc.)
- `esi/` — EVE ESI HTTP client + rate limiting
- `auth/` — OAuth2 + callback server
- `sde/` — Static Data Export import/management
- `notifications/` — background notification checks

## Patterns

- Tauri commands return `Result<T, String>` (anyhow errors stringified)
- ESI calls go through rate-limiter in `esi/`
- DB uses sqlx with SQLite; pool managed via Tauri state
- Frontend uses TanStack Query for all async data; invalidate on mutations
- Use `ts-pattern` for exhaustive matching on discriminated unions
