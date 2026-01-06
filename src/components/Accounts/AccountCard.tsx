import { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { GripVertical, Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import type {
  AccountWithCharacters,
  Character,
  SkillQueueItem,
} from '@/generated/types';
import { useReorderCharactersInAccount } from '@/hooks/tauri/useAccountsAndCharacters';
import { useSortableList } from '@/hooks/useSortableList';
import { cn } from '@/lib/utils';

import { AddCharacterToAccountMenu } from './AddCharacterToAccountMenu';
import { CharacterPortrait } from './CharacterPortrait';
import { SortableCharacterItem } from './SortableCharacterItem';

interface AccountCardProps {
  account: AccountWithCharacters;
  selectedCharacterId: number | null;
  unassignedCharacters: Character[];
  accounts: AccountWithCharacters[];
  characterSkillQueues: Map<
    number,
    { skillQueue: SkillQueueItem[]; isPaused: boolean }
  >;
}

export function AccountCard({
  account,
  selectedCharacterId,
  unassignedCharacters,
  accounts,
  characterSkillQueues,
}: AccountCardProps) {
  const reorderCharacters = useReorderCharactersInAccount();

  const {
    localItems: localCharacters,
    activeItem: activeCharacter,
    sensors,
    handleDragStart,
    handleDragEnd,
  } = useSortableList({
    items: account.characters,
    onReorder: (newOrder) =>
      reorderCharacters.mutate({
        accountId: account.id,
        characterIds: newOrder.map((char) => char.character_id),
      }),
    getId: (char) => char.character_id,
  });

  const isExpanded = account.characters.some(
    (char) => char.character_id === selectedCharacterId
  );
  const canAddCharacter = account.characters.length < 3;

  return (
    <Card className="p-3">
      {isExpanded ? (
        <div className="flex flex-col gap-2">
          <DndContext
            id={`account-chars-expanded-${account.id}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex flex-col gap-2">
              <SortableContext
                items={localCharacters.map((c) => c.character_id)}
                strategy={verticalListSortingStrategy}
              >
                {localCharacters.map((character) => {
                  const queueData = characterSkillQueues.get(
                    character.character_id
                  );
                  const isSelected =
                    character.character_id === selectedCharacterId;

                  return (
                    <SortableCharacterItem
                      key={character.character_id}
                      character={character}
                      accounts={accounts}
                      queueData={queueData}
                      isSelected={isSelected}
                      isExpanded={true}
                    />
                  );
                })}
              </SortableContext>
              {canAddCharacter && (
                <AddCharacterToAccountMenu
                  accountId={account.id}
                  unassignedCharacters={unassignedCharacters}
                >
                  <div className="flex items-center gap-2 rounded p-1">
                    <div className="flex items-center justify-center w-12 h-12 border-2 border-dashed border-muted-foreground/30 rounded cursor-pointer hover:bg-muted/50 hover:border-muted-foreground/50 transition-colors">
                      <Plus className="size-5 text-muted-foreground" />
                    </div>
                  </div>
                </AddCharacterToAccountMenu>
              )}
            </div>
            <DragOverlay dropAnimation={null}>
              {activeCharacter ? (
                <div
                  className={cn(
                    'flex items-center gap-2 rounded p-1 relative',
                    activeCharacter.character_id === selectedCharacterId &&
                      'bg-muted'
                  )}
                >
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground z-10">
                    <GripVertical className="size-4" />
                  </div>
                  <CharacterPortrait
                    character={activeCharacter}
                    skillQueue={
                      characterSkillQueues.get(activeCharacter.character_id)
                        ?.skillQueue
                    }
                    isPaused={
                      characterSkillQueues.get(activeCharacter.character_id)
                        ?.isPaused
                    }
                    size={48}
                  />
                  <span className="text-sm font-medium">
                    {activeCharacter.character_name}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          <p className="text-xs text-muted-foreground pt-1">{account.name}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <DndContext
            id={`account-chars-collapsed-${account.id}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex items-center gap-2">
              <SortableContext
                items={localCharacters.map((c) => c.character_id)}
                strategy={horizontalListSortingStrategy}
              >
                {localCharacters.map((character) => {
                  const queueData = characterSkillQueues.get(
                    character.character_id
                  );

                  return (
                    <SortableCharacterItem
                      key={character.character_id}
                      character={character}
                      accounts={accounts}
                      queueData={queueData}
                      isSelected={false}
                      isExpanded={false}
                    />
                  );
                })}
              </SortableContext>
              {canAddCharacter && (
                <AddCharacterToAccountMenu
                  accountId={account.id}
                  unassignedCharacters={unassignedCharacters}
                >
                  <div className="flex items-center justify-center w-12 h-12 border-2 border-dashed border-muted-foreground/30 rounded cursor-pointer hover:bg-muted/50 hover:border-muted-foreground/50 transition-colors">
                    <Plus className="size-5 text-muted-foreground" />
                  </div>
                </AddCharacterToAccountMenu>
              )}
            </div>
            <DragOverlay dropAnimation={null}>
              {activeCharacter ? (
                <div className="rounded relative">
                  <CharacterPortrait
                    character={activeCharacter}
                    skillQueue={
                      characterSkillQueues.get(activeCharacter.character_id)
                        ?.skillQueue
                    }
                    isPaused={
                      characterSkillQueues.get(activeCharacter.character_id)
                        ?.isPaused
                    }
                    size={48}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          <p className="text-xs text-muted-foreground text-center">
            {account.name}
          </p>
        </div>
      )}
    </Card>
  );
}
