import { match } from 'ts-pattern';

import { cn } from '@/lib/utils';

interface SkillLevelPipsProps {
  /** Pips 1–trainedLevel shown in foreground (already trained). */
  trainedLevel?: number;
  /** Pips 1–queuedLevel shown in primary (queued or target level). */
  queuedLevel?: number;
  /** Pips beyond queuedLevel up to plannedLevel shown in primary/60 (planned). */
  plannedLevel?: number;
  /** The specific pip that glows — overlaid on top of other state. */
  activelyTrainingLevel?: number;
  /** When false, pips render at 75% scale to indicate uninjected skill. */
  isInjected?: boolean;
}

export function SkillLevelPips({
  trainedLevel = 0,
  queuedLevel,
  plannedLevel,
  activelyTrainingLevel,
  isInjected = true,
}: SkillLevelPipsProps) {
  return (
    <div className="flex gap-[3px] shrink-0">
      {[1, 2, 3, 4, 5].map((i) => {
        const isTraining = i === activelyTrainingLevel;
        const isQueued = queuedLevel !== undefined && i <= queuedLevel;
        const isPlanned = plannedLevel !== undefined && i <= plannedLevel;
        const isTrained = i <= trainedLevel;

        const bg = match({ isTraining, isQueued, isPlanned, isTrained })
          .with({ isTraining: true }, () => 'bg-primary')
          .with({ isQueued: true }, () => 'bg-primary')
          .with({ isPlanned: true }, () => 'bg-primary/60')
          .with({ isTrained: true }, () => 'bg-primary')
          .otherwise(() => 'bg-foreground/20');

        return (
          <div
            key={i}
            className={cn(
              'w-2 h-2 rounded-[2px]',
              bg,
              isTraining && 'shadow-[0_0_6px_-1px_var(--primary)]',
              !isInjected && 'scale-75'
            )}
          />
        );
      })}
    </div>
  );
}
