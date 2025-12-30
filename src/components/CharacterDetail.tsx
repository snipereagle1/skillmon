import { getRouteApi, Link, Navigate } from '@tanstack/react-router';
import { useMemo } from 'react';

import { AccountSidebar } from '@/components/Accounts/AccountSidebar';
import { Attributes } from '@/components/Attributes';
import { CharacterPlanComparison } from '@/components/CharacterPlanComparison';
import { Clones } from '@/components/Clones';
import { NotificationSettings } from '@/components/NotificationSettings';
import { SkillQueue } from '@/components/SkillQueue';
import { Skills } from '@/components/Skills';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';
import { useCharacterSkills } from '@/hooks/tauri/useCharacterSkills';
import { useSkillQueue } from '@/hooks/tauri/useSkillQueue';

const routeApi = getRouteApi('/characters/$characterId/$tab');

const VALID_TABS = [
  'skill-queue',
  'skills',
  'clones',
  'attributes',
  'plans',
  'settings',
] as const;

type Tab = (typeof VALID_TABS)[number];

export function CharacterDetail() {
  const { characterId, tab } = routeApi.useParams();
  const {
    data: accountsData,
    isLoading: isLoadingAccounts,
    error: accountsError,
  } = useAccountsAndCharacters();
  const { data: characterSkills } = useCharacterSkills(characterId);
  const { data: selectedSkillQueue } = useSkillQueue(characterId, {
    refetchInterval: 60_000,
  });

  const allCharacters = useMemo(() => {
    if (!accountsData) return [];
    const accountChars = accountsData.accounts.flatMap((acc) => acc.characters);
    return [...accountChars, ...accountsData.unassigned_characters];
  }, [accountsData]);

  const selectedCharacter = allCharacters.find(
    (c) => c.character_id === characterId
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

  const isValidTab = VALID_TABS.includes(tab as Tab);
  const activeTab = isValidTab ? (tab as Tab) : 'skill-queue';

  if (!isValidTab) {
    return (
      <Navigate
        to="/characters/$characterId/$tab"
        params={{ characterId, tab: 'skill-queue' }}
        replace
      />
    );
  }

  if (isLoadingAccounts) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading characters...</p>
      </div>
    );
  }

  if (accountsError) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          Error:{' '}
          {accountsError instanceof Error
            ? accountsError.message
            : 'Failed to load characters'}
        </p>
      </div>
    );
  }

  if (!selectedCharacter) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">Character not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-2 p-4">
      <div className="w-64 shrink-0 overflow-y-auto">
        {accountsData &&
        accountsData.accounts.length === 0 &&
        accountsData.unassigned_characters.length === 0 ? (
          <p className="text-muted-foreground p-4">No characters added yet.</p>
        ) : (
          <AccountSidebar selectedCharacterId={characterId} />
        )}
      </div>
      <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
        <div className="border-b px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              to="/characters/$characterId/$tab"
              params={{ characterId, tab: 'skill-queue' }}
              className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              Skill Queue
            </Link>
            <Link
              to="/characters/$characterId/$tab"
              params={{ characterId, tab: 'skills' }}
              className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              Skills
            </Link>
            <Link
              to="/characters/$characterId/$tab"
              params={{ characterId, tab: 'clones' }}
              className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              Clones
            </Link>
            <Link
              to="/characters/$characterId/$tab"
              params={{ characterId, tab: 'attributes' }}
              className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              Attributes
            </Link>
            <Link
              to="/characters/$characterId/$tab"
              params={{ characterId, tab: 'plans' }}
              className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              Plans
            </Link>
            <Link
              to="/characters/$characterId/$tab"
              params={{ characterId, tab: 'settings' }}
              className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              Settings
            </Link>
          </div>
          {totalSkillpoints !== null && (
            <span className="text-sm text-muted-foreground">
              {totalSkillpoints.toLocaleString('en-US')} total skillpoints
            </span>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {activeTab === 'skill-queue' && (
            <div className="p-4">
              <SkillQueue characterId={characterId} />
            </div>
          )}
          {activeTab === 'skills' && <Skills characterId={characterId} />}
          {activeTab === 'clones' && <Clones characterId={characterId} />}
          {activeTab === 'attributes' && (
            <Attributes characterId={characterId} />
          )}
          {activeTab === 'plans' && (
            <CharacterPlanComparison characterId={characterId} />
          )}
          {activeTab === 'settings' && (
            <NotificationSettings characterId={characterId} />
          )}
        </div>
      </div>
    </div>
  );
}
