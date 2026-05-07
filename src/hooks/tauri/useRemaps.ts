import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteRemap,
  getCharacterAttributesBreakdown,
  getCharacterRemaps,
  getPlanRemaps,
  saveRemap,
} from '@/generated/commands';
import type { Remap, SaveRemapParams } from '@/generated/types';
import { useEsiStore } from '@/stores/esiStore';

import { queryKeys } from './queryKeys';

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
      return await getPlanRemaps({ planId });
    },
    enabled: planId !== null,
  });
}

export function useSaveRemap() {
  const queryClient = useQueryClient();
  const { setAttributes, setRemaps, setError } = useEsiStore();

  return useMutation({
    mutationFn: async (params: SaveRemapParams) => {
      return await saveRemap(params);
    },
    onSuccess: async (_, params) => {
      if (params.characterId) {
        const id = params.characterId;
        await Promise.allSettled([
          getCharacterAttributesBreakdown({ characterId: id })
            .then((data) => setAttributes(id, data))
            .catch((err) => setError('attributes', id, String(err))),
          getCharacterRemaps({ characterId: id })
            .then((data) => setRemaps(id, data))
            .catch((err) => setError('remaps', id, String(err))),
        ]);
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
  const { setAttributes, setRemaps, setError } = useEsiStore();

  return useMutation({
    mutationFn: async (params: {
      remapId: number;
      characterId?: number | null;
      planId?: number | null;
    }) => {
      await deleteRemap({ remapId: params.remapId });
      return params;
    },
    onSuccess: async (params) => {
      if (params.characterId) {
        const id = params.characterId;
        await Promise.allSettled([
          getCharacterAttributesBreakdown({ characterId: id })
            .then((data) => setAttributes(id, data))
            .catch((err) => setError('attributes', id, String(err))),
          getCharacterRemaps({ characterId: id })
            .then((data) => setRemaps(id, data))
            .catch((err) => setError('remaps', id, String(err))),
        ]);
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
