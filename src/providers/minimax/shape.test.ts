import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test/helpers/fixture';
import {
  readMiniMaxAccountBalance,
  readMiniMaxPlan,
  readMiniMaxSubscription,
  readMiniMaxTokenUsage,
  withAvailability,
  type MiniMaxPlan,
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
      ['weekly', 21, 'field'],
    ]);
  });

  it('applies the weekly boost multiplier', () => {
    const response = JSON.parse(JSON.stringify(capturedPlan.response)) as {
      model_remains: Array<Record<string, unknown>>;
    };
    const general = response.model_remains[0]!;
    general.current_weekly_remaining_percent = 50;
    general.weekly_boost_permille = 1500;

    const plan = readMiniMaxPlan(response);

    expect(plan.windows.find((window) => window.window === 'weekly')?.remainingPercent).toBe(75);
  });

  it('treats status 3 as unlimited, except for a model outside the plan', () => {
    const response = (total: number) => ({
      model_remains: [
        {
          model_name: 'general',
          current_interval_total_count: total,
          current_interval_usage_count: 0,
          current_interval_remaining_percent: 100,
          current_interval_status: 3,
          current_weekly_total_count: total,
          current_weekly_usage_count: 0,
          current_weekly_remaining_percent: 100,
          current_weekly_status: 3,
          end_time: 1,
          weekly_end_time: 2,
        },
      ],
    });

    expect(
      readMiniMaxPlan(response(1)).windows.map((window) => ({
        window: window.window,
        unlimited: window.unlimited,
        percent: window.remainingPercent,
      })),
    ).toEqual([
      { window: 'fiveHour', unlimited: true, percent: null },
      { window: 'weekly', unlimited: true, percent: null },
    ]);

    expect(
      readMiniMaxPlan(response(0)).windows.every((window) => !window.unlimited),
    ).toBe(true);
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

describe('weekly availability', () => {
  const general = (fields: Record<string, unknown>) => ({
    model_remains: [{ model_name: 'general', ...fields }],
  });

  it('blocks the five-hour window when the weekly window is exhausted', () => {
    const plan = readMiniMaxPlan(
      general({
        current_interval_remaining_percent: 80,
        current_weekly_remaining_percent: 0,
      }),
    );

    expect(plan.weeklyExhausted).toBe(true);
    expect(plan.windows.find((window) => window.window === 'fiveHour')?.blocked).toBe(true);
    expect(plan.windows.find((window) => window.window === 'weekly')?.blocked).toBe(false);
  });

  it('keeps the five-hour window usable while the weekly window has quota', () => {
    const plan = readMiniMaxPlan(
      general({
        current_interval_remaining_percent: 80,
        current_weekly_remaining_percent: 40,
      }),
    );

    expect(plan.weeklyExhausted).toBe(false);
    expect(plan.windows.find((window) => window.window === 'fiveHour')?.blocked).toBe(false);
  });

  it('treats a weekly percentage the boost empties as exhausted', () => {
    const plan = readMiniMaxPlan(
      general({
        current_interval_remaining_percent: 80,
        current_weekly_remaining_percent: 50,
        weekly_boost_permille: 0,
      }),
    );

    expect(plan.weeklyExhausted).toBe(true);
  });

  it('does not call an unlimited weekly window exhausted', () => {
    const plan = readMiniMaxPlan({
      model_remains: [
        {
          model_name: 'general',
          current_interval_total_count: 1,
          current_interval_usage_count: 1,
          current_interval_status: 3,
          current_weekly_total_count: 1,
          current_weekly_usage_count: 1,
          current_weekly_status: 3,
        },
      ],
    });

    expect(plan.weeklyExhausted).toBe(false);
    expect(plan.windows.every((window) => !window.blocked)).toBe(true);
  });

  it('blocks a media model whose own weekly pool is empty', () => {
    const plan = readMiniMaxPlan({
      model_remains: [
        {
          model_name: 'video',
          current_interval_total_count: 3,
          current_interval_usage_count: 3,
          current_weekly_total_count: 21,
          current_weekly_usage_count: 0,
        },
      ],
    });

    expect(plan.models[0]?.blocked).toBe(true);
  });

  it('keeps a media model usable while its own weekly pool has quota', () => {
    const plan = readMiniMaxPlan({
      model_remains: [
        {
          model_name: 'video',
          current_interval_total_count: 3,
          current_interval_usage_count: 3,
          current_weekly_total_count: 21,
          current_weekly_usage_count: 21,
        },
      ],
    });

    expect(plan.models[0]?.blocked).toBe(false);
  });

  it('derives the flags for a snapshot cached before the rule existed', () => {
    const cached = {
      windows: [
        { window: 'fiveHour', remainingPercent: 80, resetAt: null, unlimited: false },
        { window: 'weekly', remainingPercent: 0, resetAt: null, unlimited: false },
      ],
    } as unknown as MiniMaxPlan;

    const plan = withAvailability(cached);

    expect(plan.weeklyExhausted).toBe(true);
    expect(plan.windows[0]?.blocked).toBe(true);
    expect(plan.windows[1]?.blocked).toBe(false);
    expect(plan.models).toEqual([]);
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
  });

  it('reads the expiry from the epoch field regardless of the machine time zone', () => {
    const fixture = loadFixture('minimax-cn', 'minimax.subscription', 'standard') as {
      response: unknown;
    };
    expect(readMiniMaxSubscription(fixture.response).planName).toBe(
      'TokenPlanMax-年度会员',
    );
    expect(readMiniMaxSubscription(fixture.response).voiceSlotTotal).toBe(0);
    expect(readMiniMaxSubscription(fixture.response).voiceSlotUsed).toBe(0);
    expect(readMiniMaxSubscription(fixture.response).renewalPrice).toBe(1190);
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

describe('readMiniMaxAccountBalance', () => {
  const fixture = loadFixture('minimax-cn', 'minimax.accountBalance', 'standard') as {
    response: unknown;
  };

  it('parses the captured balance in the provider currency', () => {
    expect(readMiniMaxAccountBalance(fixture.response, 'CNY')).toEqual({
      availableAmount: 0,
      cashBalance: 0,
      voucherBalance: 0,
      creditBalance: 0,
      owedAmount: 0,
      currency: 'CNY',
    });
  });

  it('rejects a non-zero base_resp', () => {
    expect(() =>
      readMiniMaxAccountBalance(
        { base_resp: { status_code: 1004 }, available_amount: '0' },
        'CNY',
      ),
    ).toThrow();
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
      cash: 0,
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
