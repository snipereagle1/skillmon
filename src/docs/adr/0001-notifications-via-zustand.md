# Notifications via Zustand, not React Query

Notifications are owned by the Rust backend: checkers in `notifications/checkers/` write to the `notifications` table, and the same backend handles dismiss/clear via Tauri commands. The frontend previously read this state via `useNotifications`, a TanStack Query hook that invoked `get_notifications` and re-fetched when a `notifications:new` Tauri event fired. That hybrid created two persistent bugs: dismiss and clear had no event of their own, so the bell badge stayed stale until something else triggered a refetch; and every push from the backend cost an extra round-trip (event → invalidate → invoke → SQLite read) to arrive at data the backend already had in hand.

Notifications now live in a Zustand store (`notificationsStore`), populated by a single global `notifications:changed` event whose payload is the full notification list (active + dismissed). The backend emits this snapshot once at startup to hydrate, and again after every create, clear, or dismiss. The frontend reads via selectors — `useActiveNotifications()`, `useNotificationsForCharacter(id)`, `useUnreadCount()` — and never invokes `get_notifications` directly. `useDismissNotification` remains a TanStack Mutation around the existing `dismiss_notification` command but no longer invalidates a query: the backend's post-mutation emit updates the store.

This extends ADR-0001's boundary from "live ESI data" to "live backend-owned data": anything the backend computes and re-computes on a timer or in response to a mutation belongs in Zustand, pushed via events. React Query remains the right tool for SDE/static data, settings, and one-shot startup queries.

## Considered options

**Keep React Query, fix the events.** Rename to `notifications:changed`, emit from create + clear + dismiss. Smallest change but kept notifications on the wrong side of the boundary; every event still cost an extra invoke.

**Hybrid — count in Zustand, list in React Query.** Push the unread count for the bell badge; pull the full list for the drawer. Worth considering if the list ever grows large enough that snapshot pushes become wasteful. At current scale (a handful of active rows per character, low thousands lifetime) the split adds two code paths for no measurable gain.

**Per-character channels (`character:{id}:notifications`).** Matches `esiEvents.ts` convention. Rejected because notifications are consumed globally (bell aggregates across characters) and the per-character data model would force the frontend to re-aggregate something the backend already has.
