import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type {
  AppSettings,
  BaseScopeStrings,
  BooleanAppSettingKey,
  CharacterFeatureScopeStatus,
  FeatureId,
  OptionalFeature,
} from '@/generated/types';

import { queryKeys } from './queryKeys';

export function useAppSettings() {
  return useQuery<AppSettings>({
    queryKey: queryKeys.appSettings(),
    queryFn: () => invoke<AppSettings>('get_app_settings'),
  });
}

export function useSetBooleanAppSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      value,
    }: {
      key: BooleanAppSettingKey;
      value: boolean;
    }) => invoke<void>('set_boolean_app_setting', { key, value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appSettings() });
    },
  });
}

export function useBaseScopeStrings() {
  return useQuery<BaseScopeStrings>({
    queryKey: queryKeys.baseScopeStrings(),
    queryFn: async () => {
      return invoke<BaseScopeStrings>('get_base_scope_strings');
    },
  });
}

export function useEnabledFeatures() {
  return useQuery<FeatureId[]>({
    queryKey: queryKeys.enabledFeatures(),
    queryFn: async () => {
      return invoke<FeatureId[]>('get_enabled_features');
    },
  });
}

export function useOptionalFeatures() {
  return useQuery<OptionalFeature[]>({
    queryKey: queryKeys.optionalFeatures(),
    queryFn: async () => {
      return invoke<OptionalFeature[]>('get_optional_features');
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
      return invoke<void>('set_feature_enabled', { featureId, enabled });
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
      return invoke<CharacterFeatureScopeStatus[]>(
        'get_character_feature_scope_status'
      );
    },
  });
}
