import { describe, expect, it, vi } from 'vitest';
import { MiniMaxProvider } from './provider';
import type { HttpClient, JsonResult } from '../../core/http';
import type { SecretReader } from '../../core/types';

function secretReader(values: Record<string, string>): SecretReader {
  return { read: async (providerId, credential) => values[`${providerId}:${credential}`] };
}

function httpClient(result: JsonResult): HttpClient {
  return { getJson: vi.fn().mockResolvedValue(result) } as unknown as HttpClient;
}

describe('MiniMaxProvider', () => {
  it('declares the four MiniMax capabilities', () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const ids = provider.getCapabilities().capabilities.map((capability) => capability.id);
    expect(ids).toEqual(['minimax.plan', 'minimax.subscription', 'minimax.tokenUsage', 'minimax.points']);
  });

  it('marks the plan capability required and the points capability optional', () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const byId = new Map(provider.getCapabilities().capabilities.map((c) => [c.id, c] as const));
    expect(byId.get('minimax.plan')?.required).toBe(true);
    expect(byId.get('minimax.points')?.required).toBe(false);
  });

  it('reports not-configured when no token plan key is stored', async () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const connection = await provider.connect(secretReader({}));
    expect(connection.kind).toBe('not-configured');
  });

  it('reports partial when only the optional web cookie is missing', async () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const connection = await provider.connect(secretReader({ 'minimax-cn:token-plan-key': 'token' }));
    expect(connection.kind).toBe('partial');
  });

  it('resolves the points capability to unconfigured when the cookie is absent', async () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    await provider.connect(secretReader({ 'minimax-cn:token-plan-key': 'token' }));
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    expect(snapshot.capabilities['minimax.points']?.kind).toBe('unconfigured');
  });

  it('never reports an unavailable capability as a zero percentage', async () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'auth', message: 'error.auth' } }));
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    for (const state of Object.values(snapshot.capabilities)) {
      if (state.kind !== 'ok') continue;
      expect(JSON.stringify(state.data)).not.toContain('"remainingPercent":0');
    }
  });
});
