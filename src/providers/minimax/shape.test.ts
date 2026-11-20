import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test/helpers/fixture';
import {
  readMiniMaxPlan,
  readMiniMaxSubscription,
  readMiniMaxTokenUsage,
} from './shape';

const capturedPlan = loadFixture('minimax-cn', 'minimax.plan', 'standard') as {
  response: unknown;
};

describe('readMiniMaxPlan', () => {
  it('reads the current model_remains envelope and general windows', () => {
    const plan = readMiniMaxPlan(capturedPlan.response);
    expect(plan.models.map((model) => model.model)).toEqual(['general', 'video']);
    expect(plan.windows.map((window) => window.window)).toEqual(['fiveHour', 'weekly']);
  });

  it('reads the Token Plan percentage shape when the counts are zero', () => {
    const plan = readMiniMaxPlan(capturedPlan.response);
    expect(
      plan.windows.map((window) => [
        window.window,
        window.remainingPercent,
        window.remainingPercentSource,
      ]),
    ).toEqual([
      ['fiveHour', 90, 'field'],
      ['weekly', 14, 'field'],
    ]);
  });

  it('reads a video count as the number of uses still left', () => {
    const plan = readMiniMaxPlan(capturedPlan.response);
    expect(plan.models.find((model) => model.model === 'video')).toMatchObject({
      total: 3,
      remaining: 3,
      used: 0,
      remainingPercent: 100,
      resetAt: 1795104000000,
      weeklyTotal: 21,
      weeklyRemaining: 21,
      weeklyUsed: 0,
      weeklyRemainingPercent: 100,
      weeklyResetAt: 1795363200000,
    });
  });

  it('keeps absolute reset timestamps in milliseconds', () => {
    const plan = readMiniMaxPlan(capturedPlan.response);
    expect(plan.windows[0]?.resetAt).toBe(1795035600000);
  });

  it('derives remaining percentages from a count shape', () => {
    const plan = readMiniMaxPlan({
      model_remains: [
        {
          model_name: 'video',
          current_interval_total_count: 10,
          current_interval_usage_count: 4,
        },
      ],
    });
    expect(plan.models[0]).toMatchObject({
      total: 10,
      remaining: 4,
      used: 6,
      remainingPercent: 40,
    });
  });

  it('does not invent a percentage for an unknown shape', () => {
    expect(() => readMiniMaxPlan({ unexpected: true })).toThrow(/unknown response shape/);
  });
});

describe('readMiniMaxSubscription', () => {
  it('reads the subscription expiry from the current subscribe envelope', () => {
    const subscription = readMiniMaxSubscription({
      current_subscribe: {
        current_subscribe_end_time: '2027-03-01T00:00:00Z',
        combo_name: 'Token Plan Pro',
      },
    });
    expect(subscription.planName).toBe('Token Plan Pro');
    expect(subscription.expiresAt).toBe(Date.parse('2027-03-01T00:00:00Z'));
    expect(subscription.totalCredit).toBeNull();
  });

  it('reads the prepaid credit balance from credit_info', () => {
    const subscription = readMiniMaxSubscription({
      current_subscribe: { current_subscribe_title: 'Token Plan Pro' },
      credit_info: { total_credit: '1234.50' },
    });
    expect(subscription.totalCredit).toBe(1234.5);
  });

  it('reads the expiry from the epoch field regardless of the machine time zone', () => {
    const fixture = loadFixture('minimax-cn', 'minimax.subscription', 'standard') as {
      response: unknown;
    };
    expect(readMiniMaxSubscription(fixture.response).planName).toBe(
      'TokenPlanMax-年度会员',
    );
    expect(readMiniMaxSubscription(fixture.response).totalCredit).toBe(0);
    const originalTimeZone = process.env.TZ;
    try {
      for (const timeZone of ['UTC', 'America/New_York', 'Asia/Shanghai']) {
        process.env.TZ = timeZone;
        expect(readMiniMaxSubscription(fixture.response).expiresAt).toBe(1814803200000);
      }
    } finally {
      process.env.TZ = originalTimeZone;
    }
  });
});

describe('readMiniMaxTokenUsage', () => {
  it('aggregates the records inside the requested range', () => {
    const now = Date.parse('2026-03-15T07:30:00Z');
    const records = [
      { consume_token: 10, created_at: Date.parse('2026-03-14T10:00:00Z') / 1000 },
      { consume_token: 20, created_at: Date.parse('2026-03-10T17:00:00Z') / 1000 },
      { consume_token: 30, created_at: Date.parse('2026-02-20T17:00:00Z') / 1000 },
    ];
    expect(readMiniMaxTokenUsage({ charge_records: records }, 'last7', now)).toEqual({
      rangeId: 'last7',
      tokens: 30,
      currency: null,
      hasUsageRecords: true,
    });
  });

  it('reports only the records inside the current month for a month range', () => {
    const now = Date.parse('2026-03-15T07:30:00Z');
    const records = [
      { consume_token: 10, created_at: Date.parse('2026-03-14T10:00:00Z') / 1000 },
      { consume_token: 30, created_at: Date.parse('2026-02-20T17:00:00Z') / 1000 },
    ];
    expect(readMiniMaxTokenUsage({ charge_records: records }, 'thisMonth', now).tokens).toBe(10);
  });

  it('does not present plan purchases as Token usage', () => {
    const usage = readMiniMaxTokenUsage(
      {
        charge_records: [
          {
            method: 'code_plan_purchase',
            consume_token: 0,
            created_at: Date.parse('2026-03-14T10:00:00Z') / 1000,
          },
          {
            method: 'openplatform_purchase',
            consume_token: 0,
            created_at: Date.parse('2026-03-14T11:00:00Z') / 1000,
          },
        ],
      },
      'last30',
      Date.parse('2026-03-15T07:30:00Z'),
    );
    expect(usage).toMatchObject({ tokens: 0, hasUsageRecords: false });
  });
});
