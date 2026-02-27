import { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useQueries } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { GripHorizontal, GripVertical } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getSkillQueueForCharacter } from '@/generated/commands';
import type { CharacterSkillQueue, SkillQueueItem } from '@/generated/types';
import { queryKeys } from '@/hooks/tauri/queryKeys';
import {
  useAccountsAndCharacters,
  useReorderAccounts,
  useReorderUnassignedCharacters,
} from '@/hooks/tauri/useAccountsAndCharacters';
import { useSortableList } from '@/hooks/useSortableList';
import { cn } from '@/lib/utils';

import { AccountCard } from './AccountCard';
import { CharacterPortrait } from './CharacterPortrait';
import { CreateAccountDialog } from './CreateAccountDialog';
import { SortableAccountCard } from './SortableAccountCard';
import { SortableUnassignedCharacter } from './SortableUnassignedCharacter';

export function AccountSidebar() {
  const params = useParams({ strict: false });
  const selectedCharacterId = params.characterId
    ? Number(params.characterId)
    : null;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: accountsData, isLoading, error } = useAccountsAndCharacters();

  const reorderAccounts = useReorderAccounts();
  const reorderUnassignedCharacters = useReorderUnassignedCharacters();

  const {
    localItems: localAccounts,
    activeId: activeAccountId,
    sensors: accountSensors,
    handleDragStart: handleAccountDragStart,
    handleDragEnd: handleAccountDragEnd,
  } = useSortableList({
    items: accountsData?.accounts || [],
    onReorder: (newOrder) =>
      reorderAccounts.mutate({ accountIds: newOrder.map((acc) => acc.id) }),
    getId: (acc) => acc.id,
  });

  const {
    localItems: localUnassigned,
    activeItem: activeUnassignedCharacter,
    sensors: unassignedSensors,
    handleDragStart: handleUnassignedDragStart,
    handleDragEnd: handleUnassignedDragEnd,
  } = useSortableList({
    items: accountsData?.unassigned_characters || [],
    onReorder: (newOrder) =>
      reorderUnassignedCharacters.mutate({
        characterIds: newOrder.map((char) => char.character_id),
      }),
    getId: (char) => char.character_id,
  });

  const allCharacters = useMemo(() => {
    if (!accountsData) return [];
    const accountChars = accountsData.accounts.flatMap((acc) => acc.characters);
    return [...accountChars, ...accountsData.unassigned_characters];
  }, [accountsData]);

  const skillQueueQueriesConfig = useMemo(
    () =>
      allCharacters.map((character) => ({
        queryKey: queryKeys.skillQueue(character.character_id),
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
      <div className="flex flex-col gap-2 overflow-y-auto pr-4">
        <DndContext
          id="accounts-dnd-context"
          sensors={accountSensors}
          collisionDetection={closestCenter}
          onDragStart={handleAccountDragStart}
          onDragEnd={handleAccountDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={localAccounts.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            {localAccounts.map((account) => (
              <SortableAccountCard
                key={account.id}
                account={account}
                selectedCharacterId={selectedCharacterId}
                unassignedCharacters={localUnassigned}
                accounts={localAccounts}
                characterSkillQueues={characterSkillQueues}
              />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeAccountId ? (
              <div className="relative group/dragging">
                {accountsData.accounts
                  .find((a) => a.id === activeAccountId)
                  ?.characters.some(
                    (c) => c.character_id === selectedCharacterId
                  ) ? (
                  <div className="absolute left-1/2 bottom-1 -translate-x-1/2 p-1 text-muted-foreground z-10">
                    <GripHorizontal className="size-5" />
                  </div>
                ) : (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-opacity z-10">
                    <GripVertical className="size-5" />
                  </div>
                )}
                <AccountCard
                  account={localAccounts.find((a) => a.id === activeAccountId)!}
                  selectedCharacterId={selectedCharacterId}
                  unassignedCharacters={localUnassigned}
                  accounts={localAccounts}
                  characterSkillQueues={characterSkillQueues}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {localUnassigned.length > 0 && (
          <div className="flex flex-col gap-2 pt-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Unassigned Characters
            </h3>
            <DndContext
              id="unassigned-chars-dnd-context"
              sensors={unassignedSensors}
              collisionDetection={closestCenter}
              onDragStart={handleUnassignedDragStart}
              onDragEnd={handleUnassignedDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={localUnassigned.map((c) => c.character_id)}
                strategy={verticalListSortingStrategy}
              >
                {localUnassigned.map((character) => {
                  const queueData = characterSkillQueues.get(
                    character.character_id
                  );
                  const isSelected =
                    character.character_id === selectedCharacterId;

                  return (
                    <SortableUnassignedCharacter
                      key={character.character_id}
                      character={character}
                      accounts={localAccounts}
                      queueData={queueData}
                      isSelected={isSelected}
                    />
                  );
                })}
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeUnassignedCharacter ? (
                  <Card
                    className={cn(
                      'p-3 transition-all relative',
                      activeUnassignedCharacter.character_id ===
                        selectedCharacterId && 'bg-muted/50'
                    )}
                  >
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground transition-opacity z-10">
                      <GripVertical className="size-5" />
                    </div>
                    <div className="flex items-center gap-2">
                      <CharacterPortrait
                        character={activeUnassignedCharacter}
                        skillQueue={
                          characterSkillQueues.get(
                            activeUnassignedCharacter.character_id
                          )?.skillQueue
                        }
                        isPaused={
                          characterSkillQueues.get(
                            activeUnassignedCharacter.character_id
                          )?.isPaused
                        }
                        size={48}
                      />
                      <span className="text-sm font-medium">
                        {activeUnassignedCharacter.character_name}
                      </span>
                    </div>
                  </Card>
                ) : null}
              </DragOverlay>
            </DndContext>
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
