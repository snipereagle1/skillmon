---
name: esi-phase-3
status: backlog
created: 2026-05-05T00:18:53Z
updated: 2026-05-05T00:18:53Z
progress: 0%
prd: .claude/prds/esi-revamp.md
github: (will be set on sync)
---

# Epic: ESI Phase 3 — Cleanup

## Overview

Audit and remove all dead code left by the Phase 1→2 migration. Confirm React Query is used only for mutations, SDE/static reads, and settings. Document the final data-flow pattern. Depends on Phase 2 complete.

## Architecture Decisions

- **What stays in RQ**: mutations (useLogoutCharacter, useStartEveLogin, useDismissNotification, useForceRefreshSkillQueue, skill plan mutations), SDE/static (useSdeSkills, useSkillDetails, useSkillPlans), settings (useSettings, useNotificationSettings), one-shot (useStartupState, useAccountsAndCharacters).
- **What should be gone**: any `refetchInterval`, `staleTime` tuned for live polling, or `queryClient.setQueryData` calls for ESI live data.
- **Documentation target**: `CLAUDE.md` — add a "Data flow" section describing Zustand-for-live / RQ-for-mutations+static.

## Technical Approach

### Audit Scope

```bash
# Dead refetchInterval
grep -rn "refetchInterval" src/hooks/tauri/

# Stale queryClient.setQueryData for live data
grep -rn "setQueryData" src/

# Dead query keys for live data
grep -rn "queryKeys" src/hooks/tauri/queryKeys.ts
```

Look for: query keys for `skill_queue`, `character_skills`, `locations_overview`, `attributes`, `clones`, `remaps` — these should no longer be in `queryKeys.ts` after Phase 2.

### Changes

- Remove dead query key entries from `queryKeys.ts`.
- Remove any leftover `staleTime` / `refetchInterval` / `gcTime` config that was tuned for live polling.
- Remove any RQ query setup (useQuery calls) for live-data resources in hooks.
- Remove Phase 1 `esiEvents.ts` remnants if any slipped through Phase 2.
- Update `CLAUDE.md`: add "Data Flow" section.

## Task Breakdown Preview

1. Audit: grep for dead `refetchInterval`, `setQueryData`, stale query keys for live resources — produce a hit list
2. Remove dead query keys from `queryKeys.ts` and dead `useQuery` calls from migrated hooks
3. Remove leftover RQ config (staleTime, gcTime) tuned for live polling
4. Update `CLAUDE.md` with "Data Flow" section: Zustand for live ESI data, RQ for mutations/static/settings
5. Final verify: `pnpm verify` clean; grep confirms no `refetchInterval` for ESI live data

## Dependencies

- Phase 2 complete (all live-data hooks migrated to Zustand).

## Success Criteria (Technical)

- `grep -rn "refetchInterval" src/hooks/tauri/` returns no hits for ESI live-data hooks.
- `queryKeys.ts` contains no keys for `queue`, `skills`, `locations`, `attributes`, `clones`, `remaps`.
- `CLAUDE.md` documents the Zustand-for-live / RQ-for-mutations+static pattern.
- `pnpm verify` passes clean.

## Estimated Effort

Small. ~5 tasks. Mostly deletion and a short doc update.

## Tasks Created

- [ ] 001.md - Audit dead ESI polling code (parallel: false)
- [ ] 002.md - Remove dead query keys and useQuery calls (parallel: false, depends: 001)
- [ ] 003.md - Remove leftover RQ live-polling config (parallel: false, depends: 001)
- [ ] 004.md - Update CLAUDE.md with Data Flow section (parallel: false, depends: 002, 003)
- [ ] 005.md - Final verification (parallel: false, depends: 002, 003, 004)

Total tasks: 5
Parallel tasks: 0
Sequential tasks: 5
Estimated total effort: 5.5 hours
