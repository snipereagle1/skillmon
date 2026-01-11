## Phase 4 — Skill Reordering Optimization (Advanced)

### Goal

Reorder skills (while respecting prerequisites) to further reduce training time.

### Optimization Mode: Attribute + Reordering

Answers:
“If I can reorder skills, what’s the fastest possible plan?”

### Safety Rules

- Original plan never mutated
- Output is a derived plan
- All prerequisites respected

### Reordering Strategy

1. Cluster skills by dominant attribute pair
2. Toposort within clusters
3. Order clusters to minimize remap churn
4. Align remaps with clusters

Outputs:

- New canonical ordering
- Suggested remaps
- Time saved vs other modes

UX:

- Explicit advanced action
- **Preview Required**: A diff view of the changes is shown before any action is taken.
- **Output Handling**: After preview, the user can:
  - (a) Apply changes directly to the current plan.
  - (b) Save the optimized version as a new plan.
- Default: create new plan

Success Criteria:

- Valid reordered plans
- Greater savings than attribute-only mode
- Explainable changes
