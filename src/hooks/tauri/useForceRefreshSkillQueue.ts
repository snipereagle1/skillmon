import { useMutation } from '@tanstack/react-query';

import { forceRefreshSkillQueue } from '@/generated/commands';
import { useEsiStore } from '@/stores/esiStore';

export function useForceRefreshSkillQueue() {
  const { setQueue, setError } = useEsiStore();

  return useMutation({
    mutationFn: async (characterId: number) => {
      return await forceRefreshSkillQueue({ characterId });
    },
    onSuccess: (data, characterId) => {
      setQueue(characterId, data);
    },
    onError: (err, characterId) => {
      setError('queues', characterId, String(err));
    },
  });
}
