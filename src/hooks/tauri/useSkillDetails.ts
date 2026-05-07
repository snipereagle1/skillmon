import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type { SkillDetailsResponse } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function useSkillDetails(
  skillId: number | null,
  characterId: number | null
) {
  return useQuery<SkillDetailsResponse>({
    queryKey: queryKeys.skillDetails(skillId, characterId),
    queryFn: async () => {
      if (skillId === null) {
        throw new Error('Skill ID is required');
      }
      return invoke<SkillDetailsResponse>('get_skill_details', {
        skillId,
        characterId: characterId ?? undefined,
      });
    },
    enabled: skillId !== null,
  });
}
