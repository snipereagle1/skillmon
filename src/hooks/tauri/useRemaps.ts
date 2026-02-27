import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteRemap,
  getCharacterRemaps,
  getPlanRemaps,
  saveRemap,
} from '@/generated/commands';
import type { Remap, SaveRemapParams } from '@/generated/types';

import { queryKeys } from './queryKeys';

export function useCharacterRemaps(characterId: number | null) {
  return useQuery<Remap[]>({
    queryKey: queryKeys.remaps.character(characterId),
    queryFn: async () => {
      if (characterId === null) return [];
      return await getCharacterRemaps({ characterId });
    },
    enabled: characterId !== null,
  });
}

export function usePlanRemaps(planId: number | null) {
  return useQuery<Remap[]>({
    queryKey: queryKeys.remaps.plan(planId),
    queryFn: async () => {
      if (planId === null) return [];
      return await getPlanRemaps({ planId });
    },
    enabled: planId !== null,
  });
}

export function useSaveRemap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SaveRemapParams) => {
      return await saveRemap(params);
    },
    onSuccess: (_, params) => {
      if (params.characterId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.remaps.character(params.characterId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.attributes(params.characterId),
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
      await deleteRemap({ remapId: params.remapId });
      return params;
    },
    onSuccess: (params) => {
      if (params.characterId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.remaps.character(params.characterId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.attributes(params.characterId),
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
