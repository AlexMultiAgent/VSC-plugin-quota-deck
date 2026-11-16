import { describe, expect, it } from 'vitest';
import { normalizeError } from './errors';

describe('normalizeError', () => {
  it('maps 401 to an auth error', () => {
    const error = normalizeError({ status: 401 });
    expect(error.kind).toBe('auth');
    expect(error.status).toBe(401);
  });

  it('maps 403 to an auth error', () => {
    expect(normalizeError({ status: 403 }).kind).toBe('auth');
  });

  it('maps 429 to a rate limit error with the retry delay', () => {
    const error = normalizeError({ status: 429, retryAfterMs: 30_000 });
    expect(error.kind).toBe('rate-limit');
    expect(error.retryAfterMs).toBe(30_000);
  });

  it('maps an abort to a timeout error', () => {
    expect(normalizeError({ name: 'AbortError' }).kind).toBe('timeout');
  });

  it('maps a fetch failure to a network error', () => {
    expect(normalizeError({ message: 'fetch failed' }).kind).toBe('network');
  });

  it('never carries the original message into the error', () => {
    const error = normalizeError({ message: 'cookie=secret-value rejected' });
    expect(JSON.stringify(error)).not.toContain('secret-value');
  });

  it('maps a 404 to an unknown error rather than a malformed one', () => {
    expect(normalizeError({ status: 404 }).kind).toBe('unknown');
  });

  it('maps a 500 to a network error', () => {
    expect(normalizeError({ status: 500 }).kind).toBe('network');
  });
});
