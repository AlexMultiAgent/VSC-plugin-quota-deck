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

type SnapshotMap = Partial<Record<ProviderId, ProviderSnapshot>>;

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
      state !== undefined && (state.kind === 'ok' || state.kind === 'stale')
        ? { fetchedAt: state.fetchedAt, data: state.data }
        : state !== undefined && state.kind === 'failed' && state.lastGood !== undefined
          ? { fetchedAt: state.lastGood.fetchedAt, data: state.lastGood.data }
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

/**
 * A provider reports a per-capability failure inside its snapshot instead of
 * throwing. The last good value for that capability still belongs on screen:
 * convert the failure into `stale` from the previous snapshot for the same
 * range, so the value stays visible and is labelled as out of date. The cache
 * must receive the reconciled snapshot, or the last good value is lost.
 */
async function reconcileFailedCapabilities(
  snapshot: ProviderSnapshot,
  range: RangeId,
  cache: SnapshotCache | undefined,
): Promise<ProviderSnapshot> {
  const failedIds = Object.entries(snapshot.capabilities)
    .filter(([, state]) => state.kind === 'failed')
    .map(([id]) => id);
  if (failedIds.length === 0 || cache === undefined) return snapshot;

  const previous = await cache.load(snapshot.providerId, range).catch(() => undefined);
  if (previous === undefined) return snapshot;

  const capabilities = { ...snapshot.capabilities };
  let changed = false;
  for (const id of failedIds) {
    const failed = capabilities[id];
    if (failed?.kind !== 'failed') continue;
    const prior = previous.capabilities[id];
    const carried =
      prior !== undefined && (prior.kind === 'ok' || prior.kind === 'stale')
        ? { fetchedAt: prior.fetchedAt, data: prior.data }
        : prior !== undefined && prior.kind === 'failed' && prior.lastGood !== undefined
          ? { fetchedAt: prior.lastGood.fetchedAt, data: prior.lastGood.data }
          : undefined;
    if (carried === undefined) continue;
    capabilities[id] = {
      kind: 'stale',
      fetchedAt: carried.fetchedAt,
      data: carried.data,
      reason: failed.error.message,
    };
    changed = true;
  }

  return changed ? { ...snapshot, capabilities } : snapshot;
}

export class Coordinator {
  private readonly options: CoordinatorOptions;
  private readonly providers: QuotaProvider[];
  private readonly cache: SnapshotCache | undefined;
  private readonly timeoutMs: number;
  private timeZone: string | undefined;
  /**
   * Only one `run` is ever active. A request for a different range while one
   * is running is coalesced into a single pending slot; the latest requested
   * range wins. Two runs must never overlap, or the slower run overwrites the
   * newer snapshot in `last` and the per-range cache is filled out of order.
   */
  private active: { readonly range: RangeId; readonly promise: Promise<SnapshotMap> } | undefined;
  private pending:
    | {
        readonly range: RangeId;
        readonly promise: Promise<SnapshotMap>;
        readonly resolve: (value: SnapshotMap | PromiseLike<SnapshotMap>) => void;
      }
    | undefined;
  private last: SnapshotMap = {};

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

  async refreshAll(range: RangeId = 'last7'): Promise<SnapshotMap> {
    if (this.active?.range === range) {
      // A request for the range already running supersedes any queued range:
      // the latest intent wins, so the queued run is unnecessary.
      const superseded = this.pending;
      if (superseded !== undefined) {
        this.pending = undefined;
        superseded.resolve(this.active.promise);
      }
      return this.active.promise;
    }
    if (this.pending?.range === range) return this.pending.promise;
    if (this.active === undefined) return this.begin(range);

    const previous = this.pending;
    let resolve!: (value: SnapshotMap | PromiseLike<SnapshotMap>) => void;
    const promise = new Promise<SnapshotMap>((res) => {
      resolve = res;
    });
    this.pending = { range, promise, resolve };
    // Callers waiting on a superseded range adopt the newer run's result.
    previous?.resolve(promise);
    return promise;
  }

  private begin(range: RangeId): Promise<SnapshotMap> {
    const promise = this.run(range);
    this.active = { range, promise };
    const settle = (): void => this.finish(promise);
    void promise.then(settle, settle);
    return promise;
  }

  private finish(promise: Promise<SnapshotMap>): void {
    if (this.active?.promise !== promise) return;
    this.active = undefined;
    const pending = this.pending;
    if (pending === undefined) return;
    this.pending = undefined;
    pending.resolve(this.begin(pending.range));
  }

  private async run(range: RangeId): Promise<SnapshotMap> {
    const result: SnapshotMap = {};
    for (const provider of this.providers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let snapshot: ProviderSnapshot | undefined;
      try {
        snapshot = await provider.fetchSnapshot(controller.signal, range, this.timeZone);
      } catch {
        snapshot = undefined;
      } finally {
        clearTimeout(timer);
      }

      if (snapshot === undefined) {
        const previous = await this.loadPrevious(provider.id, range);
        const failed = failedSnapshot(provider, normalizeError({ name: 'RefreshError' }), previous);
        result[provider.id] = failed;
        await this.saveSnapshot(failed, range);
        continue;
      }

      for (const state of Object.values(snapshot.capabilities)) {
        if (state.kind === 'failed' && state.error.kind === 'rate-limit') {
          this.options.onRateLimited?.(state.error.retryAfterMs ?? 60_000);
        }
      }
      const reconciled = await reconcileFailedCapabilities(snapshot, range, this.cache);
      result[provider.id] = reconciled;
      await this.saveSnapshot(reconciled, range);
    }
    this.last = { ...this.last, ...result };
    return result;
  }

  private async loadPrevious(
    providerId: ProviderId,
    range: RangeId,
  ): Promise<ProviderSnapshot | undefined> {
    if (this.cache === undefined) return undefined;
    try {
      return await this.cache.load(providerId, range);
    } catch {
      return undefined;
    }
  }

  /** A cache write is best-effort: losing it must not discard a live snapshot. */
  private async saveSnapshot(snapshot: ProviderSnapshot, range: RangeId): Promise<void> {
    if (this.cache === undefined) return;
    try {
      await this.cache.save(snapshot, range);
    } catch {
      // The next refresh will retry; the in-memory snapshot is still usable.
    }
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
