import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { Character } from "@/types/tauri";

export function useCharacters() {
  return useQuery<Character[]>({
    queryKey: ["characters"],
    queryFn: async () => {
      return await invoke<Character[]>("get_characters");
    },
  });
}

