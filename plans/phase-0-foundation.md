## Phase 0 — Foundations (Plan Graph & Ordering)

### Goal

Establish a robust internal representation for skill plans that supports:

- Safe reordering
- Prerequisite enforcement
- Simulation
- Optimization
- Stable import/export

### Skill Plan Graph (DAG)

Plans are internally modeled as a **directed acyclic graph** of nodes:

(skill_type_id, level)

Edges:

- Same-skill progression
- Cross-skill prerequisites

Missing prerequisite nodes may exist outside the plan.

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
