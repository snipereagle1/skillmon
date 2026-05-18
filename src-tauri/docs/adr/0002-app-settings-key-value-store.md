# ADR 0002: App Settings as Key/Value Store

## Status

Accepted

## Context

App-wide settings (e.g. `start_minimized`) need a storage location in SQLite. Two options were considered:

- **Key/value table**: `app_settings(key TEXT PRIMARY KEY, value TEXT)` — add new settings without schema migrations
- **Typed columns**: single row with one column per setting — compile-time type safety, but each new setting requires a migration

## Decision

Use a key/value table. New app-wide settings can be added without schema migrations; the pattern matches how `enabled_features` works (feature IDs as text keys).

## Consequences

- Adding a new setting: insert a default in the migration that creates it, add a variant to the appropriate key enum (`BooleanAppSettingKey`, etc.) — no schema change required
- Values are always stored as `TEXT`; typed db helpers (`get_boolean_app_setting` / `set_boolean_app_setting`) centralise parsing/serialising per value type — call sites never touch raw strings
- No DB-level type enforcement on values
- The Tauri command surface uses one generic command per value type (e.g. `set_boolean_app_setting(key: BooleanAppSettingKey, value: bool)`) rather than one command per setting — avoids command proliferation as settings grow; new value types get a new enum and a new command pair
