import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';
import { useCharacterSkills } from '@/hooks/tauri/useCharacterSkills';
import { useSkillQueue } from '@/hooks/tauri/useSkillQueue';

import { AccountSidebar } from './Accounts/AccountSidebar';
import { Attributes } from './Attributes';
import { CharacterPlanComparison } from './CharacterPlanComparison';
import { Clones } from './Clones';
import { NotificationSettings } from './NotificationSettings';
import { SkillQueue } from './SkillQueue';
import { Skills } from './Skills';

export function CharactersTab() {
  const {
    data: accountsData,
    isLoading: isLoadingAccounts,
    error: accountsError,
  } = useAccountsAndCharacters();
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(
    null
  );
  const hasInitializedRef = useRef(false);
  const { data: characterSkills } = useCharacterSkills(selectedCharacterId);
  const { data: selectedSkillQueue } = useSkillQueue(selectedCharacterId, {
    refetchInterval: 60_000,
  });

  const allCharacters = useMemo(() => {
    if (!accountsData) return [];
    const accountChars = accountsData.accounts.flatMap((acc) => acc.characters);
    return [...accountChars, ...accountsData.unassigned_characters];
  }, [accountsData]);

  const isLoading = isLoadingAccounts;
  const error = accountsError;

  useEffect(() => {
    if (allCharacters.length > 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      startTransition(() => {
        setSelectedCharacterId(allCharacters[0].character_id);
      });
    }
  }, [allCharacters]);

  const selectedCharacter = allCharacters.find(
    (c) => c.character_id === selectedCharacterId
  );

  const totalSkillpoints = useMemo(() => {
    if (!characterSkills || !selectedSkillQueue) {
      return null;
    }
    const skillsSP = characterSkills.skills.reduce(
      (sum, skill) => sum + skill.skillpoints_in_skill,
      0
    );
    const unallocatedSP = selectedSkillQueue.unallocated_sp ?? 0;
    return skillsSP + unallocatedSP;
  }, [characterSkills, selectedSkillQueue]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading characters...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          Error:{' '}
          {error instanceof Error ? error.message : 'Failed to load characters'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-2">
      <div className="w-64 shrink-0 overflow-y-auto">
        {accountsData &&
        accountsData.accounts.length === 0 &&
        accountsData.unassigned_characters.length === 0 ? (
          <p className="text-muted-foreground p-4">No characters added yet.</p>
        ) : (
          <AccountSidebar
            selectedCharacterId={selectedCharacterId}
            onSelectCharacter={setSelectedCharacterId}
          />
        )}
      </div>
      <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
        {selectedCharacter ? (
          <Tabs
            defaultValue="skill-queue"
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="border-b px-4 py-2 flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="skill-queue">Skill Queue</TabsTrigger>
                <TabsTrigger value="skills">Skills</TabsTrigger>
                <TabsTrigger value="clones">Clones</TabsTrigger>
                <TabsTrigger value="attributes">Attributes</TabsTrigger>
                <TabsTrigger value="plans">Plans</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
              {totalSkillpoints !== null && (
                <span className="text-sm text-muted-foreground">
                  {totalSkillpoints.toLocaleString('en-US')} total skillpoints
                </span>
              )}
            </div>
            <TabsContent
              value="skill-queue"
              className="flex-1 overflow-auto p-4 m-0"
            >
              <SkillQueue characterId={selectedCharacterId} />
            </TabsContent>
            <TabsContent value="skills" className="flex-1 overflow-hidden m-0">
              <Skills characterId={selectedCharacterId} />
            </TabsContent>
            <TabsContent value="clones" className="flex-1 overflow-hidden m-0">
              <Clones characterId={selectedCharacterId} />
            </TabsContent>
            <TabsContent
              value="attributes"
              className="flex-1 overflow-hidden m-0"
            >
              <Attributes characterId={selectedCharacterId} />
            </TabsContent>
            <TabsContent value="plans" className="flex-1 overflow-hidden m-0">
              <CharacterPlanComparison characterId={selectedCharacterId} />
            </TabsContent>
            <TabsContent value="settings" className="flex-1 overflow-auto m-0">
              <NotificationSettings characterId={selectedCharacterId} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              Select a character to view skill queue
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
