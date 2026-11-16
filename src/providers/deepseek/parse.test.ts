import { describe, expect, it } from 'vitest';
import { balancesByCurrency, selectDisplayBalance } from './parse';

const balances = {
  available: true,
  entries: [
    { currency: 'USD', total: 12.5, granted: 2.5, toppedUp: 10 },
    { currency: 'CNY', total: 112.8, granted: 12.8, toppedUp: 100 },
  ],
};

describe('balancesByCurrency', () => {
  it('keeps every currency as a separate value', () => {
    expect(Object.keys(balancesByCurrency(balances))).toEqual(['USD', 'CNY']);
  });

  it('never sums across currencies', () => {
    const byCurrency = balancesByCurrency(balances);
    expect(byCurrency['CNY']!.total).toBe(112.8);
    expect(byCurrency['USD']!.total).toBe(12.5);
  });
});

describe('selectDisplayBalance', () => {
  it('prefers CNY', () => {
    expect(selectDisplayBalance(balances)?.currency).toBe('CNY');
  });

  it('falls back to USD when there is no CNY', () => {
    const withoutCny = { available: true, entries: [balances.entries[0]!] };
    expect(selectDisplayBalance(withoutCny)?.currency).toBe('USD');
  });

  it('falls back to the remaining currencies in ascending code order', () => {
    const other = { available: true, entries: [{ currency: 'EUR', total: 1, granted: 0, toppedUp: 1 }] };
    expect(selectDisplayBalance(other)?.currency).toBe('EUR');
  });

  it('returns undefined when there is no balance at all', () => {
    expect(selectDisplayBalance({ available: false, entries: [] })).toBeUndefined();
  });
});
