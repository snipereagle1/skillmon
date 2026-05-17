# Code Organization

## Backend (`src-tauri/src/`)

### Core Modules

| Module | Purpose |
|--------|---------|
| `commands/` | Tauri invoke handlers — organized by domain, registered in `lib.rs` |
| `db/` | sqlx queries per domain (characters, tokens, skills, clones, notifications, etc.) |
| `esi/` | EVE ESI HTTP client + rate limiting (auto-generated client, do not edit `client.rs` / `types.rs`) |
| `auth/` | OAuth2 flow + local callback server |
| `sde.rs` | Static Data Export import/management (single file) |
| `notifications/` | Plugin-based notification checkers |
| `refresh/` | `RefreshSupervisor` — per-character background loops, polls ESI, emits Tauri events |
| `skill_plans/` | DAG-based prerequisite validation, training simulation, optimisation |
| `cache/` | ESI response cache with ETags and expiration timestamps |
| `features.rs` | Optional feature definitions and ESI scope management (single file) |

### Key Files

- `lib.rs` — app setup, command registration via `invoke_handler![]`, module declarations
- `main.rs` — minimal entry point, delegates to `lib.rs`

### `commands/` Structure

- `mod.rs` — exports all command modules
- One file per domain: `auth.rs`, `characters.rs`, `skill_queues.rs`, `settings.rs`, etc.
- Commands registered in `lib.rs`: `commands::domain::command_name`

### `db/` Structure

- `mod.rs` — pool initialisation, exports all db functions
- One file per domain: `characters.rs`, `tokens.rs`, `notifications.rs`, `skill_plans.rs`, etc.
- Commands call db functions — never raw sqlx in a command

## Frontend (`src/`)

### Core Files

- `main.tsx` — React entry point, router initialisation
- `index.css` — global styles, Tailwind CSS imports
- `routes/__root.tsx` — root layout, global auth event listeners, global dialogs

### Directories

| Directory | Purpose |
|-----------|---------|
| `routes/` | TanStack Router file-based routes |
| `components/ui/` | shadcn/ui primitives (never edit manually) |
| `components/` | Domain components; feature subdirectories for cohesive groups |
| `hooks/tauri/` | TanStack Query wrappers around Tauri commands |
| `hooks/` | General UI hooks |
| `stores/` | Zustand stores (`esiStore`, `skillDetailStore`, `undoRedoStore`, `updateStore`) |
| `lib/` | Shared utilities (`cn()`, `notificationTypes.ts`) |
| `generated/` | Auto-generated types (`types.ts`) — never edit manually |

### Path Aliases

```typescript
@/components     → src/components
@/components/ui  → src/components/ui
@/hooks          → src/hooks
@/lib            → src/lib
@/generated      → src/generated
```

Always use aliases, not relative paths.

## File Naming Conventions

- **Rust**: `snake_case.rs` for files, `snake_case` for functions/variables
- **TypeScript/React**: `PascalCase.tsx` for components, `camelCase.ts` for utilities
- **SQL Migrations**: `NNN_description.sql` (sequential numbers)

## Import Patterns

### Rust
```rust
use crate::db;
use crate::esi;
use crate::cache;
use crate::commands;
use crate::notifications;
```

### TypeScript
```typescript
import { Component } from '@/components/ui/component';
import { useHook } from '@/hooks/tauri/useHook';
import { invoke } from '@tauri-apps/api/core';
import type { Type } from '@/generated/types';
```

## Configuration Files

- `package.json` / `pnpm-lock.yaml` — frontend deps (use pnpm)
- `tsconfig.json` — TypeScript config
- `vite.config.ts` — Vite build config
- `components.json` — shadcn/ui config
- `src-tauri/Cargo.toml` — Rust deps
- `src-tauri/tauri.conf.json` — Tauri app config
- `src-tauri/migrations/` — SQL migration files
