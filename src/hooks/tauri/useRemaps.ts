import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteRemap,getCharacterRemaps, getPlanRemaps, saveRemap } from '@/generated/commands';
import type { Attributes, GetCharacterRemapsParams, GetPlanRemapsParams, Remap,SaveRemapParams } from '@/generated/types';

export function useCharacterRemaps(characterId: number | null) {
  return useQuery<Remap[]>({
    queryKey: ['remaps', 'character', characterId],
    queryFn: async () => {
      if (characterId === null) return [];
      return await getCharacterRemaps({ characterId });
    },
    enabled: characterId !== null,
  });
}

export function usePlanRemaps(planId: number | null) {
  return useQuery<Remap[]>({
    queryKey: ['remaps', 'plan', planId],
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
        queryClient.invalidateQueries({ queryKey: ['remaps', 'character', params.characterId] });
        queryClient.invalidateQueries({ queryKey: ['attributes', params.characterId] });
      }
      if (params.planId) {
        queryClient.invalidateQueries({ queryKey: ['remaps', 'plan', params.planId] });
        queryClient.invalidateQueries({ queryKey: ['simulation', params.planId] });
      }
    },
  });
}

export function useDeleteRemap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { remapId: number, characterId?: number | null, planId?: number | null }) => {
      await deleteRemap({ remapId: params.remapId });
      return params;
    },
    onSuccess: (params) => {
      if (params.characterId) {
        queryClient.invalidateQueries({ queryKey: ['remaps', 'character', params.characterId] });
        queryClient.invalidateQueries({ queryKey: ['attributes', params.characterId] });
      }
      if (params.planId) {
        queryClient.invalidateQueries({ queryKey: ['remaps', 'plan', params.planId] });
        queryClient.invalidateQueries({ queryKey: ['simulation', params.planId] });
      }
    },
  });
}
