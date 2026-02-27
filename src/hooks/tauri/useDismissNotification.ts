import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dismissNotification } from '@/generated/commands';

import { queryKeys } from './queryKeys';

export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      notificationId,
    }: {
      notificationId: number;
      characterId?: number | null;
    }) => {
      return await dismissNotification({ notificationId });
    },
    onSuccess: (_, { characterId }) => {
      queryClient.invalidateQueries({
        queryKey:
          characterId != null
            ? queryKeys.notifications(characterId)
            : queryKeys.notifications(),
      });
    },
  });
}
