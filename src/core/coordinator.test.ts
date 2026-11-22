import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __reset } from '../test/__mocks__/vscode';
import { makeSnapshot } from '../test/helpers/snapshot';
import { SnapshotCache } from './cache';
import { Coordinator } from './coordinator';
import type { ProviderSnapshot, QuotaProvider } from './types';

function provider(id: QuotaProvider['id'], snapshot: ProviderSnapshot): QuotaProvider {
  return {
    id,
    displayName: id,
    getCapabilities: () => ({
      capabilities: [
        { id: `${id}.balance`, titleKey: 'capability.deepseek.balance', credential: 'api-key', required: true },
      ],
    }),
    connect: async () => ({ kind: 'ready', capabilities: [] }),
    fetchSnapshot: async () => snapshot,
    dispose: vi.fn(),
  };
}

describe('Coordinator', () => {
  beforeEach(() => __reset());

  it('collects one snapshot per provider', async () => {
    const coordinator = new Coordinator({ providers: [provider('deepseek', makeSnapshot('deepseek', {}))] });
    const snapshots = await coordinator.refreshAll();
    expect(Object.keys(snapshots)).toEqual(['deepseek']);
  });

  it('isolates a provider failure from the other providers', async () => {
    const failing: QuotaProvider = {
      ...provider('qwen', makeSnapshot('qwen', {})),
      fetchSnapshot: async () => { throw new Error('boom'); },
    };
    const coordinator = new Coordinator({
      providers: [provider('deepseek', makeSnapshot('deepseek', {})), failing],
    });
    const snapshots = await coordinator.refreshAll();
    expect(snapshots['deepseek']).toBeDefined();
    expect(snapshots['qwen']?.capabilities['qwen.balance']?.kind).toBe('failed');
    expect(snapshots['deepseek']?.capabilities['deepseek.balance']?.kind).toBeUndefined();
  });

  it('reports a failed provider as failed rather than dropping it', async () => {
    const failing: QuotaProvider = {
      ...provider('minimax-cn', makeSnapshot('minimax-cn', {})),
      getCapabilities: () => ({ capabilities: [{ id: 'minimax.plan', titleKey: 'capability.minimax.plan', credential: 'token-plan-key', required: true }] }),
      fetchSnapshot: async () => { throw new Error('boom'); },
    };
    const coordinator = new Coordinator({ providers: [failing] });
    const snapshots = await coordinator.refreshAll();
    const state = snapshots['minimax-cn']?.capabilities['minimax.plan'];
    expect(state?.kind).toBe('failed');
  });

  it('keeps a provider in the live view when a later refresh fails', async () => {
    let attempt = 0;
    const flaky: QuotaProvider = {
      ...provider('deepseek', makeSnapshot('deepseek', {})),
      getCapabilities: () => ({ capabilities: [{ id: 'deepseek.balance', titleKey: 'capability.deepseek.balance', credential: 'api-key', required: true }] }),
      fetchSnapshot: async () => {
        attempt += 1;
        if (attempt === 1) return makeSnapshot('deepseek', {});
        throw new Error('boom');
      },
    };
    const coordinator = new Coordinator({ providers: [flaky] });
    await coordinator.refreshAll();
    await coordinator.refreshAll();
    expect(coordinator.getLast()['deepseek']).toBeDefined();
  });

  it('keeps the last good snapshot when a refresh fails', async () => {
    let attempt = 0;
    const flaky: QuotaProvider = {
      ...provider('deepseek', makeSnapshot('deepseek', {})),
      fetchSnapshot: async () => {
        attempt += 1;
        if (attempt === 1) {
          return makeSnapshot('deepseek', {
            'deepseek.balance': { kind: 'ok', fetchedAt: 'x', data: { cny: 1 } },
          });
        }
        throw new Error('boom');
      },
    };
    const storage = new Map<string, unknown>();
    const coordinator = new Coordinator({ providers: [flaky], cache: new SnapshotCache(storage) });
    await coordinator.refreshAll();
    await coordinator.refreshAll();
    const snapshots = await coordinator.refreshAll();
    const state = snapshots['deepseek']?.capabilities['deepseek.balance'];
    expect(state?.kind === 'stale' || state?.kind === 'failed').toBe(true);
  });

  it('marks a carried-over value as stale instead of hiding it', async () => {
    let attempt = 0;
    const flaky: QuotaProvider = {
      ...provider('deepseek', makeSnapshot('deepseek', {})),
      fetchSnapshot: async () => {
        attempt += 1;
        if (attempt === 1) {
          return makeSnapshot('deepseek', {
            'deepseek.balance': { kind: 'ok', fetchedAt: 'x', data: { cny: 1 } },
          });
        }
        throw new Error('boom');
      },
    };
    const storage = new Map<string, unknown>();
    const coordinator = new Coordinator({ providers: [flaky], cache: new SnapshotCache(storage) });
    await coordinator.refreshAll();
    await coordinator.refreshAll();
    const snapshots = await coordinator.refreshAll();
    const state = snapshots['deepseek']?.capabilities['deepseek.balance'];
    expect(state?.kind).toBe('stale');
    expect(state?.kind === 'stale' ? state.data : undefined).toEqual({ cny: 1 });
  });

  it('coalesces concurrent refreshes into one request', async () => {
    const order: string[] = [];
    const slow: QuotaProvider = {
      ...provider('deepseek', makeSnapshot('deepseek', {})),
      fetchSnapshot: async () => {
        order.push('start');
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('end');
        return makeSnapshot('deepseek', {});
      },
    };
    const coordinator = new Coordinator({ providers: [slow] });
    const first = coordinator.refreshAll();
    const second = coordinator.refreshAll();
    await Promise.all([first, second]);
    expect(order).toEqual(['start', 'end']);
  });

  it('turns a per-capability failure into stale and keeps it in the cache', async () => {
    let attempt = 0;
    const flaky: QuotaProvider = {
      ...provider('deepseek', makeSnapshot('deepseek', {})),
      getCapabilities: () => ({
        capabilities: [
          { id: 'deepseek.balance', titleKey: 'capability.deepseek.balance', credential: 'api-key', required: true },
        ],
      }),
      fetchSnapshot: async () => {
        attempt += 1;
        return attempt === 1
          ? makeSnapshot('deepseek', {
              'deepseek.balance': { kind: 'ok', fetchedAt: 'first', data: { total: 12 } },
            })
          : makeSnapshot('deepseek', {
              'deepseek.balance': {
                kind: 'failed',
                error: { kind: 'network', message: 'error.network' },
              },
            });
      },
    };
    const cache = new SnapshotCache(new Map<string, unknown>());
    const coordinator = new Coordinator({ providers: [flaky], cache });

    await coordinator.refreshAll();
    const second = await coordinator.refreshAll();

    expect(second['deepseek']?.capabilities['deepseek.balance']).toEqual({
      kind: 'stale',
      fetchedAt: 'first',
      data: { total: 12 },
      reason: 'error.network',
    });
    const cached = await cache.load('deepseek', 'last7');
    expect(cached?.capabilities['deepseek.balance']?.kind).toBe('stale');
  });

  it('does not turn a never-successful capability into stale', async () => {
    const failing: QuotaProvider = {
      ...provider('deepseek', makeSnapshot('deepseek', {})),
      getCapabilities: () => ({
        capabilities: [
          { id: 'deepseek.balance', titleKey: 'capability.deepseek.balance', credential: 'api-key', required: true },
        ],
      }),
      fetchSnapshot: async () =>
        makeSnapshot('deepseek', {
          'deepseek.balance': {
            kind: 'failed',
            error: { kind: 'network', message: 'error.network' },
          },
        }),
    };
    const cache = new SnapshotCache(new Map<string, unknown>());
    const coordinator = new Coordinator({ providers: [failing], cache });

    await coordinator.refreshAll();
    const second = await coordinator.refreshAll();

    expect(second['deepseek']?.capabilities['deepseek.balance']?.kind).toBe('failed');
  });

  it('serialises different ranges and runs only the latest pending one', async () => {
    const started: string[] = [];
    const releases: Array<() => void> = [];
    const slow: QuotaProvider = {
      ...provider('deepseek', makeSnapshot('deepseek', {})),
      fetchSnapshot: async (_signal, range) => {
        started.push(range ?? 'last7');
        await new Promise<void>((resolve) => releases.push(resolve));
        return makeSnapshot('deepseek', {
          'deepseek.balance': { kind: 'ok', fetchedAt: 'x', data: { range } },
        });
      },
    };
    const coordinator = new Coordinator({ providers: [slow] });

    const first = coordinator.refreshAll('last7');
    await Promise.resolve();
    const today = coordinator.refreshAll('today');
    const month = coordinator.refreshAll('thisMonth');
    await Promise.resolve();

    expect(started).toEqual(['last7']);
    releases[0]!();
    await first;
    expect(started).toEqual(['last7', 'thisMonth']);

    releases[1]!();
    await month;
    await today;
    const last = coordinator.getLast().deepseek?.capabilities['deepseek.balance'];
    expect(last?.kind === 'ok' ? last.data : undefined).toEqual({ range: 'thisMonth' });
  });

  it('drops a pending range when the active range is requested again', async () => {
    const started: string[] = [];
    const releases: Array<() => void> = [];
    const slow: QuotaProvider = {
      ...provider('deepseek', makeSnapshot('deepseek', {})),
      fetchSnapshot: async (_signal, range) => {
        started.push(range ?? 'last7');
        await new Promise<void>((resolve) => releases.push(resolve));
        return makeSnapshot('deepseek', {
          'deepseek.balance': { kind: 'ok', fetchedAt: 'x', data: { range } },
        });
      },
    };
    const coordinator = new Coordinator({ providers: [slow] });

    const first = coordinator.refreshAll('last7');
    await Promise.resolve();
    const today = coordinator.refreshAll('today');
    const again = coordinator.refreshAll('last7');
    await Promise.resolve();
    expect(started).toEqual(['last7']);

    releases[0]!();
    await first;
    await today;
    await again;
    expect(started).toEqual(['last7']);
    const last = coordinator.getLast().deepseek?.capabilities['deepseek.balance'];
    expect(last?.kind === 'ok' ? last.data : undefined).toEqual({ range: 'last7' });
  });

  it('uses an updated time zone for later refreshes', async () => {
    const seen: Array<string | undefined> = [];
    const p: QuotaProvider = {
      ...provider('minimax-cn', makeSnapshot('minimax-cn', {})),
      fetchSnapshot: async (_signal, _range, timeZone) => {
        seen.push(timeZone);
        return makeSnapshot('minimax-cn', {});
      },
    };
    const coordinator = new Coordinator({
      providers: [p],
      timeZone: 'Asia/Shanghai',
    });

    await coordinator.refreshAll();
    coordinator.setTimeZone('America/New_York');
    await coordinator.refreshAll();

    expect(seen).toEqual(['Asia/Shanghai', 'America/New_York']);
  });

  it('disposes every provider on shutdown', async () => {
    const p = provider('qwen', makeSnapshot('qwen', {}));
    const coordinator = new Coordinator({ providers: [p] });
    coordinator.dispose();
    expect(p.dispose).toHaveBeenCalled();
  });
});
