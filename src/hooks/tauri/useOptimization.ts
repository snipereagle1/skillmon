import { useQuery } from '@tanstack/react-query';

import { optimizePlanAttributes } from '@/generated/commands';
import type { Attributes } from '@/generated/types';

export function useOptimization(
  planId: number,
  implants: Attributes,
  characterId?: number | null
) {
  const query = useQuery({
    queryKey: ['skillPlanOptimization', planId, implants, characterId],
    queryFn: () =>
      optimizePlanAttributes({
        planId,
        implants,
        characterId: characterId || undefined,
      }),
    enabled: !!planId,
  });

  return {
    optimization: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
