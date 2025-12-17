import { useQuery } from '@tanstack/react-query';
import { getCharacterAttributesBreakdown } from '@/generated/commands';
import type { CharacterAttributesBreakdown } from '@/generated/types';

export function useAttributes(characterId: number | null) {
  return useQuery<CharacterAttributesBreakdown>({
    queryKey: ['attributes', characterId],
    queryFn: async () => {
      if (characterId === null) {
        throw new Error('Character ID is required');
      }
      return await getCharacterAttributesBreakdown({ characterId });
    },
    enabled: characterId !== null,
  });
}
