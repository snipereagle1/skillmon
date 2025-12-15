import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/tauri/useNotifications";
import { useDismissNotification } from "@/hooks/tauri/useDismissNotification";
import { useCharacters } from "@/hooks/tauri/useCharacters";
import type { NotificationResponse } from "@/generated/types";
import { formatDistanceToNow } from "date-fns";

interface NotificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCharacterId?: number | null;
}

function CharacterFilter({
  selectedCharacterId,
  onCharacterChange,
}: {
  selectedCharacterId: number | null | undefined;
  onCharacterChange: (characterId: number | null) => void;
}) {
  const { data: characters = [] } = useCharacters();

  return (
    <div className="px-4 pb-2">
      <select
        value={selectedCharacterId ?? ""}
        onChange={(e) =>
          onCharacterChange(
            e.target.value === "" ? null : parseInt(e.target.value, 10)
          )
        }
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">All Characters</option>
        {characters.map((char) => (
          <option key={char.character_id} value={char.character_id}>
            {char.character_name}
          </option>
        ))}
      </select>
    </div>
  );
}

function NotificationItem({
  notification,
  onDismiss,
  canDismiss,
}: {
  notification: NotificationResponse;
  onDismiss: () => void;
  canDismiss: boolean;
}) {
  const { data: characters = [] } = useCharacters();
  const character = characters.find((c) => c.character_id === notification.character_id);

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
          <p className="text-sm text-muted-foreground">{notification.message}</p>
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

function NotificationList({
  notifications,
  onDismiss,
  canDismiss,
}: {
  notifications: NotificationResponse[];
  onDismiss: (id: number) => void;
  canDismiss: boolean;
}) {
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

export function NotificationDrawer({
  open,
  onOpenChange,
  selectedCharacterId: initialSelectedCharacterId,
}: NotificationDrawerProps) {
  const [filterCharacterId, setFilterCharacterId] = useState<number | null>(
    initialSelectedCharacterId ?? null
  );
  const { data: activeNotifications = [], isLoading: isLoadingActive } =
    useNotifications(filterCharacterId ?? undefined, "active");
  const { data: dismissedNotifications = [], isLoading: isLoadingDismissed } =
    useNotifications(filterCharacterId ?? undefined, "dismissed");
  const dismissNotification = useDismissNotification();

  // Update filter when initial selected character changes
  useEffect(() => {
    if (initialSelectedCharacterId !== undefined) {
      setFilterCharacterId(initialSelectedCharacterId);
    }
  }, [initialSelectedCharacterId]);

  const handleDismiss = (id: number) => {
    dismissNotification.mutate(id);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 py-4 border-b">
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <CharacterFilter
          selectedCharacterId={filterCharacterId}
          onCharacterChange={setFilterCharacterId}
        />
        <Tabs defaultValue="active" className="flex flex-col flex-1 overflow-hidden">
          <div className="px-4 pt-4 border-b">
            <TabsList>
              <TabsTrigger value="active">
                Active ({activeNotifications.length})
              </TabsTrigger>
              <TabsTrigger value="dismissed">
                Dismissed ({dismissedNotifications.length})
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="active" className="flex-1 overflow-hidden m-0">
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
          <TabsContent value="dismissed" className="flex-1 overflow-hidden m-0">
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

