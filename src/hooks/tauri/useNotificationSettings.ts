import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getNotificationSettings,
  upsertNotificationSetting,
} from "@/generated/commands";
import type { NotificationSettingResponse } from "@/generated/types";

export function useNotificationSettings(characterId: number | null) {
  return useQuery<NotificationSettingResponse[]>({
    queryKey: ["notificationSettings", characterId],
    queryFn: async () => {
      if (!characterId) {
        return [];
      }
      return await getNotificationSettings({ characterId });
    },
    enabled: characterId !== null,
  });
}

export function useUpdateNotificationSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      characterId: number;
      notificationType: string;
      enabled: boolean;
      config?: Record<string, unknown> | null;
    }) => {
      const serializedConfig =
        params.config != null ? JSON.stringify(params.config) : undefined;

      return await upsertNotificationSetting({
        characterId: params.characterId,
        notificationType: params.notificationType,
        enabled: params.enabled,
        config: serializedConfig,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["notificationSettings", variables.characterId],
      });
    },
  });
}
