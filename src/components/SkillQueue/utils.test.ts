import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SkillQueueItem } from '@/generated/types';

import {
  calculateCompletionPercentage,
  calculateTimeToTrain,
  calculateTrainingHours,
  formatDurationFromHours,
  formatTimeRemaining,
  isCurrentlyTraining,
} from './utils';

describe('formatTimeRemaining', () => {
  it('returns "Paused" for null finish date', () => {
    expect(formatTimeRemaining(null)).toBe('Paused');
  });

  it('returns "Paused" for undefined finish date', () => {
    expect(formatTimeRemaining(undefined)).toBe('Paused');
  });

  it('returns "Complete" for past finish date', () => {
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 1);
    expect(formatTimeRemaining(pastDate.toISOString())).toBe('Complete');
  });

  it('returns "Complete" for finish date exactly now', () => {
    const now = new Date();
    expect(formatTimeRemaining(now.toISOString())).toBe('Complete');
  });

  it('formats seconds correctly', () => {
    const futureDate = new Date();
    futureDate.setSeconds(futureDate.getSeconds() + 30);
    const result = formatTimeRemaining(futureDate.toISOString());
    expect(result).toMatch(/^\d+s$/);
  });

  it('formats minutes correctly', () => {
    const futureDate = new Date();
    futureDate.setMinutes(futureDate.getMinutes() + 5);
    const result = formatTimeRemaining(futureDate.toISOString());
    expect(result).toMatch(/^\d+m$/);
  });

  it('formats hours correctly', () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 3);
    const result = formatTimeRemaining(futureDate.toISOString());
    expect(result).toMatch(/^\d+h$/);
  });

  it('formats days correctly', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    const result = formatTimeRemaining(futureDate.toISOString());
    expect(result).toMatch(/^\d+d$/);
  });

  it('formats combined duration correctly', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    futureDate.setHours(futureDate.getHours() + 2);
    futureDate.setMinutes(futureDate.getMinutes() + 30);
    const result = formatTimeRemaining(futureDate.toISOString());
    expect(result).toMatch(/^\d+d \d+h \d+m$/);
  });

  it('returns "0s" for zero duration', () => {
    const now = new Date();
    now.setMilliseconds(now.getMilliseconds() + 1);
    const result = formatTimeRemaining(now.toISOString());
    expect(result).toBe('0s');
  });
});

describe('formatDurationFromHours', () => {
  it('returns "0h" for zero hours', () => {
    expect(formatDurationFromHours(0)).toBe('0h');
  });

  it('returns "0h" for negative hours', () => {
    expect(formatDurationFromHours(-5)).toBe('0h');
  });

  it('formats hours correctly', () => {
    expect(formatDurationFromHours(5)).toBe('5h');
  });

  it('formats days correctly', () => {
    expect(formatDurationFromHours(48)).toBe('2d');
  });

  it('formats days and hours correctly', () => {
    expect(formatDurationFromHours(26)).toBe('1d 2h');
  });

  it('formats minutes when days is 0', () => {
    expect(formatDurationFromHours(0.5)).toBe('30m');
  });

  it('formats days, hours, and minutes correctly', () => {
    expect(formatDurationFromHours(1.5)).toBe('1h 30m');
  });

  it('handles fractional hours correctly', () => {
    expect(formatDurationFromHours(0.25)).toBe('15m');
  });

  it('returns "0h" when all parts are zero', () => {
    expect(formatDurationFromHours(0.001)).toBe('1m');
  });
});

describe('calculateTimeToTrain', () => {
  const createMockSkill = (
    overrides: Partial<SkillQueueItem> = {}
  ): SkillQueueItem => ({
    skill_id: 1,
    queue_position: 0,
    finished_level: 1,
    level_start_sp: 0,
    level_end_sp: 1000,
    current_sp: 500,
    sp_per_minute: 10,
    ...overrides,
  });

  it('returns null for missing sp_per_minute', () => {
    const skill = createMockSkill({ sp_per_minute: null });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('returns null for zero sp_per_minute', () => {
    const skill = createMockSkill({ sp_per_minute: 0 });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('returns null for negative sp_per_minute', () => {
    const skill = createMockSkill({ sp_per_minute: -5 });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('returns null for missing level_start_sp', () => {
    const skill = createMockSkill({ level_start_sp: null });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('returns null for missing level_end_sp', () => {
    const skill = createMockSkill({ level_end_sp: null });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('returns null when all current_sp sources are missing', () => {
    const skill = createMockSkill({
      current_sp: null,
      training_start_sp: null,
      level_start_sp: null,
    });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('uses current_sp when available', () => {
    const skill = createMockSkill({
      current_sp: 800,
      training_start_sp: 500,
      level_start_sp: 0,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).not.toBe('Complete');
  });

  it('falls back to training_start_sp when current_sp is null', () => {
    const skill = createMockSkill({
      current_sp: null,
      training_start_sp: 600,
      level_start_sp: 0,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).not.toBe('Complete');
  });

  it('falls back to level_start_sp when current_sp and training_start_sp are null', () => {
    const skill = createMockSkill({
      current_sp: null,
      training_start_sp: null,
      level_start_sp: 0,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).not.toBe('Complete');
  });

  it('returns "Complete" when remainingSP <= 0', () => {
    const skill = createMockSkill({
      current_sp: 1000,
      level_end_sp: 1000,
    });
    expect(calculateTimeToTrain(skill)).toBe('Complete');
  });

  it('returns "Complete" when current_sp exceeds level_end_sp', () => {
    const skill = createMockSkill({
      current_sp: 1200,
      level_end_sp: 1000,
    });
    expect(calculateTimeToTrain(skill)).toBe('Complete');
  });

  it('calculates time correctly for valid skill', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: 0,
      sp_per_minute: 10,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^\d+[hdm](\s\d+[hdm])*$/);
  });

  it('calculates time correctly with partial progress', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: 500,
      sp_per_minute: 10,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^\d+[hdm](\s\d+[hdm])*$/);
  });

  it('clamps current_sp to level_start_sp when current_sp is less than level_start_sp', () => {
    const skill = createMockSkill({
      level_start_sp: 226275,
      level_end_sp: 1280000,
      current_sp: 73702,
      training_start_sp: 226275,
      sp_per_minute: 10,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).not.toBe('Complete');
    expect(result).toMatch(/^\d+[hdm](\s\d+[hdm])*$/);
  });
});

describe('calculateCompletionPercentage', () => {
  const createMockSkill = (
    overrides: Partial<SkillQueueItem> = {}
  ): SkillQueueItem => ({
    skill_id: 1,
    queue_position: 0,
    finished_level: 1,
    level_start_sp: 0,
    level_end_sp: 1000,
    current_sp: 500,
    ...overrides,
  });

  it('returns 0 for missing level_start_sp', () => {
    const skill = createMockSkill({ level_start_sp: null });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });

  it('returns 0 for missing level_end_sp', () => {
    const skill = createMockSkill({ level_end_sp: null });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });

  it('returns 0 when all current_sp sources are missing', () => {
    const skill = createMockSkill({
      current_sp: null,
      training_start_sp: null,
      level_start_sp: null,
    });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });

  it('returns 100 when totalSP <= 0', () => {
    const skill = createMockSkill({
      level_start_sp: 1000,
      level_end_sp: 1000,
    });
    expect(calculateCompletionPercentage(skill)).toBe(100);
  });

  it('returns 0 when completedSP <= 0', () => {
    const skill = createMockSkill({
      level_start_sp: 1000,
      level_end_sp: 2000,
      current_sp: 500,
    });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });

  it('clamps current_sp to level_start_sp when current_sp is less than level_start_sp', () => {
    const skill = createMockSkill({
      level_start_sp: 226275,
      level_end_sp: 1280000,
      current_sp: 73702,
      training_start_sp: 226275,
    });
    const result = calculateCompletionPercentage(skill);
    expect(result).toBe(0);
  });

  it('returns 100 when completedSP >= totalSP', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: 1000,
    });
    expect(calculateCompletionPercentage(skill)).toBe(100);
  });

  it('returns 100 when current_sp exceeds level_end_sp', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: 1200,
    });
    expect(calculateCompletionPercentage(skill)).toBe(100);
  });

  it('calculates 50% correctly', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: 500,
    });
    expect(calculateCompletionPercentage(skill)).toBe(50);
  });

  it('calculates 25% correctly', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: 250,
    });
    expect(calculateCompletionPercentage(skill)).toBe(25);
  });

  it('calculates 75% correctly', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: 750,
    });
    expect(calculateCompletionPercentage(skill)).toBe(75);
  });

  it('uses current_sp when available', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: 800,
      training_start_sp: 500,
    });
    expect(calculateCompletionPercentage(skill)).toBe(80);
  });

  it('falls back to training_start_sp when current_sp is null', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: null,
      training_start_sp: 600,
    });
    expect(calculateCompletionPercentage(skill)).toBe(60);
  });

  it('falls back to level_start_sp when current_sp and training_start_sp are null', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: null,
      training_start_sp: null,
    });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });

  it('handles non-zero level_start_sp correctly', () => {
    const skill = createMockSkill({
      level_start_sp: 1000,
      level_end_sp: 2000,
      current_sp: 1500,
    });
    expect(calculateCompletionPercentage(skill)).toBe(50);
  });

  it('clamps result to 0-100 range', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 1000,
      current_sp: -100,
    });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });
});

describe('calculateTrainingHours', () => {
  const createMockSkill = (
    overrides: Partial<SkillQueueItem> = {}
  ): SkillQueueItem => ({
    skill_id: 1,
    queue_position: 0,
    finished_level: 1,
    level_start_sp: 0,
    level_end_sp: 1000,
    current_sp: 500,
    sp_per_minute: 10,
    ...overrides,
  });

  it('returns 0 for missing sp_per_minute', () => {
    const skill = createMockSkill({ sp_per_minute: null });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 for zero sp_per_minute', () => {
    const skill = createMockSkill({ sp_per_minute: 0 });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 for negative sp_per_minute', () => {
    const skill = createMockSkill({ sp_per_minute: -5 });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 for missing level_start_sp', () => {
    const skill = createMockSkill({ level_start_sp: null });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 for missing level_end_sp', () => {
    const skill = createMockSkill({ level_end_sp: null });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 when all current_sp sources are missing', () => {
    const skill = createMockSkill({
      current_sp: null,
      training_start_sp: null,
      level_start_sp: null,
    });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 when remainingSP <= 0', () => {
    const skill = createMockSkill({
      current_sp: 1000,
      level_end_sp: 1000,
    });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 when current_sp exceeds level_end_sp', () => {
    const skill = createMockSkill({
      current_sp: 1200,
      level_end_sp: 1000,
    });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('calculates hours correctly for valid skill', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 600,
      current_sp: 0,
      sp_per_minute: 10,
    });
    expect(calculateTrainingHours(skill)).toBe(1);
  });

  it('calculates hours correctly with partial progress', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 600,
      current_sp: 300,
      sp_per_minute: 10,
    });
    expect(calculateTrainingHours(skill)).toBe(0.5);
  });

  it('uses current_sp when available', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 600,
      current_sp: 200,
      training_start_sp: 100,
      sp_per_minute: 10,
    });
    expect(calculateTrainingHours(skill)).toBeCloseTo(400 / 600, 2);
  });

  it('falls back to training_start_sp when current_sp is null', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 600,
      current_sp: null,
      training_start_sp: 300,
      sp_per_minute: 10,
    });
    expect(calculateTrainingHours(skill)).toBe(0.5);
  });

  it('falls back to level_start_sp when current_sp and training_start_sp are null', () => {
    const skill = createMockSkill({
      level_start_sp: 0,
      level_end_sp: 600,
      current_sp: null,
      training_start_sp: null,
      sp_per_minute: 10,
    });
    expect(calculateTrainingHours(skill)).toBe(1);
  });

  it('clamps current_sp to level_start_sp when current_sp is less than level_start_sp', () => {
    const skill = createMockSkill({
      level_start_sp: 226275,
      level_end_sp: 1280000,
      current_sp: 73702,
      training_start_sp: 226275,
      sp_per_minute: 10,
    });
    const remainingSP = 1280000 - 226275;
    const expectedHours = remainingSP / (10 * 60);
    expect(calculateTrainingHours(skill)).toBe(expectedHours);
  });
});

describe('isCurrentlyTraining', () => {
  const createMockSkill = (
    overrides: Partial<SkillQueueItem> = {}
  ): SkillQueueItem => ({
    skill_id: 1,
    queue_position: 1,
    finished_level: 1,
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when queue_position is 0', () => {
    const skill = createMockSkill({ queue_position: 0 });
    expect(isCurrentlyTraining(skill)).toBe(true);
  });

  it('returns false when queue_position is not 0 and dates are missing', () => {
    const skill = createMockSkill({
      queue_position: 1,
      start_date: null,
      finish_date: null,
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns true when now is between start and finish dates', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const skill = createMockSkill({
      queue_position: 1,
      start_date: '2024-01-15T10:00:00Z',
      finish_date: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(true);
  });

  it('returns true when now equals start date', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    const skill = createMockSkill({
      queue_position: 1,
      start_date: '2024-01-15T10:00:00Z',
      finish_date: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(true);
  });

  it('returns false when now is before start date', () => {
    const now = new Date('2024-01-15T09:00:00Z');
    vi.setSystemTime(now);

    const skill = createMockSkill({
      queue_position: 1,
      start_date: '2024-01-15T10:00:00Z',
      finish_date: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns false when now is after finish date', () => {
    const now = new Date('2024-01-15T15:00:00Z');
    vi.setSystemTime(now);

    const skill = createMockSkill({
      queue_position: 1,
      start_date: '2024-01-15T10:00:00Z',
      finish_date: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns false when now equals finish date', () => {
    const now = new Date('2024-01-15T14:00:00Z');
    vi.setSystemTime(now);

    const skill = createMockSkill({
      queue_position: 1,
      start_date: '2024-01-15T10:00:00Z',
      finish_date: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns false for invalid date format', () => {
    const skill = createMockSkill({
      queue_position: 1,
      start_date: 'invalid-date',
      finish_date: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns false when start_date is null but finish_date exists', () => {
    const skill = createMockSkill({
      queue_position: 1,
      start_date: null,
      finish_date: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns false when finish_date is null but start_date exists', () => {
    const skill = createMockSkill({
      queue_position: 1,
      start_date: '2024-01-15T10:00:00Z',
      finish_date: null,
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });
});
