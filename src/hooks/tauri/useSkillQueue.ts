import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { CharacterSkillQueue } from "@/types/tauri";

export function useSkillQueue(
  characterId: number | null,
  options?: { refetchInterval?: number | false }
) {
  return useQuery<CharacterSkillQueue>({
    queryKey: ["skillQueue", characterId],
    queryFn: async () => {
      if (characterId === null) {
        throw new Error("Character ID is required");
      }
      return await invoke<CharacterSkillQueue>("get_skill_queue_for_character", { characterId });
    },
    enabled: characterId !== null,
    refetchInterval: options?.refetchInterval,
  });
}

