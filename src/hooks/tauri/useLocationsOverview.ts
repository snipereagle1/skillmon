import { useQuery } from '@tanstack/react-query';

import { getAllCharactersLocations } from '@/generated/commands';
import type { CharacterLocationOverview } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function useAllCharactersLocations() {
  return useQuery<CharacterLocationOverview[]>({
    queryKey: queryKeys.locationsOverview(),
    queryFn: () => getAllCharactersLocations(),
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
}
