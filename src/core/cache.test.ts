import { beforeEach, describe, expect, it } from 'vitest';
import { __reset } from '../test/__mocks__/vscode';
import { SnapshotCache } from './cache';
import type { ProviderSnapshot } from './types';

const snapshot: ProviderSnapshot = {
  providerId: 'deepseek',
  fetchedAt: '2026-11-16T00:00:00.000Z',
  capabilities: {
    'deepseek.balance': { kind: 'ok', fetchedAt: '2026-11-16T00:00:00.000Z', data: { cny: 12 } },
  },
};

describe('SnapshotCache', () => {
  beforeEach(() => __reset());

  it('returns undefined for a provider that was never cached', async () => {
    const cache = new SnapshotCache(new Map());
    expect(await cache.load('deepseek', 'last7')).toBeUndefined();
  });

  it('round-trips a snapshot through the storage backend', async () => {
    const storage = new Map<string, unknown>();
    const cache = new SnapshotCache(storage);
    await cache.save(snapshot, 'last7');
    expect(await cache.load('deepseek', 'last7')).toEqual(snapshot);
  });

  it('keeps each range in its own slot', async () => {
    const storage = new Map<string, unknown>();
    const cache = new SnapshotCache(storage);
    await cache.save(snapshot, 'thisMonth');
    expect(await cache.load('deepseek', 'last7')).toBeUndefined();
    expect(await cache.load('deepseek', 'thisMonth')).toEqual(snapshot);
  });

  it('drops retired DeepSeek detail capabilities from legacy caches', async () => {
    const storage = new Map<string, unknown>([[
      'quotaDeck.snapshot.deepseek.last7',
      {
        ...snapshot,
        capabilities: {
          ...snapshot.capabilities,
          'deepseek.usageAmount': { kind: 'unconfigured', reason: 'missing platform session' },
          'deepseek.usageCost': { kind: 'unconfigured', reason: 'missing platform session' },
          'deepseek.accountSummary': { kind: 'unconfigured', reason: 'missing platform session' },
        },
      },
    ]]);
    const cache = new SnapshotCache(storage);

    expect(await cache.load('deepseek', 'last7')).toEqual(snapshot);
  });

  it('drops retired MiniMax cookie points from legacy caches', async () => {
    const storage = new Map<string, unknown>([[
      'quotaDeck.snapshot.minimax-cn.last7',
      {
        providerId: 'minimax-cn',
        fetchedAt: '2026-11-16T00:00:00.000Z',
        capabilities: {
          'minimax.points': {
            kind: 'ok',
            fetchedAt: '2026-11-16T00:00:00.000Z',
            data: { balance: 6850, expiresAt: null },
          },
        },
      },
    ]]);
    const cache = new SnapshotCache(storage);

    expect(await cache.load('minimax-cn', 'last7')).toEqual({
      providerId: 'minimax-cn',
      fetchedAt: '2026-11-16T00:00:00.000Z',
      capabilities: {},
    });
  });

  it('drops a MiniMax plan cached under the inverted count rule', async () => {
    const storage = new Map<string, unknown>([[
      'quotaDeck.snapshot.minimax-cn.last7',
      {
        providerId: 'minimax-cn',
        fetchedAt: '2026-11-16T00:00:00.000Z',
        capabilities: {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: '2026-11-16T00:00:00.000Z',
            data: {
              windows: [
                {
                  window: 'fiveHour',
                  total: 0,
                  used: 0,
                  remainingPercent: 90,
                  remainingPercentSource: 'field',
                  resetAt: null,
                  unlimited: false,
                },
              ],
              models: [
                {
                  model: 'video',
                  total: 3,
                  used: 3,
                  remaining: 0,
                  remainingPercent: 0,
                  resetAt: null,
                },
              ],
            },
          },
        },
      },
    ]]);
    const cache = new SnapshotCache(storage);

    expect(await cache.load('minimax-cn', 'last7')).toEqual({
      providerId: 'minimax-cn',
      fetchedAt: '2026-11-16T00:00:00.000Z',
      capabilities: {},
    });
  });

  it('keeps a MiniMax plan cached under the current count rule', async () => {
    const storage = new Map<string, unknown>();
    const cache = new SnapshotCache(storage);
    await cache.save(
      {
        providerId: 'minimax-cn',
        fetchedAt: '2026-11-16T00:00:00.000Z',
        capabilities: {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: '2026-11-16T00:00:00.000Z',
            data: {
              windows: [
                {
                  window: 'fiveHour',
                  remainingPercent: 90,
                  remainingPercentSource: 'field',
                  resetAt: null,
                  unlimited: false,
                },
              ],
              models: [
                {
                  model: 'video',
                  total: 3,
                  remaining: 3,
                  used: 0,
                  remainingPercent: 100,
                  resetAt: null,
                },
              ],
            },
          },
        },
      },
      'last7',
    );

    const loaded = await cache.load('minimax-cn', 'last7');
    expect(loaded?.capabilities['minimax.plan']).toBeDefined();
  });

  it('strips credential fields before persisting a snapshot', async () => {
    const storage = new Map<string, unknown>();
    const cache = new SnapshotCache(storage);
    await cache.save(
      {
        ...snapshot,
        capabilities: {
          'deepseek.balance': {
            kind: 'ok',
            fetchedAt: '2026-11-16T00:00:00.000Z',
            data: {
              cny: 12,
              apiKey: 'sk-test-secret',
              access_token: 'at-secret',
              csrf_token: 'csrf-secret',
              nested: { Cookie: 'session=secret', safe: 'kept' },
            },
          },
        },
      },
      'last7',
    );
    const persisted = JSON.stringify([...storage.entries()]);
    expect(persisted).not.toMatch(/sk-test-secret|session=secret|at-secret|csrf-secret/);
    expect(persisted).toContain('kept');
  });

  it('returns undefined when the stored payload is not a snapshot', async () => {
    const storage = new Map<string, unknown>([['quotaDeck.snapshot.deepseek.last7', { garbage: true }]]);
    const cache = new SnapshotCache(storage);
    expect(await cache.load('deepseek', 'last7')).toBeUndefined();
  });

  it('waits for the storage write to finish before resolving', async () => {
    let persisted = false;
    const cache = new SnapshotCache({
      get: () => undefined,
      set: () => {
        persisted = true;
      },
    });
    await cache.save(snapshot, 'last7');
    expect(persisted).toBe(true);
  });

  it('propagates a storage failure to the caller', async () => {
    const cache = new SnapshotCache({
      get: () => undefined,
      set: () => {
        throw new Error('storage full');
      },
    });
    await expect(cache.save(snapshot, 'last7')).rejects.toThrow(/storage full/);
  });
});
