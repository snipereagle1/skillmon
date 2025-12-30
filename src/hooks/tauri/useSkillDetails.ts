import { useQuery } from '@tanstack/react-query';

import { getSkillDetails } from '@/generated/commands';
import type { SkillDetailsResponse } from '@/generated/types';

export function useSkillDetails(
  skillId: number | null,
  characterId: number | null
) {
  return useQuery<SkillDetailsResponse>({
    queryKey: ['skillDetails', skillId, characterId],
    queryFn: async () => {
      if (skillId === null) {
        throw new Error('Skill ID is required');
      }
      return await getSkillDetails({
        skillId,
        characterId: characterId ?? undefined,
      });
    },
    enabled: skillId !== null,
  });
}
