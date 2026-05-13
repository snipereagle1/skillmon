import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';

import type { CharacterSnapshot } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

import { queryKeys } from './queryKeys';

export function useAuthEvents() {
  const queryClient = useQueryClient();
  const { setQueue, setSkills, setAttributes, setClones } = useEsiStore();

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        const unlistenSuccess = await listen<number>(
          'auth-success',
          async () => {
            try {
              const snapshots =
                await invoke<CharacterSnapshot[]>('get_esi_snapshot');
              for (const snapshot of snapshots) {
                const characterId = snapshot.characterId;
                if (snapshot.queue) setQueue(characterId, snapshot.queue);
                if (snapshot.skills) setSkills(characterId, snapshot.skills);
                if (snapshot.attributes)
                  setAttributes(characterId, snapshot.attributes);
                setClones(characterId, snapshot.clones);
              }
            } catch (err) {
              console.error('Failed to hydrate ESI snapshot after auth:', err);
            }
            await queryClient.invalidateQueries({
              queryKey: queryKeys.accountsAndCharacters(),
            });
          }
        );

        const unlistenError = await listen<string>('auth-error', (event) => {
          console.error('Auth error:', event.payload);
        });

        cleanup = () => {
          unlistenSuccess();
          unlistenError();
        };
      } catch (error) {
        console.error('Failed to setup auth listeners:', error);
        if (error instanceof Error && error.message.includes('Tauri')) {
          console.log('Not in Tauri environment (expected in browser dev)');
        }
      }
    };

    setup();
    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
