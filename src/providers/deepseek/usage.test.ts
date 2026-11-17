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

const twoCurrencyCost = {
  data: {
    biz_data: {
      data: [
        {
          currency: 'CNY',
          series: [{ model: 'deepseek-chat', buckets: [{ time: '2026-11-15 10:00:00', usage: { amount: 50 } }] }],
        },
        {
          currency: 'USD',
          series: [{ model: 'deepseek-chat', buckets: [{ time: '2026-11-15 10:00:00', usage: { amount: 7 } }] }],
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

  it('keeps every currency as its own cost row', () => {
    const parsed = readDeepSeekCost(twoCurrencyCost);
    expect(parsed.currencies).toEqual(['CNY', 'USD']);
    expect(parsed.points).toHaveLength(2);
    expect(parsed.points.map((point) => point.currency)).toEqual(['CNY', 'USD']);
  });

  it('merges cost into the matching usage point', () => {
    const usage = mergeDeepSeekUsage(readDeepSeekAmount(amount), readDeepSeekCost(cost));
    expect(usage.points[0]).toMatchObject({ totalTokens: 300 });
    expect(usage.costs[0]).toMatchObject({ cost: 1.5, currency: 'CNY' });
  });

  it('counts tokens once when a day carries two currencies', () => {
    const usage = mergeDeepSeekUsage(readDeepSeekAmount(amount), readDeepSeekCost(twoCurrencyCost));
    const totalTokens = usage.points.reduce((sum, point) => sum + point.totalTokens, 0);
    expect(totalTokens).toBe(300);
  });

  it('never merges two currencies into one cost row', () => {
    const usage = mergeDeepSeekUsage(readDeepSeekAmount(amount), readDeepSeekCost(twoCurrencyCost));
    expect(usage.costs).toHaveLength(2);
    expect(usage.costs.map((row) => row.cost)).toEqual([50, 7]);
  });

  it('reports the model cost per currency', () => {
    const usage = mergeDeepSeekUsage(readDeepSeekAmount(amount), readDeepSeekCost(twoCurrencyCost));
    expect(usage.byModel).toHaveLength(1);
    expect(usage.byModel[0]).toMatchObject({ model: 'deepseek-chat', totalTokens: 300 });
    expect(usage.modelCosts).toHaveLength(2);
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

  it('rejects a non-numeric cost instead of reading it as zero', () => {
    const broken = {
      data: {
        biz_data: {
          data: [
            {
              currency: 'CNY',
              series: [{ model: 'deepseek-chat', buckets: [{ time: '2026-11-15 10:00:00', usage: { amount: 'abc' } }] }],
            },
          ],
        },
      },
    };
    expect(() => readDeepSeekCost(broken)).toThrow(/unknown response shape/);
  });
});
