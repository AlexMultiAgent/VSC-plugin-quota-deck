export interface PerKeyRow {
  readonly apiKeyId: string;
  readonly currency: string;
  readonly requests: number;
  readonly tokens: number;
  readonly cost: number;
}

export interface AccountTotals {
  readonly requests: number;
  readonly tokens: number;
  readonly cost: number;
  readonly keyCount: number;
}

export interface CurrencyTotal {
  readonly currency: string;
  readonly amount: number;
}

export type AccountTotalSource = 'summary' | 'aggregated' | 'unavailable';

export interface AccountTotalSelection {
  /** Where the totals came from. Never both a summary and a summed per-key total. */
  readonly source: AccountTotalSource;
  readonly totals: readonly CurrencyTotal[];
  readonly keyCount: number;
}

export function aggregatePerKeyRows(rows: readonly PerKeyRow[]): AccountTotals {
  return rows.reduce<AccountTotals>(
    (totals, row) => ({
      requests: totals.requests + row.requests,
      tokens: totals.tokens + row.tokens,
      cost: totals.cost + row.cost,
      keyCount: totals.keyCount + 1,
    }),
    { requests: 0, tokens: 0, cost: 0, keyCount: 0 },
  );
}

export function canAggregate(
  rows: readonly PerKeyRow[],
  knownKeyIds: readonly string[] | undefined,
): boolean {
  if (knownKeyIds === undefined || knownKeyIds.length === 0) return false;
  const rowIds = new Set(rows.map((row) => row.apiKeyId));
  return knownKeyIds.every((id) => rowIds.has(id));
}

function sumByCurrency(rows: readonly PerKeyRow[]): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.cost);
  }
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/**
 * Pick the single source of account-level totals.
 *
 * The platform summary and the summed per-key rows are alternatives: adding
 * them together would double-count, so exactly one is ever returned.
 */
export function selectAccountTotals(input: {
  readonly summaryTotals: readonly CurrencyTotal[];
  readonly perKeyRows: readonly PerKeyRow[];
  readonly knownKeyIds: readonly string[] | undefined;
}): AccountTotalSelection {
  if (canAggregate(input.perKeyRows, input.knownKeyIds)) {
    return {
      source: 'aggregated',
      totals: sumByCurrency(input.perKeyRows),
      keyCount: input.perKeyRows.length,
    };
  }
  if (input.summaryTotals.length > 0) {
    return { source: 'summary', totals: input.summaryTotals, keyCount: 0 };
  }
  return { source: 'unavailable', totals: [], keyCount: 0 };
}
