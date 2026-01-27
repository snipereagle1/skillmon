import {
  differenceInSeconds,
  isAfter,
  isBefore,
  isEqual,
  isFuture,
  parseISO,
} from 'date-fns';

import type { SkillQueueItem } from '@/generated/types';
import { formatDuration, formatDurationFromHours } from '@/lib/utils';

export { formatDurationFromHours };

export function formatTimeRemaining(
  finishDate: string | null | undefined
): string {
  if (!finishDate) return 'Paused';

  const finish = parseISO(finishDate);

  if (!isFuture(finish)) return 'Complete';

  const durationInSeconds = Math.max(
    0,
    differenceInSeconds(finish, new Date())
  );

  return formatDuration(durationInSeconds, {
    showSeconds: true,
    zeroLabel: '0s',
  });
}

export function calculateTimeToTrain(skill: SkillQueueItem): string | null {
  if (!skill.sp_per_minute || skill.sp_per_minute <= 0) {
    return null;
  }

  if (skill.level_start_sp == null || skill.level_end_sp == null) {
    return null;
  }

  const rawCurrentSP =
    skill.current_sp ?? skill.training_start_sp ?? skill.level_start_sp;
  if (rawCurrentSP == null) {
    return null;
  }
  const currentSP = Math.max(rawCurrentSP, skill.level_start_sp);
  const remainingSP = skill.level_end_sp - currentSP;

  if (remainingSP <= 0) {
    return 'Complete';
  }

  const spPerHour = skill.sp_per_minute * 60;
  const hoursToTrain = remainingSP / spPerHour;

  return formatDurationFromHours(hoursToTrain);
}

export function calculateCompletionPercentage(skill: SkillQueueItem): number {
  if (skill.level_start_sp == null || skill.level_end_sp == null) {
    return 0;
  }

  const rawCurrentSP =
    skill.current_sp ?? skill.training_start_sp ?? skill.level_start_sp;
  if (rawCurrentSP == null) {
    return 0;
  }
  const currentSP = Math.max(rawCurrentSP, skill.level_start_sp);
  const totalSP = skill.level_end_sp - skill.level_start_sp;
  const completedSP = currentSP - skill.level_start_sp;

  if (totalSP <= 0) {
    return 100;
  }

  if (completedSP <= 0) {
    return 0;
  }

  if (completedSP >= totalSP) {
    return 100;
  }

  return Math.min(Math.max((completedSP / totalSP) * 100, 0), 100);
}

export function calculateTrainingHours(skill: SkillQueueItem): number {
  if (!skill.sp_per_minute || skill.sp_per_minute <= 0) {
    return 0;
  }

  if (skill.level_start_sp == null || skill.level_end_sp == null) {
    return 0;
  }

  const rawCurrentSP =
    skill.current_sp ?? skill.training_start_sp ?? skill.level_start_sp;
  if (rawCurrentSP == null) {
    return 0;
  }
  const currentSP = Math.max(rawCurrentSP, skill.level_start_sp);
  const remainingSP = skill.level_end_sp - currentSP;

  if (remainingSP <= 0) {
    return 0;
  }

  const spPerHour = skill.sp_per_minute * 60;
  return remainingSP / spPerHour;
}

export function isCurrentlyTraining(skill: SkillQueueItem): boolean {
  if (skill.queue_position === 0) {
    return true;
  }

  if (skill.start_date != null && skill.finish_date != null) {
    try {
      const now = new Date();
      const startDate = parseISO(skill.start_date);
      const finishDate = parseISO(skill.finish_date);

      const isAfterOrEqualStart =
        isAfter(now, startDate) || isEqual(now, startDate);
      const isBeforeFinish = isBefore(now, finishDate);

      if (isAfterOrEqualStart && isBeforeFinish) {
        return true;
      }
    } catch {
      // Invalid date format, skip this check
    }
  }

  return false;
}
