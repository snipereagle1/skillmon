import { useQuery } from '@tanstack/react-query';

import { compareSkillPlanWithAllCharacters } from '@/generated/commands';
import type { MultiPlanComparisonResponse } from '@/generated/types';

export function usePlanComparisonAll(planId: number | null) {
  return useQuery<MultiPlanComparisonResponse | null>({
    queryKey: ['planComparisonAll', planId],
    queryFn: async () => {
      if (!planId) {
        return null;
      }
      return await compareSkillPlanWithAllCharacters({ planId });
    },
    enabled: planId !== null,
  });
}
