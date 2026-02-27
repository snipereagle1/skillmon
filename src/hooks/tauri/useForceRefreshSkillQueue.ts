import { useMutation, useQueryClient } from '@tanstack/react-query';

import { forceRefreshSkillQueue } from '@/generated/commands';

import { queryKeys } from './queryKeys';

export function useForceRefreshSkillQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (characterId: number) => {
      return await forceRefreshSkillQueue({ characterId });
    },
    onSuccess: (data, characterId) => {
      queryClient.setQueryData(queryKeys.skillQueue(characterId), data);
    },
    onSettled: (_, __, characterId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillQueue(characterId),
      });
    },
  });
}
