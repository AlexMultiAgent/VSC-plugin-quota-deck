import type { ProviderId } from '../core/types';
import { zonedParts } from '../core/time';
import type { Translator } from '../localization';

/** Currencies shown first when the account holds more than one. */
const CURRENCY_PRIORITY = ['CNY', 'USD', 'EUR'];

export function formatMoney(amount: number, currency: string): string {
  return currency === 'CNY' ? `¥${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
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

/** Format an instant as `YYYY-MM-DD HH:mm` in the given time zone. */
export function formatDateTime(instant: number, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ` +
    `${pad(parts.hour)}:${pad(parts.minute)}`
  );
}

/** Format an explicit day count, e.g. `剩余 10天` / `Remaining 10d`. */
export function formatRemainingDays(days: number, t: Translator): string {
  return `${t('tooltip.remaining')} ${days}${t('dashboard.duration.day').trim()}`;
}

/**
 * Whole days left before `expiresAt`, rounded up so a partial day still
 * counts. An expiry in the past renders the localized "expired" label.
 */
export function formatExpiryRemaining(
  expiresAt: number,
  now: number,
  t: Translator,
): string {
  if (expiresAt <= now) return t('tooltip.expired');
  return formatRemainingDays(Math.ceil((expiresAt - now) / 86_400_000), t);
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
