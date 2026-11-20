import { describe, expect, it } from 'vitest';
import { buildProviders, MINIMAX_CN_ORIGIN, MINIMAX_GLOBAL_ORIGIN } from './registry';
import type { MiniMaxProvider } from './minimax/provider';
import type { QwenProvider } from './qwen/provider';
import type { HttpClient } from '../core/http';

describe('buildProviders', () => {
  it('builds one instance per provider id', () => {
    const providers = buildProviders({} as HttpClient);
    expect(providers.map((provider) => provider.id)).toEqual([
      'minimax-cn',
      'minimax-global',
      'deepseek',
      'qwen',
    ]);
  });

  it('gives the two MiniMax instances different origins', () => {
    const providers = buildProviders({} as HttpClient);
    const origins = providers
      .slice(0, 2)
      .map((provider) => (provider as MiniMaxProvider).origin);
    expect(origins[0]).not.toBe(origins[1]);
    expect(origins[0]).toBe(MINIMAX_CN_ORIGIN);
    expect(origins[1]).toBe(MINIMAX_GLOBAL_ORIGIN);
  });

  it('gives every provider a distinct id', () => {
    const providers = buildProviders({} as HttpClient);
    expect(new Set(providers.map((provider) => provider.id)).size).toBe(providers.length);
  });

  it('gives Qwen the CLI and data origins', () => {
    const providers = buildProviders({} as HttpClient);
    const qwen = providers.find((provider) => provider.id === 'qwen') as QwenProvider;
    expect(qwen.origins.cli).toBe('https://cli.qianwenai.com');
    expect(qwen.origins.data).toBe('https://cs-data.qianwenai.com');
  });
});
