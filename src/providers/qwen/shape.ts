import { ShapeError, asRecord, numberOrNull, requireNumber } from '../shape';

export interface QwenAccountBalance {
  readonly availableAmount: number;
  readonly availableCashAmount: number;
  readonly creditAmount: number;
  readonly availableCreditAmount: number | null;
  readonly quotaLimit: number | null;
  readonly quotaConsumedAmount: number | null;
  readonly unclearedAmount: number | null;
  readonly unpaidAmount: number | null;
  readonly fundAccountStatus: string | null;
  readonly currency: string;
}

function balanceText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new ShapeError(path);
  return value;
}

/**
 * Parse the flat `BssOpenAPI-V3.GetFundAccountAvailableAmount` response. The
 * login token queries the fund account directly, so `CashAmount` replaces the
 * retired AccessKey `AvailableCashAmount` and there is no Mybank credit field.
 */
export function readQwenAccountBalance(response: unknown): QwenAccountBalance {
  const root = asRecord(response, 'root');
  if (root.code !== '200') throw new ShapeError('code');
  const data = asRecord(root.data, 'data');
  return {
    availableAmount: requireNumber(data.AvailableAmount, 'AvailableAmount'),
    availableCashAmount: requireNumber(data.CashAmount, 'CashAmount'),
    creditAmount: requireNumber(data.CreditAmount, 'CreditAmount'),
    availableCreditAmount: numberOrNull(data.AvailableCreditAmount),
    quotaLimit:
      data.QuotaAmount === undefined || data.QuotaAmount === null
        ? null
        : requireNumber(data.QuotaAmount, 'QuotaAmount'),
    quotaConsumedAmount: numberOrNull(data.QuotaConsumedAmount),
    unclearedAmount: numberOrNull(data.UnclearedAmount),
    unpaidAmount: numberOrNull(data.UnpaidAmount),
    fundAccountStatus:
      typeof data.FundAccountStatus === 'string' ? data.FundAccountStatus : null,
    currency: balanceText(data.Currency, 'Currency'),
  };
}

export interface QwenTokenPlanWindow {
  readonly cycle: 'monthly' | 'weekly';
  /** Official semantic: used ratio in 0..1, never remaining. */
  readonly usedRatio: number;
  readonly resetAt: number | null;
}

export interface QwenTokenPlan {
  /** Only windows the backend actually returned a percentage for. */
  readonly windows: readonly QwenTokenPlanWindow[];
}

export type QwenTokenPlanStatus = 'active' | 'none' | 'unknown';

export interface QwenTokenPlanSubscription {
  readonly status: QwenTokenPlanStatus;
  readonly specCode: string | null;
  readonly startedAt: number | null;
  readonly expiresAt: number | null;
  readonly remainingDays: number | null;
  readonly autoRenew: boolean | null;
}

/** The console gateway rejected the derived token even after a refresh. */
export class QwenConsoleAuthError extends Error {
  constructor() {
    super('BailianGateway.Login.NotLogined');
    this.name = 'QwenConsoleAuthError';
  }
}

/** The account is not authorized for the console business space. */
export class QwenConsoleForbiddenError extends Error {
  constructor() {
    super('BailianGateway.Team.NotAuthorised');
    this.name = 'QwenConsoleForbiddenError';
  }
}

function tokenIn(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const token = (value as Record<string, unknown>).cliAccessToken;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

export function readQwenConsoleToken(response: unknown): string {
  const root = asRecord(response, 'root');
  const token = tokenIn(root) ?? tokenIn(root.Data) ?? tokenIn(root.data);
  if (token === undefined) throw new ShapeError('cliAccessToken');
  return token;
}

/**
 * Validate the console gateway envelope and return the business record. The
 * usage and subscription payloads both live at `DataV2.data.data`; `ret` is
 * checked when the gateway sends it and is not required when it does not.
 */
function gatewayBusiness(response: unknown): Record<string, unknown> {
  const root = asRecord(response, 'root');
  if (root.code !== '200' || root.successResponse !== true) {
    throw new ShapeError('code');
  }
  const gateway = asRecord(root.data, 'data');
  const errorCode = typeof gateway.errorCode === 'string' ? gateway.errorCode : '';
  if (gateway.success === false && errorCode === 'BailianGateway.Login.NotLogined') {
    throw new QwenConsoleAuthError();
  }
  if (gateway.success === false && errorCode === 'BailianGateway.Team.NotAuthorised') {
    throw new QwenConsoleForbiddenError();
  }
  if (gateway.success !== true || errorCode !== '') throw new ShapeError('success');

  const dataV2 = asRecord(gateway.DataV2, 'DataV2');
  const ret = dataV2.ret;
  if (
    ret !== undefined &&
    (!Array.isArray(ret) || typeof ret[0] !== 'string' || !ret[0].startsWith('SUCCESS::'))
  ) {
    throw new ShapeError('ret');
  }
  const business = asRecord(dataV2.data, 'business');
  if (business.code !== 'SUCCESS' || business.success !== true) {
    throw new ShapeError('business');
  }
  return business;
}

function timestampOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

const USAGE_CYCLES = [
  { cycle: 'monthly', percentage: 'per1MonthPercentage', resetTime: 'per1MonthResetTime' },
  { cycle: 'weekly', percentage: 'per1WeekPercentage', resetTime: 'per1WeekResetTime' },
] as const;

export function readQwenTokenPlan(response: unknown): QwenTokenPlan {
  const business = gatewayBusiness(response);
  if (business.data === undefined || business.data === null) return { windows: [] };
  const payload = asRecord(business.data, 'usage');
  const windows: QwenTokenPlanWindow[] = [];

  for (const { cycle, percentage, resetTime } of USAGE_CYCLES) {
    if (!Object.hasOwn(payload, percentage)) continue;
    const usedRatio = requireNumber(payload[percentage], percentage);
    if (usedRatio < 0 || usedRatio > 1) throw new ShapeError(percentage);

    const rawReset = payload[resetTime];
    let resetAt: number | null = null;
    if (rawReset !== undefined && rawReset !== null) {
      const parsed = requireNumber(rawReset, resetTime);
      if (!Number.isSafeInteger(parsed) || parsed < 0) throw new ShapeError(resetTime);
      resetAt = parsed;
    }

    windows.push({ cycle, usedRatio, resetAt });
  }

  return { windows };
}

export function readQwenTokenPlanSubscription(
  response: unknown,
): QwenTokenPlanSubscription {
  const business = gatewayBusiness(response);
  if (business.data === undefined || business.data === null) {
    return {
      status: 'none',
      specCode: null,
      startedAt: null,
      expiresAt: null,
      remainingDays: null,
      autoRenew: null,
    };
  }
  const entity = asRecord(business.data, 'subscription');
  if (entity.status !== 'VALID') {
    return {
      status: 'unknown',
      specCode: null,
      startedAt: null,
      expiresAt: null,
      remainingDays: null,
      autoRenew: null,
    };
  }
  return {
    status: 'active',
    specCode:
      typeof entity.specCode === 'string' && entity.specCode.length > 0
        ? entity.specCode
        : null,
    startedAt: timestampOrNull(entity.startTime),
    expiresAt: timestampOrNull(entity.endTime),
    remainingDays: numberOrNull(entity.remainingDays),
    autoRenew: typeof entity.autoRenewFlag === 'boolean' ? entity.autoRenewFlag : null,
  };
}
