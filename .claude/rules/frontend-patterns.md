---
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# Frontend Patterns

## Data Fetching with TanStack Query

Never use `fetch` or `axios` directly for Tauri commands. Always go through TanStack Query.

### Query Hook Pattern

```typescript
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { MyDataType } from '@/generated/types';

export function useMyData() {
  return useQuery<MyDataType[]>({
    queryKey: ['myData'],
    queryFn: () => invoke<MyDataType[]>('get_my_data'),
  });
}
```

### Mutation Hook Pattern

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export function useMyMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InputType) => invoke<void>('my_mutation', { data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myData'] });
    },
  });
}
```

### Query Key Conventions

- `['characters']` — all characters
- `['skillQueue', characterId]` — single character's skill queue
- `['enabled-features']` — enabled optional features
- Hierarchical and descriptive — invalidation should be intentional

## Data Flow — Where State Lives

| Data type | Layer | Why |
|-----------|-------|-----|
| Live ESI data (skills, queue, attributes, clones, location) | Zustand `esiStore` | Pushed via `RefreshSupervisor` events, not polled |
| Mutations, SDE/static data, settings | TanStack Query | Pulled on demand |
| UI state (skill detail modal, undo/redo) | Zustand (`skillDetailStore`, `undoRedoStore`) | Local UI only |

**Never** use `refetchInterval` or sub-minute `staleTime`/`gcTime` for live ESI data — that belongs in Zustand.

## Tauri Commands

Call commands with `invoke` from `@tauri-apps/api/core`. Command names are snake_case matching the Rust function name:

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { Character } from '@/generated/types';

const characters = await invoke<Character[]>('get_characters');
await invoke<void>('logout_character', { characterId: 123 });
```

## Types

Import from `@/generated/types` — never manually define types that mirror Rust structs:

```typescript
import type { Character, SkillQueue } from '@/generated/types';
```

The deprecated `src/types/tauri.ts` should not be used — use `@/generated/types` instead. Do not import from `@/generated/commands` — that file no longer exists.

## Custom Hooks Location

All data-fetching hooks wrapping Tauri commands live in `src/hooks/tauri/`. Check there before creating a new one.

## Discriminated Unions

Use `ts-pattern` for exhaustive matching:

```typescript
import { match } from 'ts-pattern';

match(status)
  .with('active', () => ...)
  .with('paused', () => ...)
  .exhaustive();
```

## Zustand Stores

Read live ESI data via `useEsiStore`:

```typescript
import { useEsiStore } from '@/stores/esiStore';

const skills = useEsiStore((s) => s.skills[characterId]);
```

Never fetch ESI data with React Query — it comes from Tauri events via `src/lib/esiEvents.ts`.

## Component Conventions

- shadcn/ui primitives: `src/components/ui/` (never edit manually, always add via CLI)
- Domain components: `src/components/` or feature subdirectories
- PascalCase filenames for components, camelCase for utilities
- Always handle loading and error states from TanStack Query
