import { describe, expect, it } from 'vitest';
import { translatorFor } from '../../localization';
import { readMiniMaxPlan } from '../../providers/minimax/shape';
import { loadFixture } from '../../test/helpers/fixture';
import { makeSnapshot } from '../../test/helpers/snapshot';
import { buildOverviewItems } from './model';

const zh = translatorFor('zh-CN');
const t = translatorFor('en-US');

describe('buildOverviewItems', () => {
  it('summarizes and expands MiniMax without losing used values', () => {
    const items = buildOverviewItems({
      snapshots: {
        'minimax-cn': makeSnapshot('minimax-cn', {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              windows: [
                { window: 'fiveHour', remainingPercent: 100, resetAt: null, unlimited: false },
                { window: 'weekly', remainingPercent: 22, resetAt: null, unlimited: false },
              ],
              models: [{ model: 'video', remaining: 3, total: 3, used: 0 }],
            },
          },
          'minimax.subscription': {
            kind: 'ok',
            fetchedAt: 'x',
            data: { expiresAt: Date.parse('2027-07-05T00:00:00Z'), planName: null },
          },
        }),
      },
      configured: { 'minimax-cn': true },
      order: ['minimax-cn'],
      t: zh,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
      lastRefreshIso: '2026-11-18T10:43:00.000Z',
    });

    expect(items[0]?.label).toBe('MiniMax CN');
    expect(items[0]?.id).toBe('provider:minimax-cn');
    expect(items[0]?.description).toBe('每周 22%');
    expect(items[0]?.stateLabel).toBe('注意');
    expect(items[0]?.tooltip).toContain('⇄ 2026-11-18 18:43');
    expect(items[0]?.action?.kind).toBe('openDashboard');
    expect(items[0]?.children.map((item) => item.label)).toEqual([
      '5 小时', '每周', '视频', '到期',
    ]);
    expect(items[0]?.children[0]?.description).toBe('剩余 100% · 已使用 0%');
    expect(items[0]?.children[1]?.description).toBe('剩余 22% · 已使用 78%');
    expect(items[0]?.children[2]?.description).toBe('剩余 3/3 次 · 已使用 0 次');
  });

  it('renders the captured MiniMax video quota as three of three remaining', () => {
    const fixture = loadFixture('minimax-cn', 'minimax.plan', 'standard') as {
      response: unknown;
    };
    const items = buildOverviewItems({
      snapshots: {
        'minimax-cn': makeSnapshot('minimax-cn', {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: readMiniMaxPlan(fixture.response),
          },
        }),
      },
      configured: { 'minimax-cn': true },
      order: ['minimax-cn'],
      t: zh,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });

    const video = items[0]?.children.find((child) => child.label === '视频');
    expect(video?.description).toBe('剩余 3/3 次 · 已使用 0 次');
    expect(video?.state).toBe('positive');
  });

  it('preserves provider order and separate DeepSeek currency balances', () => {
    const items = buildOverviewItems({
      snapshots: {
        deepseek: makeSnapshot('deepseek', {
          'deepseek.balance': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              entries: [
                { currency: 'USD', total: 2, granted: 0, toppedUp: 2 },
                { currency: 'CNY', total: 13.69, granted: 0, toppedUp: 13.69 },
              ],
            },
          },
        }),
        qwen: makeSnapshot('qwen', {
          'qwen.accountBalance': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              availableAmount: 1.25,
              availableCashAmount: 0.5,
              creditAmount: 0.75,
              quotaLimit: 100,
              currency: 'CNY',
            },
          },
        }),
      },
      configured: { deepseek: true, qwen: true },
      order: ['qwen', 'deepseek'],
      t,
      pricing: 'peak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });

    expect(items.map((item) => item.id)).toEqual([
      'provider:qwen',
      'provider:deepseek',
    ]);
    expect(items.map((item) => item.label)).toEqual(['Qwen', 'DeepSeek']);
    expect(items[0]?.description).toBe('¥1.25 CNY');
    expect(items[0]?.children.map((item) => item.label)).toEqual(['Account balance']);
    const balanceGroup = items[0]?.children[0];
    expect(balanceGroup?.children.map((item) => item.label)).toEqual([
      'Available balance',
      'Available cash',
      'Credit',
      'Quota limit',
    ]);
    expect(balanceGroup?.children.map((item) => item.description)).toEqual([
      '¥1.25 CNY',
      '¥0.50 CNY',
      '¥0.75 CNY',
      '¥100.00 CNY',
    ]);
    expect(items[1]?.description).toBe('CNY ¥13.69');
    expect(
      items[1]?.children.filter((item) => item.id.includes(':balance:')),
    ).toHaveLength(2);
    expect(items[1]?.children.find((item) => item.label === 'Peak')).toBeDefined();
  });

  it('keeps MiniMax Global distinct from MiniMax CN', () => {
    const items = buildOverviewItems({
      snapshots: {
        'minimax-global': makeSnapshot('minimax-global', {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              windows: [
                { window: 'fiveHour', remainingPercent: 64, resetAt: null, unlimited: false },
              ],
              models: [],
            },
          },
        }),
      },
      configured: { 'minimax-global': true },
      order: ['minimax-global'],
      t,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });

    expect(items[0]?.id).toBe('provider:minimax-global');
    expect(items[0]?.label).toBe('MiniMax Global');
  });

  it('offers configuration when no provider is configured', () => {
    const items = buildOverviewItems({
      snapshots: {},
      configured: {},
      order: ['minimax-cn', 'deepseek', 'qwen'],
      t: zh,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe('配置服务商');
    expect(items[0]?.action?.kind).toBe('configureProviders');
  });

  it('keeps stale and failed states explicit', () => {
    const items = buildOverviewItems({
      snapshots: {
        deepseek: makeSnapshot('deepseek', {
          'deepseek.balance': {
            kind: 'stale',
            fetchedAt: 'x',
            data: { entries: [{ currency: 'CNY', total: 8, granted: 0, toppedUp: 8 }] },
            reason: 'old',
          },
        }),
        qwen: makeSnapshot('qwen', {
          'qwen.accountBalance': {
            kind: 'failed',
            error: { kind: 'network', message: 'error.network' },
          },
        }),
      },
      configured: { deepseek: true, qwen: true },
      order: ['deepseek', 'qwen'],
      t: zh,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });
    expect(items[0]?.state).toBe('stale');
    expect(items[0]?.stateLabel).toBe('数据已过期');
    expect(items[0]?.description).toBe('数据已过期');
    expect(items[1]?.state).toBe('failed');
    expect(items[1]?.stateLabel).toBe('获取失败');
    expect(items[1]?.description).toBe('获取失败');
  });

  it('does not invent unsupported optional values', () => {
    const items = buildOverviewItems({
      snapshots: {
        qwen: makeSnapshot('qwen', {
          'qwen.accountBalance': {
            kind: 'unsupported',
            reason: 'not integrated',
          },
        }),
      },
      configured: { qwen: true },
      order: ['qwen'],
      t: zh,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });
    expect(items[0]?.state).toBe('muted');
    expect(items[0]?.stateLabel).toBe('不支持');
    expect(items[0]?.description).toBe('');
    expect(items[0]?.children).toEqual([]);
  });
});

  it('adds Token Plan windows, plan, and expiry to the Qwen item', () => {
    const items = buildOverviewItems({
      snapshots: {
        qwen: makeSnapshot('qwen', {
          'qwen.accountBalance': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              availableAmount: 1.25,
              availableCashAmount: 0.5,
              creditAmount: 0.75,
              quotaLimit: null,
              currency: 'CNY',
            },
          },
          'qwen.tokenPlan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              windows: [
                { cycle: 'monthly', usedRatio: 0.62, resetAt: Date.parse('2026-12-01T00:00:00Z') },
              ],
            },
          },
          'qwen.tokenPlanSubscription': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              status: 'active',
              specCode: 'pro',
              expiresAt: Date.parse('2027-01-01T00:00:00Z'),
              remainingDays: 40,
            },
          },
        }),
      },
      configured: { qwen: true },
      order: ['qwen'],
      t,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });

    expect(items[0]?.description).toBe('¥1.25 CNY · Token Plan 38%');
    expect(items[0]?.state).toBe('caution');
    const planGroup = items[0]?.children.find(
      (child) => child.id === 'provider:qwen:tokenPlanGroup',
    );
    const monthly = planGroup?.children.find(
      (child) => child.id === 'provider:qwen:tokenPlan:monthly',
    );
    expect(monthly?.description).toBe('Remaining 38% · Used 62%');
    expect(monthly?.tooltip).toContain('Next reset 2026-12-01 08:00');
    expect(planGroup?.children.map((child) => child.label)).toContain('Plan');
    expect(planGroup?.children.map((child) => child.label)).toContain('Expires');
  });

  it('shows the unsubscribed state without inventing a window', () => {
    const items = buildOverviewItems({
      snapshots: {
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
          'qwen.tokenPlanSubscription': {
            kind: 'ok',
            fetchedAt: 'x',
            data: { status: 'none', specCode: null, expiresAt: null, remainingDays: null },
          },
        }),
      },
      configured: { qwen: true },
      order: ['qwen'],
      t,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });

    expect(items[0]?.description).toBe('¥1.00 CNY');
    const planGroup = items[0]?.children.find(
      (child) => child.id === 'provider:qwen:tokenPlanGroup',
    );
    expect(planGroup?.children.map((child) => child.label)).toContain(
      'No Token Plan subscription',
    );
    expect(planGroup?.children.some((child) => child.id.includes('tokenPlan:'))).toBe(false);
  });
