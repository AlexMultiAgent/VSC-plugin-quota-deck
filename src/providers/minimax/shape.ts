import { rangeFor, SHANGHAI, type RangeId } from '../../core/time';
import { asRecord, numberOrNull } from '../shape';

export interface MiniMaxWindow {
  readonly window: 'fiveHour' | 'weekly';
  readonly remainingPercent: number | null;
  readonly remainingPercentSource: 'computed' | 'field' | null;
  readonly resetAt: number | null;
  readonly unlimited: boolean;
}

export interface MiniMaxModel {
  readonly model: string;
  readonly total: number | null;
  readonly remaining: number | null;
  readonly used: number | null;
  readonly remainingPercent: number | null;
  readonly resetAt: number | null;
  readonly weeklyTotal: number | null;
  readonly weeklyRemaining: number | null;
  readonly weeklyUsed: number | null;
  readonly weeklyRemainingPercent: number | null;
  readonly weeklyResetAt: number | null;
}

export interface MiniMaxPlan {
  readonly windows: MiniMaxWindow[];
  readonly models: MiniMaxModel[];
}

export interface MiniMaxSubscription {
  readonly expiresAt: number | null;
  readonly planName: string | null;
  /** Prepaid credit balance (`credit_info.total_credit`), not quota percent. */
  readonly totalCredit: number | null;
}

export interface MiniMaxTokenUsage {
  readonly rangeId: RangeId;
  readonly tokens: number;
  readonly currency: string | null;
  readonly hasUsageRecords: boolean;
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

interface Quota {
  readonly total: number | null;
  readonly remaining: number | null;
  readonly used: number | null;
  readonly remainingPercent: number | null;
  readonly remainingPercentSource: 'computed' | 'field' | null;
}

/**
 * MiniMax reports `current_interval_usage_count` as the count still *left*, not
 * the count already spent — the same record carries
 * `current_interval_remaining_percent` next to it, so a video allowance of 3
 * with a usage count of 3 means 3 remaining, not 3 spent. A Token Plan key
 * exposes no counts at all: `current_interval_total_count` is 0 and only the
 * percentage fields carry the quota.
 */
function readQuota(
  total: number | null,
  remainingCount: number | null,
  remainingPercent: number | null,
): Quota {
  if (total !== null && total > 0 && remainingCount !== null) {
    const remaining = Math.max(0, Math.min(total, remainingCount));
    return {
      total,
      remaining,
      used: total - remaining,
      remainingPercent: (remaining / total) * 100,
      remainingPercentSource: 'computed',
    };
  }
  return {
    total,
    remaining: null,
    used: null,
    remainingPercent:
      remainingPercent === null ? null : Math.max(0, Math.min(100, remainingPercent)),
    remainingPercentSource: remainingPercent === null ? null : 'field',
  };
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
  const interval = readQuota(
    numberOrNull(general.current_interval_total_count),
    numberOrNull(general.current_interval_usage_count),
    numberOrNull(general.current_interval_remaining_percent),
  );
  const weekly = readQuota(
    numberOrNull(general.current_weekly_total_count),
    numberOrNull(general.current_weekly_usage_count),
    numberOrNull(general.current_weekly_remaining_percent),
  );

  const windows: MiniMaxWindow[] = [
    {
      window: 'fiveHour',
      remainingPercent: interval.remainingPercent,
      remainingPercentSource: interval.remainingPercentSource,
      resetAt: asTimestamp(general.end_time),
      unlimited: false,
    },
  ];

  if (
    weekly.total !== null ||
    weekly.remainingPercent !== null ||
    general.weekly_unlimited === true
  ) {
    windows.push({
      window: 'weekly',
      remainingPercent: weekly.remainingPercent,
      remainingPercentSource: weekly.remainingPercentSource,
      resetAt: asTimestamp(general.weekly_end_time),
      unlimited: general.weekly_unlimited === true,
    });
  }

  const models: MiniMaxModel[] = records.map((record) => {
    const quota = readQuota(
      numberOrNull(record.current_interval_total_count),
      numberOrNull(record.current_interval_usage_count),
      numberOrNull(record.current_interval_remaining_percent),
    );
    const weeklyQuota = readQuota(
      numberOrNull(record.current_weekly_total_count),
      numberOrNull(record.current_weekly_usage_count),
      numberOrNull(record.current_weekly_remaining_percent),
    );
    return {
      model: String(record.model_name ?? ''),
      total: quota.total,
      remaining: quota.remaining,
      used: quota.used,
      remainingPercent: quota.remainingPercent,
      resetAt: asTimestamp(record.end_time),
      weeklyTotal: weeklyQuota.total,
      weeklyRemaining: weeklyQuota.remaining,
      weeklyUsed: weeklyQuota.used,
      weeklyRemainingPercent: weeklyQuota.remainingPercent,
      weeklyResetAt: asTimestamp(record.weekly_end_time),
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
  const planName =
    current.current_subscribe_title ??
    current.combo_name ??
    current.plan_name;
  // `current_subscribe_end_time` is a locale date string such as "07/06/2027";
  // parsing it yields local midnight, so the epoch field wins when present.
  const expiresAt =
    asTimestamp(current.current_subscribe_end_time_ts) ??
    asTimestamp(current.current_subscribe_end_time ?? current.end_time);
  const creditInfo = root.credit_info;
  const totalCredit =
    typeof creditInfo === 'object' && creditInfo !== null && !Array.isArray(creditInfo)
      ? numberOrNull((creditInfo as Record<string, unknown>).total_credit)
      : null;
  return {
    expiresAt,
    planName: typeof planName === 'string' ? planName : null,
    totalCredit,
  };
}

function recordTime(value: unknown): number | null {
  const timestamp = asTimestamp(value);
  return timestamp;
}

export function readMiniMaxTokenUsage(
  response: unknown,
  rangeId: RangeId = 'last7',
  now = Date.now(),
  timeZone: string = SHANGHAI,
): MiniMaxTokenUsage {
  const root = asRecord(response, 'root');
  const records = Array.isArray(root.charge_records) ? root.charge_records : [];
  const range = rangeFor(rangeId, now, timeZone);
  let tokens = 0;
  let hasUsageRecords = false;

  for (const raw of records) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as Record<string, unknown>;
    // `/account/amount` also lists plan and credit purchases. Those events are
    // not model usage and must not make an all-zero usage range look populated.
    if (
      typeof record.method === 'string' &&
      record.method.endsWith('_purchase')
    ) {
      continue;
    }
    hasUsageRecords = true;
    const timestamp = recordTime(record.created_at);
    if (timestamp === null) continue;
    if (timestamp < range.start || timestamp > range.end) continue;
    tokens += numberOrNull(record.consume_token) ?? 0;
  }

  return {
    rangeId,
    tokens,
    currency: typeof root.currency === 'string' ? root.currency : null,
    hasUsageRecords,
  };
}
