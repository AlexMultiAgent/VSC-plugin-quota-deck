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
  it('declares the four DeepSeek capabilities', () => {
    const provider = new DeepSeekProvider(httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const ids = provider.getCapabilities().capabilities.map((capability) => capability.id);
    expect(ids).toEqual(['deepseek.balance', 'deepseek.usageAmount', 'deepseek.usageCost', 'deepseek.accountSummary']);
  });

  it('is not configured without an api key', async () => {
    const provider = new DeepSeekProvider(httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    expect((await provider.connect(secretReader({}))).kind).toBe('not-configured');
  });

  it('is partial with only an api key and marks the usage capabilities as missing', async () => {
    const provider = new DeepSeekProvider(httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const connection = await provider.connect(secretReader({ 'deepseek:api-key': 'sk-test' }));
    expect(connection.kind).toBe('partial');
  });

  it('resolves the balance capability even without a session', async () => {
    const provider = new DeepSeekProvider(httpClient({ ok: false, error: { kind: 'auth', message: 'error.auth' } }));
    await provider.connect(secretReader({ 'deepseek:api-key': 'sk-test' }));
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    expect(snapshot.capabilities['deepseek.balance']?.kind).toBe('failed');
    expect(snapshot.capabilities['deepseek.usageAmount']?.kind).toBe('unconfigured');
  });

  it('never throws when a single capability fails', async () => {
    const provider = new DeepSeekProvider(httpClient({ ok: false, error: { kind: 'network', message: 'error.network' } }));
    await expect(provider.fetchSnapshot(new AbortController().signal)).resolves.toBeDefined();
  });
});
