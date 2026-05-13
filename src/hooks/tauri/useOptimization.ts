import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

import type {
  Attributes,
  OptimizationResult,
  ReorderOptimizationResult,
} from '@/generated/types';
import { stableStringify } from '@/lib/utils';

import { queryKeys } from './queryKeys';

export type OptimizationMode = 'attributes' | 'reorder';

export function useOptimization(
  planId: number,
  implants: Attributes,
  baselineRemap: Attributes,
  acceleratorBonus: number,
  characterId?: number | null,
  mode: OptimizationMode = 'attributes',
  maxRemaps: number = 1
) {
  const query = useQuery<OptimizationResult | ReorderOptimizationResult, Error>(
    {
      queryKey: queryKeys.skillPlanOptimizationQuery(
        planId,
        stableStringify(implants),
        stableStringify(baselineRemap),
        acceleratorBonus,
        characterId,
        mode,
        maxRemaps
      ),
      queryFn: async () => {
        if (mode === 'reorder') {
          return invoke<ReorderOptimizationResult>('optimize_plan_reordering', {
            planId,
            implants,
            baselineRemap,
            acceleratorBonus,
            characterId: characterId || undefined,
            maxRemaps,
          });
        } else {
          return invoke<OptimizationResult>('optimize_plan_attributes', {
            planId,
            implants,
            baselineRemap,
            acceleratorBonus,
            characterId: characterId || undefined,
          });
        }
      },
      enabled: !!planId,
    }
  );

  return {
    optimization: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
