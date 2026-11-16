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
    getCapabilities: () => ({ capabilities: [] }),
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
    expect(snapshots['qwen']).toBeUndefined();
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
    expect(snapshots['deepseek']?.capabilities['deepseek.balance']?.kind).toBe('failed');
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

  it('disposes every provider on shutdown', async () => {
    const p = provider('qwen', makeSnapshot('qwen', {}));
    const coordinator = new Coordinator({ providers: [p] });
    coordinator.dispose();
    expect(p.dispose).toHaveBeenCalled();
  });
});
