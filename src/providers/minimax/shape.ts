import { rangeFor } from '../../core/time';

export interface MiniMaxWindow {
  readonly window: 'fiveHour' | 'weekly';
  readonly total: number | null;
  readonly used: number | null;
  readonly remainingPercent: number | null;
  readonly remainingPercentSource: 'computed' | 'field' | null;
  readonly resetAt: number | null;
  readonly unlimited: boolean;
}

export interface MiniMaxModel {
  readonly model: string;
  readonly remaining: number | null;
  readonly total: number | null;
}

export interface MiniMaxPlan {
  readonly windows: MiniMaxWindow[];
  readonly models: MiniMaxModel[];
}

export interface MiniMaxSubscription {
  readonly expiresAt: number | null;
  readonly planName: string | null;
}

export interface MiniMaxTokenUsage {
  readonly yesterday: number;
  readonly lastSevenDays: number;
  readonly currentMonth: number;
  readonly currency: string | null;
}

export interface MiniMaxPoints {
  readonly balance: number | null;
  readonly expiresAt: number | null;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`unknown response shape: ${path}`);
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) return asTimestamp(Number(value));
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function percentFrom(total: number | null, used: number | null, field: number | null) {
  if (total !== null && total > 0 && used !== null) {
    return {
      value: Math.max(0, Math.min(100, 100 * ((total - used) / total))),
      source: 'computed' as const,
    };
  }
  if (field !== null) {
    return { value: Math.max(0, Math.min(100, field)), source: 'field' as const };
  }
  return { value: null, source: null };
}

export function readMiniMaxPlan(response: unknown): MiniMaxPlan {
  const root = asRecord(response, 'root');
  const rows = root.model_remains;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('unknown response shape: model_remains');
  }

  const records = rows.map((row) => asRecord(row, 'model_remains[]'));
  const general =
    records.find((row) => String(row.model_name ?? '') === 'general') ?? records[0]!;
  const fiveHourTotal = asNumber(general.current_interval_total_count);
  const fiveHourUsed = asNumber(general.current_interval_usage_count);
  const fiveHourField = asNumber(general.current_interval_remaining_percent);
  const fiveHourPercent = percentFrom(fiveHourTotal, fiveHourUsed, fiveHourField);

  const weeklyTotal = asNumber(general.current_weekly_total_count);
  const weeklyUsed = asNumber(general.current_weekly_usage_count);
  const weeklyField = asNumber(general.current_weekly_remaining_percent);
  const weeklyPercent = percentFrom(weeklyTotal, weeklyUsed, weeklyField);

  const windows: MiniMaxWindow[] = [
    {
      window: 'fiveHour',
      total: fiveHourTotal,
      used: fiveHourUsed,
      remainingPercent: fiveHourPercent.value,
      remainingPercentSource: fiveHourPercent.source,
      resetAt: asTimestamp(general.end_time),
      unlimited: false,
    },
  ];

  if (
    weeklyTotal !== null ||
    weeklyUsed !== null ||
    weeklyField !== null ||
    general.weekly_unlimited === true
  ) {
    windows.push({
      window: 'weekly',
      total: weeklyTotal,
      used: weeklyUsed,
      remainingPercent: weeklyPercent.value,
      remainingPercentSource: weeklyPercent.source,
      resetAt: asTimestamp(general.weekly_end_time),
      unlimited: general.weekly_unlimited === true,
    });
  }

  const models: MiniMaxModel[] = records.map((record) => {
    const total = asNumber(record.current_interval_total_count);
    const used = asNumber(record.current_interval_usage_count);
    const percent = percentFrom(total, used, asNumber(record.current_interval_remaining_percent));
    return {
      model: String(record.model_name ?? ''),
      remaining: total !== null && percent.value !== null ? Math.round(total * (percent.value / 100)) : null,
      total,
    };
  });

  return { windows, models };
}

export function readMiniMaxSubscription(response: unknown): MiniMaxSubscription {
  const root = asRecord(response, 'root');
  const current =
    typeof root.current_subscribe === 'object' && root.current_subscribe !== null
      ? (root.current_subscribe as Record<string, unknown>)
      : root;
  return {
    expiresAt: asTimestamp(current.current_subscribe_end_time ?? current.end_time),
    planName:
      typeof (current.combo_name ?? current.plan_name) === 'string'
        ? String(current.combo_name ?? current.plan_name)
        : null,
  };
}

function recordTime(value: unknown): number | null {
  const timestamp = asTimestamp(value);
  return timestamp;
}

export function readMiniMaxTokenUsage(response: unknown, now = Date.now()): MiniMaxTokenUsage {
  const root = asRecord(response, 'root');
  const records = Array.isArray(root.charge_records) ? root.charge_records : [];
  const yesterdayRange = rangeFor('yesterday', now);
  const sevenDayRange = rangeFor('last7', now);
  const monthRange = rangeFor('thisMonth', now);
  let yesterday = 0;
  let lastSevenDays = 0;
  let currentMonth = 0;

  for (const raw of records) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    const timestamp = recordTime(record.created_at);
    const tokens = asNumber(record.consume_token) ?? 0;
    if (timestamp === null) continue;
    if (timestamp >= yesterdayRange.start && timestamp < yesterdayRange.end) yesterday += tokens;
    if (timestamp >= sevenDayRange.start && timestamp <= sevenDayRange.end) lastSevenDays += tokens;
    if (timestamp >= monthRange.start && timestamp <= monthRange.end) currentMonth += tokens;
  }

  return {
    yesterday,
    lastSevenDays,
    currentMonth,
    currency: typeof root.currency === 'string' ? root.currency : null,
  };
}

export function readMiniMaxPoints(response: unknown): MiniMaxPoints {
  const root = asRecord(response, 'root');
  const data =
    typeof root.data === 'object' && root.data !== null
      ? (root.data as Record<string, unknown>)
      : root;
  const balanceKeys = ['token_plan_credit', 'credit', 'points', 'point_balance', 'balance'];
  let balance: number | null = null;
  for (const key of balanceKeys) {
    balance = asNumber(data[key]);
    if (balance !== null) break;
  }
  return {
    balance,
    expiresAt: asTimestamp(data.expire_time ?? data.expires_at),
  };
}
