import { describe, expect, it } from 'vitest';
import { PROVIDER_IDS, isProviderId } from './types';

describe('provider ids', () => {
  it('enumerates exactly the four providers', () => {
    expect(PROVIDER_IDS).toEqual(['minimax-cn', 'minimax-global', 'deepseek', 'qwen']);
  });

  it('narrows unknown ids', () => {
    expect(isProviderId('deepseek')).toBe(true);
    expect(isProviderId('kimi')).toBe(false);
  });
});
