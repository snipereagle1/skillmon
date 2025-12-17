import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dismissNotification } from '@/generated/commands';

export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: number) => {
      return await dismissNotification({ notificationId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
