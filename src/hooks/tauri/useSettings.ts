import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getCharacterFeatureScopeStatus,
  getEnabledFeatures,
  getOptionalFeatures,
  setFeatureEnabled,
} from '@/generated/commands';
import type {
  CharacterFeatureScopeStatus,
  FeatureId,
  OptionalFeature,
} from '@/generated/types';

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
      queryClient.invalidateQueries({
        queryKey: ['character-feature-scope-status'],
      });
    },
  });
}

export function useCharacterFeatureScopeStatus() {
  return useQuery<CharacterFeatureScopeStatus[]>({
    queryKey: ['character-feature-scope-status'],
    queryFn: async () => {
      return await getCharacterFeatureScopeStatus();
    },
  });
}
