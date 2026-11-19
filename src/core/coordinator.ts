import { SnapshotCache } from './cache';
import { normalizeError } from './errors';
import type {
  CapabilityState,
  NormalizedError,
  ProviderId,
  ProviderSnapshot,
  QuotaProvider,
} from './types';
import type { RangeId } from './time';

export interface CoordinatorOptions {
  readonly providers: QuotaProvider[];
  readonly cache?: SnapshotCache;
  readonly timeoutMs?: number;
  readonly timeZone?: string;
  readonly onRateLimited?: (retryAfterMs: number) => void;
}

function failedSnapshot(
  provider: QuotaProvider,
  error: NormalizedError,
  previous: ProviderSnapshot | undefined,
): ProviderSnapshot {
  const capabilities: Record<string, CapabilityState> = {};
  const ids = new Set([
    ...provider.getCapabilities().capabilities.map((capability) => capability.id),
    ...Object.keys(previous?.capabilities ?? {}),
  ]);
  for (const id of ids) {
    const state = previous?.capabilities[id];
    if (state !== undefined && (state.kind === 'unconfigured' || state.kind === 'unsupported')) {
      capabilities[id] = state;
      continue;
    }
    const carried =
      state !== undefined && 'fetchedAt' in state
        ? { fetchedAt: state.fetchedAt, data: state.data }
        : state !== undefined && state.kind === 'failed'
          ? { fetchedAt: state.lastGood?.fetchedAt ?? previous?.fetchedAt ?? '', data: state.lastGood?.data }
          : undefined;
    if (carried === undefined) {
      capabilities[id] = { kind: 'failed', error };
      continue;
    }
    capabilities[id] = {
      kind: 'stale',
      fetchedAt: carried.fetchedAt,
      data: carried.data,
      reason: error.message,
    };
  }
  return {
    providerId: provider.id,
    fetchedAt: previous?.fetchedAt ?? new Date().toISOString(),
    capabilities,
  };
}

export class Coordinator {
  private readonly options: CoordinatorOptions;
  private readonly providers: QuotaProvider[];
  private readonly cache: SnapshotCache | undefined;
  private readonly timeoutMs: number;
  private timeZone: string | undefined;
  private inFlight: { range: RangeId; promise: Promise<Partial<Record<ProviderId, ProviderSnapshot>>> } | undefined;
  private last: Partial<Record<ProviderId, ProviderSnapshot>> = {};

  constructor(options: CoordinatorOptions) {
    this.options = options;
    this.providers = options.providers;
    this.cache = options.cache;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.timeZone = options.timeZone;
  }

  getLast(): Partial<Record<ProviderId, ProviderSnapshot>> {
    return this.last;
  }

  setTimeZone(timeZone: string): void {
    this.timeZone = timeZone;
  }

  async refreshAll(range: RangeId = 'last7'): Promise<Partial<Record<ProviderId, ProviderSnapshot>>> {
    if (this.inFlight?.range === range) return this.inFlight.promise;
    if (this.inFlight) {
      this.inFlight.promise = this.run(range).finally(() => {
        this.inFlight = undefined;
      });
      return this.inFlight.promise;
    }
    this.inFlight = {
      range,
      promise: this.run(range).finally(() => {
        this.inFlight = undefined;
      }),
    };
    return this.inFlight.promise;
  }

  private async run(range: RangeId): Promise<Partial<Record<ProviderId, ProviderSnapshot>>> {
    const result: Partial<Record<ProviderId, ProviderSnapshot>> = {};
    for (const provider of this.providers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const snapshot = await provider.fetchSnapshot(controller.signal, range, this.timeZone);
        result[provider.id] = snapshot;
        for (const state of Object.values(snapshot.capabilities)) {
          if (state.kind === 'failed' && state.error.kind === 'rate-limit') {
            this.options.onRateLimited?.(state.error.retryAfterMs ?? 60_000);
          }
        }
        await this.cache?.save(snapshot, range);
      } catch (error) {
        const previous = await this.cache?.load(provider.id, range);
        const failed = failedSnapshot(provider, normalizeError({ name: 'RefreshError' }), previous);
        result[provider.id] = failed;
        await this.cache?.save(failed, range);
      } finally {
        clearTimeout(timer);
      }
    }
    this.last = { ...this.last, ...result };
    return result;
  }

  async loadCached(range: RangeId = 'last7'): Promise<Partial<Record<ProviderId, ProviderSnapshot>>> {
    const result: Partial<Record<ProviderId, ProviderSnapshot>> = {};
    for (const provider of this.providers) {
      const cached = await this.cache?.load(provider.id, range);
      if (cached) result[provider.id] = cached;
    }
    return result;
  }

  dispose(): void {
    for (const provider of this.providers) provider.dispose();
  }
}
