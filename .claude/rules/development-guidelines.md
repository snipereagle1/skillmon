# Development Guidelines

## Package Management

Always use **pnpm** — never npm or yarn.

```bash
pnpm install
pnpm add <package>
pnpm remove <package>
```

## UI Components

Always use the **shadcn CLI** to add components. Never manually create shadcn component files.

```bash
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add dialog
```

Components land in `src/components/ui/` automatically. Config is in `components.json`.

## Database (Rust)

- Use `sqlx` with compile-time query checking
- Use transactions for multi-step operations
- Use `anyhow::Result` for error propagation
- Use `?` operator for error handling
- Prefer type-safe queries with `query_as!` or `query_as::<_, Type>`

## ESI Requests

- Always use `esi::fetch_cached()` — handles caching, ETags, and rate limit tracking automatically
- Pass `rate_limits: &esi::RateLimitStore` to all ESI-fetching functions
- Never call ESI endpoints directly — always go through the rate-limiter in `esi/`

## Frontend Data Fetching

- Always use TanStack Query (`@tanstack/react-query`) for data fetching
- Never use `fetch` or `axios` directly for Tauri commands
- Use generated command functions from `@/generated/commands` instead of calling `invoke()` directly
- Use custom hooks in `src/hooks/tauri/` to wrap Tauri commands
- Invalidate queries after mutations to refresh data
- Use `@/generated/types` — never manually define types that mirror Rust structs

## Tauri Commands

- Return `Result<T, String>` for error handling
- Use `State<'_, db::Pool>` to access the database
- Include `rate_limits: State<'_, esi::RateLimitStore>` for commands that make ESI requests
- Use `async` for all commands
- Convert `anyhow::Result` with `.map_err(|e| format!("...: {}", e))`
- Emit Tauri events when state changes the frontend should know about

## Error Handling

- **Rust**: `anyhow::Result` internally, `Result<T, String>` at the Tauri command boundary
- **TypeScript**: handle `error` state from TanStack Query
- User-facing errors: clear, actionable messages

## Code Style

- **Rust**: standard conventions (snake_case)
- **TypeScript**: strict mode, prefer interfaces over types for objects
- **React**: functional components + hooks
- Comments only for non-obvious WHY, never for WHAT

## Key Patterns

- Tauri commands return `Result<T, String>` (anyhow errors stringified at boundary)
- ESI calls always go through rate-limiter in `esi/`
- DB uses sqlx with SQLite; pool managed via Tauri state
- Use `ts-pattern` for exhaustive matching on discriminated unions
- Live ESI data → Zustand (`esiStore`); mutations + static data → TanStack Query

## Environment Variables

- **EVE_CLIENT_ID** (required): OAuth client ID from EVE Developers portal
- **EVE_CALLBACK_URL** (optional): Override callback URL (default: `http://localhost:1421/callback`)
- Never commit `.env` files

## Generated Files — Never Hand-Edit

- `src/generated/` — run `pnpm typegen` after any Rust struct change
- `routeTree.gen.ts` — managed by the TanStack Router Vite plugin
- `src-tauri/src/esi/client.rs`, `types.rs` — run `./scripts/generate-esi.sh` to regenerate
