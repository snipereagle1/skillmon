import type { CloneResponse } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

export function useClones(characterId: number | null): {
  data: CloneResponse[];
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
