import { useMemo } from 'react';
import { create } from 'zustand';

import type { NotificationResponse } from '@/generated/types';

interface NotificationsStoreState {
  notifications: NotificationResponse[];
  unreadCount: number;
  hydrated: boolean;
  setAll(notifications: NotificationResponse[]): void;
  markDismissed(notificationId: number): void;
}

function countActive(notifications: NotificationResponse[]): number {
  let count = 0;
  for (const n of notifications) {
    if (n.status === 'active') count++;
  }
  return count;
}

export const useNotificationsStore = create<NotificationsStoreState>((set) => ({
  notifications: [],
  unreadCount: 0,
  hydrated: false,
  setAll: (notifications) =>
    set({
      notifications,
      unreadCount: countActive(notifications),
      hydrated: true,
    }),
  markDismissed: (notificationId) =>
    set((state) => {
      const next = state.notifications.map((n) =>
        n.id === notificationId ? { ...n, status: 'dismissed' } : n
      );
      return { notifications: next, unreadCount: countActive(next) };
    }),
}));

export function useActiveNotifications(): NotificationResponse[] {
  const all = useNotificationsStore((s) => s.notifications);
  return useMemo(() => all.filter((n) => n.status === 'active'), [all]);
}

export function useDismissedNotifications(): NotificationResponse[] {
  const all = useNotificationsStore((s) => s.notifications);
  return useMemo(() => all.filter((n) => n.status === 'dismissed'), [all]);
}

export function useNotificationsForCharacter(
  characterId: number | null | undefined,
  status?: 'active' | 'dismissed'
): NotificationResponse[] {
  const all = useNotificationsStore((s) => s.notifications);
  return useMemo(
    () =>
      all.filter((n) => {
        if (characterId != null && n.character_id !== characterId) {
          return false;
        }
        if (status && n.status !== status) return false;
        return true;
      }),
    [all, characterId, status]
  );
}

export function useUnreadCount(): number {
  return useNotificationsStore((s) => s.unreadCount);
}
