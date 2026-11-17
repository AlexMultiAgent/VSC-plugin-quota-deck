import { describe, expect, it } from 'vitest';
import { makeSnapshot } from '../../test/helpers/snapshot';
import { translatorFor } from '../../localization';
import { buildDashboardModel, type DashboardOptions } from './viewModel';

const t = translatorFor('en-US');

function options(overrides: Partial<DashboardOptions> = {}): DashboardOptions {
  return {
    snapshots: {},
    order: [],
    t,
    range: 'last7',
    pricing: 'peak',
    ...overrides,
  };
}

describe('buildDashboardModel', () => {
  it('returns one entry per provider in the given order', () => {
    const model = buildDashboardModel(options({ order: ['minimax-cn', 'deepseek'] }));
    expect(model.providers.map((provider) => provider.id)).toEqual(['minimax-cn', 'deepseek']);
  });

  it('marks a provider with no snapshot as not configured', () => {
    expect(buildDashboardModel(options({ order: ['qwen'] })).providers[0]!.state).toBe('not-configured');
  });

  it('marks a provider whose capabilities all failed as failed', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': { kind: 'failed', error: { kind: 'auth', message: 'error.auth' } },
          }),
        },
      }),
    );
    expect(model.providers[0]!.state).toBe('failed');
  });

  it('marks all-unconfigured capabilities as not configured', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': { kind: 'unconfigured', reason: 'missing token plan key' },
          }),
        },
      }),
    );
    expect(model.providers[0]!.state).toBe('not-configured');
  });

  it('exposes the lowest remaining percentage as the hero value', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { windows: [{ window: 'fiveHour', remainingPercent: 42, resetAt: null, unlimited: false }] },
            },
          }),
        },
      }),
    );
    expect(model.hero.value).toBe('42%');
    expect(model.hero.label).toBe('Lowest remaining quota');
  });

  it('uses the configured warning threshold for quota meters', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        warningThresholdPercent: 20,
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                windows: [
                  { window: 'fiveHour', remainingPercent: 20, resetAt: null, unlimited: false },
                  { window: 'weekly', remainingPercent: 19, resetAt: null, unlimited: false },
                ],
              },
            },
          }),
        },
      }),
    );
    expect(model.providers[0]!.meters.map((meter) => meter.tone)).toEqual(['positive', 'warning']);
  });

  it('shows no hero value when nothing has a percentage', () => {
    expect(buildDashboardModel(options({ order: ['qwen'] })).hero.value).toBe('—');
  });

  it('never renders a failed capability as zero', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': { kind: 'failed', error: { kind: 'network', message: 'error.network' } },
          }),
        },
      }),
    );
    expect(model.hero.value).not.toBe('0%');
  });

  it('carries light and dark provider accents', () => {
    const model = buildDashboardModel(options({ order: ['deepseek'] }));
    expect(model.providers[0]!.accent.light).toBe('#2a78d6');
    expect(model.providers[0]!.accent.dark).toBe('#3987e5');
  });

  it('carries the usage series', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.usageAmount': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                rangeId: 'last7',
                points: [
                  { date: '2026-11-15', requests: 3, totalTokens: 300, cacheHitTokens: 100, cacheMissTokens: 50, outputTokens: 150, cost: 1.5, currency: 'CNY' },
                  { date: '2026-11-16', requests: 2, totalTokens: 200, cacheHitTokens: 80, cacheMissTokens: 40, outputTokens: 80, cost: 0.5, currency: 'CNY' },
                ],
                byModel: [{ model: 'deepseek-chat', requests: 5, totalTokens: 500, cost: 2, currency: 'CNY' }],
              },
            },
          }),
        },
      }),
    );
    expect(model.usage.available).toBe(true);
    expect(model.usage.categories).toEqual(['2026-11-15', '2026-11-16']);
    expect(model.usage.cost).toEqual([{ x: '2026-11-15', y: 1.5 }, { x: '2026-11-16', y: 0.5 }]);
    expect(model.usage.tokenSeries).toHaveLength(3);
    expect(model.usage.byModel).toHaveLength(1);
  });

  it('reports usage unavailable when no series exists', () => {
    const model = buildDashboardModel(options({ order: ['deepseek'] }));
    expect(model.usage.available).toBe(false);
    expect(model.usage.cost).toEqual([]);
  });

  it('sums token and cost tiles over the loaded range', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.usageAmount': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                rangeId: 'last7',
                points: [
                  { date: '2026-11-15', requests: 3, totalTokens: 300, cacheHitTokens: 100, cacheMissTokens: 50, outputTokens: 150, cost: 1.5, currency: 'CNY' },
                  { date: '2026-11-16', requests: 2, totalTokens: 200, cacheHitTokens: 80, cacheMissTokens: 40, outputTokens: 80, cost: 0.5, currency: 'CNY' },
                ],
                byModel: [],
              },
            },
          }),
        },
      }),
    );
    expect(model.tiles.find((tile) => tile.key === 'tokens')!.value).toBe('500');
    expect(model.tiles.find((tile) => tile.key === 'cost')!.value).toBe('¥2.00');
  });

  it('never adds different currencies in the balance tile', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { entries: [{ currency: 'CNY', total: 10 }, { currency: 'USD', total: 20 }] },
            },
          }),
        },
      }),
    );
    expect(model.tiles.find((tile) => tile.key === 'balance')!.value).toBe('¥10.00');
    expect(model.balances).toHaveLength(2);
  });

  it('lists the Qwen capability matrix as unsupported', () => {
    const model = buildDashboardModel(options({ order: ['qwen'] }));
    expect(model.qwen.length).toBeGreaterThan(0);
    expect(model.qwen.every((row) => row.state === 'unsupported')).toBe(true);
  });

  it('carries the selected range and all options', () => {
    const model = buildDashboardModel(options({ range: 'last30' }));
    expect(model.range).toBe('last30');
    expect(model.rangeLabel).toBe('Last 30 days');
    expect(model.ranges).toHaveLength(6);
  });

  it('localizes the pricing state', () => {
    expect(buildDashboardModel(options({ pricing: 'offPeak' })).pricingLabel).toBe('Off-peak pricing right now');
    expect(buildDashboardModel(options({ pricing: 'unavailable' })).pricingLabel).toBe('Pricing calendar unavailable');
  });

  it('shows MiniMax media meters and points when the account returns them', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                windows: [{ window: 'fiveHour', remainingPercent: 40, resetAt: null, unlimited: false }],
                models: [{ model: 'video', remaining: 3, total: 3 }],
              },
            },
            'minimax.points': { kind: 'ok', fetchedAt: 'x', data: { balance: 6850, expiresAt: null } },
          }),
        },
      }),
    );
    expect(model.providers[0]!.meters.find((meter) => meter.key === 'model:video')?.percent).toBe(100);
    expect(model.tiles.find((tile) => tile.key === 'points')?.value).toBe('6,850');
  });
});
