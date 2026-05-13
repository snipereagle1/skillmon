# Context Map

This is a multi-context repo. Load contexts by scope:

| Scope                              | Context file                                   | ADRs                                         |
| ---------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| EVE Online domain (game concepts)  | [`docs/context/eve.md`](docs/context/eve.md)   | —                                            |
| Frontend (React, UI, TanStack)     | [`src/CONTEXT.md`](src/CONTEXT.md)             | [`src/docs/adr/`](src/docs/adr/)             |
| Backend (Rust, Tauri, ESI, SQLite) | [`src-tauri/CONTEXT.md`](src-tauri/CONTEXT.md) | [`src-tauri/docs/adr/`](src-tauri/docs/adr/) |

## When to load which

- **Working in `src/`** → load `docs/context/eve.md` + `src/CONTEXT.md`
- **Working in `src-tauri/`** → load `docs/context/eve.md` + `src-tauri/CONTEXT.md`
- **Cross-boundary work** (e.g. new Tauri command + React hook) → load all three
- **EVE domain question only** → `docs/context/eve.md` alone
