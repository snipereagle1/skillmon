import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { CharacterSkillQueue } from "@/types/tauri";

export function useSkillQueues() {
  return useQuery<CharacterSkillQueue[]>({
    queryKey: ["skillQueues"],
    queryFn: async () => {
      return await invoke<CharacterSkillQueue[]>("get_skill_queues");
    },
  });
}

