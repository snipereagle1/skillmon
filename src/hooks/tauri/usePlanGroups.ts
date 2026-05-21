import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type { PlanGroup } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function usePlanGroups() {
  return useQuery<PlanGroup[]>({
    queryKey: queryKeys.planGroups(),
    queryFn: () => invoke<PlanGroup[]>('list_plan_groups'),
  });
}
