import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';

import type { CharacterSnapshot } from '@/generated/types';
import { listenCharacterChannels } from '@/lib/esiEvents';
import { useEsiStore } from '@/stores/esiStore';

import { queryKeys } from './queryKeys';

export function useAuthEvents() {
  const queryClient = useQueryClient();
  const characterUnlisteners = useRef<Map<number, () => void>>(new Map());

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        const unlistenSuccess = await listen<number>(
          'auth-success',
          async (event) => {
            const newCharacterId = event.payload;

            // Register event listeners for the newly authenticated character
            const unlisten = await listenCharacterChannels(newCharacterId);
            characterUnlisteners.current.set(newCharacterId, unlisten);

            try {
              const snapshots =
                await invoke<CharacterSnapshot[]>('get_esi_snapshot');
              const snapshot = snapshots.find(
                (s) => s.characterId === newCharacterId
              );
              if (snapshot) {
                const { setQueue, setSkills, setAttributes, setClones } =
                  useEsiStore.getState();
                if (snapshot.queue) setQueue(newCharacterId, snapshot.queue);
                if (snapshot.skills) setSkills(newCharacterId, snapshot.skills);
                if (snapshot.attributes)
                  setAttributes(newCharacterId, snapshot.attributes);
                setClones(newCharacterId, snapshot.clones);
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
          characterUnlisteners.current.forEach((fn) => fn());
          characterUnlisteners.current.clear();
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
