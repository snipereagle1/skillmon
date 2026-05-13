import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type { Remap } from '@/generated/types';

import { queryKeys } from './queryKeys';

interface SaveRemapParams {
  [key: string]: unknown;
  characterId?: number;
  planId?: number;
  afterSkillTypeId?: number;
  afterSkillLevel?: number;
  attributes: {
    charisma: number;
    intelligence: number;
    memory: number;
    perception: number;
    willpower: number;
  };
}

export function useCharacterRemaps(characterId: number | null) {
  return useQuery<Remap[]>({
    queryKey: queryKeys.remaps.character(characterId),
    queryFn: async () => {
      if (characterId === null) return [];
      return await invoke<Remap[]>('get_character_remaps', { characterId });
    },
    enabled: characterId !== null,
  });
}

export function usePlanRemaps(planId: number | null) {
  return useQuery<Remap[]>({
    queryKey: queryKeys.remaps.plan(planId),
    queryFn: async () => {
      if (planId === null) return [];
      return await invoke<Remap[]>('get_plan_remaps', { planId });
    },
    enabled: planId !== null,
  });
}

export function useSaveRemap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SaveRemapParams) => {
      return await invoke('save_remap', params);
    },
    onSuccess: async (_, params) => {
      if (params.characterId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.remaps.character(params.characterId),
        });
      }
      if (params.planId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.remaps.plan(params.planId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.simulation(params.planId),
        });
      }
    },
  });
}

export function useDeleteRemap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      remapId: number;
      characterId?: number | null;
      planId?: number | null;
    }) => {
      await invoke('delete_remap', { remapId: params.remapId });
      return params;
    },
    onSuccess: async (params) => {
      if (params.characterId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.remaps.character(params.characterId),
        });
      }
      if (params.planId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.remaps.plan(params.planId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.simulation(params.planId),
        });
      }
    },
  });
}
