import { startTransition, useEffect, useRef, useState } from 'react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDismissNotification } from '@/hooks/tauri/useDismissNotification';
import { useNotificationsForCharacter } from '@/stores/notificationsStore';

import { CharacterFilter } from './CharacterFilter';
import { NotificationList } from './NotificationList';

interface NotificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCharacterId?: number | null;
}

export function NotificationDrawer({
  open,
  onOpenChange,
  selectedCharacterId: initialSelectedCharacterId,
}: NotificationDrawerProps) {
  const [filterCharacterId, setFilterCharacterId] = useState<number | null>(
    initialSelectedCharacterId ?? null
  );
  const previousInitialIdRef = useRef(initialSelectedCharacterId);
  const activeNotifications = useNotificationsForCharacter(
    filterCharacterId,
    'active'
  );
  const dismissedNotifications = useNotificationsForCharacter(
    filterCharacterId,
    'dismissed'
  );
  const dismissNotification = useDismissNotification();

  useEffect(() => {
    if (
      initialSelectedCharacterId !== undefined &&
      previousInitialIdRef.current !== initialSelectedCharacterId
    ) {
      previousInitialIdRef.current = initialSelectedCharacterId;
      startTransition(() => {
        setFilterCharacterId(initialSelectedCharacterId);
      });
    }
  }, [initialSelectedCharacterId]);

  const handleDismiss = (id: number) => {
    dismissNotification.mutate({ notificationId: id });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col p-0"
      >
        <SheetHeader className="px-4 py-4 border-b">
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <CharacterFilter
          selectedCharacterId={filterCharacterId}
          onCharacterChange={setFilterCharacterId}
        />
        <Tabs
          defaultValue="active"
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="px-4 pb-4 border-b">
            <TabsList className="w-full">
              <TabsTrigger value="active">
                Active ({activeNotifications.length})
              </TabsTrigger>
              <TabsTrigger value="dismissed">
                Dismissed ({dismissedNotifications.length})
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="active"
            className="flex-1 overflow-hidden m-0 flex flex-col"
          >
            <NotificationList
              notifications={activeNotifications}
              onDismiss={handleDismiss}
              canDismiss={true}
            />
          </TabsContent>
          <TabsContent
            value="dismissed"
            className="flex-1 overflow-hidden m-0 flex flex-col"
          >
            <NotificationList
              notifications={dismissedNotifications}
              onDismiss={handleDismiss}
              canDismiss={false}
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
