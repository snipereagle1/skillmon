import { useMutation } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import { useNotificationsStore } from '@/stores/notificationsStore';

export function useDismissNotification() {
  return useMutation({
    mutationFn: async ({ notificationId }: { notificationId: number }) => {
      return invoke<void>('dismiss_notification', { notificationId });
    },
    onMutate: ({ notificationId }) => {
      useNotificationsStore.getState().markDismissed(notificationId);
    },
  });
}
