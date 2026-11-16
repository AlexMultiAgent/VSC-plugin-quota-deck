import { SnapshotCache } from './cache';
import { normalizeError } from './errors';
import type { NormalizedError, ProviderId, ProviderSnapshot, QuotaProvider } from './types';
import type { RangeId } from './time';

export interface CoordinatorOptions {
  readonly providers: QuotaProvider[];
  readonly cache?: SnapshotCache;
  readonly timeoutMs?: number;
  readonly onRateLimited?: (retryAfterMs: number) => void;
}

function markAllFailed(snapshot: ProviderSnapshot, error: NormalizedError): ProviderSnapshot {
  const capabilities = Object.fromEntries(
    Object.entries(snapshot.capabilities).map(([id, state]) => {
      if (state.kind === 'unconfigured' || state.kind === 'unsupported') return [id, state];
      const lastGood =
        'fetchedAt' in state
          ? { fetchedAt: state.fetchedAt, data: state.data }
          : { fetchedAt: state.lastGood?.fetchedAt ?? snapshot.fetchedAt, data: state.lastGood?.data };
      return [id, { kind: 'failed' as const, error, lastGood }];
    }),
  );
  return { ...snapshot, capabilities };
}

export class Coordinator {
  private readonly options: CoordinatorOptions;
  private readonly providers: QuotaProvider[];
  private readonly cache: SnapshotCache | undefined;
  private readonly timeoutMs: number;
  private inFlight: Promise<Partial<Record<ProviderId, ProviderSnapshot>>> | undefined;
  private last: Partial<Record<ProviderId, ProviderSnapshot>> = {};

  constructor(options: CoordinatorOptions) {
    this.options = options;
    this.providers = options.providers;
    this.cache = options.cache;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  getLast(): Partial<Record<ProviderId, ProviderSnapshot>> {
    return this.last;
  }

  async refreshAll(range?: RangeId): Promise<Partial<Record<ProviderId, ProviderSnapshot>>> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run(range).finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async run(range?: RangeId): Promise<Partial<Record<ProviderId, ProviderSnapshot>>> {
    const result: Partial<Record<ProviderId, ProviderSnapshot>> = {};
    for (const provider of this.providers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const snapshot = await provider.fetchSnapshot(controller.signal, range);
        result[provider.id] = snapshot;
        for (const state of Object.values(snapshot.capabilities)) {
          if (state.kind === 'failed' && state.error.kind === 'rate-limit') {
            this.options.onRateLimited?.(state.error.retryAfterMs ?? 60_000);
          }
        }
        await this.cache?.save(snapshot);
      } catch {
        const previous = await this.cache?.load(provider.id);
        if (previous) {
          const failed = markAllFailed(previous, normalizeError({ name: 'RefreshError' }));
          result[provider.id] = failed;
          await this.cache?.save(failed);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    this.last = result;
    return result;
  }

  async loadCached(): Promise<Partial<Record<ProviderId, ProviderSnapshot>>> {
    const result: Partial<Record<ProviderId, ProviderSnapshot>> = {};
    for (const provider of this.providers) {
      const cached = await this.cache?.load(provider.id);
      if (cached) result[provider.id] = cached;
    }
    return result;
  }

  dispose(): void {
    for (const provider of this.providers) provider.dispose();
  }
}
