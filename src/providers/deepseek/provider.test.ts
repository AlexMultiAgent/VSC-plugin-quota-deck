import { describe, expect, it, vi } from 'vitest';
import { DeepSeekProvider } from './provider';
import type { HttpClient, JsonResult } from '../../core/http';
import type { SecretReader } from '../../core/types';

function secretReader(values: Record<string, string>): SecretReader {
  return { read: async (providerId, credential) => values[`${providerId}:${credential}`] };
}

function httpClient(result: JsonResult): HttpClient {
  return { getJson: vi.fn().mockResolvedValue(result) } as unknown as HttpClient;
}

describe('DeepSeekProvider', () => {
  it('declares only the DeepSeek account balance capability', () => {
    const provider = new DeepSeekProvider(httpClient({
      ok: false,
      error: { kind: 'unknown', message: 'error.unknown' },
    }));
    const ids = provider.getCapabilities().capabilities.map((capability) => capability.id);
    expect(ids).toEqual(['deepseek.balance']);
  });

  it('is not configured without an api key', async () => {
    const provider = new DeepSeekProvider(httpClient({
      ok: false,
      error: { kind: 'unknown', message: 'error.unknown' },
    }));
    expect((await provider.connect(secretReader({}))).kind).toBe('not-configured');
  });

  it('is ready with only an api key', async () => {
    const provider = new DeepSeekProvider(httpClient({
      ok: false,
      error: { kind: 'unknown', message: 'error.unknown' },
    }));
    const connection = await provider.connect(secretReader({ 'deepseek:api-key': 'sk-test' }));
    expect(connection).toEqual({ kind: 'ready', capabilities: ['deepseek.balance'] });
  });

  it('queries only the public balance endpoint', async () => {
    const urls: string[] = [];
    const http = {
      getJson: vi.fn(async (url: string) => {
        urls.push(url);
        return {
          ok: true,
          body: {
            is_available: true,
            balance_infos: [
              { currency: 'CNY', total_balance: '10', granted_balance: '10', topped_up_balance: '0' },
            ],
          },
        };
      }),
    } as unknown as HttpClient;
    const provider = new DeepSeekProvider(http);
    await provider.connect(secretReader({ 'deepseek:api-key': 'sk-test' }));
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);

    expect(urls).toEqual(['https://api.deepseek.com/user/balance']);
    expect(Object.keys(snapshot.capabilities)).toEqual(['deepseek.balance']);
  });

  it('never reads platform session credentials', async () => {
    const provider = new DeepSeekProvider(httpClient({
      ok: false,
      error: { kind: 'auth', message: 'error.auth' },
    }));
    const read = vi.fn(async (providerId: string, credential: string) =>
      providerId === 'deepseek' && credential === 'api-key' ? 'sk-test' : undefined,
    );
    const connection = await provider.connect({ read });

    expect(connection.kind).toBe('ready');
    expect(read.mock.calls).toEqual([['deepseek', 'api-key']]);
  });

  it('never throws when the balance request fails', async () => {
    const provider = new DeepSeekProvider(httpClient({
      ok: false,
      error: { kind: 'network', message: 'error.network' },
    }));
    await provider.connect(secretReader({ 'deepseek:api-key': 'sk-test' }));
    await expect(provider.fetchSnapshot(new AbortController().signal)).resolves.toBeDefined();
  });

  it('reports a drifted balance payload as malformed rather than throwing', async () => {
    const provider = new DeepSeekProvider(httpClient({
      ok: true,
      body: { data: {} },
    }));
    await provider.connect(secretReader({ 'deepseek:api-key': 'sk-test' }));
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    expect(snapshot.capabilities['deepseek.balance']).toMatchObject({
      kind: 'failed',
      error: { kind: 'malformed' },
    });
  });
});
