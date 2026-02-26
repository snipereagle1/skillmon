import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getEnabledFeatures,
  getOptionalFeatures,
  setFeatureEnabled,
} from '@/generated/commands';
import type { FeatureId, OptionalFeature } from '@/generated/types';

export function useEnabledFeatures() {
  return useQuery<FeatureId[]>({
    queryKey: ['enabled-features'],
    queryFn: async () => {
      return await getEnabledFeatures();
    },
  });
}

export function useOptionalFeatures() {
  return useQuery<OptionalFeature[]>({
    queryKey: ['optional-features'],
    queryFn: async () => {
      return await getOptionalFeatures();
    },
  });
}

export function useSetFeatureEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      featureId,
      enabled,
    }: {
      featureId: FeatureId;
      enabled: boolean;
    }) => {
      return await setFeatureEnabled({ featureId, enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enabled-features'] });
    },
  });
}
