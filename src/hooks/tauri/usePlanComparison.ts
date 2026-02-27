import { useQuery } from '@tanstack/react-query';

import { compareSkillPlanWithCharacter } from '@/generated/commands';
import type { PlanComparisonResponse } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function usePlanComparison(
  planId: number | null,
  characterId: number | null
) {
  return useQuery<PlanComparisonResponse | null>({
    queryKey: queryKeys.planComparison(planId, characterId),
    queryFn: async () => {
      if (!planId || !characterId) {
        return null;
      }
      return await compareSkillPlanWithCharacter({ planId, characterId });
    },
    enabled: planId !== null && characterId !== null,
  });
}
