import { describe, expect, it } from 'vitest';
import { mergeDeepSeekUsage, readDeepSeekAmount, readDeepSeekCost, readDeepSeekSummary } from './usage';

const amount = {
  data: {
    biz_data: {
      series: [
        {
          model: 'deepseek-chat',
          buckets: [
            {
              time: '2026-11-15 10:00:00',
              usage: {
                REQUEST: 3,
                PROMPT_CACHE_HIT_TOKEN: 100,
                PROMPT_CACHE_MISS_TOKEN: 50,
                RESPONSE_TOKEN: 150,
              },
            },
          ],
        },
      ],
    },
  },
};

const cost = {
  data: {
    biz_data: {
      data: [
        {
          currency: 'CNY',
          series: [{ model: 'deepseek-chat', buckets: [{ time: '2026-11-15 10:00:00', usage: { amount: 1.5 } }] }],
        },
      ],
    },
  },
};

describe('DeepSeek usage parsing', () => {
  it('reads token, request, cache, and model data from the amount endpoint', () => {
    const parsed = readDeepSeekAmount(amount);
    expect(parsed.points[0]).toMatchObject({
      requests: 3,
      totalTokens: 300,
      cacheHitTokens: 100,
      cacheMissTokens: 50,
      outputTokens: 150,
    });
    expect(parsed.byModel[0]).toMatchObject({ model: 'deepseek-chat', requests: 3, totalTokens: 300 });
  });

  it('reads costs grouped by currency', () => {
    const parsed = readDeepSeekCost(cost);
    expect(parsed.currencies).toEqual(['CNY']);
    expect(parsed.points[0]).toMatchObject({ cost: 1.5, currency: 'CNY' });
  });

  it('merges cost into the matching usage point', () => {
    const usage = mergeDeepSeekUsage(readDeepSeekAmount(amount), readDeepSeekCost(cost));
    expect(usage.points[0]).toMatchObject({ totalTokens: 300, cost: 1.5, currency: 'CNY' });
  });

  it('reads account summary costs without combining them with per-key rows', () => {
    const summary = readDeepSeekSummary({
      data: { biz_data: { total_costs: [{ currency: 'CNY', amount: '9.25' }] } },
    });
    expect(summary).toEqual([{ currency: 'CNY', amount: 9.25 }]);
  });

  it('rejects an unexpected shape', () => {
    expect(() => readDeepSeekAmount({ unexpected: true })).toThrow(/unknown response shape/);
  });
});
