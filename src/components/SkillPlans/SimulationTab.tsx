import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';
import { useAttributes } from '@/hooks/tauri/useAttributes';
import { useSimulation } from '@/hooks/tauri/useSimulation';
import { useSkillPlanWithEntries } from '@/hooks/tauri/useSkillPlans';

import { SimulationPanel } from './SimulationPanel';
import { SimulationTimeline } from './SimulationTimeline';

interface SimulationTabProps {
  planId: number;
}

export function SimulationTab({ planId }: SimulationTabProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(
    null
  );
  const { profile, setProfile, simulation, isLoading, error } = useSimulation(
    planId,
    selectedCharacterId
  );
  const { data: accountsData } = useAccountsAndCharacters();
  const { data: characterAttributes } = useAttributes(selectedCharacterId);
  const { data: planWithEntries } = useSkillPlanWithEntries(planId);

  useEffect(() => {
    if (selectedCharacterId && characterAttributes) {
      setProfile({
        implants: {
          charisma: characterAttributes.charisma.implants,
          intelligence: characterAttributes.intelligence.implants,
          memory: characterAttributes.memory.implants,
          perception: characterAttributes.perception.implants,
          willpower: characterAttributes.willpower.implants,
        },
        remaps: [
          {
            entry_index: 0,
            attributes: {
              charisma: characterAttributes.charisma.remap,
              intelligence: characterAttributes.intelligence.remap,
              memory: characterAttributes.memory.remap,
              perception: characterAttributes.perception.remap,
              willpower: characterAttributes.willpower.remap,
            },
          },
        ],
        accelerators:
          characterAttributes.intelligence.accelerator > 0
            ? [
                {
                  entry_index: 0,
                  bonus: characterAttributes.intelligence.accelerator,
                  duration_seconds: 315360000, // 10 years
                },
              ]
            : [],
      });
    } else if (!selectedCharacterId) {
      setProfile({
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
    }
  }, [selectedCharacterId, characterAttributes, setProfile]);

  const allCharacters =
    accountsData?.accounts
      .flatMap((a) => a.characters)
      .concat(accountsData?.unassigned_characters || []) || [];

  return (
    <div className="flex h-full min-h-0 gap-4 p-4">
      <div className="w-1/3 flex flex-col gap-4 overflow-y-auto pr-2">
        <div className="space-y-2">
          <Label>Simulate for Character</Label>
          <Select
            value={selectedCharacterId?.toString() || 'none'}
            onValueChange={(value) =>
              setSelectedCharacterId(value === 'none' ? null : Number(value))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="None (Base Attributes Only)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (Base Attributes Only)</SelectItem>
              {allCharacters.map((char) => (
                <SelectItem
                  key={char.character_id}
                  value={char.character_id.toString()}
                >
                  {char.character_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SimulationPanel
          planId={planId}
          planName={planWithEntries?.plan.name || ''}
          characterId={selectedCharacterId}
          profile={profile}
          onProfileChange={setProfile}
          entries={planWithEntries?.entries || []}
        />
      </div>

      <div className="flex-1 min-w-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-destructive">
            Error:{' '}
            {error instanceof Error ? error.message : 'Simulation failed'}
          </div>
        ) : simulation ? (
          <SimulationTimeline result={simulation} profile={profile} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No simulation data available.
          </div>
        )}
      </div>
    </div>
  );
}
