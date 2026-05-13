# EVE Online Domain Context

Game concepts used across the skillmon codebase. Load this before any frontend or backend context.

## Glossary

**Skill** — a trainable attribute that unlocks or improves a character's capabilities. Has a type ID, a level (0–5), and a rank (multiplier on training time).

**Skill queue** — the ordered list of skills a character is actively training or has queued. A character trains at most one skill at a time. Each entry has a start time, finish time, and target level.

**Skill point (SP)** — the unit of training progress. Accumulates based on the character's primary and secondary attributes.

**Attribute** — one of five character stats (Perception, Memory, Willpower, Intelligence, Charisma) that determine SP accrual rate for skills. Skills have a primary and secondary attribute.

**Remap** — a one-time reallocation of attribute points. Characters get one free remap per year plus bonus remaps from CCP events. Used to optimise training speed for a skill plan.

**Clone** — a backup body. Jump clones can hold implants and be jumped to; the active clone is the one currently in use.

**Implant** — a hardware inserted into a clone's brain slot. Attribute-enhancing implants (+1 to +5) increase SP accrual rate. Skill hardwirings give other bonuses.

**Character** — a player-controlled entity in EVE, authenticated via OAuth2 (ESI). Skillmon tracks one or more characters per account.

**Account** — a collection of characters belonging to one EVE Online subscription. Stored locally; linked to ESI tokens.

**ESI** — EVE Swagger Interface, the official EVE Online REST API. Provides character skills, skill queue, attributes, location, clones, and more.

**SDE** — Static Data Export. A snapshot of EVE's game data (skill types, groups, names, descriptions). Imported into the local SQLite DB at startup; not fetched from ESI at runtime.

**Type ID** — EVE's internal integer identifier for any item, including skills. The SDE maps type IDs to names and metadata.

**Skill group** — a category grouping related skills (e.g. "Spaceship Command", "Engineering"). Skills belong to exactly one group.

**Skill plan** — a user-defined ordered list of skills to train, with target levels. skillmon validates prerequisites, simulates training time, and can optimise attribute remaps.

**Training time** — how long a skill level takes to complete. Determined by SP required, character attributes, and any implant bonuses.

**Certificate** — a CCP-defined collection of skills at specified levels representing a competency. Not directly used in skillmon yet but present in SDE.
