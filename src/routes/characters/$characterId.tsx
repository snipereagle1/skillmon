import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useMemo } from 'react';

import { AccountSidebar } from '@/components/Accounts/AccountSidebar';
import { AlphaIcon } from '@/components/AlphaIcon';
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
  const { data: selectedSkillQueue } = useSkillQueue(characterIdNum);

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
      (sum, skill) => sum + skill.skillpointsInSkill,
      0
    );
    const unallocatedSP = selectedSkillQueue.unallocatedSp ?? 0;
    return skillsSP + unallocatedSP;
  }, [characterSkills, selectedSkillQueue]);

  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="w-64 shrink-0 bg-[var(--surface)] border-r border-border">
          <p className="text-muted-foreground p-4">Loading characters...</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full">
        <div className="w-64 shrink-0 bg-[var(--surface)] border-r border-border">
          <p className="text-destructive p-4">
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
      <div className="flex h-full">
        <div className="w-64 shrink-0 overflow-y-auto bg-[var(--surface)] border-r border-border">
          <AccountSidebar />
        </div>
        <div className="flex-1 overflow-hidden flex items-center justify-center">
          <p className="text-muted-foreground">Character not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 overflow-y-auto bg-[var(--surface)] border-r border-border">
        <AccountSidebar />
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="border-b px-4 py-2 flex items-center justify-between bg-[var(--surface)]">
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{formatNumber(totalSkillpoints)} total skillpoints</span>
              {!selectedCharacter.is_omega && (
                <span title="Alpha Clone">
                  <AlphaIcon className="h-4 w-4 text-white" />
                </span>
              )}
            </div>
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
