import type { ProviderId, ProviderSnapshot } from './types';

export interface StorageBackend {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

const KEY_PREFIX = 'quotaDeck.snapshot';
const SENSITIVE_KEY =
  /^(?:authorization|cookie|set-cookie|api-?key|access-?token|session-?token|token-?plan-?key|password|secret)$/i;

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

export class SnapshotCache {
  constructor(private readonly storage: StorageBackend) {}

  async load(providerId: ProviderId): Promise<ProviderSnapshot | undefined> {
    const raw = this.storage.get(`${KEY_PREFIX}.${providerId}`);
    return isSnapshot(raw) ? raw : undefined;
  }

  async save(snapshot: ProviderSnapshot): Promise<void> {
    const sanitized = stripSensitive(snapshot) as ProviderSnapshot;
    this.storage.set(`${KEY_PREFIX}.${snapshot.providerId}`, sanitized);
  }
}
