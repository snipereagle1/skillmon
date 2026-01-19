import { useQuery } from '@tanstack/react-query';

import { getSdeSkillsWithGroups } from '@/generated/commands';
import type { CharacterSkillsResponse } from '@/generated/types';

export function useSdeSkills() {
  return useQuery<CharacterSkillsResponse>({
    queryKey: ['sdeSkills'],
    queryFn: async () => {
      return await getSdeSkillsWithGroups();
    },
    staleTime: Infinity, // SDE skills don't change often
  });
}
