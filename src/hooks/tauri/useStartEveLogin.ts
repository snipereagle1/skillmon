import { useMutation } from '@tanstack/react-query';

import { startEveLogin } from '@/generated/commands';

export function useStartEveLogin() {
  return useMutation({
    mutationFn: async () => {
      return await startEveLogin();
    },
  });
}
