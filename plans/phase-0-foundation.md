## Phase 0 — Foundations (Plan Graph & Ordering)

### Goal

Establish a robust internal representation for skill plans that supports:

- Safe reordering
- Prerequisite enforcement
- Simulation
- Optimization
- Stable import/export

### Skill Plan Graph (DAG)

Plans are internally modeled as a **directed acyclic graph** (DAG) of nodes:

`(skill_type_id, level)`

#### Graph Representation

The DAG structure is **computed dynamically** at runtime from the `sde_skill_requirements` table.

- Edges are not explicitly stored in the skill plan tables.
- This ensures the plan always reflects the latest game data and avoids architectural debt.
- Missing prerequisite nodes (skills the character hasn't trained but aren't in the plan) are handled during evaluation.

Edges:

- Same-skill progression (e.g., Level I -> Level II)
- Cross-skill prerequisites (e.g., Caldari Destroyer III -> Caldari Cruiser I)

### Canonical Ordering

- Exactly one canonical ordering per plan
- Implemented as a persisted topological sort
- All reorder operations re-toposort the DAG
- Illegal moves are blocked

### Planned vs Prerequisite Entries

Entries are marked as:

- Planned
- Prerequisite

This distinction is preserved in exports.

### Skillmon JSON Plan Format

- JSON, machine-stable, versioned
- Full round-trip fidelity
- Independent of EVEMon

### Validation

Plans are continuously validated for:

- Cycles
- Ordering violations
- Missing prerequisites
- Duplicate nodes

Validation states:

- Valid
- Warning
- Error

Success Criteria:

- Plans reorder safely
- DAG is authoritative
- JSON plans round-trip exactly
