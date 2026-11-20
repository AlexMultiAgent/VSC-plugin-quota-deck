import { describe, expect, it } from 'vitest';
import { makeSnapshot } from '../../test/helpers/snapshot';
import { translatorFor } from '../../localization';
import { buildDashboardModel, groupHistoryTiles, type DashboardOptions } from './viewModel';

const t = translatorFor('en-US');

function options(overrides: Partial<DashboardOptions> = {}): DashboardOptions {
  return {
    snapshots: {},
    order: [],
    t,
    range: 'last7',
    pricing: 'peak',
    timeZone: 'Asia/Shanghai',
    ...overrides,
  };
}

describe('buildDashboardModel', () => {
  it('localizes the dashboard actions', () => {
    const model = buildDashboardModel(options());
    expect(model.labels.refreshNow).toBe('Refresh now');
    expect(model.labels.configureProviders).toBe('Configure providers');
  });

  it('keeps configured providers in order and omits empty cards', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn', 'deepseek', 'qwen'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'unconfigured',
              reason: 'missing token plan key',
            },
          }),
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': { kind: 'unconfigured', reason: 'missing api key' },
          }),
          qwen: makeSnapshot('qwen', {
            'qwen.accountBalance': { kind: 'unconfigured', reason: 'missing access key' },
          }),
        },
      }),
    );
    expect(model.providers).toEqual([]);
  });

  it('returns one entry per configured provider in the given order', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek', 'qwen', 'minimax-cn'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: { entries: [{ currency: 'CNY', total: 10 }] },
            },
          }),
          qwen: makeSnapshot('qwen', {
            'qwen.accountBalance': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                availableAmount: 1,
                availableCashAmount: 1,
                creditAmount: 0,
                quotaLimit: null,
                currency: 'CNY',
              },
            },
          }),
        },
      }),
    );
    expect(model.providers.map((provider) => provider.id)).toEqual([
      'deepseek',
      'qwen',
    ]);
  });

  it('omits a provider with no snapshot instead of rendering an empty card', () => {
    expect(buildDashboardModel(options({ order: ['qwen'] })).providers).toEqual([]);
  });

  it('marks a provider whose only capability failed as failed', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'failed',
              error: { kind: 'auth', message: 'error.auth' },
            },
          }),
        },
      }),
    );
    expect(model.providers[0]!.state).toBe('failed');
    expect(model.providers[0]!.message).toBe('Authentication failed. Reconfigure your credentials.');
    expect(model.providers[0]!.details).toEqual([]);
  });

  it('shows only DeepSeek balance data and points to official billing', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: { entries: [{ currency: 'CNY', total: 10 }] },
            },
            'deepseek.usageAmount': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { points: [{ date: '2026-11-15', requests: 3, totalTokens: 300 }] },
            },
            'deepseek.accountSummary': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { totals: [{ currency: 'CNY', amount: 99 }], source: 'summary' },
            },
          }),
        },
      }),
    );
    const provider = model.providers[0]!;
    expect(provider.state).toBe('ok');
    expect(provider.accountValue).toEqual({
      key: 'balance',
      label: 'Account balance',
      value: '¥10.00',
    });
    expect(provider.note).toContain('platform.deepseek.com');
    expect(model.historyTiles).toEqual([]);
    expect(model.hasHistoryData).toBe(false);
    expect(model.hero).toBeNull();
    expect(model).not.toHaveProperty('usage');
    expect(model).not.toHaveProperty('accountTotals');
  });

  it('shows every DeepSeek balance component and when it was fetched', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'ok',
              fetchedAt: '2026-11-19T01:00:00.000Z',
              data: {
                available: true,
                entries: [
                  {
                    currency: 'CNY',
                    total: 10,
                    granted: 3,
                    toppedUp: 7,
                  },
                ],
              },
            },
          }, '2026-11-19T01:00:00.000Z'),
        },
      }),
    );
    expect(model.providers[0]!.details).toEqual([
      { label: 'Account status', value: 'Available' },
      { label: 'Granted balance', value: '¥3.00' },
      { label: 'Topped-up balance', value: '¥7.00' },
      { label: 'Updated', value: '2026-11-19 09:00' },
    ]);
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
    expect(model.providers).toEqual([]);
  });

  it('exposes the lowest live remaining percentage as the hero value', () => {
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
    expect(model.hero).toEqual({
      label: 'Lowest remaining quota',
      value: '34%',
      sourceLabel: 'MiniMax CN · Weekly',
    });
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
    expect(model.providers[0]!.meters.map((meter) => meter.tone)).toEqual([
      'caution',
      'warning',
    ]);
  });

  it('shows MiniMax model usage for the current and weekly windows', () => {
    const model = buildDashboardModel(
      options({
        now: Date.parse('2026-11-19T00:00:00+08:00'),
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                windows: [],
                models: [
                  {
                    model: 'video',
                    total: 3,
                    remaining: 3,
                    used: 0,
                    remainingPercent: 100,
                    resetAt: Date.parse('2026-11-20T00:00:00+08:00'),
                    weeklyTotal: 21,
                    weeklyRemaining: 21,
                    weeklyUsed: 0,
                    weeklyRemainingPercent: 100,
                    weeklyResetAt: Date.parse('2026-11-23T00:00:00+08:00'),
                  },
                ],
              },
            },
          }),
        },
      }),
    );
    expect(model.providers[0]!.meters).toEqual([
      {
        key: 'model:video:current',
        label: 'Video · Current window',
        percent: 100,
        valueLabel: '3/3 · 100%',
        resetLabel: 'Next reset 2026-11-20 00:00 · Reset in 1d',
        tone: 'positive',
      },
      {
        key: 'model:video:weekly',
        label: 'Video · Weekly',
        percent: 100,
        valueLabel: '21/21 · 100%',
        resetLabel: 'Next reset 2026-11-23 00:00 · Reset in 4d',
        tone: 'positive',
      },
    ]);
  });

  it('shows the remaining time beside each MiniMax reset time', () => {
    const now = Date.parse('2026-11-19T08:00:00+08:00');
    const model = buildDashboardModel(
      options({
        now,
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                windows: [
                  {
                    window: 'fiveHour',
                    remainingPercent: 80,
                    resetAt: Date.parse('2026-11-19T10:30:00+08:00'),
                    unlimited: false,
                  },
                ],
                models: [
                  {
                    model: 'video',
                    total: 3,
                    remaining: 2,
                    used: 1,
                    remainingPercent: 67,
                    resetAt: Date.parse('2026-11-20T11:30:00+08:00'),
                    weeklyTotal: 21,
                    weeklyRemaining: 14,
                    weeklyUsed: 7,
                    weeklyRemainingPercent: 67,
                    weeklyResetAt: Date.parse('2026-11-24T00:00:00+08:00'),
                  },
                ],
              },
            },
          }),
        },
      }),
    );

    expect(model.providers[0]!.meters.map((meter) => meter.resetLabel)).toEqual([
      'Next reset 2026-11-19 10:30 · Reset in 2h 30m',
      'Next reset 2026-11-20 11:30 · Reset in 1d 3h 30m',
      'Next reset 2026-11-24 00:00 · Reset in 4d 16h',
    ]);
  });

  it('localizes the remaining time beside reset times', () => {
    const zh = translatorFor('zh-CN');
    const model = buildDashboardModel(
      options({
        t: zh,
        now: Date.parse('2026-11-19T08:00:00+08:00'),
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                windows: [
                  {
                    window: 'fiveHour',
                    remainingPercent: 80,
                    resetAt: Date.parse('2026-11-19T10:30:00+08:00'),
                    unlimited: false,
                  },
                ],
                models: [],
              },
            },
          }),
        },
      }),
    );

    expect(model.providers[0]!.meters[0]!.resetLabel).toBe(
      '下次重置 2026-11-19 10:30 · 剩余 2小时30分钟',
    );
  });

  it('never renders a failed quota as zero', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'failed',
              error: { kind: 'network', message: 'error.network' },
            },
          }),
        },
      }),
    );
    expect(model.hero).toBeNull();
    expect(model.providers[0]!.meters).toEqual([]);
  });

  it('carries light and dark provider accents', () => {
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
    expect(model.providers[0]!.accent).toEqual({
      light: '#2a78d6',
      dark: '#3987e5',
    });
  });

  it('shows every DeepSeek currency without adding them together', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                available: true,
                entries: [
                  { currency: 'USD', total: 20, granted: 5, toppedUp: 15 },
                  { currency: 'CNY', total: 10, granted: 0, toppedUp: 10 },
                ],
              },
            },
          }),
        },
      }),
    );
    expect(model.providers[0]!.accountValue?.value).toBe('¥10.00');
    expect(model.providers[0]!.details).toEqual([
      { label: 'Account status', value: 'Available' },
      { label: 'USD · Balance', value: 'USD 20.00' },
      { label: 'USD · Granted balance', value: 'USD 5.00' },
      { label: 'USD · Topped-up balance', value: 'USD 15.00' },
      { label: 'CNY · Balance', value: '¥10.00' },
      { label: 'CNY · Granted balance', value: '¥0.00' },
      { label: 'CNY · Topped-up balance', value: '¥10.00' },
      { label: 'Updated', value: '2026-11-16 08:00' },
    ]);
    expect(model).not.toHaveProperty('balances');
  });

  it('does not repeat the single DeepSeek currency total in details', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                entries: [{ currency: 'CNY', total: 10, granted: 4, toppedUp: 6 }],
              },
            },
          }),
        },
      }),
    );
    expect(model.providers[0]!.details).toEqual([
      { label: 'Granted balance', value: '¥4.00' },
      { label: 'Topped-up balance', value: '¥6.00' },
      { label: 'Updated', value: '2026-11-16 08:00' },
    ]);
  });

  it('shows the Qwen balance and every reported balance field', () => {
    const model = buildDashboardModel(
      options({
        order: ['qwen'],
        snapshots: {
          qwen: makeSnapshot('qwen', {
            'qwen.accountBalance': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                availableAmount: -12.34,
                availableCashAmount: -18.34,
                creditAmount: 5,
                quotaLimit: 1000,
                currency: 'CNY',
              },
            },
          }),
        },
      }),
    );
    const provider = model.providers[0]!;
    expect(provider.state).toBe('ok');
    expect(provider.accountValue?.value).toBe('¥-12.34');
    expect(provider.details).toEqual([
      { label: 'Available cash', value: '¥-18.34', group: 'Balance details' },
      { label: 'Credit', value: '¥5.00', group: 'Balance details' },
      { label: 'Quota limit', value: '¥1000.00', group: 'Balance details' },
      { label: 'Updated', value: '2026-11-16 08:00' },
    ]);
    expect(provider.note).toContain('Model Studio');
    expect(model.historyTiles).toEqual([]);
  });

  it('shows MiniMax voice slots, renewal price, and the weekly multiplier', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: { windows: [], models: [], weeklyBoostPermille: 1500 },
            },
            'minimax.subscription': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                expiresAt: null,
                planName: null,
                voiceSlotTotal: 5,
                voiceSlotUsed: 2,
                renewalPrice: 1190,
              },
            },
          }),
        },
      }),
    );

    const details = model.providers[0]!.details;
    expect(details).toContainEqual({ label: 'Voice slots', value: '2/5' });
    expect(details).toContainEqual({ label: 'Renewal price', value: '¥1190.00' });
    expect(details).toContainEqual({ label: 'Weekly multiplier', value: '1.5×' });
  });

  it('shows the MiniMax account balance fields', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.accountBalance': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                availableAmount: 1,
                cashBalance: 2,
                voucherBalance: 3,
                creditBalance: 4,
                owedAmount: 5,
                currency: 'CNY',
              },
            },
          }),
        },
      }),
    );

    expect(model.providers[0]!.details).toEqual([
      { label: 'Available balance', value: '¥1.00', group: 'Account balance' },
      { label: 'Cash', value: '¥2.00', group: 'Account balance' },
      { label: 'Voucher', value: '¥3.00', group: 'Account balance' },
      { label: 'Credit', value: '¥4.00', group: 'Account balance' },
      { label: 'Owed', value: '¥5.00', group: 'Account balance' },
      { label: 'Updated', value: '2026-11-16 08:00' },
    ]);
  });

  it('renders an unlimited MiniMax window without a percentage or track', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                windows: [
                  { window: 'fiveHour', remainingPercent: 100, resetAt: null, unlimited: false },
                  { window: 'weekly', remainingPercent: null, resetAt: null, unlimited: true },
                ],
                models: [],
              },
            },
          }),
        },
      }),
    );

    expect(model.providers[0]!.meters).toEqual([
      {
        key: 'fiveHour',
        label: '5-hour',
        percent: 100,
        valueLabel: '100%',
        resetLabel: null,
        tone: 'positive',
        unlimited: false,
      },
      {
        key: 'weekly',
        label: 'Weekly',
        percent: null,
        valueLabel: 'Unlimited',
        resetLabel: null,
        tone: 'positive',
        unlimited: true,
      },
    ]);
  });

  it('shows the MiniMax plan and expiry from the Token Plan API', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        timeZone: 'UTC',
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.subscription': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                expiresAt: Date.parse('2027-07-05T16:00:00.000Z'),
                planName: 'TokenPlanMax-年度会员',
              },
            },
          }),
        },
      }),
    );
    expect(model.providers[0]!.details).toEqual([
      { label: 'Plan', value: 'TokenPlanMax-年度会员' },
      { label: 'Expires', value: '2027-07-05 16:00' },
      { label: 'Updated', value: '2026-11-16 00:00' },
    ]);
    expect(model.providers[0]!.note).toBe(
      'Credit balance is available in the MiniMax console.',
    );
  });

  it('shows the extended Qwen balance and subscription fields', () => {
    const model = buildDashboardModel(
      options({
        order: ['qwen'],
        timeZone: 'UTC',
        snapshots: {
          qwen: makeSnapshot('qwen', {
            'qwen.accountBalance': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                availableAmount: 10,
                availableCashAmount: 1,
                creditAmount: 2,
                availableCreditAmount: 3,
                quotaLimit: 4,
                quotaConsumedAmount: 5,
                unclearedAmount: 6,
                unpaidAmount: 7,
                fundAccountStatus: 'VALID',
                currency: 'CNY',
              },
            },
            'qwen.tokenPlanSubscription': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                status: 'active',
                specCode: 'pro',
                startedAt: Date.parse('2026-01-01T00:00:00Z'),
                expiresAt: Date.parse('2027-01-01T00:00:00Z'),
                remainingDays: 30,
                autoRenew: true,
              },
            },
          }),
        },
      }),
    );

    expect(model.providers[0]!.details).toEqual([
      { label: 'Available cash', value: '¥1.00', group: 'Balance details' },
      { label: 'Credit', value: '¥2.00', group: 'Balance details' },
      { label: 'Available credit', value: '¥3.00', group: 'Balance details' },
      { label: 'Quota limit', value: '¥4.00', group: 'Balance details' },
      { label: 'Quota used', value: '¥5.00', group: 'Balance details' },
      { label: 'Uncleared', value: '¥6.00', group: 'Balance details' },
      { label: 'Unpaid', value: '¥7.00', group: 'Balance details' },
      { label: 'Account status', value: 'Valid', group: 'Balance details' },
      { label: 'Plan', value: 'pro', group: 'Token Plan' },
      { label: 'Expires', value: '2027-01-01 00:00', group: 'Token Plan' },
      { label: 'Remaining days', value: '30', group: 'Token Plan' },
      { label: 'Started', value: '2026-01-01 00:00', group: 'Token Plan' },
      { label: 'Auto-renew', value: 'Yes', group: 'Token Plan' },
      { label: 'Updated', value: '2026-11-16 00:00' },
    ]);
  });

  it('carries the selected range and all range options', () => {
    const model = buildDashboardModel(options({ range: 'last30' }));
    expect(model.range).toBe('last30');
    expect(model.rangeLabel).toBe('Last 30 days');
    expect(model.ranges).toHaveLength(6);
  });

  it('localizes the DeepSeek pricing state', () => {
    const snapshot = makeSnapshot('deepseek', {
      'deepseek.balance': {
        kind: 'ok',
        fetchedAt: 'x',
        data: { entries: [{ currency: 'CNY', total: 10 }] },
      },
    });
    const offPeak = buildDashboardModel(
      options({
        order: ['deepseek'],
        pricing: 'offPeak',
        snapshots: { deepseek: snapshot },
      }),
    );
    expect(offPeak.providers[0]!.hoursLabel).toBe('Off-peak');
  });

  it('shows MiniMax Token usage for the selected history range', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        range: 'last30',
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.tokenUsage': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                rangeId: 'last30',
                tokens: 12345,
                cash: 6.5,
                currency: 'CNY',
                hasUsageRecords: true,
              },
            },
          }),
        },
      }),
    );
    expect(model.historyTiles).toEqual([
      {
        key: 'minimaxTokens',
        label: 'Token usage',
        value: '12,345',
        tone: 'neutral',
        scope: 'MiniMax CN',
      },
      {
        key: 'minimaxCost',
        label: 'Cost',
        value: '¥6.50',
        tone: 'neutral',
        scope: 'MiniMax CN',
      },
    ]);
    expect(model.hasHistoryData).toBe(true);
    expect(model.rangeLabel).toBe('Last 30 days');
  });

  it('shows a real zero Token total instead of treating it as missing data', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-global'],
        snapshots: {
          'minimax-global': makeSnapshot('minimax-global', {
            'minimax.tokenUsage': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                rangeId: 'last7',
                tokens: 0,
                currency: null,
                hasUsageRecords: true,
              },
            },
          }),
        },
      }),
    );
    expect(model.historyTiles[0]?.value).toBe('0');
    expect(model.hasHistoryData).toBe(true);
  });

  it('hides history when MiniMax returned purchases but no usage records', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.tokenUsage': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                rangeId: 'last7',
                tokens: 0,
                currency: null,
                hasUsageRecords: false,
              },
            },
          }),
        },
      }),
    );
    expect(model.historyTiles).toEqual([]);
    expect(model.hasHistoryData).toBe(false);
  });

  it('ignores retired MiniMax cookie points', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.points': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { balance: 6850, expiresAt: null },
            },
          }),
        },
      }),
    );
    expect(model.providers[0]!.accountValue).toBeNull();
    expect(model.historyTiles).toEqual([]);
  });
});

describe('groupHistoryTiles', () => {
  it('keeps each provider history together in first-seen order', () => {
    expect(groupHistoryTiles([
      { key: 'minimaxTokens', label: 'Tokens', value: '1', tone: 'neutral', scope: 'MiniMax CN' },
      { key: 'otherTokens', label: 'Tokens', value: '2', tone: 'neutral', scope: 'MiniMax Global' },
      { key: 'other', label: 'Other', value: '3', tone: 'neutral', scope: 'MiniMax CN' },
    ])).toEqual([
      {
        scope: 'MiniMax CN',
        tiles: [
          { key: 'minimaxTokens', label: 'Tokens', value: '1', tone: 'neutral', scope: 'MiniMax CN' },
          { key: 'other', label: 'Other', value: '3', tone: 'neutral', scope: 'MiniMax CN' },
        ],
      },
      {
        scope: 'MiniMax Global',
        tiles: [
          { key: 'otherTokens', label: 'Tokens', value: '2', tone: 'neutral', scope: 'MiniMax Global' },
        ],
      },
    ]);
  });
});

  it('adds Qwen Token Plan meters and subscription details', () => {
    const model = buildDashboardModel(
      options({
        order: ['qwen'],
        now: Date.parse('2026-11-20T00:00:00Z'),
        snapshots: {
          qwen: makeSnapshot('qwen', {
            'qwen.accountBalance': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                availableAmount: 1,
                availableCashAmount: 1,
                creditAmount: 0,
                quotaLimit: null,
                currency: 'CNY',
              },
            },
            'qwen.tokenPlan': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                windows: [
                  {
                    cycle: 'monthly',
                    usedRatio: 0.62,
                    resetAt: Date.parse('2026-12-01T00:00:00Z'),
                  },
                ],
              },
            },
            'qwen.tokenPlanSubscription': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                status: 'active',
                specCode: 'pro',
                expiresAt: Date.parse('2027-01-01T00:00:00Z'),
                remainingDays: 40,
              },
            },
          }),
        },
      }),
    );

    const provider = model.providers[0]!;
    expect(provider.meters).toEqual([
      {
        key: 'qwen-token-plan:monthly',
        label: 'Monthly',
        percent: 38,
        valueLabel: '38%',
        resetLabel: 'Next reset 2026-12-01 08:00 · Reset in 11d',
        tone: 'caution',
        group: 'Token Plan',
      },
    ]);
    expect(provider.details).toContainEqual({
      label: 'Plan',
      value: 'pro',
      group: 'Token Plan',
    });
    expect(provider.details).toContainEqual({
      label: 'Expires',
      value: '2027-01-01 08:00',
      group: 'Token Plan',
    });
    expect(model.hero?.sourceLabel).toBe('Qwen · Monthly');
  });
