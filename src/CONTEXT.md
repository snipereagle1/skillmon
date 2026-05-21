# Frontend Context

React 19 + TypeScript frontend for skillmon. Always load `docs/context/eve.md` first for game domain vocabulary.

## Glossary

**ESI store** — the Zustand store (`esiStore`) holding live character data (skills, skill queue, attributes, clones, remaps, locations). Populated by `RefreshSupervisor` events via `src/lib/esiEvents.ts` and `useAuthEvents` (auth-triggered snapshot hydration). Read via `useEsiStore`. Never fetched via React Query.

**Skill detail store** — the Zustand store (`skillDetailStore`) holding UI state for the skill detail modal (which skill/character is open).

**Undo/redo store** — the Zustand store (`undoRedoStore`) holding undo/redo stacks for user actions. Applies to skill plan edits.

**Update store** — the Zustand store (`updateStore`) tracking app update availability and metadata.

**Notifications store** — the Zustand store (`notificationsStore`) holding the full notification list (active + dismissed) for all characters. Populated by a single `notifications:changed` Tauri event whose payload is the complete snapshot. Hydrated at startup by a backend-emitted snapshot; re-emitted after every create, clear, or dismiss. Read via selectors (`useActiveNotifications`, `useNotificationsForCharacter`, `useUnreadCount`). Never fetched via React Query — see `docs/adr/0001-notifications-via-zustand.md`.

**Plan group** — a presentational folder containing skill plans and/or other plan groups. Rendered as a tree on `/plans` and `/characters/$characterId/plans` via shadcn-tree-view. Folders and plans mix freely at any level; root-level ungrouped plans sit alongside top-level folders. Expanded-group state persists in `app_settings`. Backend owns the tree shape; see backend `CONTEXT.md`.

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

## Design tokens

All tokens are CSS custom properties defined in `src/index.css`. **Always use Tailwind utility classes — never raw `var(--token)` in component code.** Raw `var()` is only acceptable inside `@layer utilities` definitions in `index.css`.

### Surfaces

| Token                | Tailwind class              | Use                      |
| -------------------- | --------------------------- | ------------------------ |
| `--bg`               | `bg-background`             | Page/app background      |
| `--surface`          | `bg-card`                   | Panel/card surface       |
| `--surface-elevated` | `bg-muted` / `bg-secondary` | Elevated surface, inputs |
| `--surface-hover`    | `bg-accent`                 | Hover state background   |

### Foreground

| Token        | Tailwind class          | Use                       |
| ------------ | ----------------------- | ------------------------- |
| `--fg`       | `text-foreground`       | Primary text              |
| `--fg-muted` | `text-muted-foreground` | Secondary/supporting text |
| `--fg-dim`   | `text-fg-dim`           | Tertiary/metadata text    |
| `--fg-faint` | `text-fg-faint`         | Placeholder / disabled    |

### Brand

| Token               | Tailwind class                        | Use                        |
| ------------------- | ------------------------------------- | -------------------------- |
| `--brand`           | `text-primary` / `bg-primary`         | Primary interactive colour |
| `--brand-hover`     | `text-brand-hover` / `bg-brand-hover` | Hover state                |
| `--brand-active`    | `text-brand-active`                   | Active/pressed state       |
| `--brand-deep`      | `bg-brand-deep`                       | Deep brand fill (badges)   |
| `--brand-ink`       | `text-primary-foreground`             | Text on primary bg         |
| `--brand-glow`      | `ring-brand-glow`                     | Focus ring / glow          |
| `--brand-glow-soft` | `bg-brand-glow-soft`                  | Soft brand tint bg         |

### Edges

| Token             | Tailwind class         | Use             |
| ----------------- | ---------------------- | --------------- |
| `--border`        | `border-border`        | Default border  |
| `--border-strong` | `border-border-strong` | Emphatic border |

### Status

| Token               | Tailwind class         | Meaning                  |
| ------------------- | ---------------------- | ------------------------ |
| `--status-training` | `text-status-training` | Skill actively training  |
| `--status-paused`   | `text-status-paused`   | Queue paused             |
| `--status-empty`    | `text-status-empty`    | Queue empty              |
| `--status-info`     | `text-status-info`     | Informational / timeline |
| `--status-omega`    | `text-status-omega`    | Omega-only skill         |
| `--status-danger`   | `text-destructive`     | Error / danger           |

Each status colour has a `-soft` variant (`bg-status-training-soft` etc.) for tinted backgrounds.

### Shadows and motion

Shadow (`--shadow-sm/md/lg/glow/inset`) and motion (`--ease`, `--ease-out`, `--dur-fast/base/slow`) tokens are **not mapped to Tailwind utilities** — their naming would collide with Tailwind's built-ins and the benefit is low. Use `var()` for these, but only inside `@layer utilities` definitions in `index.css` or component `style` props where a Tailwind class cannot express the value.

## Architectural rules

- Live ESI data → Zustand (`esiStore`). No `refetchInterval` or sub-minute `staleTime`/`gcTime` on React Query for live data.
- Mutations, SDE/static data, settings → React Query.
- Use `ts-pattern` for exhaustive matching on discriminated unions.
- shadcn/ui primitives live in `src/components/ui/`; domain components elsewhere in `src/components/`.
