export interface QwenAccountBalance {
  readonly availableAmount: number;
  readonly creditAmount: number;
  readonly mybankCreditAmount: number;
  readonly availableCashAmount: number;
  readonly quotaLimit: number | null;
  readonly currency: string;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('expected an object');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('expected a non-empty string');
  }
  return value;
}

function amount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(text(value));
  if (!Number.isFinite(parsed)) throw new TypeError('expected a finite amount');
  return parsed;
}

export function readQwenAccountBalance(response: unknown): QwenAccountBalance {
  const root = record(response);
  if (root.Code !== '200' || root.Success !== true) {
    throw new Error('the balance query failed');
  }
  const data = record(root.Data);
  const quotaLimit = data.QuotaLimit === undefined ? null : amount(data.QuotaLimit);
  return {
    availableAmount: amount(data.AvailableAmount),
    creditAmount: amount(data.CreditAmount),
    mybankCreditAmount: amount(data.MybankCreditAmount),
    availableCashAmount: amount(data.AvailableCashAmount),
    quotaLimit,
    currency: text(data.Currency),
  };
}
