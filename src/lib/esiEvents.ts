import type { QueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';

import { queryKeys } from '@/hooks/tauri/queryKeys';

export async function bootstrapEsiEvents(
  queryClient: QueryClient,
  characterIds: number[]
): Promise<() => void> {
  const unlisteners: Array<() => void> = [];

  for (const characterId of characterIds) {
    const unlistenQueue = await listen(`character:${characterId}:queue`, () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillQueue(characterId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.trainingCharactersOverview(),
      });
    });
    unlisteners.push(unlistenQueue);

    const unlistenSkills = await listen(
      `character:${characterId}:skills`,
      () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.characterSkills(characterId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.trainingCharactersOverview(),
        });
      }
    );
    unlisteners.push(unlistenSkills);

    const unlistenAttributes = await listen(
      `character:${characterId}:attributes`,
      () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.attributes(characterId),
        });
      }
    );
    unlisteners.push(unlistenAttributes);

    const unlistenLocation = await listen(
      `character:${characterId}:location`,
      () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.locationsOverview(),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.location(characterId),
        });
      }
    );
    unlisteners.push(unlistenLocation);

    const unlistenClones = await listen(
      `character:${characterId}:clones`,
      () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.clones(characterId),
        });
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
