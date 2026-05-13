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

export function formatAbsoluteDate(
  finishDate: string | null | undefined
): string {
  if (!finishDate) return 'Paused';

  const finish = parseISO(finishDate);

  if (!isFuture(finish)) return 'Complete';

  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][finish.getUTCMonth()];
  const day = finish.getUTCDate();
  const hours = String(finish.getUTCHours()).padStart(2, '0');
  const mins = String(finish.getUTCMinutes()).padStart(2, '0');

  return `${month} ${day} at ${hours}:${mins} UTC`;
}

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
  if (!skill.spPerMinute || skill.spPerMinute <= 0) {
    return null;
  }

  if (skill.levelStartSp == null || skill.levelEndSp == null) {
    return null;
  }

  const rawCurrentSP =
    skill.currentSp ?? skill.trainingStartSp ?? skill.levelStartSp;
  if (rawCurrentSP == null) {
    return null;
  }
  const currentSP = Math.max(rawCurrentSP, skill.levelStartSp);
  const remainingSP = skill.levelEndSp - currentSP;

  if (remainingSP <= 0) {
    return 'Complete';
  }

  const spPerHour = skill.spPerMinute * 60;
  const hoursToTrain = remainingSP / spPerHour;

  return formatDurationFromHours(hoursToTrain);
}

export function calculateCompletionPercentage(skill: SkillQueueItem): number {
  if (skill.levelStartSp == null || skill.levelEndSp == null) {
    return 0;
  }

  const rawCurrentSP =
    skill.currentSp ?? skill.trainingStartSp ?? skill.levelStartSp;
  if (rawCurrentSP == null) {
    return 0;
  }
  const currentSP = Math.max(rawCurrentSP, skill.levelStartSp);
  const totalSP = skill.levelEndSp - skill.levelStartSp;
  const completedSP = currentSP - skill.levelStartSp;

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
  if (!skill.spPerMinute || skill.spPerMinute <= 0) {
    return 0;
  }

  if (skill.levelStartSp == null || skill.levelEndSp == null) {
    return 0;
  }

  const rawCurrentSP =
    skill.currentSp ?? skill.trainingStartSp ?? skill.levelStartSp;
  if (rawCurrentSP == null) {
    return 0;
  }
  const currentSP = Math.max(rawCurrentSP, skill.levelStartSp);
  const remainingSP = skill.levelEndSp - currentSP;

  if (remainingSP <= 0) {
    return 0;
  }

  const spPerHour = skill.spPerMinute * 60;
  return remainingSP / spPerHour;
}

export function isCurrentlyTraining(skill: SkillQueueItem): boolean {
  if (skill.queuePosition === 0) {
    return true;
  }

  if (skill.startDate != null && skill.finishDate != null) {
    try {
      const now = new Date();
      const startDate = parseISO(skill.startDate);
      const finishDate = parseISO(skill.finishDate);

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
