import { asRecord, requireNumber, ShapeError } from '../shape';

/**
 * Gated scaffolding for the deferred DeepSeek usage/cost capabilities
 * (design §4.5). Production exposes only `deepseek.balance`; nothing in
 * `src/` imports this parser yet. Keep it aligned with `docs/contracts/`
 * before wiring it into a provider.
 */

export interface UsagePoint {
  readonly date: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cacheHitTokens: number;
  readonly cacheMissTokens: number;
  readonly outputTokens: number;
}

export interface UsageCost {
  readonly date: string;
  readonly cost: number;
  readonly currency: string;
}

export interface ModelUsage {
  readonly model: string;
  readonly requests: number;
  readonly totalTokens: number;
}

export interface ModelCost {
  readonly model: string;
  readonly cost: number;
  readonly currency: string;
}

export interface AmountUsage {
  readonly points: UsagePoint[];
  readonly byModel: ModelUsage[];
}

export interface CostUsage {
  readonly points: UsageCost[];
  readonly byModel: ModelCost[];
  readonly currencies: string[];
}

export interface DeepSeekUsage {
  /** Token and request counts per day. Independent of currency. */
  readonly points: UsagePoint[];
  /** Costs per day and currency. Never summed across currencies. */
  readonly costs: UsageCost[];
  readonly byModel: ModelUsage[];
  readonly modelCosts: ModelCost[];
  readonly currencies: string[];
}

interface SeriesGroup {
  readonly currency: string;
  readonly series: Record<string, unknown>[];
}

function canonicalTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString();
  }
  if (typeof value !== 'string' || value.length === 0) return null;
  if (/^\d+$/.test(value)) return canonicalTime(Number(value));
  const parsed = Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}+08:00`);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function seriesGroups(response: unknown): SeriesGroup[] {
  const root = asRecord(response, 'root');
  const data = asRecord(root.data, 'root.data');
  const bizRecord = asRecord(data.biz_data, 'root.data.biz_data');
  const groups = Array.isArray(bizRecord.data) ? bizRecord.data : [bizRecord];
  return groups.flatMap((raw, index) => {
    const group = asRecord(raw, `root.data.biz_data.data[${index}]`);
    if (!Array.isArray(group.series)) return [];
    return [{
      currency: typeof group.currency === 'string' ? group.currency.toUpperCase() : '',
      series: group.series.map((series, seriesIndex) =>
        asRecord(series, `root.data.biz_data.data[${index}].series[${seriesIndex}]`),
      ),
    }];
  });
}

function amountParts(usage: unknown, path: string): {
  requests: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  outputTokens: number;
} {
  const result = { requests: 0, cacheHitTokens: 0, cacheMissTokens: 0, outputTokens: 0 };
  if (Array.isArray(usage)) {
    for (const [index, item] of usage.entries()) {
      const value = asRecord(item, `${path}[${index}]`);
      const amount = requireNumber(value.amount, `${path}[${index}].amount`);
      if (value.type === 'REQUEST') result.requests += amount;
      if (value.type === 'PROMPT_CACHE_HIT_TOKEN') result.cacheHitTokens += amount;
      if (value.type === 'PROMPT_CACHE_MISS_TOKEN') result.cacheMissTokens += amount;
      if (value.type === 'RESPONSE_TOKEN') result.outputTokens += amount;
    }
  } else if (typeof usage === 'object' && usage !== null) {
    const value = usage as Record<string, unknown>;
    result.requests = requireNumber(value.REQUEST, `${path}.REQUEST`);
    result.cacheHitTokens = requireNumber(value.PROMPT_CACHE_HIT_TOKEN, `${path}.PROMPT_CACHE_HIT_TOKEN`);
    result.cacheMissTokens = requireNumber(value.PROMPT_CACHE_MISS_TOKEN, `${path}.PROMPT_CACHE_MISS_TOKEN`);
    result.outputTokens = requireNumber(value.RESPONSE_TOKEN, `${path}.RESPONSE_TOKEN`);
  }
  return result;
}

function bucketCost(usage: unknown, bucket: Record<string, unknown>, path: string): number {
  if (Array.isArray(usage)) {
    return usage.reduce(
      (sum, item, index) => sum + requireNumber(asRecord(item, `${path}[${index}]`).amount, `${path}[${index}].amount`),
      0,
    );
  }
  if (typeof usage === 'number' || typeof usage === 'string') return requireNumber(usage, path);
  if (typeof usage === 'object' && usage !== null) {
    const value = usage as Record<string, unknown>;
    return requireNumber(value.amount ?? value.cost, path);
  }
  return requireNumber(bucket.amount ?? bucket.cost, path);
}

export function readDeepSeekAmount(response: unknown): AmountUsage {
  const pointMap = new Map<string, UsagePoint>();
  const modelMap = new Map<string, ModelUsage>();

  for (const group of seriesGroups(response)) {
    for (const series of group.series) {
      const model = typeof series.model === 'string' && series.model.length > 0 ? series.model : 'unknown';
      if (!Array.isArray(series.buckets)) continue;
      for (const [bucketIndex, rawBucket] of series.buckets.entries()) {
        const bucket = asRecord(rawBucket, `bucket[${bucketIndex}]`);
        const date = canonicalTime(bucket.time);
        if (date === null) continue;
        const parts = amountParts(bucket.usage, `bucket[${bucketIndex}].usage`);
        const tokens = parts.cacheHitTokens + parts.cacheMissTokens + parts.outputTokens;
        const point = pointMap.get(date) ?? {
          date,
          requests: 0,
          totalTokens: 0,
          cacheHitTokens: 0,
          cacheMissTokens: 0,
          outputTokens: 0,
        };
        pointMap.set(date, {
          date,
          requests: point.requests + parts.requests,
          totalTokens: point.totalTokens + tokens,
          cacheHitTokens: point.cacheHitTokens + parts.cacheHitTokens,
          cacheMissTokens: point.cacheMissTokens + parts.cacheMissTokens,
          outputTokens: point.outputTokens + parts.outputTokens,
        });
        const modelPoint = modelMap.get(model) ?? { model, requests: 0, totalTokens: 0 };
        modelMap.set(model, {
          model,
          requests: modelPoint.requests + parts.requests,
          totalTokens: modelPoint.totalTokens + tokens,
        });
      }
    }
  }

  return {
    points: [...pointMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byModel: [...modelMap.values()].sort((a, b) => a.model.localeCompare(b.model)),
  };
}

export function readDeepSeekCost(response: unknown): CostUsage {
  const pointMap = new Map<string, UsageCost>();
  const modelMap = new Map<string, ModelCost>();
  const currencies = new Set<string>();

  for (const group of seriesGroups(response)) {
    const currency = group.currency;
    currencies.add(currency);
    for (const series of group.series) {
      const model = typeof series.model === 'string' && series.model.length > 0 ? series.model : 'unknown';
      if (!Array.isArray(series.buckets)) continue;
      for (const [bucketIndex, rawBucket] of series.buckets.entries()) {
        const bucket = asRecord(rawBucket, `bucket[${bucketIndex}]`);
        const date = canonicalTime(bucket.time);
        if (date === null) continue;
        const cost = bucketCost(bucket.usage, bucket, `bucket[${bucketIndex}].usage`);
        const key = `${date}\u0000${currency}`;
        const point = pointMap.get(key) ?? { date, cost: 0, currency };
        pointMap.set(key, { ...point, cost: point.cost + cost });
        const modelKey = `${model}\u0000${currency}`;
        const modelPoint = modelMap.get(modelKey) ?? { model, cost: 0, currency };
        modelMap.set(modelKey, { ...modelPoint, cost: modelPoint.cost + cost });
      }
    }
  }

  return {
    points: [...pointMap.values()].sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency)),
    byModel: [...modelMap.values()].sort((a, b) => a.model.localeCompare(b.model) || a.currency.localeCompare(b.currency)),
    currencies: [...currencies].filter(Boolean).sort(),
  };
}

export function mergeDeepSeekUsage(amount: AmountUsage, cost: CostUsage): DeepSeekUsage {
  return {
    points: amount.points,
    costs: cost.points,
    byModel: amount.byModel,
    modelCosts: cost.byModel,
    currencies: cost.currencies,
  };
}

export function readDeepSeekSummary(response: unknown): { currency: string; amount: number }[] {
  const root = asRecord(response, 'root');
  const data = asRecord(root.data, 'root.data');
  const biz = asRecord(data.biz_data, 'root.data.biz_data');
  if (!Array.isArray(biz.total_costs)) throw new ShapeError('total_costs');
  return biz.total_costs.map((item, index) => {
    const entry = asRecord(item, `total_costs[${index}]`);
    return {
      currency: String(entry.currency ?? ''),
      amount: requireNumber(entry.amount, `total_costs[${index}].amount`),
    };
  });
}
