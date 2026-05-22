import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef } from 'react';

import { queryKeys } from './queryKeys';

export function useExcludedComparisonCharacters() {
  return useQuery<number[]>({
    queryKey: queryKeys.excludedComparisonCharacters(),
    queryFn: () => invoke<number[]>('get_excluded_comparison_characters'),
  });
}

export function useSetExcludedComparisonCharacters() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (characterIds: number[]) =>
      invoke<void>('set_excluded_comparison_characters', { characterIds }),
    onSuccess: (_, characterIds) => {
      queryClient.setQueryData(
        queryKeys.excludedComparisonCharacters(),
        characterIds
      );
    },
  });
}

/**
 * Returns a callback that synchronously caches the new excluded-character ids and
 * debounces the server write. On unmount, any pending write is flushed fire-and-forget
 * so a rapid toggle-then-navigate doesn't drop the last change.
 */
export function usePersistExcludedComparisonCharacters(debounceMs = 250) {
  const queryClient = useQueryClient();
  const { mutate } = useSetExcludedComparisonCharacters();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIds = useRef<number[] | null>(null);
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (pendingIds.current !== null) {
        void invoke('set_excluded_comparison_characters', {
          characterIds: pendingIds.current,
        });
        pendingIds.current = null;
      }
    },
    []
  );
  return useCallback(
    (characterIds: number[]) => {
      queryClient.setQueryData(
        queryKeys.excludedComparisonCharacters(),
        characterIds
      );
      pendingIds.current = characterIds;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        pendingIds.current = null;
        mutate(characterIds);
      }, debounceMs);
    },
    [queryClient, mutate, debounceMs]
  );
}
