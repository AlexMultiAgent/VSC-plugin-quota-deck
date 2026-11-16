import { describe, expect, it } from 'vitest';
import { sanitizeValue } from './sanitize.mjs';

describe('sanitizeValue', () => {
  it('replaces the value of a declared sensitive key', () => {
    const result = sanitizeValue({ token: 'abc123', plan: 'ok' }, ['token']);
    expect(result).toEqual({ token: '<redacted>', plan: 'ok' });
  });

  it('replaces a sk- prefixed value even when the key is not declared', () => {
    const result = sanitizeValue({ header: 'sk-abcdef0123456789abcdef' }, []);
    expect(result).toEqual({ header: '<redacted>' });
  });

  it('replaces a long hex string', () => {
    const result = sanitizeValue({ id: 'a'.repeat(40) }, []);
    expect(result).toEqual({ id: '<redacted>' });
  });

  it('leaves ordinary identifiers alone', () => {
    const result = sanitizeValue({ model: 'MiniMax-M2', count: 42 }, []);
    expect(result).toEqual({ model: 'MiniMax-M2', count: 42 });
  });

  it('walks into nested objects and arrays', () => {
    const result = sanitizeValue({ list: [{ token: 'abc' }, { ok: 1 }] }, ['token']);
    expect(result).toEqual({ list: [{ token: '<redacted>' }, { ok: 1 }] });
  });
});
