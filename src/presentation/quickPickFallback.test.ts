import { describe, expect, it } from 'vitest';
import { translatorFor } from '../localization';
import { makeSnapshot } from '../test/helpers/snapshot';
import { buildFallbackItems } from './quickPickFallback';

const t = translatorFor('en-US');

describe('buildFallbackItems', () => {
  it('builds one item per provider', () => {
    const items = buildFallbackItems({}, ['minimax-cn', 'deepseek'], t);
    expect(items.map((item) => item.label)).toEqual(['MiniMax CN', 'DeepSeek']);
  });

  it('shows an em dash for a provider with no snapshot', () => {
    expect(buildFallbackItems({}, ['qwen'], t)[0]!.description).toContain('—');
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
    expect(buildFallbackItems(snapshots, ['minimax-cn'], t)[0]!.description).toContain('42%');
  });

  it('never shows a failed capability as zero', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': { kind: 'failed', error: { kind: 'network', message: 'error.network' } },
      }),
    };
    expect(buildFallbackItems(snapshots, ['minimax-cn'], t)[0]!.description).not.toContain('0%');
  });

  it('translates a failed capability message instead of showing the raw key', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': { kind: 'failed', error: { kind: 'rate-limit', message: 'error.rateLimit' } },
      }),
    };
    const description = buildFallbackItems(snapshots, ['minimax-cn'], t)[0]!.description;
    expect(description).not.toContain('error.rateLimit');
    expect(description).toBe(t('error.rateLimit'));
  });

  it('translates the unsupported state', () => {
    const snapshots = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': { kind: 'unsupported', reason: 'not implemented in V1' },
      }),
    };
    const description = buildFallbackItems(snapshots, ['qwen'], t)[0]!.description;
    expect(description).toBe(t('state.unsupported'));
  });
});
