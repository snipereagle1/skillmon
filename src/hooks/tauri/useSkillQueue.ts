import type { CharacterSkillQueue } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

export function useSkillQueue(characterId: number | null): {
  data: CharacterSkillQueue | null;
  isLoading: boolean;
  error: string | null;
} {
  const slice = useEsiStore((state) =>
    characterId !== null ? state.queues[characterId] : undefined
  );

  return {
    data: slice?.data ?? null,
    isLoading: characterId !== null && slice === undefined,
    error: slice?.lastError ?? null,
  };
}
