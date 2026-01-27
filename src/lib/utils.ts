import { type ClassValue, clsx } from 'clsx';
import { format, intervalToDuration, parseISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import { match, P } from 'ts-pattern';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toRoman(n: number): string {
  const roman = ['I', 'II', 'III', 'IV', 'V'];
  return roman[n - 1] || n.toString();
}

interface FormatDurationOptions {
  showSeconds?: boolean;
  zeroLabel?: string;
  minLabel?: string;
}

export function formatDuration(
  seconds: number,
  options: FormatDurationOptions = {}
): string {
  const { showSeconds = true, zeroLabel = 'None', minLabel } = options;

  if (seconds <= 0) return zeroLabel;

  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  const {
    days = 0,
    hours = 0,
    minutes = 0,
    seconds: remainingSeconds = 0,
  } = duration;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  if (showSeconds) {
    if (remainingSeconds > 0 || parts.length === 0) {
      parts.push(`${remainingSeconds}s`);
    }
  } else if (parts.length === 0) {
    return minLabel || '0m';
  }

  return parts.join(' ');
}

export function formatDurationFromHours(
  hours: number,
  options: FormatDurationOptions = {}
): string {
  if (hours <= 0) return options.zeroLabel || '0h';
  return formatDuration(hours * 3600, {
    showSeconds: false,
    minLabel: '1m',
    ...options,
  });
}

export function formatSkillpoints(sp: number): string {
  return match(sp)
    .with(P.number.gte(1_000_000), (s) => `${(s / 1_000_000).toFixed(2)}M SP`)
    .with(P.number.gt(1_000), (s) => `${(s / 1_000).toFixed(1)}K SP`)
    .otherwise((s) => `${s.toLocaleString('en-US')} SP`);
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatDate(
  date: string | Date,
  formatString: string = 'PP'
): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatString);
}

export function formatAttributeBonus(value: number): string {
  return match(value)
    .with(0, () => '—')
    .with(P.number.gt(0), (v) => `+${v}`)
    .otherwise((v) => `${v}`);
}
