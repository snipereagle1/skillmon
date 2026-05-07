import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type { NotificationResponse } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function useNotifications(
  characterId?: number | null,
  status?: 'active' | 'dismissed'
) {
  return useQuery<NotificationResponse[]>({
    queryKey: queryKeys.notifications(characterId, status),
    queryFn: async () => {
      return invoke<NotificationResponse[]>('get_notifications', {
        characterId: characterId ?? undefined,
        status: status ?? undefined,
      });
    },
    enabled: characterId != null,
  });
}
