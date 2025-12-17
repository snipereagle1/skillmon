import { useMutation, useQueryClient } from '@tanstack/react-query';

import { forceRefreshSkillQueue } from '@/generated/commands';

export function useForceRefreshSkillQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (characterId: number) => {
      return await forceRefreshSkillQueue({ characterId });
    },
    onSuccess: (data, characterId) => {
      queryClient.setQueryData(['skillQueue', characterId], data);
    },
  });
}
