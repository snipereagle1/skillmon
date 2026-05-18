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
pnpm typegen         # typeshare: generate types.ts from Rust structs → src/generated/
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest (TZ=UTC)
pnpm lint            # eslint
pnpm lint:rust       # cargo clippy -D warnings
pnpm format          # prettier + cargo fmt
pnpm verify          # typegen + lint:full + format:check:all + typecheck
```

## Critical Rules

- **Never hand-edit `src/generated/`** — auto-generated. `types.ts` by typeshare (`pnpm typegen`). Run after Rust struct changes.
- **`routeTree.gen.ts` is generated** — run `pnpm generate-route-tree` or let Vite plugin handle it.
- Husky + lint-staged enforce eslint/prettier on TS and clippy/fmt on Rust pre-commit.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`snipereagle1/skillmon`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout — `docs/context/eve.md` (shared EVE domain) + `src/CONTEXT.md` (frontend) + `src-tauri/CONTEXT.md` (backend), each with their own `docs/adr/`. See `docs/agents/domain.md`.

### Claude Design Handoff

If you are presented with a handoff from Claude Design (recognized by links starting with https://api.anthropic.com/v1/design) extract to `.claude/design/` in a subdirectory based on the last part of the url. Use existing components and patterns from the design system. Surface ambiguity to the user, don't assume.
