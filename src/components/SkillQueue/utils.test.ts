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
  // Freeze the clock so the `new Date()` inside formatTimeRemaining reads the
  // same instant the test used to build its target date. Without this the two
  // reads differ by a sub-second delta, differenceInSeconds truncates (e.g.
  // 300s -> 299s), and "5m" renders as "4m 59s" — a flaky failure on slow CI.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('formats long duration correctly (years and months)', () => {
    const futureDate = new Date();
    // Move 1 year, 2 months, 3 days ahead
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    futureDate.setMonth(futureDate.getMonth() + 2);
    futureDate.setDate(futureDate.getDate() + 3);

    const result = formatTimeRemaining(futureDate.toISOString());
    // result should contain y and mo
    expect(result).toContain('1y');
    expect(result).toContain('2mo');
    expect(result).toMatch(/1y 2mo \d+d/);
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

  it('formats months and years correctly from hours', () => {
    // 1 year = 8760 hours (approx)
    // 1 month = 730 hours (approx)
    // Let's use exact numbers based on 1970 calendar used by formatDuration internally
    // 31 days (Jan) = 744 hours
    expect(formatDurationFromHours(744)).toBe('1mo');
    // 365 days = 8760 hours
    expect(formatDurationFromHours(8760)).toBe('1y');
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
    skillId: 1,
    queuePosition: 0,
    finishedLevel: 1,
    levelStartSp: 0,
    levelEndSp: 1000,
    currentSp: 500,
    spPerMinute: 10,
    ...overrides,
  });

  it('returns null for missing spPerMinute', () => {
    const skill = createMockSkill({ spPerMinute: undefined });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('returns null for zero spPerMinute', () => {
    const skill = createMockSkill({ spPerMinute: 0 });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('returns null for negative spPerMinute', () => {
    const skill = createMockSkill({ spPerMinute: -5 });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('returns null for missing levelStartSp', () => {
    const skill = createMockSkill({ levelStartSp: undefined });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('returns null for missing levelEndSp', () => {
    const skill = createMockSkill({ levelEndSp: undefined });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('returns null when all currentSp sources are missing', () => {
    const skill = createMockSkill({
      currentSp: undefined,
      trainingStartSp: undefined,
      levelStartSp: undefined,
    });
    expect(calculateTimeToTrain(skill)).toBeNull();
  });

  it('uses currentSp when available', () => {
    const skill = createMockSkill({
      currentSp: 800,
      trainingStartSp: 500,
      levelStartSp: 0,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).not.toBe('Complete');
  });

  it('falls back to trainingStartSp when currentSp is null', () => {
    const skill = createMockSkill({
      currentSp: undefined,
      trainingStartSp: 600,
      levelStartSp: 0,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).not.toBe('Complete');
  });

  it('falls back to levelStartSp when currentSp and trainingStartSp are null', () => {
    const skill = createMockSkill({
      currentSp: undefined,
      trainingStartSp: undefined,
      levelStartSp: 0,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).not.toBe('Complete');
  });

  it('returns "Complete" when remainingSP <= 0', () => {
    const skill = createMockSkill({
      currentSp: 1000,
      levelEndSp: 1000,
    });
    expect(calculateTimeToTrain(skill)).toBe('Complete');
  });

  it('returns "Complete" when currentSp exceeds levelEndSp', () => {
    const skill = createMockSkill({
      currentSp: 1200,
      levelEndSp: 1000,
    });
    expect(calculateTimeToTrain(skill)).toBe('Complete');
  });

  it('calculates time correctly for valid skill', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: 0,
      spPerMinute: 10,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^\d+(y|mo|[hdm])(\s\d+(y|mo|[hdm]))*$/);
  });

  it('calculates time correctly with partial progress', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: 500,
      spPerMinute: 10,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^\d+(y|mo|[hdm])(\s\d+(y|mo|[hdm]))*$/);
  });

  it('clamps currentSp to levelStartSp when currentSp is less than levelStartSp', () => {
    const skill = createMockSkill({
      levelStartSp: 226275,
      levelEndSp: 1280000,
      currentSp: 73702,
      trainingStartSp: 226275,
      spPerMinute: 10,
    });
    const result = calculateTimeToTrain(skill);
    expect(result).toBeTruthy();
    expect(result).not.toBe('Complete');
    expect(result).toMatch(/^\d+(y|mo|[hdm])(\s\d+(y|mo|[hdm]))*$/);
  });
});

describe('calculateCompletionPercentage', () => {
  const createMockSkill = (
    overrides: Partial<SkillQueueItem> = {}
  ): SkillQueueItem => ({
    skillId: 1,
    queuePosition: 0,
    finishedLevel: 1,
    levelStartSp: 0,
    levelEndSp: 1000,
    currentSp: 500,
    ...overrides,
  });

  it('returns 0 for missing levelStartSp', () => {
    const skill = createMockSkill({ levelStartSp: undefined });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });

  it('returns 0 for missing levelEndSp', () => {
    const skill = createMockSkill({ levelEndSp: undefined });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });

  it('returns 0 when all currentSp sources are missing', () => {
    const skill = createMockSkill({
      currentSp: undefined,
      trainingStartSp: undefined,
      levelStartSp: undefined,
    });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });

  it('returns 100 when totalSP <= 0', () => {
    const skill = createMockSkill({
      levelStartSp: 1000,
      levelEndSp: 1000,
    });
    expect(calculateCompletionPercentage(skill)).toBe(100);
  });

  it('returns 0 when completedSP <= 0', () => {
    const skill = createMockSkill({
      levelStartSp: 1000,
      levelEndSp: 2000,
      currentSp: 500,
    });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });

  it('clamps currentSp to levelStartSp when currentSp is less than levelStartSp', () => {
    const skill = createMockSkill({
      levelStartSp: 226275,
      levelEndSp: 1280000,
      currentSp: 73702,
      trainingStartSp: 226275,
    });
    const result = calculateCompletionPercentage(skill);
    expect(result).toBe(0);
  });

  it('returns 100 when completedSP >= totalSP', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: 1000,
    });
    expect(calculateCompletionPercentage(skill)).toBe(100);
  });

  it('returns 100 when currentSp exceeds levelEndSp', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: 1200,
    });
    expect(calculateCompletionPercentage(skill)).toBe(100);
  });

  it('calculates 50% correctly', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: 500,
    });
    expect(calculateCompletionPercentage(skill)).toBe(50);
  });

  it('calculates 25% correctly', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: 250,
    });
    expect(calculateCompletionPercentage(skill)).toBe(25);
  });

  it('calculates 75% correctly', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: 750,
    });
    expect(calculateCompletionPercentage(skill)).toBe(75);
  });

  it('uses currentSp when available', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: 800,
      trainingStartSp: 500,
    });
    expect(calculateCompletionPercentage(skill)).toBe(80);
  });

  it('falls back to trainingStartSp when currentSp is null', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: undefined,
      trainingStartSp: 600,
    });
    expect(calculateCompletionPercentage(skill)).toBe(60);
  });

  it('falls back to levelStartSp when currentSp and trainingStartSp are null', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: undefined,
      trainingStartSp: undefined,
    });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });

  it('handles non-zero levelStartSp correctly', () => {
    const skill = createMockSkill({
      levelStartSp: 1000,
      levelEndSp: 2000,
      currentSp: 1500,
    });
    expect(calculateCompletionPercentage(skill)).toBe(50);
  });

  it('clamps result to 0-100 range', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 1000,
      currentSp: -100,
    });
    expect(calculateCompletionPercentage(skill)).toBe(0);
  });
});

describe('calculateTrainingHours', () => {
  const createMockSkill = (
    overrides: Partial<SkillQueueItem> = {}
  ): SkillQueueItem => ({
    skillId: 1,
    queuePosition: 0,
    finishedLevel: 1,
    levelStartSp: 0,
    levelEndSp: 1000,
    currentSp: 500,
    spPerMinute: 10,
    ...overrides,
  });

  it('returns 0 for missing spPerMinute', () => {
    const skill = createMockSkill({ spPerMinute: undefined });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 for zero spPerMinute', () => {
    const skill = createMockSkill({ spPerMinute: 0 });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 for negative spPerMinute', () => {
    const skill = createMockSkill({ spPerMinute: -5 });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 for missing levelStartSp', () => {
    const skill = createMockSkill({ levelStartSp: undefined });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 for missing levelEndSp', () => {
    const skill = createMockSkill({ levelEndSp: undefined });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 when all currentSp sources are missing', () => {
    const skill = createMockSkill({
      currentSp: undefined,
      trainingStartSp: undefined,
      levelStartSp: undefined,
    });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 when remainingSP <= 0', () => {
    const skill = createMockSkill({
      currentSp: 1000,
      levelEndSp: 1000,
    });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('returns 0 when currentSp exceeds levelEndSp', () => {
    const skill = createMockSkill({
      currentSp: 1200,
      levelEndSp: 1000,
    });
    expect(calculateTrainingHours(skill)).toBe(0);
  });

  it('calculates hours correctly for valid skill', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 600,
      currentSp: 0,
      spPerMinute: 10,
    });
    expect(calculateTrainingHours(skill)).toBe(1);
  });

  it('calculates hours correctly with partial progress', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 600,
      currentSp: 300,
      spPerMinute: 10,
    });
    expect(calculateTrainingHours(skill)).toBe(0.5);
  });

  it('uses currentSp when available', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 600,
      currentSp: 200,
      trainingStartSp: 100,
      spPerMinute: 10,
    });
    expect(calculateTrainingHours(skill)).toBeCloseTo(400 / 600, 2);
  });

  it('falls back to trainingStartSp when currentSp is null', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 600,
      currentSp: undefined,
      trainingStartSp: 300,
      spPerMinute: 10,
    });
    expect(calculateTrainingHours(skill)).toBe(0.5);
  });

  it('falls back to levelStartSp when currentSp and trainingStartSp are null', () => {
    const skill = createMockSkill({
      levelStartSp: 0,
      levelEndSp: 600,
      currentSp: undefined,
      trainingStartSp: undefined,
      spPerMinute: 10,
    });
    expect(calculateTrainingHours(skill)).toBe(1);
  });

  it('clamps currentSp to levelStartSp when currentSp is less than levelStartSp', () => {
    const skill = createMockSkill({
      levelStartSp: 226275,
      levelEndSp: 1280000,
      currentSp: 73702,
      trainingStartSp: 226275,
      spPerMinute: 10,
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
    skillId: 1,
    queuePosition: 1,
    finishedLevel: 1,
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when queuePosition is 0', () => {
    const skill = createMockSkill({ queuePosition: 0 });
    expect(isCurrentlyTraining(skill)).toBe(true);
  });

  it('returns false when queuePosition is not 0 and dates are missing', () => {
    const skill = createMockSkill({
      queuePosition: 1,
      startDate: undefined,
      finishDate: undefined,
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns true when now is between start and finish dates', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const skill = createMockSkill({
      queuePosition: 1,
      startDate: '2024-01-15T10:00:00Z',
      finishDate: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(true);
  });

  it('returns true when now equals start date', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    const skill = createMockSkill({
      queuePosition: 1,
      startDate: '2024-01-15T10:00:00Z',
      finishDate: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(true);
  });

  it('returns false when now is before start date', () => {
    const now = new Date('2024-01-15T09:00:00Z');
    vi.setSystemTime(now);

    const skill = createMockSkill({
      queuePosition: 1,
      startDate: '2024-01-15T10:00:00Z',
      finishDate: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns false when now is after finish date', () => {
    const now = new Date('2024-01-15T15:00:00Z');
    vi.setSystemTime(now);

    const skill = createMockSkill({
      queuePosition: 1,
      startDate: '2024-01-15T10:00:00Z',
      finishDate: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns false when now equals finish date', () => {
    const now = new Date('2024-01-15T14:00:00Z');
    vi.setSystemTime(now);

    const skill = createMockSkill({
      queuePosition: 1,
      startDate: '2024-01-15T10:00:00Z',
      finishDate: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns false for invalid date format', () => {
    const skill = createMockSkill({
      queuePosition: 1,
      startDate: 'invalid-date',
      finishDate: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns false when startDate is null but finishDate exists', () => {
    const skill = createMockSkill({
      queuePosition: 1,
      startDate: undefined,
      finishDate: '2024-01-15T14:00:00Z',
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });

  it('returns false when finishDate is null but startDate exists', () => {
    const skill = createMockSkill({
      queuePosition: 1,
      startDate: '2024-01-15T10:00:00Z',
      finishDate: undefined,
    });
    expect(isCurrentlyTraining(skill)).toBe(false);
  });
});
