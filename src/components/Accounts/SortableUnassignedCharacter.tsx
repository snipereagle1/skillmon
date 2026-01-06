import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from '@tanstack/react-router';
import { GripVertical } from 'lucide-react';

import { Card } from '@/components/ui/card';
import type {
  AccountWithCharacters,
  Character,
  SkillQueueItem,
} from '@/generated/types';
import { cn } from '@/lib/utils';

import { CharacterContextMenu } from './CharacterContextMenu';
import { CharacterPortrait } from './CharacterPortrait';

interface SortableUnassignedCharacterProps {
  character: Character;
  accounts: AccountWithCharacters[];
  queueData?: { skillQueue: SkillQueueItem[]; isPaused: boolean };
  isSelected: boolean;
}

export function SortableUnassignedCharacter({
  character,
  accounts,
  queueData,
  isSelected,
}: SortableUnassignedCharacterProps) {
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

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 text-muted-foreground/50 hover:text-muted-foreground transition-opacity z-10"
      >
        <GripVertical className="size-4" />
      </div>
      <CharacterContextMenu character={character} accounts={accounts}>
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
    </div>
  );
}
