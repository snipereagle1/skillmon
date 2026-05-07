import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type { Remap } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

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

export function useCharacterRemaps(characterId: number | null): {
  data: Remap[];
  isLoading: boolean;
  error: string | null;
} {
  const slice = useEsiStore((state) =>
    characterId !== null ? state.remaps[characterId] : undefined
  );

  return {
    data: slice?.data ?? [],
    isLoading: characterId !== null && slice === undefined,
    error: slice?.lastError ?? null,
  };
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
  const { setRemaps, setError } = useEsiStore();

  return useMutation({
    mutationFn: async (params: SaveRemapParams) => {
      return await invoke('save_remap', params);
    },
    onSuccess: async (_, params) => {
      if (params.characterId) {
        const id = params.characterId;
        await invoke<Remap[]>('get_character_remaps', {
          characterId: id,
        })
          .then((data) => setRemaps(id, data))
          .catch((err) => setError('remaps', id, String(err)));
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
  const { setRemaps, setError } = useEsiStore();

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
        const id = params.characterId;
        await invoke<Remap[]>('get_character_remaps', {
          characterId: id,
        })
          .then((data) => setRemaps(id, data))
          .catch((err) => setError('remaps', id, String(err)));
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
