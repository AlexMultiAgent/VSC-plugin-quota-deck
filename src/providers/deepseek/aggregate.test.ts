import { describe, expect, it } from 'vitest';
import { aggregatePerKeyRows, canAggregate, selectAccountTotals } from './aggregate';

const rows = [
  { apiKeyId: 'k1', currency: 'CNY', requests: 3, tokens: 300, cost: 1.5 },
  { apiKeyId: 'k2', currency: 'CNY', requests: 2, tokens: 200, cost: 0.5 },
];

const summaryTotals = [{ currency: 'CNY', amount: 9.25 }];

describe('aggregatePerKeyRows', () => {
  it('sums the requests across keys', () => {
    expect(aggregatePerKeyRows(rows).requests).toBe(5);
  });

  it('sums the tokens across keys', () => {
    expect(aggregatePerKeyRows(rows).tokens).toBe(500);
  });

  it('sums the cost across keys', () => {
    expect(aggregatePerKeyRows(rows).cost).toBe(2);
  });

  it('counts the keys it aggregated', () => {
    expect(aggregatePerKeyRows(rows).keyCount).toBe(2);
  });

  it('never mixes a summary total with a per-key total', () => {
    const result = aggregatePerKeyRows(rows);
    expect(result).not.toHaveProperty('summaryTokens');
  });
});

describe('canAggregate', () => {
  it('allows aggregation when every key is known', () => {
    expect(canAggregate(rows, ['k1', 'k2'])).toBe(true);
  });

  it('refuses aggregation when a key is missing from the row set', () => {
    expect(canAggregate(rows, ['k1', 'k2', 'k3'])).toBe(false);
  });

  it('refuses aggregation when the key list is unknown', () => {
    expect(canAggregate(rows, undefined)).toBe(false);
  });
});

describe('selectAccountTotals', () => {
  it('uses the platform summary when the key list cannot be enumerated', () => {
    const selected = selectAccountTotals({
      summaryTotals,
      perKeyRows: rows,
      knownKeyIds: undefined,
    });
    expect(selected.source).toBe('summary');
    expect(selected.totals).toEqual(summaryTotals);
    expect(selected.keyCount).toBe(0);
  });

  it('sums the per-key rows when every key is known', () => {
    const selected = selectAccountTotals({
      summaryTotals,
      perKeyRows: rows,
      knownKeyIds: ['k1', 'k2'],
    });
    expect(selected.source).toBe('aggregated');
    expect(selected.keyCount).toBe(2);
    expect(selected.totals).toEqual([{ currency: 'CNY', amount: 2 }]);
  });

  it('never returns the summary and the per-key sum together', () => {
    const selected = selectAccountTotals({
      summaryTotals,
      perKeyRows: rows,
      knownKeyIds: ['k1', 'k2'],
    });
    expect(selected.totals).toHaveLength(1);
    expect(selected.totals[0]!.amount).toBe(2);
  });

  it('keeps each currency separate when summing per-key rows', () => {
    const selected = selectAccountTotals({
      summaryTotals: [],
      perKeyRows: [
        { apiKeyId: 'k1', currency: 'CNY', requests: 1, tokens: 10, cost: 1 },
        { apiKeyId: 'k2', currency: 'USD', requests: 1, tokens: 10, cost: 2 },
      ],
      knownKeyIds: ['k1', 'k2'],
    });
    expect(selected.totals).toEqual([
      { currency: 'CNY', amount: 1 },
      { currency: 'USD', amount: 2 },
    ]);
  });

  it('reports no totals when neither source is available', () => {
    const selected = selectAccountTotals({
      summaryTotals: [],
      perKeyRows: [],
      knownKeyIds: undefined,
    });
    expect(selected.totals).toEqual([]);
    expect(selected.source).toBe('unavailable');
  });
});
