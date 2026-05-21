# ADR 0003: Plan Grouping as Single-Parent Tree

## Status

Accepted

## Context

Users want to organise skill plans into folders. Two shapes were considered:

- **Tag-based**: a plan can belong to many groups (join table), groups have no parent. Flexible, matches "labels" mental model.
- **Single-parent tree**: a plan belongs to at most one group; groups can nest inside other groups. Matches the file-manager mental model.

Grouping is explicitly presentational — it does not change how plans are trained, simulated, or optimised.

## Decision

Single-parent tree:

- `plan_groups(group_id, name, parent_group_id NULLABLE, sort_order)` — `parent_group_id NULL` means root.
- `skill_plans.group_id NULLABLE` — NULL means the plan sits at the tree root alongside top-level folders.
- Nesting capped at **3 levels of folders** (group at depth 0, 1, or 2). Plans may sit at any depth, including root.
- Cycles (a group becoming its own ancestor) are forbidden. Enforcement is a `WITH RECURSIVE` ancestor walk in Rust inside the same transaction as the write — not a DB trigger.
- No uniqueness constraint on group or plan names at any scope.
- Sibling order is a dense integer `sort_order`, rewritten in a transaction on each move (matches the existing `reorder_plan_entries` pattern).
- Reorder and reparent share one command, `move_node`, taking a discriminated payload `{ kind, id, new_parent_group_id, new_sort_order }`.
- Deleting a group prompts the user: cancel, delete group only (children reparent to the deleted group's parent), or delete group and cascade plans.

## Consequences

- Tree-view UI (shadcn-tree-view) maps cleanly: one parent per node, no duplicate rendering.
- No multi-categorisation. A plan that conceptually belongs in both "PvP" and "Caldari" must pick one home; this is accepted as a trade-off against the simpler model.
- Cycle and depth checks live in application code, not the schema. They must be invoked on every group move; the `move_node` command is the single chokepoint.
- The depth cap is a product choice (3 levels keep the tree readable); it is not a technical limit and can be raised by relaxing the check.
- Frontend fetches a flat list of groups and a flat list of plans, then assembles the tree in `useMemo`. Recursive types over the typeshare boundary are avoided.
- Expanded-group state persists in `app_settings` as a JSON array of group IDs (single key) — no new table needed.
