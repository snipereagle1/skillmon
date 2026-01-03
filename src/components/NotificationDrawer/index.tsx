import { startTransition, useEffect, useRef, useState } from 'react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDismissNotification } from '@/hooks/tauri/useDismissNotification';
import { useNotifications } from '@/hooks/tauri/useNotifications';

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
  const { data: activeNotifications = [], isLoading: isLoadingActive } =
    useNotifications(filterCharacterId ?? undefined, 'active');
  const { data: dismissedNotifications = [], isLoading: isLoadingDismissed } =
    useNotifications(filterCharacterId ?? undefined, 'dismissed');
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
    dismissNotification.mutate(id);
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
            {isLoadingActive ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <p>Loading...</p>
              </div>
            ) : (
              <NotificationList
                notifications={activeNotifications}
                onDismiss={handleDismiss}
                canDismiss={true}
              />
            )}
          </TabsContent>
          <TabsContent
            value="dismissed"
            className="flex-1 overflow-hidden m-0 flex flex-col"
          >
            {isLoadingDismissed ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <p>Loading...</p>
              </div>
            ) : (
              <NotificationList
                notifications={dismissedNotifications}
                onDismiss={handleDismiss}
                canDismiss={false}
              />
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
