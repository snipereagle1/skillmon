import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';

import { cn } from '@/lib/utils';

interface SortableSourceRowProps {
  id: number;
  name: string;
  onRemove: () => void;
}

export function SortableSourceRow({
  id,
  name,
  onRemove,
}: SortableSourceRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.3 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-1 rounded-sm border bg-background px-2 py-1.5 text-sm'
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="relative inline-flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground/60 transition-transform hover:text-muted-foreground active:scale-[0.96] before:absolute before:left-1/2 before:top-1/2 before:size-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
        aria-label="Reorder"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex-1 truncate">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="relative inline-flex items-center justify-center text-muted-foreground/60 transition-transform hover:text-destructive active:scale-[0.96] before:absolute before:left-1/2 before:top-1/2 before:size-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
        aria-label="Remove"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
