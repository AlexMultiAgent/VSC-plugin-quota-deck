import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  rangeFor,
  toDayStart,
  toShanghaiDayStart,
  validTimeZone,
} from './time';

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

describe('toDayStart', () => {
  it('uses the configured time zone for the day boundary', () => {
    const instant = Date.parse('2026-03-15T07:30:00Z');
    expect(toDayStart(instant, 'America/New_York')).toBe(Date.parse('2026-03-15T04:00:00Z'));
  });

  it('keeps the Asia/Shanghai boundary for the default zone', () => {
    const instant = Date.parse('2026-03-15T07:30:00Z');
    expect(toDayStart(instant, 'Asia/Shanghai')).toBe(Date.parse('2026-03-14T16:00:00Z'));
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

  it('builds the day range in the configured time zone', () => {
    const now = Date.parse('2026-03-15T07:30:00Z');
    const range = rangeFor('today', now, 'America/New_York');
    expect(range.start).toBe(Date.parse('2026-03-15T04:00:00Z'));
  });

  it('builds the month range in the configured time zone', () => {
    const now = Date.parse('2026-03-15T07:30:00Z');
    const range = rangeFor('thisMonth', now, 'America/New_York');
    expect(range.start).toBe(Date.parse('2026-03-01T05:00:00Z'));
  });
});

describe('validTimeZone', () => {
  it('accepts a known IANA zone', () => {
    expect(validTimeZone('America/New_York')).toBe('America/New_York');
  });

  it('falls back to Shanghai for an unknown zone', () => {
    expect(validTimeZone('Not/AZone')).toBe('Asia/Shanghai');
  });

  it('falls back to Shanghai for an empty zone', () => {
    expect(validTimeZone('')).toBe('Asia/Shanghai');
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
