import { useQuery } from "@tanstack/react-query";
import { getCharacterSkillsWithGroups } from "@/generated/commands";
import type { CharacterSkillsResponse } from "@/generated/types";

export function useCharacterSkills(characterId: number | null) {
  return useQuery<CharacterSkillsResponse>({
    queryKey: ["characterSkills", characterId],
    queryFn: async () => {
      if (characterId === null) {
        throw new Error("Character ID is required");
      }
      return await getCharacterSkillsWithGroups({ characterId });
    },
    enabled: characterId !== null,
  });
}

