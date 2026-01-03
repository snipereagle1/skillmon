import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useState } from 'react';

import { AddCharacterDialog } from '@/components/AddCharacterDialog';
import { NotificationBell } from '@/components/NotificationBell';
import { NotificationDrawer } from '@/components/NotificationDrawer';
import { SkillDetail } from '@/components/SkillDetail';
import { Button } from '@/components/ui/button';
import { NavigationTabs } from '@/components/ui/navigation-tabs';
import { useAuthEvents } from '@/hooks/tauri/useAuthEvents';
import { useStartupState } from '@/hooks/tauri/useStartupState';
import { useSkillDetailStore } from '@/stores/skillDetailStore';

function RootComponent() {
  useAuthEvents();
  const { isStartingUp } = useStartupState();
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const { open, skillId, characterId, closeSkillDetail } =
    useSkillDetailStore();

  if (isStartingUp) {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Starting up...</p>
          <p className="text-sm text-muted-foreground mt-2">
            Checking for updates and refreshing character data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <NavigationTabs
          items={[
            { to: '/overview', label: 'Overview' },
            { to: '/characters', label: 'Characters' },
            { to: '/plans', label: 'Plans' },
            { to: '/about', label: 'About' },
          ]}
        />
        <div className="flex items-center gap-2">
          <NotificationBell onOpen={() => setNotificationDrawerOpen(true)} />
          <Button onClick={() => setAddCharacterOpen(true)}>
            Add Character
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
      <AddCharacterDialog
        open={addCharacterOpen}
        onOpenChange={setAddCharacterOpen}
      />
      <NotificationDrawer
        open={notificationDrawerOpen}
        onOpenChange={setNotificationDrawerOpen}
      />
      <SkillDetail
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeSkillDetail();
          }
        }}
        skillId={skillId}
        characterId={characterId}
      />
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
