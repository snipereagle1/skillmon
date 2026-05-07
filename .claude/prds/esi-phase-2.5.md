---
name: esi-phase-2.5
description: Fix the event data layer — enriched payloads, pure setter listeners, single hydration command, and removal of tauri-typegen
status: backlog
created: 2026-05-07T04:52:20Z
---

# PRD: ESI Phase 2.5 — Event Data Layer Overhaul

## Executive Summary

Phase 2 shipped Zustand store + event listeners but left two gaps: payloads carry raw ESI shapes (not enriched), supervisor silent on cache hits, starving store. Result: permanent loading spinners when cache warm. Phase 2.5 fixes data layer end-to-end: enriched payloads from supervisor, listeners become pure setters, single hydration command replaces mount-time fan-out, tauri-typegen replaced with typeshare + inline invoke calls.

## Problem Statement

- Supervisor emits `Ok(None)` on cache hits — no event fires, store never gets data, screens show infinite spinners.
- Payloads carry raw ESI shapes (skill IDs, system IDs, location IDs); frontend needs enriched shapes (names). Listeners compensate by calling commands after every event — double-fetch on every refresh.
- Commands listeners call re-fetch from ESI if cache stale — race where listener beats supervisor cache write, duplicate ESI request.
- Mount-time hydration calls 5+ commands per character; any failure/hang leaves that character's store slices undefined indefinitely.
- tauri-typegen generates wrong output in edge cases (bad serde rename handling), requires manual fixes that rot.
- Frontend components merge data from multiple store slices via `useMemo` — work that belongs in backend.

## User Stories

- User: app shows data immediately after launch + every background refresh — no permanent loading states.
- User: UI reflects latest ESI data without double-fetch delays.
- Developer: event listeners are pure setters — receive payload, write to store, nothing more.
- Developer: single hydration call on mount returns all data for all characters, no per-character fan-out.
- Developer: TypeScript types correct by construction, not dependent on tool that silently generates wrong output.

## Functional Requirements

### Backend — Supervisor Enrichment

- Every refresh cycle, supervisor enriches in Rust before emitting events:
  - **Queue**: skill names, rank, primary/secondary attribute IDs, `sp_per_minute` (computed from character attributes + omega status).
  - **Skills**: skill names, group names, group IDs, `is_in_queue`, `is_injected` flags.
  - **Attributes**: full breakdown per attribute — `base`, `implants`, `remap`, `accelerator`, `total`.
  - **Clones**: location name, `is_current`, implant type IDs + names.
  - **Location**: solar system name, region name, station/structure name + type ID, ship type name, ship name, online status, implant IDs + names. Ship, online status, implants join supervisor refresh loop.
- Cache hit (`Ok(None)`): supervisor reads last-known SQLite row, re-emits enriched payload. Frontend never starves.
- Location name resolution DB-first; ESI called only when IDs change.

### Backend — Hydration Command

- `get_esi_snapshot` replaced with single command returning fully enriched data for **all characters** in one call.
- Return shape: queue (skill names, sp_per_minute), skills (group names), attributes (full breakdown), clones (implant names, location names), location (all resolved names, ship, online status, implants), remaps.
- All reads DB-only — no ESI calls, no network on app launch.

### Backend — Command Removal

- Remove commands made redundant by event layer: `get_skill_queue_for_character`, `get_skill_queues`, `get_character_skills_with_groups`, `get_character_attributes_breakdown`, `get_clones`, `get_all_characters_locations`, `get_character_location`, `get_training_characters_count`, `get_training_characters_overview`.
- Retained: `force_refresh_skill_queue`, `get_character_remaps`, `get_esi_snapshot` (new shape), all mutation/auth/account/settings/notification/skill-plan commands.

### Frontend — Pure Setter Listeners

- `src/lib/esiEvents.ts` listeners write payload directly to Zustand store. No command calls, no network in listeners.
- Each payload arrives in exact shape store + components consume — no transformation needed.

### Frontend — Hydration

- `__root.tsx` mount hydration calls single `get_esi_snapshot` once — no per-character loop, no fan-out.
- On failure: individual slice errors set, `isLoading` flips false, screens show error state not permanent spinner.

### Frontend — Type System

- tauri-typegen removed entirely.
- All command input/output structs annotated with `#[typeshare]`. `pnpm typeshare` generates `src/generated/types.ts` + `src/generated/events.ts`.
- `src/generated/commands.ts` deleted. `invoke()` calls move into hooks that use them.
- `src/generated/` contains only generated files — no manually maintained generated code.
- `pnpm typegen` replaced by `pnpm typeshare`.

## Non-Functional Requirements

- DB reads in supervisor enrichment path must not block ESI fetch — enrichment runs after ESI result persisted.
- Location ESI calls (ship, online, implants) fetched in parallel within same supervisor cycle.
- Hydration command returns under 500ms on typical hardware (SQLite only, no network).
- No regression in notification behavior — supervisor restructuring must not affect `NotificationProcessor` calls.

## Success Criteria

- App shows data immediately after launch, no loading spinners (when SQLite has prior data).
- Event listeners contain zero `invoke()` / command calls — verified by code review.
- `src/generated/commands.ts` does not exist.
- tauri-typegen not in `Cargo.toml` or `package.json`.
- All command types annotated with `#[typeshare]`, present in `src/generated/types.ts`.
- No frontend component joins store slices via `useMemo` for ESI live data.
- `Ok(None)` cache-hit path emits re-hydration event — verified by disabling ESI network access, confirming UI updates still fire.

## Constraints & Assumptions

- SDE tables (skill names, group names, type names) pre-populated, available for DB-only enrichment reads.
- Station/structure names may not exist in DB on new install — first location fetch triggers ESI resolution + persists; subsequent refreshes read from DB.
- Remaps stay command-driven (not event-driven) — infrequent changes, already stable command.
- `force_refresh_skill_queue` stays as command — manual trigger, not data fetch.

## Out of Scope

- New ESI endpoints or notification types.
- SDE or static-data flow refactors.
- Mutation flow refactors (save remap, skill plan mutations, etc.).
- Per-skill completion timers or precise notification timing.
- Auth, accounts, or settings flow changes.

## Dependencies

- Phase 2 complete (Zustand store, event listeners, supervisor running).
- Phase 2 findings document: `.claude/epics/esi-phase-2/findings.md`.
- SDE populated (skill names, type names in SQLite).
