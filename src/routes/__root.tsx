import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
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
import type { CharacterSnapshot } from '@/generated/types';
import { FeatureId } from '@/generated/types';
import { useAuthEvents } from '@/hooks/tauri/useAuthEvents';
import { useEnabledFeatures } from '@/hooks/tauri/useSettings';
import { useStartupState } from '@/hooks/tauri/useStartupState';
import { bootstrapEsiEvents } from '@/lib/esiEvents';
import { cn } from '@/lib/utils';
import { useEsiStore } from '@/stores/esiStore';
import { useSkillDetailStore } from '@/stores/skillDetailStore';
import { useUpdateStore } from '@/stores/updateStore';

function RootComponent() {
  useAuthEvents();
  const { isStartingUp } = useStartupState();
  const isFetching = useIsFetching();
  const queryClient = useQueryClient();
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const { open, skillId, characterId, closeSkillDetail } =
    useSkillDetailStore();
  const { updateAvailable, setUpdate } = useUpdateStore();
  const { data: enabledFeatures } = useEnabledFeatures();
  const locationsEnabled =
    enabledFeatures?.includes(FeatureId.Locations) ?? false;

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

  // Hydrate the Zustand ESI store from SQLite on app mount so the UI has data
  // immediately before the first Rust supervisor refresh fires.
  // Also registers Tauri event listeners that keep the store (and RQ cache) current.
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const hydrateStore = async () => {
      try {
        const accountsData = await invoke<{
          accounts: { characters: { character_id: number }[] }[];
          unassigned_characters: { character_id: number }[];
        }>('get_accounts_and_characters');
        const characterIds = [
          ...accountsData.unassigned_characters,
          ...accountsData.accounts.flatMap((a) => a.characters),
        ].map((c) => c.character_id);

        try {
          const snapshots =
            await invoke<CharacterSnapshot[]>('get_esi_snapshot');
          const store = useEsiStore.getState();
          for (const snapshot of snapshots) {
            const id = snapshot.characterId;
            if (snapshot.queue) store.setQueue(id, snapshot.queue);
            if (snapshot.skills) store.setSkills(id, snapshot.skills);
            if (snapshot.attributes)
              store.setAttributes(id, snapshot.attributes);
            if (snapshot.clones.length > 0)
              store.setClones(id, snapshot.clones);
            if (snapshot.location) store.setLocation(id, snapshot.location);
            if (snapshot.remaps.length > 0)
              store.setRemaps(id, snapshot.remaps);
          }
        } catch (err) {
          const store = useEsiStore.getState();
          for (const id of characterIds) {
            store.setError('queues', id, String(err));
            store.setError('skills', id, String(err));
            store.setError('attributes', id, String(err));
            store.setError('locations', id, String(err));
            store.setError('clones', id, String(err));
            store.setError('remaps', id, String(err));
          }
        }

        cleanup = await bootstrapEsiEvents(queryClient, characterIds);
      } catch (err) {
        console.warn('Failed to hydrate ESI store:', err);
      }
    };

    hydrateStore();

    return () => {
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            ...(locationsEnabled
              ? [{ to: '/location' as const, label: 'Location' }]
              : []),
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
