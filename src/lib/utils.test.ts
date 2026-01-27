import { describe, expect, it } from 'vitest';

import { formatDuration } from './utils';

describe('formatDuration', () => {
  it('returns zeroLabel for 0 or negative seconds', () => {
    expect(formatDuration(0)).toBe('None');
    expect(formatDuration(-10)).toBe('None');
    expect(formatDuration(0, { zeroLabel: 'Zero' })).toBe('Zero');
  });

  it('formats seconds correctly when showSeconds is true', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(30, { showSeconds: true })).toBe('30s');
  });

  it('formats seconds correctly when showSeconds is false', () => {
    expect(formatDuration(30, { showSeconds: false })).toBe('0m');
    expect(formatDuration(30, { showSeconds: false, minLabel: '1m' })).toBe(
      '1m'
    );
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(65)).toBe('1m 5s');
    expect(formatDuration(120)).toBe('2m');
  });

  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(3661)).toBe('1h 1m 1s');
    expect(formatDuration(7200)).toBe('2h');
  });

  it('formats days', () => {
    expect(formatDuration(86400)).toBe('1d');
    expect(formatDuration(86400 * 2 + 3600)).toBe('2d 1h');
  });

  it('formats months (approximate based on intervalToDuration starting at 0)', () => {
    // intervalToDuration starting at 0 uses 1970-01-01 as epoch.
    // January has 31 days.
    expect(formatDuration(86400 * 31)).toBe('1mo');
    expect(formatDuration(86400 * 45)).toBe('1mo 14d');
  });

  it('formats years', () => {
    // 1970 was not a leap year. 365 days.
    expect(formatDuration(86400 * 365)).toBe('1y');
    expect(formatDuration(86400 * (365 + 31))).toBe('1y 1mo');
  });

  it('handles complex durations', () => {
    // Note: Feb 1971 has 28 days.
    // Jan 1971 (31) + Feb 1971 (28) = 59 days.
    // Let's re-calculate more carefully based on date-fns behavior.
    // intervalToDuration({start: 0, end: seconds * 1000})
    // 0 is 1970-01-01 00:00:00
    // Jan has 31, Feb has 28, Mar has 31...

    // 1y = 365 days
    // 2mo = Jan(31) + Feb(28) = 59 days
    const secondsForTest = (365 + 59 + 3) * 86400 + 4 * 3600 + 5 * 60 + 6;
    expect(formatDuration(secondsForTest)).toBe('1y 2mo 3d 4h 5m 6s');
  });

  it('omits seconds when showSeconds is false', () => {
    expect(formatDuration(3661, { showSeconds: false })).toBe('1h 1m');
  });
});
