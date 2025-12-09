import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export function useLogoutCharacter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (characterId: number) => {
      return await invoke("logout_character", { characterId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      queryClient.invalidateQueries({ queryKey: ["skillQueues"] });
    },
  });
}

