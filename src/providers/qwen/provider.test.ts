import { describe, expect, it, vi } from 'vitest';
import { QwenProvider } from './provider';

describe('QwenProvider', () => {
  it('declares the four reserved capabilities', () => {
    const provider = new QwenProvider();
    const ids = provider.getCapabilities().capabilities.map((capability) => capability.id);
    expect(ids).toEqual([
      'qwen.accountBalance',
      'qwen.modelQuota',
      'qwen.consumption',
      'qwen.accessKeyValidation',
    ]);
  });

  it('resolves every capability to unsupported', async () => {
    const provider = new QwenProvider();
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    for (const state of Object.values(snapshot.capabilities)) {
      expect(state.kind).toBe('unsupported');
    }
  });

  it('performs no network request', async () => {
    const fetchMock = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      await new QwenProvider().fetchSnapshot(new AbortController().signal);
    } finally {
      globalThis.fetch = original;
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows no metric at all', async () => {
    const provider = new QwenProvider();
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    for (const state of Object.values(snapshot.capabilities)) {
      expect(state).not.toHaveProperty('data');
    }
  });
});
