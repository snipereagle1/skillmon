import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';
import { useSimulation } from '@/hooks/tauri/useSimulation';

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

        <SimulationPanel profile={profile} onProfileChange={setProfile} />
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
          <SimulationTimeline result={simulation} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No simulation data available.
          </div>
        )}
      </div>
    </div>
  );
}
