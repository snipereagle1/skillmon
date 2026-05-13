import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import { useEsiStore } from '@/stores/esiStore';

import { queryKeys } from './queryKeys';

export function useLogoutCharacter() {
  const queryClient = useQueryClient();
  const clearCharacter = useEsiStore((state) => state.clearCharacter);

  return useMutation({
    mutationFn: async (characterId: number) => {
      return invoke<void>('logout_character', { characterId });
    },
    onSuccess: (_, characterId) => {
      clearCharacter(characterId);
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
    },
  });
}
