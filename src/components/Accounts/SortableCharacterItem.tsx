import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from '@tanstack/react-router';
import { GripVertical } from 'lucide-react';

import type {
  AccountWithCharacters,
  Character,
  SkillQueueItem,
} from '@/generated/types';
import { cn } from '@/lib/utils';

import { CharacterContextMenu } from './CharacterContextMenu';
import { CharacterPortrait } from './CharacterPortrait';

interface SortableCharacterItemProps {
  character: Character;
  accounts: AccountWithCharacters[];
  queueData?: { skillQueue: SkillQueueItem[]; isPaused: boolean };
  isSelected: boolean;
  isExpanded: boolean;
}

export function SortableCharacterItem({
  character,
  accounts,
  queueData,
  isSelected,
  isExpanded,
}: SortableCharacterItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: character.character_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.3 : undefined,
  };

  if (isExpanded) {
    return (
      <div ref={setNodeRef} style={style} className="relative group">
        <div
          {...attributes}
          {...listeners}
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 text-muted-foreground/50 hover:text-muted-foreground transition-opacity z-10',
            isDragging && 'opacity-100'
          )}
        >
          <GripVertical className="size-4" />
        </div>
        <CharacterContextMenu character={character} accounts={accounts}>
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
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <CharacterContextMenu character={character} accounts={accounts}>
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
    </div>
  );
}
