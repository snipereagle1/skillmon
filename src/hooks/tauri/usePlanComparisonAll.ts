import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type { MultiPlanComparisonResponse } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function usePlanComparisonAll(planId: number | null) {
  return useQuery<MultiPlanComparisonResponse | null>({
    queryKey: queryKeys.planComparisonAll(planId),
    queryFn: async () => {
      if (!planId) {
        return null;
      }
      return invoke<MultiPlanComparisonResponse>(
        'compare_skill_plan_with_all_characters',
        { planId }
      );
    },
    enabled: planId !== null,
  });
}
