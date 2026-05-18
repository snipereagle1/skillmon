# Frontend Context

React 19 + TypeScript frontend for skillmon. Always load `docs/context/eve.md` first for game domain vocabulary.

## Glossary

**ESI store** — the Zustand store (`esiStore`) holding live character data (skills, skill queue, attributes, clones, remaps, locations). Populated by `RefreshSupervisor` events via `src/lib/esiEvents.ts` and `useAuthEvents` (auth-triggered snapshot hydration). Read via `useEsiStore`. Never fetched via React Query.

**Skill detail store** — the Zustand store (`skillDetailStore`) holding UI state for the skill detail modal (which skill/character is open).

**Undo/redo store** — the Zustand store (`undoRedoStore`) holding undo/redo stacks for user actions. Applies to skill plan edits.

**Update store** — the Zustand store (`updateStore`) tracking app update availability and metadata.

**Tauri command** — a Rust function exposed to the frontend via `invoke()`. Typed wrappers live in `src/hooks/tauri/`.

**Route** — a TanStack Router file-based route under `src/routes/`. The route tree is auto-generated; never edit `routeTree.gen.ts`.

**Hook** — a React hook. Hooks in `src/hooks/tauri/` wrap Tauri commands with TanStack Query. Hooks in `src/hooks/` are general UI hooks.

**Generated types** — TypeScript types in `src/generated/types.ts` produced by typeshare from Rust structs. Never hand-edit.

## Data flow

Live ESI data and mutations/static data use different layers. New hooks must go in the right place.

**Zustand (`src/stores/`) — client state**: `esiStore`, `skillDetailStore`, `undoRedoStore`, `updateStore`. See glossary entries above.

**React Query** — mutations, SDE/static data, settings, and one-shot startup queries. No `refetchInterval` or sub-minute `staleTime`/`gcTime` — live ESI data belongs to Zustand.

## Semantic type utilities

Defined in `src/index.css` (`@layer utilities`). Use these instead of raw Tailwind font/size/weight combos on any heading, label, or overline.

| Class        | Role                      | Font         | Size                              |
| ------------ | ------------------------- | ------------ | --------------------------------- |
| `h-display`  | Hero/splash heading       | Chakra Petch | 32px                              |
| `h-page`     | Page title                | Chakra Petch | 24px                              |
| `h-section`  | Section heading           | Chakra Petch | 20px                              |
| `h-card`     | Card/panel title          | Chakra Petch | 16px                              |
| `h-nav`      | Nav label / small heading | Chakra Petch | 13px                              |
| `p-overline` | Uppercase section label   | Fira Sans    | 12px, `fg-dim`, `tracking-widest` |

All classes bundle font-family, size, weight, tracking, and line-height. Compose with spacing/color utilities as needed (e.g. `h-page mb-2`, `h-card text-primary`).

## Architectural rules

- Live ESI data → Zustand (`esiStore`). No `refetchInterval` or sub-minute `staleTime`/`gcTime` on React Query for live data.
- Mutations, SDE/static data, settings → React Query.
- Use `ts-pattern` for exhaustive matching on discriminated unions.
- shadcn/ui primitives live in `src/components/ui/`; domain components elsewhere in `src/components/`.
