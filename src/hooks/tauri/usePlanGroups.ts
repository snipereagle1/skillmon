import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type { PlanGroup } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function usePlanGroups() {
  return useQuery<PlanGroup[]>({
    queryKey: queryKeys.planGroups(),
    queryFn: () => invoke<PlanGroup[]>('list_plan_groups'),
  });
}

export function useCreatePlanGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; parentGroupId: number | null }) =>
      invoke<number>('create_plan_group', {
        name: vars.name,
        parentGroupId: vars.parentGroupId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.planGroups() });
    },
  });
}

export function useRenamePlanGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { groupId: number; name: string }) =>
      invoke<void>('rename_plan_group', {
        groupId: vars.groupId,
        name: vars.name,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.planGroups() });
    },
  });
}
