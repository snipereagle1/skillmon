import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logoutCharacter } from "@/generated/commands";

export function useLogoutCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (characterId: number) => {
      return await logoutCharacter({ characterId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      queryClient.invalidateQueries({ queryKey: ["skillQueues"] });
    },
  });
}

