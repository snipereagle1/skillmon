import type { SkillsPayload } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

export function useCharacterSkills(characterId: number | null): {
  data: SkillsPayload | null;
  isLoading: boolean;
  error: string | null;
} {
  const slice = useEsiStore((state) =>
    characterId !== null ? state.skills[characterId] : undefined
  );

  return {
    data: slice?.data ?? null,
    isLoading: characterId !== null && slice === undefined,
    error: slice?.lastError ?? null,
  };
}
