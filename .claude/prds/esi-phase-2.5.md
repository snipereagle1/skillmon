---
name: esi-phase-2.5
description: Fix the event data layer — enriched payloads, pure setter listeners, single hydration command, and removal of tauri-typegen
status: backlog
created: 2026-05-07T04:52:20Z
---

# PRD: ESI Phase 2.5 — Event Data Layer Overhaul

## Executive Summary

Phase 2 shipped the Zustand store and event listener infrastructure but left two critical gaps: event payloads carry raw ESI shapes (not the enriched data the frontend actually consumes), and the supervisor silently does nothing on cache hits, starving the store. The result is permanent loading spinners when the cache is warm. Phase 2.5 fixes the data layer end-to-end: enriched payloads flow from the supervisor, listeners become pure setters, a single hydration command replaces the mount-time fan-out, and tauri-typegen is replaced with typeshare + inline invoke calls.

## Problem Statement

- Supervisor emits `Ok(None)` on cache hits — no event fires, the store never receives data, screens show infinite loading spinners.
- Event payloads carry raw ESI shapes (skill IDs, system IDs, location IDs) while the frontend needs enriched shapes (skill names, system names, station names). Listeners compensate by calling commands after every event, creating a double-fetch on every refresh.
- Commands that listeners call re-fetch from ESI if the cache is stale — introducing a race where the listener can beat the supervisor's cache write and trigger a duplicate ESI request.
- Mount-time hydration calls 5+ commands per character in a fan-out loop; if any fails or hangs, that character's store slices stay undefined indefinitely.
- tauri-typegen generates incorrect output in edge cases (wrong serde rename handling), requiring manual fixes that rot over time.
- Frontend components merge data from multiple store slices via `useMemo`, doing work that belongs in the backend.

## User Stories

- As a user, I expect the app to show data immediately after launch and after every background refresh — no permanent loading states.
- As a user, I expect the UI to reflect the latest ESI data without unnecessary delays from double-fetching.
- As a developer, I want event listeners to be pure setters — receiving a payload and writing it to the store, nothing more.
- As a developer, I want a single hydration call on app mount that returns all data for all characters, not a per-character fan-out.
- As a developer, I want the TypeScript type system to be correct by construction, not dependent on a tool that silently generates wrong output.

## Functional Requirements

### Backend — Supervisor Enrichment

- On every refresh cycle, the supervisor performs enrichment in Rust before emitting events:
  - **Queue**: skill names, rank, primary/secondary attribute IDs, `sp_per_minute` (computed from character attributes + omega status).
  - **Skills**: skill names, group names, group IDs, `is_in_queue`, `is_injected` flags.
  - **Attributes**: full breakdown per attribute — `base`, `implants`, `remap`, `accelerator`, `total`.
  - **Clones**: location name, `is_current`, implant type IDs + names.
  - **Location**: solar system name, region name, station/structure name + type ID, ship type name, ship name, online status, implant IDs + names. Ship, online status, and implants join the supervisor refresh loop.
- On cache hit (`Ok(None)`): supervisor reads the last-known row from SQLite and re-emits the enriched payload. The frontend never starves because the cache is warm.
- Location name resolution is DB-first; ESI is called only when IDs change (system/station/structure IDs differ from the cached row).

### Backend — Hydration Command

- `get_esi_snapshot` is replaced with a single command that returns fully enriched data for **all characters** in one call.
- Return shape covers: queue (with skill names, sp_per_minute), skills (with group names), attributes (full breakdown), clones (with implant names, location names), location (with all resolved names, ship, online status, implants), remaps.
- All reads are DB-only — no ESI calls, no network dependency on app launch.

### Backend — Command Removal

- Remove commands made redundant by the event layer: `get_skill_queue_for_character`, `get_skill_queues`, `get_character_skills_with_groups`, `get_character_attributes_breakdown`, `get_clones`, `get_all_characters_locations`, `get_character_location`, `get_training_characters_count`, `get_training_characters_overview`.
- Retained commands: `force_refresh_skill_queue`, `get_character_remaps`, `get_esi_snapshot` (new shape), and all mutation/auth/account/settings/notification/skill-plan commands.

### Frontend — Pure Setter Listeners

- `src/lib/esiEvents.ts` listeners write the event payload directly to the Zustand store. No command calls, no network requests in listeners.
- Each payload arrives in the exact shape the store and components consume — no transformation required in the listener.

### Frontend — Hydration

- `__root.tsx` mount hydration calls the single `get_esi_snapshot` command once — no per-character loop, no fan-out.
- If the command fails, individual slice errors are set so `isLoading` flips false and screens show an error state rather than a permanent spinner.

### Frontend — Type System

- tauri-typegen is removed entirely.
- All command input/output structs in Rust are annotated with `#[typeshare]`. `pnpm typeshare` generates `src/generated/types.ts` and `src/generated/events.ts`.
- `src/generated/commands.ts` is deleted. `invoke()` calls move directly into the hooks that use them.
- `src/generated/` contains only generated files; no manually maintained generated code.
- `pnpm typegen` script is replaced by `pnpm typeshare`.

## Non-Functional Requirements

- DB reads in the supervisor enrichment path must not block the ESI fetch path — enrichment runs after the ESI result is persisted.
- Location ESI calls (ship, online, implants) are fetched in parallel within the same supervisor cycle.
- Hydration command must return in under 500ms on typical hardware (SQLite reads only, no network).
- No regression in notification behavior — supervisor loop restructuring must not affect `NotificationProcessor` calls.

## Success Criteria

- App shows populated data immediately after launch with no loading spinners (when SQLite has prior data).
- Event listeners contain zero `invoke()` / command calls — verified by code review.
- `src/generated/commands.ts` does not exist.
- tauri-typegen is not in `Cargo.toml` or `package.json`.
- All command types are annotated with `#[typeshare]` and present in `src/generated/types.ts`.
- No frontend component performs data joins across store slices via `useMemo` for ESI live data.
- `Ok(None)` cache-hit path emits a re-hydration event — verified by disabling ESI network access and confirming UI updates still fire.

## Constraints & Assumptions

- SDE tables (skill names, group names, type names) are pre-populated and available for DB-only enrichment reads.
- Station and structure names may not be in the DB for a new install — first location fetch triggers ESI resolution and persists the result; subsequent refreshes read from DB.
- Remaps stay command-driven (not event-driven) — they change infrequently and are already a stable command.
- `force_refresh_skill_queue` stays as a command — it is a manual trigger, not a data fetch.

## Out of Scope

- Adding new ESI endpoints or notification types.
- Refactoring SDE or static-data flows.
- Refactoring mutation flows (save remap, skill plan mutations, etc.).
- Per-skill completion timers or precise notification timing.
- Any changes to auth, accounts, or settings flows.

## Dependencies

- Phase 2 complete (Zustand store, event listeners, supervisor running).
- Phase 2 findings document: `.claude/epics/esi-phase-2/findings.md`.
- SDE populated (skill names, type names available in SQLite).
