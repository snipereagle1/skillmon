# Frontend Context

React 19 + TypeScript frontend for skillmon. Always load `docs/context/eve.md` first for game domain vocabulary.

## Glossary

**ESI store** — the Zustand store (`esiStore`) holding live character data (skills, skill queue, attributes, clones, remaps, locations). Populated by `RefreshSupervisor` events; never fetched via React Query.

**Tauri command** — a Rust function exposed to the frontend via `invoke()`. Typed wrappers live in `src/hooks/tauri/`.

**Route** — a TanStack Router file-based route under `src/routes/`. The route tree is auto-generated; never edit `routeTree.gen.ts`.

**Hook** — a React hook. Hooks in `src/hooks/tauri/` wrap Tauri commands with TanStack Query. Hooks in `src/hooks/` are general UI hooks.

**Skill detail modal** — the UI panel showing details for a single skill. State (which skill/character is open) lives in `skillDetailStore`.

**Undo/redo stack** — user action history managed by `undoRedoStore`. Applies to skill plan edits.

**Generated types** — TypeScript types in `src/generated/types.ts` produced by typeshare from Rust structs. Never hand-edit.

## Architectural rules

- Live ESI data → Zustand (`esiStore`). No `refetchInterval` or sub-minute `staleTime` on React Query for live data.
- Mutations, SDE/static data, settings → React Query.
- Use `ts-pattern` for exhaustive matching on discriminated unions.
- shadcn/ui primitives live in `src/components/ui/`; domain components elsewhere in `src/components/`.
