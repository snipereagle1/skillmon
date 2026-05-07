import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

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
      return invoke<void>('dismiss_notification', { notificationId });
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
