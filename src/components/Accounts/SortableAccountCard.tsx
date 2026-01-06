import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal, GripVertical } from 'lucide-react';

import type {
  AccountWithCharacters,
  Character,
  SkillQueueItem,
} from '@/generated/types';
import { cn } from '@/lib/utils';

import { AccountCard } from './AccountCard';

interface SortableAccountCardProps {
  account: AccountWithCharacters;
  selectedCharacterId: number | null;
  unassignedCharacters: Character[];
  accounts: AccountWithCharacters[];
  characterSkillQueues: Map<
    number,
    { skillQueue: SkillQueueItem[]; isPaused: boolean }
  >;
}

export function SortableAccountCard(props: SortableAccountCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.account.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.3 : undefined,
  };

  const isExpanded = props.account.characters.some(
    (char) => char.character_id === props.selectedCharacterId
  );

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {isExpanded ? (
        <div
          {...attributes}
          {...listeners}
          className={cn(
            'absolute left-1/2 bottom-1 -translate-x-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing px-2 py-1 text-muted-foreground/50 hover:text-muted-foreground transition-opacity z-10',
            isDragging && 'opacity-100'
          )}
        >
          <GripHorizontal className="size-5" />
        </div>
      ) : (
        <div
          {...attributes}
          {...listeners}
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 text-muted-foreground/50 hover:text-muted-foreground transition-opacity',
            isDragging && 'opacity-100'
          )}
        >
          <GripVertical className="size-5" />
        </div>
      )}
      <AccountCard {...props} />
    </div>
  );
}
