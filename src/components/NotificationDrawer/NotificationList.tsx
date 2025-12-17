import type { NotificationResponse } from '@/generated/types';

import { NotificationItem } from './NotificationItem';

interface NotificationListProps {
  notifications: NotificationResponse[];
  onDismiss: (id: number) => void;
  canDismiss: boolean;
}

export function NotificationList({
  notifications,
  onDismiss,
  canDismiss,
}: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <p>No notifications</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={() => onDismiss(notification.id)}
          canDismiss={canDismiss}
        />
      ))}
    </div>
  );
}
