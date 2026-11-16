import { describe, expect, it } from 'vitest';
import { fixturePath, loadFixture } from './fixture';

describe('fixture loader', () => {
  it('builds a fixture path from a provider, capability, and case', () => {
    expect(fixturePath('minimax-cn', 'minimax.plan', 'with-totals')).toMatch(
      /src[/\\]test[/\\]fixtures[/\\]minimax-cn[/\\]plan[/\\]with-totals\.json$/,
    );
  });

  it('throws a clear error when the fixture does not exist', () => {
    expect(() => loadFixture('minimax-cn', 'minimax.plan', 'does-not-exist')).toThrow(
      /fixture not found/,
    );
  });
});
