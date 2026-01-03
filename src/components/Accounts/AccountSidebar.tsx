import { useQueries } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getSkillQueueForCharacter } from '@/generated/commands';
import type { CharacterSkillQueue, SkillQueueItem } from '@/generated/types';
import { useAccountsAndCharacters } from '@/hooks/tauri/useAccountsAndCharacters';
import { cn } from '@/lib/utils';

import { AccountCard } from './AccountCard';
import { CharacterContextMenu } from './CharacterContextMenu';
import { CharacterPortrait } from './CharacterPortrait';
import { CreateAccountDialog } from './CreateAccountDialog';

export function AccountSidebar() {
  const params = useParams({ strict: false });
  const selectedCharacterId = params.characterId
    ? Number(params.characterId)
    : null;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: accountsData, isLoading, error } = useAccountsAndCharacters();

  const allCharacters = useMemo(() => {
    if (!accountsData) return [];
    const accountChars = accountsData.accounts.flatMap((acc) => acc.characters);
    return [...accountChars, ...accountsData.unassigned_characters];
  }, [accountsData]);

  const skillQueueQueriesConfig = useMemo(
    () =>
      allCharacters.map((character) => ({
        queryKey: ['skillQueue', character.character_id] as const,
        queryFn: async (): Promise<CharacterSkillQueue> => {
          return await getSkillQueueForCharacter({
            characterId: character.character_id,
          });
        },
        refetchInterval:
          character.character_id === selectedCharacterId ? 60_000 : 600_000,
      })),
    [allCharacters, selectedCharacterId]
  );

  const skillQueueQueries = useQueries({
    queries: skillQueueQueriesConfig,
  });

  const characterSkillQueues = useMemo(() => {
    const map = new Map<
      number,
      { skillQueue: SkillQueueItem[]; isPaused: boolean }
    >();
    skillQueueQueries.forEach((query) => {
      if (query.data) {
        map.set(query.data.character_id, {
          skillQueue: query.data.skill_queue,
          isPaused: query.data.is_paused,
        });
      }
    });
    return map;
  }, [skillQueueQueries]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading accounts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">
          Error:{' '}
          {error instanceof Error ? error.message : 'Failed to load accounts'}
        </p>
      </div>
    );
  }

  if (!accountsData) {
    return null;
  }

  return (
    <>
      <div className="space-y-2 overflow-y-auto pr-4">
        {accountsData.accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            selectedCharacterId={selectedCharacterId}
            unassignedCharacters={accountsData.unassigned_characters}
            accounts={accountsData.accounts}
            characterSkillQueues={characterSkillQueues}
          />
        ))}

        {accountsData.unassigned_characters.length > 0 && (
          <div className="space-y-2">
            {accountsData.unassigned_characters.map((character) => {
              const queueData = characterSkillQueues.get(
                character.character_id
              );
              const isSelected = character.character_id === selectedCharacterId;

              return (
                <CharacterContextMenu
                  key={character.character_id}
                  character={character}
                  accounts={accountsData.accounts}
                >
                  <Link
                    to="/characters/$characterId"
                    params={{ characterId: String(character.character_id) }}
                    className="block"
                  >
                    <Card
                      className={cn(
                        'p-3 cursor-pointer transition-all hover:shadow-md',
                        isSelected && 'bg-muted/50'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <CharacterPortrait
                          character={character}
                          skillQueue={queueData?.skillQueue}
                          isPaused={queueData?.isPaused}
                          size={48}
                        />
                        <span className="text-sm font-medium">
                          {character.character_name}
                        </span>
                      </div>
                    </Card>
                  </Link>
                </CharacterContextMenu>
              );
            })}
          </div>
        )}

        <Button
          onClick={() => setCreateDialogOpen(true)}
          variant="outline"
          className="w-full"
        >
          Add Account
        </Button>
      </div>

      <CreateAccountDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}
