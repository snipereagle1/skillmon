import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { useMemo } from 'react';

import { AccountSidebar } from '@/components/Accounts/AccountSidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';
import { useCharacterSkills } from '@/hooks/tauri/useCharacterSkills';
import { useSkillQueue } from '@/hooks/tauri/useSkillQueue';

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
        <Tabs
          value={undefined}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="border-b px-4 py-2 flex items-center justify-between">
            <TabsList>
              <Link
                to="/characters/$characterId/skill-queue"
                params={{ characterId }}
              >
                {({ isActive }) => (
                  <TabsTrigger
                    value="skill-queue"
                    data-state={isActive ? 'active' : 'inactive'}
                  >
                    Skill Queue
                  </TabsTrigger>
                )}
              </Link>
              <Link
                to="/characters/$characterId/skills"
                params={{ characterId }}
              >
                {({ isActive }) => (
                  <TabsTrigger
                    value="skills"
                    data-state={isActive ? 'active' : 'inactive'}
                  >
                    Skills
                  </TabsTrigger>
                )}
              </Link>
              <Link
                to="/characters/$characterId/clones"
                params={{ characterId }}
              >
                {({ isActive }) => (
                  <TabsTrigger
                    value="clones"
                    data-state={isActive ? 'active' : 'inactive'}
                  >
                    Clones
                  </TabsTrigger>
                )}
              </Link>
              <Link
                to="/characters/$characterId/attributes"
                params={{ characterId }}
              >
                {({ isActive }) => (
                  <TabsTrigger
                    value="attributes"
                    data-state={isActive ? 'active' : 'inactive'}
                  >
                    Attributes
                  </TabsTrigger>
                )}
              </Link>
              <Link
                to="/characters/$characterId/plans"
                params={{ characterId }}
              >
                {({ isActive }) => (
                  <TabsTrigger
                    value="plans"
                    data-state={isActive ? 'active' : 'inactive'}
                  >
                    Plans
                  </TabsTrigger>
                )}
              </Link>
              <Link
                to="/characters/$characterId/settings"
                params={{ characterId }}
              >
                {({ isActive }) => (
                  <TabsTrigger
                    value="settings"
                    data-state={isActive ? 'active' : 'inactive'}
                  >
                    Settings
                  </TabsTrigger>
                )}
              </Link>
            </TabsList>
            {totalSkillpoints !== null && (
              <span className="text-sm text-muted-foreground">
                {totalSkillpoints.toLocaleString('en-US')} total skillpoints
              </span>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <Outlet />
          </div>
        </Tabs>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/characters/$characterId')({
  component: CharacterDetailLayout,
});
