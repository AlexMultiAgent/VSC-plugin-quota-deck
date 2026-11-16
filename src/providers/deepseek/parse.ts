import type { DeepSeekBalance, DeepSeekBalanceEntry } from './shape';

export function balancesByCurrency(balance: DeepSeekBalance): Record<string, DeepSeekBalanceEntry> {
  const result: Record<string, DeepSeekBalanceEntry> = {};
  for (const entry of balance.entries) result[entry.currency] = entry;
  return result;
}

const PREFERRED_ORDER = ['CNY', 'USD', 'EUR'];

export function selectDisplayBalance(balance: DeepSeekBalance): DeepSeekBalanceEntry | undefined {
  const byCurrency = balancesByCurrency(balance);
  for (const code of PREFERRED_ORDER) {
    if (byCurrency[code] !== undefined) return byCurrency[code];
  }
  const remaining = Object.keys(byCurrency).sort();
  return remaining.length > 0 ? byCurrency[remaining[0]!] : undefined;
}
