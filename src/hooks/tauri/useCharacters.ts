import { useQuery } from "@tanstack/react-query";
import { getCharacters } from "@/generated/commands";
import type { Character } from "@/generated/types";

export function useCharacters() {
  return useQuery<Character[]>({
    queryKey: ["characters"],
    queryFn: async () => {
      return await getCharacters();
    },
  });
}

