import { useQuery } from '@tanstack/react-query';
import { getSkillQueueForCharacter } from '@/generated/commands';
import type { CharacterSkillQueue } from '@/generated/types';

export function useSkillQueue(
  characterId: number | null,
  options?: { refetchInterval?: number | false }
) {
  return useQuery<CharacterSkillQueue>({
    queryKey: ['skillQueue', characterId],
    queryFn: async () => {
      if (characterId === null) {
        throw new Error('Character ID is required');
      }
      return await getSkillQueueForCharacter({ characterId });
    },
    enabled: characterId !== null,
    refetchInterval: options?.refetchInterval,
  });
}
