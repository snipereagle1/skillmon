import { useIsFetching } from '@tanstack/react-query';
import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { check } from '@tauri-apps/plugin-updater';
import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AddCharacterDialog } from '@/components/AddCharacterDialog';
import { NotificationBell } from '@/components/NotificationBell';
import { NotificationDrawer } from '@/components/NotificationDrawer';
import { SkillDetail } from '@/components/SkillDetail';
import { Button } from '@/components/ui/button';
import { NavigationTabs } from '@/components/ui/navigation-tabs';
import { Toaster } from '@/components/ui/sonner';
import { Spinner } from '@/components/ui/spinner';
import { useAuthEvents } from '@/hooks/tauri/useAuthEvents';
import { useStartupState } from '@/hooks/tauri/useStartupState';
import { cn } from '@/lib/utils';
import { useSkillDetailStore } from '@/stores/skillDetailStore';
import { useUpdateStore } from '@/stores/updateStore';

function RootComponent() {
  useAuthEvents();
  const { isStartingUp } = useStartupState();
  const isFetching = useIsFetching();
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const { open, skillId, characterId, closeSkillDetail } =
    useSkillDetailStore();
  const { updateAvailable, setUpdate } = useUpdateStore();

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          setUpdate(update);
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    checkForUpdates();
  }, [setUpdate]);

  if (isStartingUp) {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Starting up...</p>
          <p className="text-sm text-muted-foreground mt-2">
            Checking for updates
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
            { to: '/settings', label: 'Settings' },
            { to: '/about', label: 'About' },
          ]}
        />
        <div className="flex items-center gap-2">
          {updateAvailable && (
            <Link to="/about">
              <Button
                variant="ghost"
                size="icon"
                className="text-green-500 hover:text-green-600 hover:bg-green-100/50"
                title="Update available"
              >
                <Download className="h-5 w-5" />
              </Button>
            </Link>
          )}
          <Spinner
            className={cn(
              'transition-opacity duration-1000',
              isFetching > 0 ? 'opacity-100' : 'opacity-0'
            )}
          />
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
      <Toaster />
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
