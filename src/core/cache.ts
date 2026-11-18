import type { RangeId } from './time';
import type { CapabilityState, ProviderId, ProviderSnapshot } from './types';

export interface StorageBackend {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

const KEY_PREFIX = 'quotaDeck.snapshot';
const SENSITIVE_KEY =
  /^(?:authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|session[-_]?token|token[-_]?plan[-_]?key|web[-_]?cookie|password|secret|csrf[-_]?token)$/i;
const RETIRED_DEEPSEEK_CAPABILITIES = new Set([
  'deepseek.usageAmount',
  'deepseek.usageCost',
  'deepseek.accountSummary',
]);

function isSnapshot(value: unknown): value is ProviderSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ProviderSnapshot>;
  return (
    typeof candidate.providerId === 'string' &&
    typeof candidate.fetchedAt === 'string' &&
    typeof candidate.capabilities === 'object' &&
    candidate.capabilities !== null
  );
}

function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (typeof value !== 'object' || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!SENSITIVE_KEY.test(key)) output[key] = stripSensitive(child);
  }
  return output;
}

function withoutRetiredCapabilities(snapshot: ProviderSnapshot): ProviderSnapshot {
  if (snapshot.providerId !== 'deepseek') return snapshot;
  const entries = Object.entries(snapshot.capabilities).filter(
    ([capability]) => !RETIRED_DEEPSEEK_CAPABILITIES.has(capability),
  );
  return entries.length === Object.keys(snapshot.capabilities).length
    ? snapshot
    : { ...snapshot, capabilities: Object.fromEntries(entries) };
}

/**
 * The MiniMax plan used to be parsed with `current_interval_usage_count` read
 * as "already spent", so a plan cached under that rule renders the video
 * allowance inverted. The current window shape carries no `total` key, so a
 * cached plan that still has one predates the fix and must not be shown.
 */
function isLegacyMiniMaxPlan(state: CapabilityState | undefined): boolean {
  if (state === undefined || (state.kind !== 'ok' && state.kind !== 'stale')) return false;
  const data: unknown = state.data;
  if (typeof data !== 'object' || data === null) return false;
  const windows = (data as { windows?: unknown }).windows;
  if (!Array.isArray(windows)) return false;
  return windows.some(
    (window) => typeof window === 'object' && window !== null && 'total' in window,
  );
}

function withoutLegacyMiniMaxPlan(snapshot: ProviderSnapshot): ProviderSnapshot {
  if (snapshot.providerId !== 'minimax-cn' && snapshot.providerId !== 'minimax-global') {
    return snapshot;
  }
  const entries = Object.entries(snapshot.capabilities).filter(
    ([capability, state]) =>
      capability !== 'minimax.plan' || !isLegacyMiniMaxPlan(state),
  );
  return entries.length === Object.keys(snapshot.capabilities).length
    ? snapshot
    : { ...snapshot, capabilities: Object.fromEntries(entries) };
}

export class SnapshotCache {
  constructor(private readonly storage: StorageBackend) {}

  async load(providerId: ProviderId, range: RangeId): Promise<ProviderSnapshot | undefined> {
    const raw = this.storage.get(this.key(providerId, range));
    return isSnapshot(raw)
      ? withoutLegacyMiniMaxPlan(withoutRetiredCapabilities(raw))
      : undefined;
  }

  async save(snapshot: ProviderSnapshot, range: RangeId): Promise<void> {
    const sanitized = stripSensitive(snapshot) as ProviderSnapshot;
    await this.storage.set(this.key(snapshot.providerId, range), sanitized);
  }


  private key(providerId: ProviderId, range: RangeId): string {
    return `${KEY_PREFIX}.${providerId}.${range}`;
  }
}
