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
    expect(await cache.load('deepseek')).toBeUndefined();
  });

  it('round-trips a snapshot through the storage backend', async () => {
    const storage = new Map<string, unknown>();
    const cache = new SnapshotCache(storage);
    await cache.save(snapshot);
    expect(await cache.load('deepseek')).toEqual(snapshot);
  });

  it('strips credential fields before persisting a snapshot', async () => {
    const storage = new Map<string, unknown>();
    const cache = new SnapshotCache(storage);
    await cache.save({
      ...snapshot,
      capabilities: {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: {
            cny: 12,
            apiKey: 'sk-test-secret',
            nested: { Cookie: 'session=secret', safe: 'kept' },
          },
        },
      },
    });
    const persisted = JSON.stringify([...storage.entries()]);
    expect(persisted).not.toMatch(/sk-test-secret|session=secret/);
    expect(persisted).toContain('kept');
  });

  it('returns undefined when the stored payload is not a snapshot', async () => {
    const storage = new Map<string, unknown>([['quotaDeck.snapshot.deepseek', { garbage: true }]]);
    const cache = new SnapshotCache(storage);
    expect(await cache.load('deepseek')).toBeUndefined();
  });
});
