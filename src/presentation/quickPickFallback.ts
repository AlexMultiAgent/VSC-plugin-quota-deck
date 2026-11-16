import type { ProviderId, ProviderSnapshot } from '../core/types';

export interface FallbackItem {
  readonly label: string;
  readonly description: string;
  readonly detail?: string;
}

const NAME: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

interface WindowView {
  readonly window: string;
  readonly remainingPercent?: number;
  readonly unlimited?: boolean;
}

function windows(snapshot: ProviderSnapshot | undefined): WindowView[] {
  const state = snapshot?.capabilities['minimax.plan'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { windows?: WindowView[] } | undefined;
  return data?.windows ?? [];
}

function deepSeekBalance(snapshot: ProviderSnapshot | undefined): string | undefined {
  const state = snapshot?.capabilities['deepseek.balance'];
  if (state === undefined || state.kind !== 'ok') return undefined;
  const data = state.data as { entries?: { currency: string; total: number }[] } | undefined;
  const entry = data?.entries?.find((value) => value.currency === 'CNY') ?? data?.entries?.[0];
  return entry === undefined
    ? undefined
    : entry.currency === 'CNY'
      ? `¥${entry.total.toFixed(2)}`
      : `${entry.currency} ${entry.total.toFixed(2)}`;
}

export function buildFallbackItems(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  order: ProviderId[],
): FallbackItem[] {
  return order.map((id) => {
    const snapshot = snapshots[id];
    if (snapshot === undefined) return { label: NAME[id], description: '—' };

    const balance = deepSeekBalance(snapshot);
    if (balance !== undefined) return { label: NAME[id], description: balance };

    const window = windows(snapshot)
      .filter((entry) => entry.unlimited !== true && entry.remainingPercent !== undefined)
      .sort((a, b) => (a.remainingPercent ?? 0) - (b.remainingPercent ?? 0))[0];
    if (window !== undefined) {
      return { label: NAME[id], description: `${Math.round(window.remainingPercent ?? 0)}%` };
    }
    const failed = Object.values(snapshot.capabilities).find((state) => state.kind === 'failed');
    if (failed !== undefined && failed.kind === 'failed') {
      return { label: NAME[id], description: failed.error.message };
    }
    const unsupported = Object.values(snapshot.capabilities).find((state) => state.kind === 'unsupported');
    if (unsupported !== undefined && unsupported.kind === 'unsupported') {
      return { label: NAME[id], description: 'Unsupported' };
    }
    return { label: NAME[id], description: '—' };
  });
}
