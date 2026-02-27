import { useQuery } from '@tanstack/react-query';

import { getClones } from '@/generated/commands';
import type { CloneResponse } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function useClones(characterId: number | null) {
  return useQuery<CloneResponse[]>({
    queryKey: queryKeys.clones(characterId),
    queryFn: async () => {
      if (characterId === null) {
        return [];
      }
      return await getClones({ characterId });
    },
    enabled: characterId !== null,
  });
}
