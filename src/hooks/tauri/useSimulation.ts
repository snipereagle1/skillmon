import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { simulateSkillPlan } from '@/generated/commands';
import type {
  Remap,
  SimulationProfile,
  SkillPlanEntryResponse,
} from '@/generated/types';

import { usePlanRemaps } from './useRemaps';
import { useSkillPlanWithEntries } from './useSkillPlans';

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

  const { data: planRemaps } = usePlanRemaps(planId);
  const { data: planWithEntries } = useSkillPlanWithEntries(planId);

  const [appliedPlanId, setAppliedPlanId] = useState<number | null>(null);

  // Sync profile with plan remaps when data becomes available for a new plan
  if (planRemaps && planWithEntries && appliedPlanId !== planId) {
    if (profile.remaps.length === 0) {
      const mappedRemaps = planRemaps.map((r: Remap) => {
        let entryIndex = 0;
        if (r.after_skill_type_id) {
          const idx = planWithEntries.entries.findIndex(
            (e: SkillPlanEntryResponse) =>
              e.skill_type_id === r.after_skill_type_id &&
              e.planned_level === r.after_skill_level
          );
          if (idx !== -1) {
            entryIndex = idx + 1;
          }
        }
        return {
          entry_index: entryIndex,
          attributes: {
            intelligence: r.intelligence,
            perception: r.perception,
            charisma: r.charisma,
            willpower: r.willpower,
            memory: r.memory,
          },
        };
      });

      if (mappedRemaps.length > 0) {
        setProfile((prev) => ({
          ...prev,
          remaps: mappedRemaps,
        }));
      }
    }
    setAppliedPlanId(planId);
  }

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
