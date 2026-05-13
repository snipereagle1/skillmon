import { useMutation } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import { useEsiStore } from '@/stores/esiStore';

export function useForceRefreshSkillQueue() {
  const { setError } = useEsiStore();

  return useMutation({
    mutationFn: async (characterId: number) => {
      await invoke<void>('force_refresh_skill_queue', { characterId });
    },
    onError: (err, characterId) => {
      setError('queues', characterId, String(err));
    },
  });
}
