import { intervalToDuration, isAfter, isBefore, isEqual } from 'date-fns';

import type { SkillQueueItem } from '@/generated/types';

export function formatTimeRemaining(
  finishDate: string | null | undefined
): string {
  if (!finishDate) return 'Paused';

  const finish = new Date(finishDate);
  const now = new Date();

  if (finish <= now) return 'Complete';

  const duration = intervalToDuration({ start: now, end: finish });

  const parts: string[] = [];

  if (duration.days && duration.days > 0) {
    parts.push(`${duration.days}d`);
  }
  if (duration.hours && duration.hours > 0) {
    parts.push(`${duration.hours}h`);
  }
  if (duration.minutes && duration.minutes > 0) {
    parts.push(`${duration.minutes}m`);
  }
  if (duration.seconds && duration.seconds > 0 && parts.length === 0) {
    parts.push(`${duration.seconds}s`);
  }

  if (parts.length === 0) {
    return '0s';
  }

  return parts.join(' ');
}

export function formatDurationFromHours(hours: number): string {
  if (hours <= 0) return '0h';

  const days = Math.floor(hours / 24);
  const remainingHours = Math.floor(hours % 24);
  const minutes = Math.floor((hours % 1) * 60);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (remainingHours > 0) {
    parts.push(`${remainingHours}h`);
  }
  if (minutes > 0 && days === 0) {
    parts.push(`${minutes}m`);
  }

  if (parts.length === 0) {
    return '0h';
  }

  return parts.join(' ');
}

export function calculateTimeToTrain(skill: SkillQueueItem): string | null {
  if (!skill.sp_per_minute || skill.sp_per_minute <= 0) {
    return null;
  }

  if (skill.level_start_sp == null || skill.level_end_sp == null) {
    return null;
  }

  const currentSP =
    skill.current_sp ?? skill.training_start_sp ?? skill.level_start_sp;
  if (currentSP == null) {
    return null;
  }
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

  const currentSP =
    skill.current_sp ?? skill.training_start_sp ?? skill.level_start_sp;
  if (currentSP == null) {
    return 0;
  }
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

  const currentSP =
    skill.current_sp ?? skill.training_start_sp ?? skill.level_start_sp;
  if (currentSP == null) {
    return 0;
  }
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
      const startDate = new Date(skill.start_date);
      const finishDate = new Date(skill.finish_date);

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
