import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { simulateSkillPlan } from '@/generated/commands';
import type { SimulationProfile } from '@/generated/types';

export function useSimulation(planId: number, characterId?: number | null) {
  const [profile, setProfile] = useState<SimulationProfile>({
    implants: {
      charisma: 0,
      intelligence: 0,
      memory: 0,
      perception: 0,
      willpower: 0,
    },
    remaps: [],
    accelerators: [],
  });

  const query = useQuery({
    queryKey: ['skillPlanSimulation', planId, profile, characterId],
    queryFn: () =>
      simulateSkillPlan({
        planId,
        profile,
        characterId: characterId || undefined,
      }),
    enabled: !!planId,
  });

  return {
    profile,
    setProfile,
    simulation: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
