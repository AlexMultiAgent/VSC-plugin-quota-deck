import { asRecord, requireNumber } from '../shape';

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
      total: requireNumber(entry.total_balance, `root.balance_infos[${index}].total_balance`),
      granted: requireNumber(entry.granted_balance, `root.balance_infos[${index}].granted_balance`),
      toppedUp: requireNumber(entry.topped_up_balance, `root.balance_infos[${index}].topped_up_balance`),
    };
  });
  return { available: root.is_available === true, entries };
}
