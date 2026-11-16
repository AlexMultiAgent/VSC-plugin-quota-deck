import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test/helpers/fixture';
import { readDeepSeekBalance } from './shape';

describe('readDeepSeekBalance', () => {
  it('reads the captured balance response without throwing', () => {
    const fixture = loadFixture('deepseek', 'deepseek.balance', 'standard') as { response: unknown };
    const balance = readDeepSeekBalance(fixture.response);
    expect(balance.entries.length).toBeGreaterThan(0);
    expect(balance.available).toBe(true);
  });

  it('gives every entry a non-empty currency code', () => {
    const fixture = loadFixture('deepseek', 'deepseek.balance', 'standard') as { response: unknown };
    const balance = readDeepSeekBalance(fixture.response);
    for (const entry of balance.entries) expect(entry.currency.length).toBeGreaterThan(0);
  });

  it('rejects an unexpected response shape', () => {
    expect(() => readDeepSeekBalance({ unexpected: true })).toThrow(/unknown response shape/);
  });
});
