import type { ProviderId } from '../core/types';

/** Currencies shown first when the account holds more than one. */
const CURRENCY_PRIORITY = ['CNY', 'USD', 'EUR'];

export function formatMoney(amount: number, currency: string): string {
  return currency === 'CNY' ? `¥${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
}

/** Format a non-currency credit count (MiniMax 积分) without a currency symbol. */
export function formatCredits(amount: number): string {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Pick the currency to display. Never sums across currencies. */
export function selectPrimaryCurrency(currencies: readonly string[]): string | undefined {
  for (const code of CURRENCY_PRIORITY) {
    if (currencies.includes(code)) return code;
  }
  return currencies.length > 0 ? [...currencies].sort()[0] : undefined;
}

const PROVIDER_DISPLAY_NAMES: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

export function providerDisplayName(id: ProviderId): string {
  return PROVIDER_DISPLAY_NAMES[id];
}

export interface QuotaWindowView {
  readonly remainingPercent: number | null;
  readonly unlimited: boolean;
}

/** The window with the least quota left, ignoring unlimited ones. */
export function pickTightestWindow<T extends QuotaWindowView>(
  windows: readonly T[],
): T | undefined {
  const candidates = windows.filter(
    (window) => !window.unlimited && window.remainingPercent !== null,
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((tightest, window) =>
    (window.remainingPercent ?? 0) < (tightest.remainingPercent ?? 0) ? window : tightest,
  );
}
