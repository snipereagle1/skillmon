import { useQuery } from '@tanstack/react-query';

import {
  optimizePlanAttributes,
  optimizePlanReordering,
} from '@/generated/commands';
import type {
  Attributes,
  OptimizationResult,
  ReorderOptimizationResult,
} from '@/generated/types';

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
      queryKey: [
        'skillPlanOptimization',
        planId,
        implants,
        baselineRemap,
        acceleratorBonus,
        characterId,
        mode,
        maxRemaps,
      ],
      queryFn: async () => {
        if (mode === 'reorder') {
          return await optimizePlanReordering({
            planId,
            implants,
            baselineRemap,
            acceleratorBonus,
            characterId: characterId || undefined,
            maxRemaps,
          });
        } else {
          return await optimizePlanAttributes({
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
