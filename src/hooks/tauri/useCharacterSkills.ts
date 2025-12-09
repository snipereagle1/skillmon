import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { CharacterSkillsResponse } from "@/types/tauri";

export function useCharacterSkills(characterId: number | null) {
  return useQuery<CharacterSkillsResponse>({
    queryKey: ["characterSkills", characterId],
    queryFn: async () => {
      if (characterId === null) {
        throw new Error("Character ID is required");
      }
      return await invoke<CharacterSkillsResponse>("get_character_skills_with_groups", {
        characterId,
      });
    },
    enabled: characterId !== null,
  });
}

