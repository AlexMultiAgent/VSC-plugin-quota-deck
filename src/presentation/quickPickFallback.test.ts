import { describe, expect, it } from 'vitest';
import { makeSnapshot } from '../test/helpers/snapshot';
import { buildFallbackItems } from './quickPickFallback';

describe('buildFallbackItems', () => {
  it('builds one item per provider', () => {
    const items = buildFallbackItems({}, ['minimax-cn', 'deepseek']);
    expect(items.map((item) => item.label)).toEqual(['MiniMax CN', 'DeepSeek']);
  });

  it('shows an em dash for a provider with no snapshot', () => {
    expect(buildFallbackItems({}, ['qwen'])[0]!.description).toContain('—');
  });

  it('shows the remaining percentage for MiniMax', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 42, resetAt: null, unlimited: false }] },
        },
      }),
    };
    expect(buildFallbackItems(snapshots, ['minimax-cn'])[0]!.description).toContain('42%');
  });

  it('never shows a failed capability as zero', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': { kind: 'failed', error: { kind: 'network', message: 'error.network' } },
      }),
    };
    expect(buildFallbackItems(snapshots, ['minimax-cn'])[0]!.description).not.toContain('0%');
  });
});
