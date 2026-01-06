import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import type {
  AccountWithCharacters,
  Character,
  SkillQueueItem,
} from '@/generated/types';

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

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 text-muted-foreground/50 hover:text-muted-foreground transition-opacity"
      >
        <GripVertical className="size-4" />
      </div>
      <AccountCard {...props} />
    </div>
  );
}
