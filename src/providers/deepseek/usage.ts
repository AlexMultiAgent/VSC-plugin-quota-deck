export interface UsagePoint {
  readonly date: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cacheHitTokens: number;
  readonly cacheMissTokens: number;
  readonly outputTokens: number;
  readonly cost: number;
  readonly currency: string;
}

export interface ModelUsage {
  readonly model: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cost: number;
  readonly currency: string;
}

export interface DeepSeekUsage {
  readonly points: UsagePoint[];
  readonly byModel: ModelUsage[];
}

export interface AmountUsage {
  readonly points: Omit<UsagePoint, 'cost' | 'currency'>[];
  readonly byModel: Omit<ModelUsage, 'cost' | 'currency'>[];
}

export interface CostUsage {
  readonly points: { date: string; cost: number; currency: string }[];
  readonly byModel: { model: string; cost: number; currency: string }[];
  readonly currencies: string[];
}

interface SeriesGroup {
  readonly currency: string;
  readonly series: Record<string, unknown>[];
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`unknown response shape: ${path}`);
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
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

function amountParts(usage: unknown): {
  requests: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  outputTokens: number;
} {
  const result = { requests: 0, cacheHitTokens: 0, cacheMissTokens: 0, outputTokens: 0 };
  if (Array.isArray(usage)) {
    for (const item of usage) {
      const value = asRecord(item, 'usage[]');
      const amount = asNumber(value.amount);
      if (value.type === 'REQUEST') result.requests += amount;
      if (value.type === 'PROMPT_CACHE_HIT_TOKEN') result.cacheHitTokens += amount;
      if (value.type === 'PROMPT_CACHE_MISS_TOKEN') result.cacheMissTokens += amount;
      if (value.type === 'RESPONSE_TOKEN') result.outputTokens += amount;
    }
  } else if (typeof usage === 'object' && usage !== null) {
    const value = usage as Record<string, unknown>;
    result.requests = asNumber(value.REQUEST);
    result.cacheHitTokens = asNumber(value.PROMPT_CACHE_HIT_TOKEN);
    result.cacheMissTokens = asNumber(value.PROMPT_CACHE_MISS_TOKEN);
    result.outputTokens = asNumber(value.RESPONSE_TOKEN);
  }
  return result;
}

function bucketCost(usage: unknown, bucket: Record<string, unknown>): number {
  if (Array.isArray(usage)) return usage.reduce((sum, item) => sum + asNumber((item as Record<string, unknown>).amount), 0);
  if (typeof usage === 'number' || typeof usage === 'string') return asNumber(usage);
  if (typeof usage === 'object' && usage !== null) {
    const value = usage as Record<string, unknown>;
    return asNumber(value.amount ?? value.cost);
  }
  return asNumber(bucket.amount ?? bucket.cost);
}

export function readDeepSeekAmount(response: unknown): AmountUsage {
  const pointMap = new Map<string, Omit<UsagePoint, 'cost' | 'currency'>>();
  const modelMap = new Map<string, Omit<ModelUsage, 'cost' | 'currency'>>();

  for (const group of seriesGroups(response)) {
    for (const series of group.series) {
      const model = typeof series.model === 'string' && series.model.length > 0 ? series.model : 'unknown';
      if (!Array.isArray(series.buckets)) continue;
      for (const rawBucket of series.buckets) {
        const bucket = asRecord(rawBucket, 'bucket');
        const date = canonicalTime(bucket.time);
        if (date === null) continue;
        const parts = amountParts(bucket.usage);
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
  const pointMap = new Map<string, { date: string; cost: number; currency: string }>();
  const modelMap = new Map<string, { model: string; cost: number; currency: string }>();
  const currencies = new Set<string>();

  for (const group of seriesGroups(response)) {
    const currency = group.currency;
    currencies.add(currency);
    for (const series of group.series) {
      const model = typeof series.model === 'string' && series.model.length > 0 ? series.model : 'unknown';
      if (!Array.isArray(series.buckets)) continue;
      for (const rawBucket of series.buckets) {
        const bucket = asRecord(rawBucket, 'bucket');
        const date = canonicalTime(bucket.time);
        if (date === null) continue;
        const cost = bucketCost(bucket.usage, bucket);
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
    byModel: [...modelMap.values()].sort((a, b) => a.model.localeCompare(b.model)),
    currencies: [...currencies].filter(Boolean).sort(),
  };
}

export function mergeDeepSeekUsage(amount: AmountUsage, cost: CostUsage): DeepSeekUsage {
  const points: UsagePoint[] = [];
  const costsByDate = new Map<string, CostUsage['points']>();
  for (const point of cost.points) {
    const list = costsByDate.get(point.date) ?? [];
    list.push(point);
    costsByDate.set(point.date, list);
  }
  for (const point of amount.points) {
    const costs = costsByDate.get(point.date) ?? [{ date: point.date, cost: 0, currency: '' }];
    for (const value of costs) points.push({ ...point, cost: value.cost, currency: value.currency });
  }

  const byModel: ModelUsage[] = amount.byModel.flatMap((model) => {
    const costs = cost.byModel.filter((entry) => entry.model === model.model);
    if (costs.length === 0) return [{ ...model, cost: 0, currency: '' }];
    return costs.map((entry) => ({ ...model, cost: entry.cost, currency: entry.currency }));
  });

  return { points, byModel };
}

export function readDeepSeekSummary(response: unknown): { currency: string; amount: number }[] {
  const root = asRecord(response, 'root');
  const data = asRecord(root.data, 'root.data');
  const biz = asRecord(data.biz_data, 'root.data.biz_data');
  if (!Array.isArray(biz.total_costs)) throw new Error('unknown response shape: total_costs');
  return biz.total_costs.map((item, index) => {
    const entry = asRecord(item, `total_costs[${index}]`);
    return { currency: String(entry.currency ?? ''), amount: asNumber(entry.amount) };
  });
}
