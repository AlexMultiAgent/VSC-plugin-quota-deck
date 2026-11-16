export interface PerKeyRow {
  readonly apiKeyId: string;
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
