# Tauri-owned ESI fetching via event emission

Live ESI data (skill queue, skills, attributes, location, clones) was previously fetched by the frontend via React Query polling Tauri commands on an interval. This was replaced with `RefreshSupervisor`: a per-character background loop in Rust that owns all ESI polling, enriches the raw API responses (joining SDE data, computing SP rates, resolving names), and emits typed Tauri events (`character:{id}:{data-type}`) to the frontend. The frontend stores these payloads in Zustand (`esiStore`) and never fetches live ESI data via React Query.

This boundary was drawn because the polling interval, rate limiting, ETag caching, and enrichment logic all belong together server-side — duplicating that coordination in the frontend meant React Query and the Rust backend were racing to decide when to fetch, with no single owner. Moving ownership to Rust also means enriched payloads (with skill names, SP/min, implant details, etc.) are computed once and broadcast, rather than each component deriving them independently.

## Considered options

**React Query polling Tauri commands** — the previous approach. Each hook managed its own refetch interval; enrichment happened partly in Rust commands and partly in frontend selectors. Stale data on reconnect required manual invalidation.

**Tauri events from `RefreshSupervisor`** — chosen. Single owner for fetch timing, rate limiting, and enrichment. Frontend is purely reactive; `esiStore` is the single source of truth for live character data.
