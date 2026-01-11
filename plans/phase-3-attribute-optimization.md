## Phase 3 — Attribute & Remap Optimization (No Reordering)

### Goal

Minimize total training time without changing plan order.

### Optimization Mode: Attribute-Only

Answers:
“What attributes should I use to train this plan as written?”

### Constraints

- Canonical order preserved
- Remap limits and cooldowns enforced
- Implants/accelerators excluded from strategy

### Strategy

1. Analyze SP demand by attribute
2. Segment plan by remap count
3. Assign dominant attribute pairs per segment
4. Produce remap schedule

Outputs:

- Remap schedule
- Attribute timeline
- Time saved
- Explanation

Success Criteria:

- Deterministic improvement
- Clear explanations
