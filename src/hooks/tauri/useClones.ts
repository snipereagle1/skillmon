import { useQuery } from "@tanstack/react-query";
import { getClones } from "@/generated/commands";
import type { Clone } from "@/generated/types";

export function useClones(characterId: number | null) {
  return useQuery<Clone[]>({
    queryKey: ["clones", characterId],
    queryFn: async () => {
      if (characterId === null) {
        return [];
      }
      return await getClones({ characterId });
    },
    enabled: characterId !== null,
  });
}

