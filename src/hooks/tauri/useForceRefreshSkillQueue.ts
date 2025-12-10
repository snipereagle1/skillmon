import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { CharacterSkillQueue } from "@/types/tauri";

export function useForceRefreshSkillQueue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (characterId: number) => {
      return await invoke<CharacterSkillQueue>("force_refresh_skill_queue", { characterId });
    },
    onSuccess: (data, characterId) => {
      queryClient.setQueryData(["skillQueue", characterId], data);
    },
  });
}

