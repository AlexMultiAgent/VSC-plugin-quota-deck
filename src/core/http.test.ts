import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from './http';
import type { JsonResult } from './http';
import type { NormalizedError } from './types';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: new Map(Object.entries(init.headers ?? {})),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function failure(result: JsonResult): NormalizedError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected the request to fail');
  return result.error;
}

describe('HttpClient', () => {
  it('returns the parsed body on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' }));
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(result).toEqual({ ok: true, body: { hello: 'world' } });
  });

  it('sends the bearer token when one is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    globalThis.fetch = fetchMock;
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });
    await client.getJson('https://api.example.com/v1/thing', { bearer: 'sk-test' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('reports a non-2xx status as an error result', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({}, { status: 401 }));
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(failure(result).kind).toBe('auth');
  });

  it('reads Retry-After into the error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({}, { status: 429, headers: { 'Retry-After': '30' } }),
    );
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(failure(result).kind).toBe('rate-limit');
    expect(failure(result).retryAfterMs).toBe(30_000);
  });

  it('times out a request that exceeds the timeout', async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const client = new HttpClient({ timeoutMs: 20, maxAttempts: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(failure(result).kind).toBe('timeout');
  });

  it('retries a transient network failure with a backoff', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock;
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 2, backoffBaseMs: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry an authentication failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, { status: 401 }));
    globalThis.fetch = fetchMock;
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 3, backoffBaseMs: 1 });
    await client.getJson('https://api.example.com/v1/thing');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not issue a request when the caller signal is already aborted', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 3, backoffBaseMs: 1 });
    const controller = new AbortController();
    controller.abort();
    const result = await client.getJson('https://api.example.com/v1/thing', { signal: controller.signal });
    expect(failure(result).kind).toBe('timeout');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry after the caller aborts the request', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    globalThis.fetch = fetchMock;
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 3, backoffBaseMs: 1 });
    const controller = new AbortController();
    const pending = client.getJson('https://api.example.com/v1/thing', { signal: controller.signal });
    controller.abort();
    const result = await pending;
    expect(failure(result).kind).toBe('timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports invalid JSON as a malformed error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      text: () => Promise.resolve('<html>not json</html>'),
    } as unknown as Response);
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(failure(result).kind).toBe('malformed');
  });
});
