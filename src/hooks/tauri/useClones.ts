import type { CloneInfo } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

export function useClones(characterId: number | null): {
  data: CloneInfo[];
  isLoading: boolean;
  error: string | null;
} {
  const slice = useEsiStore((state) =>
    characterId !== null ? state.clones[characterId] : undefined
  );

  return {
    data: slice?.data ?? [],
    isLoading: characterId !== null && slice === undefined,
    error: slice?.lastError ?? null,
  };
}
