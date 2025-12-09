import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { Clone } from "@/types/tauri";

export function useClones(characterId: number | null) {
  return useQuery<Clone[]>({
    queryKey: ["clones", characterId],
    queryFn: async () => {
      if (characterId === null) {
        return [];
      }
      return await invoke<Clone[]>("get_clones", { characterId });
    },
    enabled: characterId !== null,
  });
}

