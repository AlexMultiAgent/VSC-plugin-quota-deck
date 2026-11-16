export interface DeepSeekBalanceEntry {
  readonly currency: string;
  readonly total: number;
  readonly granted: number;
  readonly toppedUp: number;
}

export interface DeepSeekBalance {
  readonly available: boolean;
  readonly entries: DeepSeekBalanceEntry[];
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`unknown response shape: ${path}`);
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error('unknown response shape: not a number');
}

export function readDeepSeekBalance(response: unknown): DeepSeekBalance {
  const root = asRecord(response, 'root');
  const list = root.balance_infos;
  if (!Array.isArray(list)) throw new Error('unknown response shape: root.balance_infos');
  const entries = list.map((item, index) => {
    const entry = asRecord(item, `root.balance_infos[${index}]`);
    if (typeof entry.currency !== 'string' || entry.currency.length === 0) {
      throw new Error('unknown response shape: currency');
    }
    return {
      currency: entry.currency.toUpperCase(),
      total: asNumber(entry.total_balance),
      granted: asNumber(entry.granted_balance),
      toppedUp: asNumber(entry.topped_up_balance),
    };
  });
  return { available: root.is_available === true, entries };
}
