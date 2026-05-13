import type { AttributesPayload } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

export function useAttributes(characterId: number | null): {
  data: AttributesPayload | null;
  isLoading: boolean;
  error: string | null;
} {
  const slice = useEsiStore((state) =>
    characterId !== null ? state.attributes[characterId] : undefined
  );

  return {
    data: slice?.data ?? null,
    isLoading: characterId !== null && slice === undefined,
    error: slice?.lastError ?? null,
  };
}
