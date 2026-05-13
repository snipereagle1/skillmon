---
paths:
  - "src-tauri/src/sde.rs"
  - "src-tauri/migrations/003_sde_schema.sql"
---

# SDE (Static Data Export) System

## Overview

Imports EVE Online game data (items, skills, attributes, relationships) into the local SQLite DB. Used to enrich ESI responses with names, descriptions, and metadata.

## Auto-Refresh

`sde::ensure_latest()` runs in a background task at app startup — non-blocking.

## Data Source

- Metadata: `https://developers.eveonline.com/static-data/tranquility/latest.jsonl`
- Download: `https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-{build}-jsonl.zip`
- Format: JSONL (one JSON object per line)

## Imported Files

`categories.jsonl`, `groups.jsonl`, `types.jsonl`, `dogmaAttributes.jsonl`, `dogmaEffects.jsonl`, `typeDogma.jsonl`, `characterAttributes.jsonl`

## Database Tables

| Table | Contents |
|-------|---------|
| `sde_metadata` | Build number, release date, import timestamp |
| `sde_categories` | Item categories |
| `sde_groups` | Item groups (with `category_id`) |
| `sde_types` | Item types: skills, ships, modules, etc. |
| `sde_dogma_attributes` | Attribute definitions |
| `sde_dogma_effects` | Effect definitions |
| `sde_type_dogma_attributes` | Type → attribute mappings with values |
| `sde_type_dogma_effects` | Type → effect mappings |
| `sde_character_attributes` | Character attribute definitions |
| `sde_skill_requirements` | `skill_type_id`, `required_skill_id`, `required_level` |

## Usage

Query SDE tables to enrich ESI data:

```rust
let skill_name = sqlx::query_scalar::<_, String>(
    "SELECT name FROM sde_types WHERE type_id = ?"
)
.bind(skill_id)
.fetch_optional(&*pool)
.await?;
```

Use JOINs to enrich ESI responses:

```sql
SELECT sq.skill_id, t.name, t.description
FROM skill_queue sq
JOIN sde_types t ON t.type_id = sq.skill_id
```

## Manual Refresh

```rust
#[tauri::command]
async fn refresh_sde(app: tauri::AppHandle, pool: State<'_, db::Pool>) -> Result<(), String>
```

Calls `sde::force_refresh()` — bypasses version check, always downloads latest.

## Import Process

1. Check `sde_metadata` for current build number
2. Fetch `latest.jsonl` to get latest build number
3. If newer: download ZIP, extract JSONL files
4. Import in a transaction: clear tables → import categories → groups → types → dogma → character attributes → update metadata
5. Commit

## Notes

- SDE data is relatively static — only updates when CCP releases new builds
- The `published` flag indicates visibility in-game
- Skill requirements are derived from dogma attributes during import
- Always query from the database — never read JSONL files directly at runtime
