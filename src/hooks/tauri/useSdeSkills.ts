import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type { CharacterSkillsResponse } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function useSdeSkills() {
  return useQuery<CharacterSkillsResponse>({
    queryKey: queryKeys.sdeSkills(),
    queryFn: async () => {
      return invoke<CharacterSkillsResponse>('get_sde_skills_with_groups');
    },
    staleTime: Infinity, // SDE skills don't change often
  });
}
