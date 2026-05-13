# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Layout

Multi-context repo. See `CONTEXT-MAP.md` for the full map.

```
/
├── CONTEXT-MAP.md
├── docs/context/eve.md       # EVE Online game concepts (shared)
├── src/
│   ├── CONTEXT.md            # Frontend domain
│   └── docs/adr/
└── src-tauri/
    ├── CONTEXT.md            # Backend domain
    └── docs/adr/
```

## Before exploring, read these

- Always load **`docs/context/eve.md`** first — it defines shared game vocabulary used everywhere.
- Then load the layer-specific context for the code you're working in:
  - **Frontend work** → `src/CONTEXT.md` + `src/docs/adr/`
  - **Backend work** → `src-tauri/CONTEXT.md` + `src-tauri/docs/adr/`
  - **Cross-boundary work** → both layer contexts

If any file doesn't exist, **proceed silently**. The producer skill (`/grill-with-docs`) creates them lazily.

## Use the glossary's vocabulary

When your output names a domain concept (issue title, refactor proposal, hypothesis, test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept isn't in the glossary yet, either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly:

> _Contradicts ADR-NNNN — but worth reopening because…_
