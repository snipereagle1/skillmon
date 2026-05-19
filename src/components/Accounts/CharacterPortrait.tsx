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
    if (item.queuePosition === 0) {
      return 'training';
    }

    if (item.startDate != null && item.finishDate != null) {
      try {
        const startDate = parseISO(item.startDate);
        const finishDate = parseISO(item.finishDate);

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

const PIP_CLASS: Record<TrainingStatus, string | null> = {
  training: 'bg-status-training',
  paused: 'bg-status-paused',
  empty: null,
};

const SIZE_CLASS: Record<number, string> = {
  32: 'size-8',
  48: 'size-12',
  64: 'size-16',
  128: 'size-32',
  256: 'size-64',
  512: 'size-[512px]',
  1024: 'size-[1024px]',
};

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
  const pipClass = PIP_CLASS[status];
  const validSize = getValidSize(size);
  const sizeClass = SIZE_CLASS[size] ?? `size-[${size}px]`;

  const portraitUrl = `https://images.evetech.net/characters/${character.character_id}/portrait?size=${validSize}`;

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-sm shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]',
        sizeClass,
        className
      )}
    >
      <img
        src={portraitUrl}
        alt={character.character_name}
        className="block h-full w-full object-cover"
        loading="lazy"
      />
      {pipClass && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute bottom-0 right-0 size-[10px] rounded-sm',
            pipClass
          )}
        />
      )}
    </div>
  );
}
