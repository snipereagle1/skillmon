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

function listenCharacterChannels(characterId: number) {
  return Promise.all([
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
}

export async function bootstrapEsiEvents(
  queryClient: QueryClient,
  characterIds: number[]
): Promise<() => void> {
  const unlisteners: Array<() => void> = (
    await Promise.all(characterIds.map(listenCharacterChannels))
  ).flat();

  const unlistenNotifications = await listen('notifications:new', () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  });
  unlisteners.push(unlistenNotifications);

  return () => unlisteners.forEach((fn) => fn());
}
