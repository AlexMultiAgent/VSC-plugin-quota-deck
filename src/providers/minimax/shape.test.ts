import { describe, expect, it } from 'vitest';
import {
  readMiniMaxPlan,
  readMiniMaxPoints,
  readMiniMaxSubscription,
  readMiniMaxTokenUsage,
} from './shape';

const planResponse = {
  base_resp: { status_code: 0 },
  model_remains: [
    {
      model_name: 'general',
      start_time: 1_765_000_000_000,
      end_time: 1_765_018_000_000,
      remains_time: 18_000_000,
      current_interval_total_count: 100,
      current_interval_usage_count: 25,
      current_interval_remaining_percent: 75,
      weekly_start_time: 1_765_000_000_000,
      weekly_end_time: 1_765_600_000_000,
      weekly_remains_time: 600_000_000,
      current_weekly_total_count: 1_000,
      current_weekly_usage_count: 220,
      current_weekly_remaining_percent: 78,
    },
    {
      model_name: 'video',
      end_time: 1_765_018_000_000,
      current_interval_total_count: 3,
      current_interval_usage_count: 0,
      current_interval_remaining_percent: 100,
    },
  ],
};

describe('readMiniMaxPlan', () => {
  it('reads the current model_remains envelope and general windows', () => {
    const plan = readMiniMaxPlan(planResponse);
    expect(plan.models.map((model) => model.model)).toEqual(['general', 'video']);
    expect(plan.windows.map((window) => window.window)).toEqual(['fiveHour', 'weekly']);
  });

  it('computes remaining percentages from counts when both are available', () => {
    const plan = readMiniMaxPlan(planResponse);
    expect(plan.windows[0]?.remainingPercent).toBe(75);
    expect(plan.windows[0]?.remainingPercentSource).toBe('computed');
  });

  it('keeps absolute reset timestamps in milliseconds', () => {
    const plan = readMiniMaxPlan(planResponse);
    expect(plan.windows[0]?.resetAt).toBe(1_765_018_000_000);
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
});

describe('readMiniMaxPoints', () => {
  it('reads a points balance and keeps missing data null', () => {
    expect(readMiniMaxPoints({ token_plan_credit: 6850 }).balance).toBe(6850);
    expect(readMiniMaxPoints({}).balance).toBeNull();
  });
});
