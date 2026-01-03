import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

import { Card } from '@/components/ui/card';
import type {
  AccountWithCharacters,
  Character,
  SkillQueueItem,
} from '@/generated/types';
import { cn } from '@/lib/utils';

import { AddCharacterToAccountMenu } from './AddCharacterToAccountMenu';
import { CharacterContextMenu } from './CharacterContextMenu';
import { CharacterPortrait } from './CharacterPortrait';

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
  const isExpanded = account.characters.some(
    (char) => char.character_id === selectedCharacterId
  );
  const canAddCharacter = account.characters.length < 3;

  return (
    <Card className="p-3">
      {isExpanded ? (
        <div className="space-y-2">
          <div className="space-y-2">
            {account.characters.map((character) => {
              const queueData = characterSkillQueues.get(
                character.character_id
              );
              const isSelected = character.character_id === selectedCharacterId;

              return (
                <CharacterContextMenu
                  key={character.character_id}
                  character={character}
                  accounts={accounts}
                >
                  <Link
                    to="/characters/$characterId"
                    params={{ characterId: String(character.character_id) }}
                  >
                    <div
                      className={cn(
                        'flex items-center gap-2 cursor-pointer rounded p-1 hover:bg-muted/50',
                        isSelected && 'bg-muted!'
                      )}
                    >
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
                  </Link>
                </CharacterContextMenu>
              );
            })}
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
          <p className="text-xs text-muted-foreground pt-1">{account.name}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {account.characters.map((character) => {
              const queueData = characterSkillQueues.get(
                character.character_id
              );

              return (
                <CharacterContextMenu
                  key={character.character_id}
                  character={character}
                  accounts={accounts}
                >
                  <Link
                    to="/characters/$characterId"
                    params={{ characterId: String(character.character_id) }}
                  >
                    <div className="cursor-pointer">
                      <CharacterPortrait
                        character={character}
                        skillQueue={queueData?.skillQueue}
                        isPaused={queueData?.isPaused}
                        size={48}
                      />
                    </div>
                  </Link>
                </CharacterContextMenu>
              );
            })}
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
          <p className="text-xs text-muted-foreground text-center">
            {account.name}
          </p>
        </div>
      )}
    </Card>
  );
}
