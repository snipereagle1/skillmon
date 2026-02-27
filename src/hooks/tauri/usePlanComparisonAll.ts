import { useQuery } from '@tanstack/react-query';

import { compareSkillPlanWithAllCharacters } from '@/generated/commands';
import type { MultiPlanComparisonResponse } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function usePlanComparisonAll(planId: number | null) {
  return useQuery<MultiPlanComparisonResponse | null>({
    queryKey: queryKeys.planComparisonAll(planId),
    queryFn: async () => {
      if (!planId) {
        return null;
      }
      return await compareSkillPlanWithAllCharacters({ planId });
    },
    enabled: planId !== null,
  });
}
