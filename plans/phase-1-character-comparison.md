## Phase 1 — Multi-Character Comparison & UX

### Goal

Evaluate a single plan across many characters simultaneously.

### Plan Comparison View

- Vertical list of characters
- Sorted by completed SP, then name
- Shows completed SP, missing SP, time to completion
- Click navigates to character detail view

### Evaluation Rules

- Overtrained skills count as complete
- Partial levels count proportionally
- **Prerequisite Handling in Comparison**:
  - A plan may contain entries where the character lacks prerequisites. The UI should indicate this (warning state) but not prevent viewing or comparison.
  - Prerequisites that the character has already trained are not counted as "remaining" in the plan.
  - This is distinct from **editing** validation, which enforces prerequisite ordering and presence.

### Plan Policy UI

- Per-plan toggle for automatic prerequisite insertion
- Affects manual additions only
- Imports are unaffected

Success Criteria:

- Unlimited character comparison
- Accurate SP/time calculation
- No plan mutation
