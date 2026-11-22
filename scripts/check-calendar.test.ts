import { describe, expect, it } from 'vitest';
import { calendarDaysLeft, calendarExpiryFailure } from './check-calendar.mjs';

const calendar = { version: 'test', coverageEnd: '2027-12-31' };

describe('pricing calendar check', () => {
  it('warns when the coverage ends within the warning window', () => {
    expect(calendarExpiryFailure(calendar, Date.parse('2027-12-01T00:00:00Z'), 60))
      .toContain('30 more days');
  });

  it('passes when the coverage is far enough out', () => {
    expect(calendarExpiryFailure(calendar, Date.parse('2027-01-01T00:00:00Z'), 60))
      .toBeUndefined();
  });

  it('counts whole days left', () => {
    expect(calendarDaysLeft(calendar, Date.parse('2027-12-30T00:00:00Z'))).toBe(1);
  });
});
