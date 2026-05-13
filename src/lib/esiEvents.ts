import type { QueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';

import type {
  AttributesPayload,
  ClonesPayload,
  LocationPayload,
  OverviewRow,
  QueuePayload,
  SkillsPayload,
} from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

export async function listenCharacterChannels(
  characterId: number
): Promise<() => void> {
  const unlisteners = await Promise.all([
    listen<QueuePayload>(`character:${characterId}:queue`, ({ payload }) =>
      useEsiStore.getState().setQueue(characterId, payload)
    ),
    listen<SkillsPayload>(`character:${characterId}:skills`, ({ payload }) =>
      useEsiStore.getState().setSkills(characterId, payload)
    ),
    listen<AttributesPayload>(
      `character:${characterId}:attributes`,
      ({ payload }) =>
        useEsiStore.getState().setAttributes(characterId, payload)
    ),
    listen<LocationPayload>(
      `character:${characterId}:location`,
      ({ payload }) => useEsiStore.getState().setLocation(characterId, payload)
    ),
    listen<ClonesPayload>(`character:${characterId}:clones`, ({ payload }) =>
      useEsiStore.getState().setClones(characterId, payload.clones)
    ),
    listen<OverviewRow>(`character:${characterId}:overview`, ({ payload }) =>
      useEsiStore.getState().setOverviewRow(characterId, payload)
    ),
  ]);
  return () => unlisteners.forEach((fn) => fn());
}

export async function bootstrapEsiEvents(
  queryClient: QueryClient,
  characterIds: number[]
): Promise<() => void> {
  const characterCleanups = await Promise.all(
    characterIds.map(listenCharacterChannels)
  );

  const unlistenNotifications = await listen('notifications:new', () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  });

  return () => {
    characterCleanups.forEach((fn) => fn());
    unlistenNotifications();
  };
}
