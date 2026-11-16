import { describe, expect, it } from 'vitest';
import { formatCountdown, rangeFor, toShanghaiDayStart } from './time';

describe('toShanghaiDayStart', () => {
  it('returns midnight Asia/Shanghai for a given instant', () => {
    const instant = Date.parse('2026-03-15T07:30:00Z');
    expect(toShanghaiDayStart(instant)).toBe(Date.parse('2026-03-14T16:00:00Z'));
  });

  it('does not shift the day for an instant already inside the day', () => {
    const instant = Date.parse('2026-03-15T01:00:00Z');
    expect(toShanghaiDayStart(instant)).toBe(Date.parse('2026-03-14T16:00:00Z'));
  });
});

describe('rangeFor', () => {
  it('builds a last-7-day range as seven calendar days including today', () => {
    const now = Date.parse('2026-03-15T07:30:00Z');
    const range = rangeFor('last7', now);
    expect(range.bucket).toBe('day');
    expect(range.start).toBe(Date.parse('2026-03-08T16:00:00Z'));
    expect(range.end).toBe(now);
  });

  it('builds a last-month range from the first of the previous month', () => {
    const now = Date.parse('2026-03-15T07:30:00Z');
    const range = rangeFor('lastMonth', now);
    expect(range.start).toBe(Date.parse('2026-01-31T16:00:00Z'));
    expect(range.end).toBe(Date.parse('2026-02-28T16:00:00Z'));
  });

  it('builds a today range from midnight with hourly buckets', () => {
    const now = Date.parse('2026-03-15T07:30:00Z');
    const range = rangeFor('today', now);
    expect(range.bucket).toBe('hour');
    expect(range.start).toBe(Date.parse('2026-03-14T16:00:00Z'));
    expect(range.end).toBe(now);
  });
});

describe('formatCountdown', () => {
  it('formats under an hour in minutes', () => {
    expect(formatCountdown(25 * 60_000)).toBe('25m');
  });

  it('formats under a day in hours and minutes', () => {
    expect(formatCountdown(2 * 3_600_000 + 15 * 60_000)).toBe('2h15m');
  });

  it('formats a day or more in days and hours', () => {
    expect(formatCountdown(1 * 86_400_000 + 3 * 3_600_000)).toBe('1d3h');
  });

  it('formats an elapsed reset as zero minutes', () => {
    expect(formatCountdown(-5_000)).toBe('0m');
  });
});
