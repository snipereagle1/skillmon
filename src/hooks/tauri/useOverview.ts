import { useQuery } from '@tanstack/react-query';

import { getTrainingCharactersOverview } from '@/generated/commands';
import type { TrainingCharacterOverview } from '@/generated/types';

export function useTrainingCharactersOverview() {
  return useQuery<TrainingCharacterOverview[]>({
    queryKey: ['trainingCharactersOverview'],
    queryFn: async () => {
      return await getTrainingCharactersOverview();
    },
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });
}
