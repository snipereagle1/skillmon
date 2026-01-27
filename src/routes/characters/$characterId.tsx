import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useMemo } from 'react';

import { AccountSidebar } from '@/components/Accounts/AccountSidebar';
import { NavigationTabs } from '@/components/ui/navigation-tabs';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';
import { useCharacterSkills } from '@/hooks/tauri/useCharacterSkills';
import { useSkillQueue } from '@/hooks/tauri/useSkillQueue';
import { formatNumber } from '@/lib/utils';

function CharacterDetailLayout() {
  const { characterId } = Route.useParams();
  const characterIdNum = Number(characterId);

  const { data: accountsData, isLoading, error } = useAccountsAndCharacters();
  const { data: characterSkills } = useCharacterSkills(characterIdNum);
  const { data: selectedSkillQueue } = useSkillQueue(characterIdNum, {
    refetchInterval: 60_000,
  });

  const allCharacters = useMemo(() => {
    if (!accountsData) return [];
    const accountChars = accountsData.accounts.flatMap((acc) => acc.characters);
    return [...accountChars, ...accountsData.unassigned_characters];
  }, [accountsData]);

  const selectedCharacter = allCharacters.find(
    (c) => c.character_id === characterIdNum
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
      <div className="flex h-full gap-2 p-4">
        <div className="w-64 shrink-0">
          <p className="text-muted-foreground">Loading characters...</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full gap-2 p-4">
        <div className="w-64 shrink-0">
          <p className="text-destructive">
            Error:{' '}
            {error instanceof Error
              ? error.message
              : 'Failed to load characters'}
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-destructive">Error loading character</p>
        </div>
      </div>
    );
  }

  if (!selectedCharacter) {
    return (
      <div className="flex h-full gap-2 p-4">
        <div className="w-64 shrink-0 overflow-y-auto">
          <AccountSidebar />
        </div>
        <div className="flex-1 border rounded-lg overflow-hidden flex items-center justify-center">
          <p className="text-muted-foreground">Character not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-2 p-4">
      <div className="w-64 shrink-0 overflow-y-auto">
        <AccountSidebar />
      </div>
      <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
        <div className="border-b px-4 py-2 flex items-center justify-between">
          <NavigationTabs
            items={[
              {
                to: '/characters/$characterId/skill-queue',
                params: { characterId },
                label: 'Skill Queue',
              },
              {
                to: '/characters/$characterId/skills',
                params: { characterId },
                label: 'Skills',
              },
              {
                to: '/characters/$characterId/clones',
                params: { characterId },
                label: 'Clones',
              },
              {
                to: '/characters/$characterId/attributes',
                params: { characterId },
                label: 'Attributes',
              },
              {
                to: '/characters/$characterId/plans',
                params: { characterId },
                label: 'Plans',
              },
              {
                to: '/characters/$characterId/settings',
                params: { characterId },
                label: 'Settings',
              },
            ]}
          />
          {totalSkillpoints !== null && (
            <span className="text-sm text-muted-foreground">
              {formatNumber(totalSkillpoints)} total skillpoints
            </span>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/characters/$characterId')({
  component: CharacterDetailLayout,
});
