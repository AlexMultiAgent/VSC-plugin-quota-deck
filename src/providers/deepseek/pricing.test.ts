import { describe, expect, it } from 'vitest';
import { calendar, isCovered, pricingState } from './pricing';

describe('calendar', () => {
  it('has a version and a coverage end', () => {
    expect(calendar.version.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(calendar.coverageEnd))).toBe(false);
  });

  it('covers at least thirty days beyond the release date', () => {
    const days = (Date.parse(calendar.coverageEnd) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(30);
  });
});

describe('isCovered', () => {
  it('covers a date inside the range', () => {
    expect(isCovered('2026-06-15')).toBe(true);
  });

  it('does not cover a date past the coverage end', () => {
    expect(isCovered('2030-01-01')).toBe(false);
  });

  it('lists holidays inside the coverage window', () => {
    expect(calendar.holidays.length).toBeGreaterThan(0);
    for (const holiday of calendar.holidays) {
      expect(isCovered(holiday.date)).toBe(true);
      expect(holiday.name.length).toBeGreaterThan(0);
    }
  });
});

describe('pricingState', () => {
  it('reports off-peak at 02:00 in Shanghai time', () => {
    expect(pricingState(Date.parse('2026-06-14T18:00:00Z'))).toBe('offPeak');
  });

  it('reports peak at 14:00 in Shanghai time', () => {
    expect(pricingState(Date.parse('2026-06-15T06:00:00Z'))).toBe('peak');
  });

  it('reports peak at 09:00 in Shanghai time, the first UTC peak window', () => {
    expect(pricingState(Date.parse('2026-06-15T01:00:00Z'))).toBe('peak');
  });

  it('reports off-peak at 07:59 in Shanghai time, just before the window ends', () => {
    expect(pricingState(Date.parse('2026-06-14T23:59:00Z'))).toBe('offPeak');
  });

  it('reports off-peak in the midday UTC gap', () => {
    expect(pricingState(Date.parse('2026-11-18T05:23:00Z'))).toBe('offPeak');
  });

  it('reports peak at the second UTC window boundary', () => {
    expect(pricingState(Date.parse('2026-11-18T06:00:00Z'))).toBe('peak');
  });

  it('reports off-peak after the second UTC window', () => {
    expect(pricingState(Date.parse('2026-11-18T10:00:00Z'))).toBe('offPeak');
  });

  it('reports off-peak throughout weekends', () => {
    expect(pricingState(Date.parse('2026-11-21T02:00:00Z'))).toBe('offPeak');
  });

  it('reports off-peak on a Chinese public holiday', () => {
    expect(pricingState(Date.parse('2026-10-01T02:00:00Z'))).toBe('offPeak');
  });

  it('reports off-peak during the 2027 Spring Festival', () => {
    expect(pricingState(Date.parse('2027-02-08T02:00:00Z'))).toBe('offPeak');
  });

  it('reports off-peak on 2027 National Day', () => {
    expect(pricingState(Date.parse('2027-10-01T02:00:00Z'))).toBe('offPeak');
  });

  it('reports peak on an ordinary 2027 weekday', () => {
    expect(pricingState(Date.parse('2027-03-10T02:00:00Z'))).toBe('peak');
  });

  it('reports unavailable for a date outside the coverage', () => {
    expect(pricingState(Date.parse('2030-01-01T00:00:00Z'))).toBe('unavailable');
  });
});
