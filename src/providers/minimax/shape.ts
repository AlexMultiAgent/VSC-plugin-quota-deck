import { rangeFor, SHANGHAI, type RangeId } from '../../core/time';
import { asRecord, numberOrNull, requireNumber } from '../shape';

export interface MiniMaxWindow {
  readonly window: 'fiveHour' | 'weekly';
  readonly remainingPercent: number | null;
  readonly remainingPercentSource: 'computed' | 'field' | null;
  readonly resetAt: number | null;
  readonly unlimited: boolean;
  /**
   * The weekly window has no quota left, so this window's balance cannot be
   * used yet. MiniMax needs both windows to have remaining quota for text and
   * voice models, and refreshing the 5-hour window does not restore the
   * week's usage.
   */
  readonly blocked: boolean;
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
  /**
   * This model's own weekly pool is empty, so its current-window count cannot
   * be used yet: image and video models are limited by the weekly window.
   */
  readonly blocked: boolean;
}

export interface MiniMaxPlan {
  readonly windows: MiniMaxWindow[];
  readonly models: MiniMaxModel[];
  /** General weekly boost: 1500 means the displayed weekly percent is 1.5×. */
  readonly weeklyBoostPermille: number | null;
  /** The weekly window has no quota left. */
  readonly weeklyExhausted: boolean;
}

export interface MiniMaxSubscription {
  readonly expiresAt: number | null;
  readonly planName: string | null;
  readonly voiceSlotTotal: number | null;
  readonly voiceSlotUsed: number | null;
  /** `current_combo_card.price_data.renew_price_tag`, in the provider currency. */
  readonly renewalPrice: number | null;
}

export interface MiniMaxTokenUsage {
  readonly rangeId: RangeId;
  readonly tokens: number;
  /** Cash consumed by non-purchase records in the selected range. */
  readonly cash: number;
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

const MAX_WEEKLY_DISPLAY_PERCENT = 200;

/** `weekly_boost_permille` is a per-mille multiplier: 1500 means 1.5×. */
function weeklyBoostFactor(value: unknown): number {
  const permille = numberOrNull(value);
  return permille === null ? 1 : Math.max(0, permille) / 1000;
}

function boostedWeeklyPercent(quota: Quota, record: Record<string, unknown>): number | null {
  if (quota.remainingPercent === null) return null;
  return Math.min(
    MAX_WEEKLY_DISPLAY_PERCENT,
    quota.remainingPercent * weeklyBoostFactor(record.weekly_boost_permille),
  );
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

  // Status 3 means unlimited. When both totals are zero and both statuses are
  // 3, the API is instead describing a model that is not in the plan.
  const intervalStatus = numberOrNull(general.current_interval_status);
  const weeklyStatus = numberOrNull(general.current_weekly_status);
  const unavailablePlan =
    numberOrNull(general.current_interval_total_count) === 0 &&
    numberOrNull(general.current_weekly_total_count) === 0 &&
    intervalStatus === 3 &&
    weeklyStatus === 3;
  const fiveHourUnlimited = !unavailablePlan && intervalStatus === 3;
  const weeklyUnlimited =
    !unavailablePlan && (weeklyStatus === 3 || general.weekly_unlimited === true);

  // The weekly percentage the user can actually spend is the boosted one: a
  // raw 0 % stays 0 %, and a boost of 0 leaves nothing either way.
  const weeklyPercent = weeklyUnlimited ? null : boostedWeeklyPercent(weekly, general);

  const windows: (Omit<MiniMaxWindow, 'blocked'>)[] = [
    {
      window: 'fiveHour',
      remainingPercent: fiveHourUnlimited ? null : interval.remainingPercent,
      remainingPercentSource: fiveHourUnlimited ? null : interval.remainingPercentSource,
      resetAt: asTimestamp(general.end_time),
      unlimited: fiveHourUnlimited,
    },
  ];

  if (weekly.total !== null || weekly.remainingPercent !== null || weeklyUnlimited) {
    windows.push({
      window: 'weekly',
      remainingPercent: weeklyPercent,
      remainingPercentSource: weeklyUnlimited ? null : weekly.remainingPercentSource,
      resetAt: asTimestamp(general.weekly_end_time),
      unlimited: weeklyUnlimited,
    });
  }

  const models: (Omit<MiniMaxModel, 'blocked'>)[] = records.map((record) => {
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
      weeklyRemainingPercent: boostedWeeklyPercent(weeklyQuota, record),
      weeklyResetAt: asTimestamp(record.weekly_end_time),
    };
  });

  return withAvailability({
    windows,
    models,
    weeklyBoostPermille: numberOrNull(general.weekly_boost_permille),
  });
}

/**
 * The plan before the availability flags are derived. The parts are optional
 * because a cached snapshot written by an older build may not carry them.
 */
export interface MiniMaxPlanDraft {
  readonly windows?: readonly (Omit<MiniMaxWindow, 'blocked'>)[];
  readonly models?: readonly (Omit<MiniMaxModel, 'blocked'>)[];
  readonly weeklyBoostPermille?: number | null;
}

/**
 * Derive the availability flags from the plan's own percentages.
 *
 * The flags are derived, so a snapshot cached before this rule existed must
 * not keep a stale answer: the cache is painted at startup, before the first
 * refresh replaces it. Applying the rule at read time keeps an older cache
 * honest without a cache rule that would drop the whole plan capability.
 */
export function withAvailability(plan: MiniMaxPlanDraft): MiniMaxPlan {
  const windows = plan.windows ?? [];
  const models = plan.models ?? [];
  const weekly = windows.find((window) => window.window === 'weekly');
  const weeklyExhausted =
    weekly !== undefined &&
    !weekly.unlimited &&
    weekly.remainingPercent !== null &&
    weekly.remainingPercent <= 0;
  return {
    weeklyBoostPermille: plan.weeklyBoostPermille ?? null,
    weeklyExhausted,
    windows: windows.map((window) => ({
      ...window,
      blocked:
        window.window === 'weekly' ? false : weeklyExhausted && !window.unlimited,
    })),
    models: models.map((model) => ({
      ...model,
      blocked:
        model.weeklyRemainingPercent !== null && model.weeklyRemainingPercent <= 0,
    })),
  };
}

export interface MiniMaxAccountBalance {
  readonly availableAmount: number;
  readonly cashBalance: number;
  readonly voucherBalance: number;
  readonly creditBalance: number;
  readonly owedAmount: number;
  /** The endpoint has no currency field; the provider supplies its region's currency. */
  readonly currency: string;
}

export function readMiniMaxAccountBalance(
  response: unknown,
  currency: string,
): MiniMaxAccountBalance {
  const root = asRecord(response, 'root');
  const baseResp = asRecord(root.base_resp, 'base_resp');
  if (baseResp.status_code !== 0) throw new Error('the balance query failed');
  return {
    availableAmount: requireNumber(root.available_amount, 'available_amount'),
    cashBalance: requireNumber(root.cash_balance, 'cash_balance'),
    voucherBalance: requireNumber(root.voucher_balance, 'voucher_balance'),
    creditBalance: requireNumber(root.credit_balance, 'credit_balance'),
    owedAmount: requireNumber(root.owed_amount, 'owed_amount'),
    currency,
  };
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
  const voiceInfo = root.voice_slot_info;
  const voice =
    typeof voiceInfo === 'object' && voiceInfo !== null && !Array.isArray(voiceInfo)
      ? (voiceInfo as Record<string, unknown>)
      : undefined;
  const comboCard = root.current_combo_card;
  const priceData =
    typeof comboCard === 'object' && comboCard !== null && !Array.isArray(comboCard)
      ? (comboCard as Record<string, unknown>).price_data
      : undefined;
  const renewalPrice =
    typeof priceData === 'object' && priceData !== null && !Array.isArray(priceData)
      ? numberOrNull(
          (priceData as Record<string, unknown>).renew_price_tag ??
            (priceData as Record<string, unknown>).price_tag,
        )
      : null;
  return {
    expiresAt,
    planName: typeof planName === 'string' ? planName : null,
    voiceSlotTotal: voice === undefined ? null : numberOrNull(voice.voice_slot_total),
    voiceSlotUsed: voice === undefined ? null : numberOrNull(voice.voice_slot_used),
    renewalPrice,
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
  currency: string | null = null,
): MiniMaxTokenUsage {
  const root = asRecord(response, 'root');
  const records = Array.isArray(root.charge_records) ? root.charge_records : [];
  const range = rangeFor(rangeId, now, timeZone);
  let tokens = 0;
  let cash = 0;
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
    cash += numberOrNull(record.consume_cash) ?? 0;
  }

  return {
    rangeId,
    tokens,
    cash,
    currency:
      typeof root.currency === 'string'
        ? root.currency
        : currency,
    hasUsageRecords,
  };
}
