import type { RangeId } from './time';
import type { ProviderId, ProviderSnapshot } from './types';

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

export class SnapshotCache {
  constructor(private readonly storage: StorageBackend) {}

  async load(providerId: ProviderId, range: RangeId): Promise<ProviderSnapshot | undefined> {
    const raw = this.storage.get(this.key(providerId, range));
    return isSnapshot(raw) ? withoutRetiredCapabilities(raw) : undefined;
  }

  async save(snapshot: ProviderSnapshot, range: RangeId): Promise<void> {
    const sanitized = stripSensitive(snapshot) as ProviderSnapshot;
    await this.storage.set(this.key(snapshot.providerId, range), sanitized);
  }


  private key(providerId: ProviderId, range: RangeId): string {
    return `${KEY_PREFIX}.${providerId}.${range}`;
  }
}
