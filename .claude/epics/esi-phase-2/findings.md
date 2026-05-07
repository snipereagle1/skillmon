# ESI Phase 2 — Post-Implementation Findings

## Symptom

After the app launched on `feature/esi-revamp`, several screens stayed stuck in a loading state and data never populated.

## Root Causes

### 1. Listeners re-fetch via commands instead of consuming event payloads

`src/lib/esiEvents.ts` currently treats every Tauri event as a "data is stale, go fetch it" trigger. Each handler calls the matching command (`getSkillQueueForCharacter`, `getCharacterSkillsWithGroups`, `getCharacterAttributesBreakdown`, `getAllCharactersLocations`, `getClones`) and writes the result to the Zustand store.

The original intent of Phase 2 was for events to _carry_ the data and the store to be hydrated directly from the payload. That step never happened.

### 2. Event payloads are raw ESI shapes, not enriched response shapes

The structs in `src-tauri/src/refresh/events.rs` (and the generated `src/generated/events.ts`) ship the minimal ESI response — e.g. `SkillItem { skill_id, levels, sp }`, `LocationData { solar_system_id, station_id, structure_id }`, `ClonesData { home_location, last_clone_jump_date }`.

The frontend hooks and components consume the _enriched_ response types from `src/generated/types.ts`:

- `CharacterSkillQueue` — includes `character_name`, `attributes`, `unallocated_sp`, `is_paused`, `is_omega`
- `CharacterSkillsResponse` — includes per-skill `skill_name`, `group_id`, `group_name`, `is_in_queue`, `is_injected`, plus `groups[]` rollup
- `CharacterLocationOverview` — includes `solar_system_name`, `region_name`, `station_name`, `structure_name`, `ship_type_name`, `implants[]`
- `CloneResponse` — includes `location_name`, `is_current`, `implants[]`

Because the payload shapes don't match what the store and components expect, Phase 2 had no choice but to fall back to "event → call command → enriched data → store".

### 3. Commands are not DB-only reads — they still hit ESI

Every per-resource command (`get_skill_queue_for_character`, `get_character_skills_with_groups`, `get_character_attributes_breakdown`, `get_all_characters_locations`, `get_clones`, `get_character_remaps`) goes through `esi_helpers::get_cached_*` → `esi::fetch_cached`, which:

1. Checks the SQLite HTTP cache.
2. If expired/missing, fires an ESI request, persists the response, returns it.
3. Then performs enrichment: joins SDE rows for skill/group names, calls more `get_cached_*` helpers for station/structure/region/system info, attaches implant info.

So the current event flow does the work twice on every refresh: the supervisor fetches and emits, then the listener calls a command that re-checks the (just-populated) cache and re-enriches. It also creates a race where the listener can sometimes beat the supervisor's cache write and trigger a duplicate ESI fetch.

### 4. Refresh supervisor doesn't emit on cache hits

In `src-tauri/src/refresh/mod.rs`, every resource arm has `Ok(None) => {}`. `fetch_cached` returns `Ok(None)` when the cache is fresh (no HTTP work needed). On those iterations the supervisor does nothing and emits no event.

Combined with #1, this means: if the cache is warm at the moment a character's refresh tick fires, no event is sent → no listener-triggered command runs → the store slice never gets a value → the screen sits in `isLoading: true`.

### 5. Hydration on mount silently swallows failures

`src/routes/__root.tsx:73-135` is the only code path that actually populates slices on initial mount. It runs `Promise.allSettled` across `getSkillQueueForCharacter`, `getCharacterSkillsWithGroups`, `getCharacterAttributesBreakdown`, `getClones`, `getCharacterRemaps`, plus `getAllCharactersLocations`, plus `getAccountsAndCharacters` as a prerequisite.

The whole block is wrapped in a single `try/catch` that only logs to `console.warn`. If `getAccountsAndCharacters()` throws, no slices get written. If a per-character command hangs (ESI timeout, token refresh stuck), individual `.catch` calls write `lastError` to the slice — but only after the request actually rejects. While it's still in-flight, the slice stays `undefined`, which the hooks render as `isLoading: true`.

The hooks' loading rule is `isLoading: characterId !== null && slice === undefined`. So "slice undefined forever" → "spinner forever".

## Why Phase 2 Looks Like This

Re-fetching from listeners was the path of least resistance: the enrichment logic already lived in the commands, the response shapes the components consumed were the command outputs, and re-using those kept the diff small. Shipping enriched payloads through events would have required either duplicating enrichment in the refresh task or restructuring commands to be pure DB reads — neither was in scope for Phase 2.

The cost of that shortcut: events became "invalidation pings" instead of data carriers, which preserves the polling architecture in spirit. The supervisor's cache-hit-no-emit case then turns into a starvation bug because the FE has no fallback path.

## Two Ways Forward

### Option A — Small patch (unblock loading, keep current architecture)

1. In `src-tauri/src/refresh/mod.rs`, replace each `Ok(None) => {}` with an emit using the last-known DB row (or just an empty "tick" event that the listener treats as "re-fetch"). This guarantees the FE never starves while the cache is warm.
2. In `src/routes/__root.tsx`, replace the silent `try/catch` around hydrate with per-slice error reporting — set `lastError` on every slice that fails to fetch so `isLoading` flips false and the screen shows an error state instead of a permanent spinner.
3. Optionally gate the `<Outlet />` on a `hydrated` flag in the store so screens never mount with empty slices.

Pros: tiny, surgical, ships today.
Cons: keeps the double-fetch. Listeners still call commands. Rate-limit risk on cache-edge cases stays.

### Option B — Bigger refactor (events ship the data)

1. Move enrichment into the refresh task. Either reuse the command's enrichment functions or extract them to a shared module callable from both.
2. Replace the per-resource event payload structs with the enriched response types (or build new event-specific structs that match), and re-run `pnpm typeshare`.
3. Rewrite listeners in `src/lib/esiEvents.ts` to be pure setters — `setQueue(payload.character_id, payload.queue)` etc. No command calls.
4. Convert per-resource commands to DB-only reads (or delete them once `get_esi_snapshot` covers the first-paint hydrate).
5. Keep `get_esi_snapshot` for the mount-time hydrate so screens have data before the first emit fires.

Pros: removes the double-fetch, kills the cache-hit starvation case, makes the supervisor the single source of ESI traffic, simplifies the FE data layer.
Cons: larger surface, requires careful re-emission strategy on cache hits (re-emit DB row vs. only emit on real changes), enrichment cost moves to every refresh tick instead of on-demand.

## Recommendation

Option B is the architecture Phase 2 was aiming at. Option A is the right move if the priority is getting the build usable today and tackling the refactor as a Phase 3 follow-up.
