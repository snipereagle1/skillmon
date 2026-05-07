/* eslint-disable no-await-in-loop */
import type { QueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';

import {
  getAllCharactersLocations,
  getCharacterAttributesBreakdown,
  getCharacterSkillsWithGroups,
  getClones,
  getSkillQueueForCharacter,
} from '@/generated/commands';
import { useEsiStore } from '@/stores/esiStore';

export async function bootstrapEsiEvents(
  queryClient: QueryClient,
  characterIds: number[]
): Promise<() => void> {
  const unlisteners: Array<() => void> = [];

  for (const characterId of characterIds) {
    const unlistenQueue = await listen(
      `character:${characterId}:queue`,
      async () => {
        try {
          const data = await getSkillQueueForCharacter({ characterId });
          useEsiStore.getState().setQueue(characterId, data);
        } catch (err) {
          useEsiStore.getState().setError('queues', characterId, String(err));
        }
      }
    );
    unlisteners.push(unlistenQueue);

    const unlistenSkills = await listen(
      `character:${characterId}:skills`,
      async () => {
        try {
          const data = await getCharacterSkillsWithGroups({ characterId });
          useEsiStore.getState().setSkills(characterId, data);
        } catch (err) {
          useEsiStore.getState().setError('skills', characterId, String(err));
        }
      }
    );
    unlisteners.push(unlistenSkills);

    const unlistenAttributes = await listen(
      `character:${characterId}:attributes`,
      async () => {
        try {
          const data = await getCharacterAttributesBreakdown({ characterId });
          useEsiStore.getState().setAttributes(characterId, data);
        } catch (err) {
          useEsiStore
            .getState()
            .setError('attributes', characterId, String(err));
        }
      }
    );
    unlisteners.push(unlistenAttributes);

    const unlistenLocation = await listen(
      `character:${characterId}:location`,
      async () => {
        try {
          const allLocations = await getAllCharactersLocations();
          const store = useEsiStore.getState();
          for (const loc of allLocations) {
            store.setLocation(loc.character_id, loc);
          }
        } catch (err) {
          useEsiStore
            .getState()
            .setError('locations', characterId, String(err));
        }
      }
    );
    unlisteners.push(unlistenLocation);

    const unlistenClones = await listen(
      `character:${characterId}:clones`,
      async () => {
        try {
          const data = await getClones({ characterId });
          useEsiStore.getState().setClones(characterId, data);
        } catch (err) {
          useEsiStore.getState().setError('clones', characterId, String(err));
        }
      }
    );
    unlisteners.push(unlistenClones);
  }

  const unlistenNotifications = await listen('notifications:new', () => {
    // Invalidate all notification queries regardless of characterId/status filters
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  });
  unlisteners.push(unlistenNotifications);

  return () => unlisteners.forEach((fn) => fn());
}
