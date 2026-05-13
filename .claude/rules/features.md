---
paths:
  - "src-tauri/src/features.rs"
  - "src-tauri/src/esi/scopes.rs"
  - "src/routes/settings/**"
  - "src-tauri/src/commands/settings.rs"
  - "src/hooks/tauri/useSettings.ts"
---

# Optional Features

## Concept

Optional features add extra ESI scopes beyond the base set. Core functionality always uses `esi::BASE_SCOPES`; optional features append additional scopes during the OAuth flow. Users must re-authenticate after enabling a new feature.

## Backend

### Key Files

- `src-tauri/src/features.rs` — `FeatureId` enum, `OptionalFeature` struct, `get_optional_features()`
- `src-tauri/src/esi/scopes.rs` — `EsiScope` enum, `BASE_SCOPES` constant
- `src-tauri/src/db/enabled_features.rs` — `get_enabled_features()`, `set_feature_enabled()`
- `src-tauri/src/commands/settings.rs` — Tauri commands for features

### Types

```rust
// FeatureId: serializes as kebab-case string ("contracts", "locations")
enum FeatureId { Contracts, Locations }

struct OptionalFeature {
    id: FeatureId,
    name: String,
    description: String,
    scopes: Vec<EsiScope>,
}
```

### OAuth Scope Building (`commands/auth.rs`)

1. Start with `esi::BASE_SCOPES`
2. Load enabled feature IDs from `db::get_enabled_features`
3. For each enabled ID, append its `scopes` (deduplicated)
4. Pass combined scopes to `auth::generate_auth_url`

### Database

Table: `enabled_features` — `feature_id TEXT PRIMARY KEY`
- Enable: `INSERT OR IGNORE`
- Disable: `DELETE`
- Rows with unknown `feature_id` are skipped on parse (forward compatible)

### Tauri Commands

- `get_enabled_features` → `Vec<FeatureId>`
- `set_feature_enabled(feature_id: FeatureId, enabled: bool)` → `()`
- `get_optional_features` → `Vec<OptionalFeature>` (no DB, from `features::get_optional_features()`)

## Frontend

- **Settings page**: `src/routes/settings/features.tsx`
- **Hooks** (`src/hooks/tauri/useSettings.ts`):
  - `useEnabledFeatures()` — query key `['enabled-features']`
  - `useOptionalFeatures()` — query key `['optional-features']`
  - `useSetFeatureEnabled()` — mutation, invalidates `['enabled-features']`
- **Types**: `FeatureId`, `OptionalFeature` from `@/generated/types`

## Adding a New Optional Feature

1. Add variant to `FeatureId` in `src-tauri/src/features.rs`
2. Implement `as_str()` / `FromStr` for the new variant
3. Add the feature to `get_optional_features()` with the correct `EsiScope`s
   - Add new `EsiScope` variants to `esi/scopes.rs` if the scope isn't there yet
4. Run `pnpm typegen` to update frontend types
5. No migration needed — `enabled_features` stores any string; only `get_enabled_features` parsing needs updating
