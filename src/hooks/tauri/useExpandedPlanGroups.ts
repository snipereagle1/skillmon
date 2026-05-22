import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef } from 'react';

import { queryKeys } from './queryKeys';

export function useExpandedPlanGroups() {
  return useQuery<number[]>({
    queryKey: queryKeys.expandedPlanGroups(),
    queryFn: () => invoke<number[]>('get_expanded_plan_groups'),
  });
}

export function useSetExpandedPlanGroups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupIds: number[]) =>
      invoke<void>('set_expanded_plan_groups', { groupIds }),
    onSuccess: (_, groupIds) => {
      queryClient.setQueryData(queryKeys.expandedPlanGroups(), groupIds);
    },
  });
}

/**
 * Returns a callback that synchronously caches the new expanded-group ids and
 * debounces the server write. On unmount, any pending write is flushed fire-and-forget
 * so a rapid toggle-then-navigate doesn't drop the last change. Caller is responsible
 * for translating UI tree-node ids to backend group ids.
 */
export function usePersistExpandedPlanGroups(debounceMs = 250) {
  const queryClient = useQueryClient();
  const { mutate } = useSetExpandedPlanGroups();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIds = useRef<number[] | null>(null);
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (pendingIds.current !== null) {
        // Fire-and-forget — component is going away, don't wait on the response.
        void invoke('set_expanded_plan_groups', {
          groupIds: pendingIds.current,
        });
        pendingIds.current = null;
      }
    },
    []
  );
  return useCallback(
    (groupIds: number[]) => {
      queryClient.setQueryData(queryKeys.expandedPlanGroups(), groupIds);
      pendingIds.current = groupIds;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        pendingIds.current = null;
        mutate(groupIds);
      }, debounceMs);
    },
    [queryClient, mutate, debounceMs]
  );
}
