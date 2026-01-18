import { Brain } from 'lucide-react';

import type { Remap } from '@/generated/types';
import { cn } from '@/lib/utils';

interface RemapRowProps {
  remap: Remap;
  className?: string;
  showGripPlaceholder?: boolean;
}

export function RemapRow({
  remap,
  className,
  showGripPlaceholder = true,
}: RemapRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-3 px-4 bg-primary/15 border-b border-border/50 transition-colors',
        className
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Align with skill names: Grip(20px) + Gap(12px) + LevelIndicator(56px) = 88px */}
        <div className="flex items-center w-[88px] shrink-0">
          {showGripPlaceholder && <div className="w-8" />}
          <Brain className="h-4 w-4 text-primary" />
        </div>
        <span className="font-medium text-primary">Neural Remap</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex gap-4 text-muted-foreground text-sm">
          <div className="flex gap-1.5">
            <span className="text-small opacity-60">Perception</span>
            <span className="text-foreground">{remap.perception}</span>
          </div>
          <div className="flex gap-1.5">
            <span className="text-small opacity-60">Memory</span>
            <span className="text-foreground">{remap.memory}</span>
          </div>
          <div className="flex gap-1.5">
            <span className="text-small opacity-60">Willpower</span>
            <span className="text-foreground">{remap.willpower}</span>
          </div>
          <div className="flex gap-1.5">
            <span className="text-small opacity-60">Intelligence</span>
            <span className="text-foreground">{remap.intelligence}</span>
          </div>
          <div className="flex gap-1.5">
            <span className="text-small opacity-60">Charisma</span>
            <span className="text-foreground">{remap.charisma}</span>
          </div>
        </div>
        {/* Placeholder for action buttons to maintain alignment */}
        <div className="w-16" />
      </div>
    </div>
  );
}
