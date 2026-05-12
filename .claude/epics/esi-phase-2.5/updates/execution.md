## Active Streams

None.

## Queued

_None._

## Completed

- **Tasks 001–006** — see prior commits noted in git history / reconciliation section below.

- **Task 007** — Remove deleted Rust commands + final audit (this session)

### Rust

- Removed Tauri commands and handler registrations:
  - `get_skill_queues`, `get_training_characters_count`, `get_skill_queue_for_character`, `force_refresh_skill_queue` return type → `()` (cache clear + supervisor poke only).
  - `get_character_skills_with_groups`, `get_character_attributes_breakdown`, `get_clones`, `get_character_location`, `get_all_characters_locations`, `get_training_characters_overview`.
- Deleted `commands/location.rs`, `commands/overview.rs`. Slimmed `skill_queues.rs`, `attributes.rs`, `clones.rs`.
- **Clone DB sync**: extracted former `get_clones` persistence into `clone_sync.rs`; refresh loop calls `sync_character_clones_to_db` after `Ok(Some(clones_data))` so normalized `clones` rows still update without the removed command.
- `pub use auth::check_token_scopes` removed from `auth/mod.rs` (call sites use local logic / token scopes elsewhere).
- `features.rs`: `FeatureId::scopes` retained with `#[allow(dead_code)]` for optional-feature metadata.

### Frontend

- Deleted `src/generated/commands.ts`; `src/generated/index.ts` re-exports `./types` only.
- `LocationDemo.tsx`: reads `locations[characterId]` from Zustand (no `get_character_location` invoke).
- `useForceRefreshSkillQueue`: `invoke<void>('force_refresh_skill_queue', ...)`.
- Removed `queryKeys.location`.

### Validation run

- `pnpm typegen`
- `pnpm lint:full` (eslint + clippy `-D warnings`)
- `pnpm typecheck`
- `pnpm test` — 85/85
- `pnpm verify` — fails on **pre-existing** Prettier drift in `.claude/settings.json` (not touched this task).

### Manual smoke test (still on you)

- [ ] Warm cache / no network — screens populate.
- [ ] Background refresh updates UI.
- [ ] Force refresh skill queue.
- [ ] Add/remove character — supervisor + store behavior.

## Key Architecture Notes

### Generated files (gitignored, regenerate with `pnpm typegen`)

- `src/generated/types.ts` — Rust `#[typeshare]` structs → TypeScript interfaces
- **`src/generated/commands.ts` — removed**; hooks/components use `invoke()` + types from `types.ts`

### Task 006 key decisions (unchanged)

- `useForceRefreshSkillQueue`: trigger refresh only; events push `QueuePayload`.
- Skills display: normalize `SkillsPayload` vs SDE response in UI layer.

## Reconciliation Update (2026-05-07 — Task 007)

- `007.md` marked **closed**; epic progress **100%**, status **completed** (pending optional manual smoke above).
- Surviving `invoke` names aligned with `generate_handler!` in `lib.rs`.
