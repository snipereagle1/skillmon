import { Link, Outlet } from '@tanstack/react-router';
import { useState } from 'react';

import { AddCharacterDialog } from '@/components/AddCharacterDialog';
import { NotificationBell } from '@/components/NotificationBell';
import { NotificationDrawer } from '@/components/NotificationDrawer';
import { SkillDetail } from '@/components/SkillDetail';
import { Button } from '@/components/ui/button';
import { useAuthEvents } from '@/hooks/tauri/useAuthEvents';
import { useStartupState } from '@/hooks/tauri/useStartupState';
import { useSkillDetailStore } from '@/stores/skillDetailStore';

export function RootLayout() {
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
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
          >
            Overview
          </Link>
          <Link
            to="/characters"
            className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
          >
            Characters
          </Link>
          <Link
            to="/plans"
            className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
          >
            Plans
          </Link>
          <Link
            to="/about"
            className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
          >
            About
          </Link>
        </div>
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
