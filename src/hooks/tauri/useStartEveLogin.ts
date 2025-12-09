import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export function useStartEveLogin() {
  return useMutation({
    mutationFn: async () => {
      return await invoke<string>("start_eve_login");
    },
  });
}

