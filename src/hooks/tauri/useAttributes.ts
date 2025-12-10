import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { CharacterAttributesBreakdown } from "@/types/tauri";

export function useAttributes(characterId: number | null) {
  return useQuery<CharacterAttributesBreakdown>({
    queryKey: ["attributes", characterId],
    queryFn: async () => {
      if (characterId === null) {
        throw new Error("Character ID is required");
      }
      return await invoke<CharacterAttributesBreakdown>(
        "get_character_attributes_breakdown",
        { characterId }
      );
    },
    enabled: characterId !== null,
  });
}
