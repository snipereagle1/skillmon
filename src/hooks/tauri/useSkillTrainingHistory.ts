import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';

import type { CompletedSkill } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

import { queryKeys } from './queryKeys';

/** `characterId = null` returns completions for every character. */
export function useSkillTrainingHistory(
  characterId: number | null,
  limit = 200
) {
  const query = useQuery<CompletedSkill[]>({
    queryKey: queryKeys.skillTrainingHistory(characterId, limit),
    queryFn: () =>
      invoke<CompletedSkill[]>('get_skill_training_history', {
        characterId,
        limit,
      }),
  });

  // The backend records completions while handling each queue refresh.
  const queues = useEsiStore((state) => state.queues);
  const { refetch } = query;
  useEffect(() => {
    void refetch();
  }, [queues, refetch]);

  return query;
}
