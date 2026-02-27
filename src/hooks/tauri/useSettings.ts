import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getBaseScopeStrings,
  getCharacterFeatureScopeStatus,
  getEnabledFeatures,
  getOptionalFeatures,
  setFeatureEnabled,
} from '@/generated/commands';
import type {
  BaseScopeStrings,
  CharacterFeatureScopeStatus,
  FeatureId,
  OptionalFeature,
} from '@/generated/types';

import { queryKeys } from './queryKeys';

export function useBaseScopeStrings() {
  return useQuery<BaseScopeStrings>({
    queryKey: queryKeys.baseScopeStrings(),
    queryFn: async () => {
      return await getBaseScopeStrings();
    },
  });
}

export function useEnabledFeatures() {
  return useQuery<FeatureId[]>({
    queryKey: queryKeys.enabledFeatures(),
    queryFn: async () => {
      return await getEnabledFeatures();
    },
  });
}

export function useOptionalFeatures() {
  return useQuery<OptionalFeature[]>({
    queryKey: queryKeys.optionalFeatures(),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.enabledFeatures() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characterFeatureScopeStatus(),
      });
    },
  });
}

export function useCharacterFeatureScopeStatus() {
  return useQuery<CharacterFeatureScopeStatus[]>({
    queryKey: queryKeys.characterFeatureScopeStatus(),
    queryFn: async () => {
      return await getCharacterFeatureScopeStatus();
    },
  });
}
