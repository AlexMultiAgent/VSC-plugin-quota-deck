import { describe, expect, it } from 'vitest';
import { findSecretLikeValues } from './guard-fixtures.mjs';

describe('findSecretLikeValues', () => {
  it('finds nothing in a clean payload', () => {
    expect(findSecretLikeValues({ model: 'MiniMax-M2', count: 12 })).toEqual([]);
  });

  it('finds an api key', () => {
    const found = findSecretLikeValues({ header: 'sk-abcdef0123456789abcdef' });
    expect(found).toHaveLength(1);
    expect(found[0]!.path).toBe('header');
  });

  it('finds a long hex token', () => {
    expect(findSecretLikeValues({ value: 'f'.repeat(48) })).toHaveLength(1);
  });

  it('finds a cookie header value', () => {
    expect(findSecretLikeValues({ Cookie: 'sessionId=abcdef0123456789' })).toHaveLength(1);
  });

  it('reports the path of a nested match', () => {
    const found = findSecretLikeValues({ list: [{ id: 'a'.repeat(40) }] });
    expect(found[0]!.path).toBe('list[0].id');
  });

  it('rejects non-zero financial values in a fixture', () => {
    const found = findSecretLikeValues({ balance_infos: [{ total_balance: '28.53' }] });
    expect(found).toHaveLength(1);
    expect(found[0]!.path).toBe('balance_infos[0].total_balance');
  });
});
