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
