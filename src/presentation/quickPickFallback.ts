import type { Translator } from '../localization';
import type { ProviderId, ProviderSnapshot } from '../core/types';
import { capabilityValue } from '../core/capability';
import type { MiniMaxPlan } from '../providers/minimax/shape';
import type { DeepSeekBalance } from '../providers/deepseek/shape';
import { formatMoney, pickTightestWindow, providerDisplayName, selectPrimaryCurrency } from './display';

export interface FallbackItem {
  readonly label: string;
  readonly description: string;
  readonly detail?: string;
}

function windows(snapshot: ProviderSnapshot | undefined): MiniMaxPlan['windows'] {
  return capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan')?.windows ?? [];
}

function deepSeekBalance(snapshot: ProviderSnapshot | undefined): string | undefined {
  const entries = capabilityValue<DeepSeekBalance>(snapshot, 'deepseek.balance')?.entries ?? [];
  const currency = selectPrimaryCurrency(entries.map((entry) => entry.currency));
  if (currency === undefined) return undefined;
  const entry = entries.find((candidate) => candidate.currency === currency);
  return entry === undefined ? undefined : formatMoney(entry.total, entry.currency);
}

export function buildFallbackItems(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  order: ProviderId[],
  t: Translator,
): FallbackItem[] {
  return order.map((id) => {
    const snapshot = snapshots[id];
    if (snapshot === undefined) return { label: providerDisplayName(id), description: '—' };

    const balance = deepSeekBalance(snapshot);
    if (balance !== undefined) return { label: providerDisplayName(id), description: balance };

    const window = pickTightestWindow(windows(snapshot));
    if (window !== undefined) {
      return { label: providerDisplayName(id), description: `${Math.round(window.remainingPercent ?? 0)}%` };
    }
    const failed = Object.values(snapshot.capabilities).find((state) => state.kind === 'failed');
    if (failed !== undefined && failed.kind === 'failed') {
      return { label: providerDisplayName(id), description: t(failed.error.message) };
    }
    const unsupported = Object.values(snapshot.capabilities).find((state) => state.kind === 'unsupported');
    if (unsupported !== undefined && unsupported.kind === 'unsupported') {
      return { label: providerDisplayName(id), description: t('state.unsupported') };
    }
    return { label: providerDisplayName(id), description: '—' };
  });
}
