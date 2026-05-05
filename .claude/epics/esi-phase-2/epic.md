---
name: esi-phase-2
status: backlog
created: 2026-05-05T00:18:53Z
updated: 2026-05-05T00:33:29Z
progress: 0%
prd: .claude/prds/esi-revamp.md
github: (will be set on sync)
---

# Epic: ESI Phase 2 — Zustand Store + Hook Migration

## Overview

Replace Phase 1's React Query cache adapter with a proper Zustand store for all live ESI data. Migrate live-data hooks one resource at a time: each migration swaps the hook internals (RQ → store selector), removes the corresponding Phase 1 RQ adapter, and keeps the hook's public API stable so consumer components don't change. Depends on Phase 1 being complete and event bridge running.

## Architecture Decisions

- **Store shape**: `useEsiStore` with per-resource slices keyed by `character_id`: `queues`, `skills`, `locations`, `publicInfo`, `attributes`, `clones`, `remaps`. Each slice: `{ data: T | null, lastUpdatedAt: string | null, lastError: string | null }`.
- **Event bootstrap**: update `src/lib/esiEvents.ts` to call store setters instead of `queryClient.setQueryData`. Remove Phase 1 RQ adapter entirely for each migrated resource.
- **Hook API stability**: hook signatures must stay compatible with their current RQ equivalents. Use store selectors internally, no `useQuery`.
- **Migration order**: queue first (most impactful), then skills, then location, then attributes/clones/remaps.
- **Dual-system invariant**: during migration, no resource has both a Zustand listener and an RQ listener writing to it. Remove the Phase 1 RQ adapter for a resource when its hook migrates.

## Technical Approach

### Frontend Components

**`src/stores/esiStore.ts`** (new): Zustand store with all live-resource slices. Setter per resource per character. No side effects in setters — pure state updates.

**`src/lib/esiEvents.ts`**: update listeners to call store setters (one resource at a time as hooks migrate, removing RQ adapter per resource).

**Hooks to migrate** (all in `src/hooks/tauri/`):

- `useSkillQueue.ts` → reads `useEsiStore(state => state.queues[characterId])`
- `useOverview.ts` → reads queue + skills slices (or delegate to migrated hooks)
- `useCharacterSkills.ts` → reads `state.skills[characterId]`
- `useLocationsOverview.ts` → reads `state.locations[characterId]`
- `useAttributes.ts` → reads `state.attributes[characterId]`
- `useClones.ts` → reads `state.clones[characterId]`
- `useRemaps.ts` → reads `state.remaps[characterId]`

**Initial hydration**: update `bootstrapEsiEvents` / app mount to call `get_esi_snapshot` and populate Zustand store before event listeners take over (Phase 1 already adds the command; Phase 2 wires it to the store).

### Backend Services

No new backend work. Rust supervisor and event bridge from Phase 1 are unchanged.

## Implementation Strategy

Store creation and first hook migration can happen in parallel with updating the event bootstrap. Subsequent hook migrations are sequential per resource (to enforce the dual-system invariant). Each migration is a standalone PR.

## Task Breakdown Preview

1. Create `src/stores/esiStore.ts` — all live-resource slices, typed setters, initial hydration from `get_esi_snapshot`
2. Migrate queue: update `useSkillQueue.ts` → store selector; update `esiEvents.ts` queue listener → store setter; remove RQ adapter for queue
3. Migrate skills: `useCharacterSkills.ts` + overview skills portion → store; remove RQ adapter for skills
4. Migrate location: `useLocationsOverview.ts` → store; remove RQ adapter for location
5. Migrate attributes/clones/remaps: `useAttributes.ts`, `useClones.ts`, `useRemaps.ts` → store; remove remaining RQ adapters
6. Migrate `useOverview.ts` to compose from store slices (queue + skills already migrated); verify no dangling RQ live-data reads
7. Verify dual-system invariant: no resource has both a Zustand listener and RQ listener

## Dependencies

- Phase 1 complete (supervisor running, events emitting, `get_esi_snapshot` command exists).
- Zustand (already in stack).

## Success Criteria (Technical)

- All live-data hooks read from Zustand; no `useQuery` for ESI live data.
- `esiEvents.ts` contains only store setter calls (no `queryClient.setQueryData` for live data).
- No Phase 1 RQ adapters remain.
- Consumer components unchanged (hook API stable).
- `useEsiStore` contains `lastUpdatedAt` + `lastError` on every slice (even if UI doesn't surface them yet).

## Estimated Effort

Medium. ~7 tasks. Each hook migration is small and isolated; complexity is in ordering and invariant enforcement.

## Tasks Created

- [ ] 001.md - Create Zustand ESI Store + Wire Initial Hydration (parallel: true)
- [ ] 002.md - Migrate Skill Queue Hook to Zustand (parallel: false)
- [ ] 003.md - Migrate Character Skills Hook to Zustand (parallel: false)
- [ ] 004.md - Migrate Location Hook to Zustand (parallel: false)
- [ ] 005.md - Migrate Attributes, Clones, and Remaps Hooks to Zustand (parallel: false)
- [ ] 006.md - Migrate useOverview (Training Characters) Hook to Zustand (parallel: false)
- [ ] 007.md - Phase 2 Audit — Verify No Live-Data Leaks into React Query (parallel: true)

Total tasks: 7
Parallel tasks: 2 (001 with Phase 1 work if any; 007 final audit)
Sequential tasks: 5 (002–006, ordered by resource migration with esiEvents.ts constraint)
Estimated total effort: 16 hours
