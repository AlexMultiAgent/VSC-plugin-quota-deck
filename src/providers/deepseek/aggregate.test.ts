import { describe, expect, it } from 'vitest';
import { aggregatePerKeyRows, canAggregate } from './aggregate';

const rows = [
  { apiKeyId: 'k1', requests: 3, tokens: 300, cost: 1.5 },
  { apiKeyId: 'k2', requests: 2, tokens: 200, cost: 0.5 },
];

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
