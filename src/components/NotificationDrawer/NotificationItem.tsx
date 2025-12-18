import { formatDistanceToNow } from 'date-fns';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import type { NotificationResponse } from '@/generated/types';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';

interface NotificationItemProps {
  notification: NotificationResponse;
  onDismiss: () => void;
  canDismiss: boolean;
}

export function NotificationItem({
  notification,
  onDismiss,
  canDismiss,
}: NotificationItemProps) {
  const { data: accountsData } = useAccountsAndCharacters();
  const allCharacters = useMemo(() => {
    if (!accountsData) return [];
    const accountChars = accountsData.accounts.flatMap((acc) => acc.characters);
    return [...accountChars, ...accountsData.unassigned_characters];
  }, [accountsData]);
  const character = allCharacters.find(
    (c) => c.character_id === notification.character_id
  );

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
  });

  return (
    <div className="border-b border-border/50 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm">{notification.title}</h4>
            {character && (
              <span className="text-xs text-muted-foreground">
                {character.character_name}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
        </div>
        {canDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="shrink-0"
          >
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
