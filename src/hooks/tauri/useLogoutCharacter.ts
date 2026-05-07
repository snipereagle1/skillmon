import { useMutation, useQueryClient } from '@tanstack/react-query';

import { logoutCharacter } from '@/generated/commands';
import { useEsiStore } from '@/stores/esiStore';

import { queryKeys } from './queryKeys';

export function useLogoutCharacter() {
  const queryClient = useQueryClient();
  const clearCharacter = useEsiStore((state) => state.clearCharacter);

  return useMutation({
    mutationFn: async (characterId: number) => {
      return await logoutCharacter({ characterId });
    },
    onSuccess: (_, characterId) => {
      clearCharacter(characterId);
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
    },
  });
}
