import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

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
      return invoke<PlanComparisonResponse>(
        'compare_skill_plan_with_character',
        { planId, characterId }
      );
    },
    enabled: planId !== null && characterId !== null,
  });
}
