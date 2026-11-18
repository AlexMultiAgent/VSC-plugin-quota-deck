import { describe, expect, it } from 'vitest';
import { makeSnapshot } from '../../test/helpers/snapshot';
import { translatorFor } from '../../localization';
import { buildDashboardModel, groupStatTiles, type DashboardOptions } from './viewModel';

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
  it('localizes the dashboard refresh action', () => {
    expect(buildDashboardModel(options()).labels.refreshNow).toBe('Refresh now');
  });

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

  it('keeps DeepSeek healthy with only its API-key balance and points to official bills', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { entries: [{ currency: 'CNY', total: 10 }] },
            },
          }),
        },
      }),
    );
    const provider = model.providers[0]!;
    expect(provider.state).toBe('ok');
    expect(provider.capabilities.map((capability) => capability.id)).toEqual(['deepseek.balance']);
    expect(provider.note).toContain('platform.deepseek.com');
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

  it('does not show provider-specific guidance on MiniMax capabilities', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.points': { kind: 'unconfigured', reason: 'missing web session cookie' },
          }),
        },
      }),
    );
    expect(model.providers[0]!.capabilities[0]!.message).toBeNull();
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

  it('labels the lowest live quota without treating media inventory as the account minimum', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                windows: [
                  { window: 'fiveHour', remainingPercent: 88, resetAt: null, unlimited: false },
                  { window: 'weekly', remainingPercent: 34, resetAt: null, unlimited: false },
                ],
                models: [{ model: 'video', remaining: 0, total: 3 }],
              },
            },
          }),
        },
      }),
    );

    expect(model.hero.value).toBe('34%');
    expect(model.hero.sourceLabel).toBe('MiniMax CN · Weekly');
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
    expect(model.providers[0]!.meters.map((meter) => meter.tone)).toEqual(['caution', 'warning']);
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
                  { date: '2026-11-15', requests: 3, totalTokens: 300, cacheHitTokens: 100, cacheMissTokens: 50, outputTokens: 150 },
                  { date: '2026-11-16', requests: 2, totalTokens: 200, cacheHitTokens: 80, cacheMissTokens: 40, outputTokens: 80 },
                ],
                costs: [
                  { date: '2026-11-15', cost: 1.5, currency: 'CNY' },
                  { date: '2026-11-16', cost: 0.5, currency: 'CNY' },
                ],
                byModel: [{ model: 'deepseek-chat', requests: 5, totalTokens: 500 }],
                modelCosts: [{ model: 'deepseek-chat', cost: 2, currency: 'CNY' }],
                currencies: ['CNY'],
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

  it('does not fill the summary with blank DeepSeek metrics when it is unconfigured', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': { kind: 'unconfigured', reason: 'missing api key' },
            'deepseek.usageAmount': { kind: 'unconfigured', reason: 'missing platform session' },
            'deepseek.usageCost': { kind: 'unconfigured', reason: 'missing platform session' },
            'deepseek.accountSummary': { kind: 'unconfigured', reason: 'missing platform session' },
          }),
        },
      }),
    );

    expect(model.providers[0]!.state).toBe('not-configured');
    expect(model.tiles.filter((tile) => tile.scope === 'DeepSeek')).toEqual([]);
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
                  { date: '2026-11-15', requests: 3, totalTokens: 300, cacheHitTokens: 100, cacheMissTokens: 50, outputTokens: 150 },
                  { date: '2026-11-16', requests: 2, totalTokens: 200, cacheHitTokens: 80, cacheMissTokens: 40, outputTokens: 80 },
                ],
                costs: [
                  { date: '2026-11-15', cost: 1.5, currency: 'CNY' },
                  { date: '2026-11-16', cost: 0.5, currency: 'CNY' },
                ],
                byModel: [],
                modelCosts: [],
                currencies: ['CNY'],
              },
            },
          }),
        },
      }),
    );
    expect(model.tiles.find((tile) => tile.key === 'tokens')!.value).toBe('500');
    expect(model.tiles.find((tile) => tile.key === 'cost')!.value).toBe('¥2.00');
  });

  it('does not present the account summary as the selected range cost', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.usageAmount': {
              kind: 'failed',
              error: { kind: 'unknown', message: 'error.unknown' },
            },
            'deepseek.accountSummary': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { totals: [{ currency: 'CNY', amount: 821.92 }], source: 'summary', keyCount: 0 },
            },
          }),
        },
      }),
    );

    expect(model.tiles.find((tile) => tile.key === 'cost')).toBeUndefined();
    expect(model.accountTotals).toEqual([{ currency: 'CNY', amount: 821.92 }]);
  });

  it('attributes summary tiles to the provider that supplied them', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn', 'deepseek'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.points': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { balance: 6850, expiresAt: null },
            },
            'minimax.tokenUsage': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { rangeId: 'last7', tokens: 12345, currency: 'CNY' },
            },
          }),
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { entries: [{ currency: 'CNY', total: 10 }] },
            },
            'deepseek.usageAmount': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                rangeId: 'last7',
                points: [],
                costs: [],
                byModel: [],
                modelCosts: [],
                currencies: [],
              },
            },
          }),
        },
      }),
    );

    expect(model.tiles.map((tile) => [tile.key, tile.scope])).toEqual([
      ['balance', 'DeepSeek'],
      ['tokens', 'DeepSeek'],
      ['cost', 'DeepSeek'],
      ['points', 'MiniMax CN'],
      ['minimaxTokens', 'MiniMax CN'],
    ]);
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

  it('omits the balance table when one currency duplicates the balance tile', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { entries: [{ currency: 'CNY', total: 10 }] },
            },
          }),
        },
      }),
    );

    expect(model.tiles.find((tile) => tile.key === 'balance')!.value).toBe('¥10.00');
    expect(model.balances).toEqual([]);
  });

  it('shows the Qwen account balance on its provider card', () => {
    const model = buildDashboardModel(
      options({
        order: ['qwen'],
        snapshots: {
          qwen: makeSnapshot('qwen', {
            'qwen.accountBalance': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                availableAmount: -12.34,
                availableCashAmount: -18.34,
                creditAmount: 5,
                mybankCreditAmount: 6,
                quotaLimit: 1000,
                currency: 'CNY',
              },
            },
            'qwen.modelQuota': { kind: 'unsupported', reason: 'not public' },
            'qwen.consumption': { kind: 'unsupported', reason: 'not public' },
          }),
        },
      }),
    );
    expect(model.providers[0]!.balance).toBe('¥-12.34');
    expect(model.providers[0]!.capabilities[0]!.state).toBe('ok');
    expect(model.providers[0]!.capabilities[1]!.state).toBe('unsupported');
    expect(model.providers[0]!.capabilities[1]!.message).toContain('Model Studio console');
    expect(model.providers[0]!.capabilities[1]!.message).toContain('Alibaba Cloud Billing');
    expect(model.providers[0]!.capabilities[2]!.message).toBeNull();
    expect('qwen' in model).toBe(false);
  });

  it('carries the selected range and all options', () => {
    const model = buildDashboardModel(options({ range: 'last30' }));
    expect(model.range).toBe('last30');
    expect(model.rangeLabel).toBe('Last 30 days');
    expect(model.ranges).toHaveLength(6);
  });

  it('localizes the pricing state', () => {
    const offPeak = buildDashboardModel(options({ order: ['deepseek'], pricing: 'offPeak' }));
    expect(offPeak.pricingLabel).toBe('Off-peak pricing right now');
    expect(offPeak.providers[0]!.hoursLabel).toBe('Off-peak');
    expect(buildDashboardModel(options({ pricing: 'unavailable' })).pricingLabel).toBe('Pricing calendar unavailable');
  });

  it('counts tokens once and keeps costs apart when a day carries two currencies', () => {
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
                  { date: '2026-11-15', requests: 3, totalTokens: 300, cacheHitTokens: 100, cacheMissTokens: 50, outputTokens: 150 },
                ],
                costs: [
                  { date: '2026-11-15', cost: 50, currency: 'CNY' },
                  { date: '2026-11-15', cost: 7, currency: 'USD' },
                ],
                byModel: [{ model: 'deepseek-chat', requests: 3, totalTokens: 300 }],
                modelCosts: [
                  { model: 'deepseek-chat', cost: 50, currency: 'CNY' },
                  { model: 'deepseek-chat', cost: 7, currency: 'USD' },
                ],
                currencies: ['CNY', 'USD'],
              },
            },
          }),
        },
      }),
    );
    expect(model.tiles.find((tile) => tile.key === 'tokens')!.value).toBe('300');
    expect(model.usage.costTotals).toEqual([
      { currency: 'CNY', amount: 50 },
      { currency: 'USD', amount: 7 },
    ]);
    expect(model.usage.byModel).toHaveLength(2);
  });

  it('shows the account totals reported by the platform', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.accountSummary': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { totals: [{ currency: 'CNY', amount: 9.25 }], source: 'summary', keyCount: 0 },
            },
          }),
        },
      }),
    );
    expect(model.accountTotals).toEqual([{ currency: 'CNY', amount: 9.25 }]);
    expect(model.accountTotalSource).toBe('summary');
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

  it('shows MiniMax token usage for the selected history range', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        range: 'last30',
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.tokenUsage': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { rangeId: 'last30', tokens: 12345, currency: 'CNY' },
            },
          }),
        },
      }),
    );
    expect(model.providers[0]!.rangeUsage).toEqual({
      label: 'Last 30 days · Tokens',
      value: '12,345',
    });
  });
});

describe('groupStatTiles', () => {
  it('keeps each provider summary together in first-seen order', () => {
    expect(groupStatTiles([
      { key: 'balance', label: 'Balance', value: '1', tone: 'neutral', scope: 'DeepSeek' },
      { key: 'points', label: 'Points', value: '2', tone: 'neutral', scope: 'MiniMax CN' },
      { key: 'cost', label: 'Cost', value: '3', tone: 'neutral', scope: 'DeepSeek' },
    ])).toEqual([
      {
        scope: 'DeepSeek',
        tiles: [
          { key: 'balance', label: 'Balance', value: '1', tone: 'neutral', scope: 'DeepSeek' },
          { key: 'cost', label: 'Cost', value: '3', tone: 'neutral', scope: 'DeepSeek' },
        ],
      },
      {
        scope: 'MiniMax CN',
        tiles: [
          { key: 'points', label: 'Points', value: '2', tone: 'neutral', scope: 'MiniMax CN' },
        ],
      },
    ]);
  });
});
