import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import {
  getCharacterAttributesBreakdown,
  getCharacterRemaps,
  getCharacterSkillsWithGroups,
  getClones,
  getSkillQueueForCharacter,
} from '@/generated/commands';
import { useEsiStore } from '@/stores/esiStore';

import { queryKeys } from './queryKeys';

export function useAuthEvents() {
  const queryClient = useQueryClient();
  const { setQueue, setSkills, setAttributes, setClones, setRemaps, setError } =
    useEsiStore();

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        const unlistenSuccess = await listen<number>(
          'auth-success',
          async (event) => {
            const characterId = event.payload;
            // Hydrate store with fresh data for newly authenticated character
            await Promise.allSettled([
              getSkillQueueForCharacter({ characterId })
                .then((data) => setQueue(characterId, data))
                .catch((err) => setError('queues', characterId, String(err))),
              getCharacterSkillsWithGroups({ characterId })
                .then((data) => setSkills(characterId, data))
                .catch((err) => setError('skills', characterId, String(err))),
              getCharacterAttributesBreakdown({ characterId })
                .then((data) => setAttributes(characterId, data))
                .catch((err) =>
                  setError('attributes', characterId, String(err))
                ),
              getClones({ characterId })
                .then((data) => setClones(characterId, data))
                .catch((err) => setError('clones', characterId, String(err))),
              getCharacterRemaps({ characterId })
                .then((data) => setRemaps(characterId, data))
                .catch((err) => setError('remaps', characterId, String(err))),
            ]);
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
