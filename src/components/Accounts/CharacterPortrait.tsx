import { isAfter, isBefore, isEqual, parseISO } from 'date-fns';

import type { Character, SkillQueueItem } from '@/generated/types';
import { cn } from '@/lib/utils';

interface CharacterPortraitProps {
  character: Character;
  skillQueue?: SkillQueueItem[];
  isPaused?: boolean;
  size?: number;
  className?: string;
}

type TrainingStatus = 'training' | 'empty' | 'paused';

function getTrainingStatus(
  skillQueue: SkillQueueItem[] | undefined,
  isPaused?: boolean
): TrainingStatus {
  if (!skillQueue || skillQueue.length === 0) {
    return 'empty';
  }

  if (isPaused === true) {
    return 'paused';
  }

  const now = new Date();

  for (const item of skillQueue) {
    if (item.queue_position === 0) {
      return 'training';
    }

    if (item.start_date != null && item.finish_date != null) {
      try {
        const startDate = parseISO(item.start_date);
        const finishDate = parseISO(item.finish_date);

        const isAfterOrEqualStart =
          isAfter(now, startDate) || isEqual(now, startDate);
        const isBeforeFinish = isBefore(now, finishDate);

        if (isAfterOrEqualStart && isBeforeFinish) {
          return 'training';
        }
      } catch {
        // Invalid date format, skip this check
      }
    }
  }

  return 'paused';
}

function getBorderColor(status: TrainingStatus): string {
  switch (status) {
    case 'training':
      return 'border-green-500';
    case 'empty':
      return 'border-orange-500';
    case 'paused':
      return 'border-yellow-500';
    default:
      return 'border-border';
  }
}

const VALID_SIZES = [32, 64, 128, 256, 512, 1024];

function getValidSize(size: number): number {
  if (VALID_SIZES.includes(size)) {
    return size;
  }
  const closest = VALID_SIZES.reduce((prev, curr) =>
    Math.abs(curr - size) < Math.abs(prev - size) ? curr : prev
  );
  return closest;
}

export function CharacterPortrait({
  character,
  skillQueue,
  isPaused,
  size = 64,
  className,
}: CharacterPortraitProps) {
  const status = getTrainingStatus(skillQueue, isPaused);
  const borderColor = getBorderColor(status);
  const validSize = getValidSize(size);
  const displaySize = size;

  const portraitUrl = `https://images.evetech.net/characters/${character.character_id}/portrait?size=${validSize}`;

  return (
    <img
      src={portraitUrl}
      alt={character.character_name}
      className={cn('rounded border-2 shrink-0', borderColor, className)}
      width={displaySize}
      height={displaySize}
      loading="lazy"
    />
  );
}
