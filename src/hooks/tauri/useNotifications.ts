import { useQuery } from '@tanstack/react-query';

import { getNotifications } from '@/generated/commands';
import type { NotificationResponse } from '@/generated/types';

export function useNotifications(
  characterId?: number | null,
  status?: 'active' | 'dismissed'
) {
  return useQuery<NotificationResponse[]>({
    queryKey: ['notifications', characterId, status],
    queryFn: async () => {
      return await getNotifications({
        characterId: characterId ?? undefined,
        status: status ?? undefined,
      });
    },
  });
}
