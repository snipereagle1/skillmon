import { useMutation, useQueryClient } from '@tanstack/react-query';

import { logoutCharacter } from '@/generated/commands';

import { queryKeys } from './queryKeys';

export function useLogoutCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (characterId: number) => {
      return await logoutCharacter({ characterId });
    },
    onSuccess: (_, characterId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.accountsAndCharacters(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.skillQueue(characterId),
      });
    },
  });
}
