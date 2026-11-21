import { describe, expect, it } from 'vitest';
import { credentialEnvNames, envSecretReader } from './credentials';

describe('envSecretReader', () => {
  it('maps each provider credential to its documented environment variable', async () => {
    const reader = envSecretReader({
      MINIMAX_CN_TOKEN_PLAN: 'cn-key',
      MINIMAX_GLOBAL_TOKEN_PLAN: 'global-key',
      DEEPSEEK_API_KEY: 'ds-key',
      QWEN_MANAGEMENT_TOKEN: '{"accessToken":"qwen-token","expiresAt":""}',
    });

    expect(await reader.read('minimax-cn', 'token-plan-key')).toBe('cn-key');
    expect(await reader.read('minimax-global', 'token-plan-key')).toBe('global-key');
    expect(await reader.read('deepseek', 'api-key')).toBe('ds-key');
    expect(await reader.read('qwen', 'management-token')).toContain('qwen-token');
  });

  it('treats missing, blank and unsupported credentials as unconfigured', async () => {
    const reader = envSecretReader({ DEEPSEEK_API_KEY: '   ' });

    expect(await reader.read('deepseek', 'api-key')).toBeUndefined();
    expect(await reader.read('minimax-cn', 'token-plan-key')).toBeUndefined();
    expect(await reader.read('qwen', 'web-cookie')).toBeUndefined();
  });

  it('names the environment variables for a missing-credential hint', () => {
    expect(credentialEnvNames('minimax-cn')).toContain('MINIMAX_CN_TOKEN_PLAN');
    expect(credentialEnvNames('minimax-global')).toContain('MINIMAX_GLOBAL_TOKEN_PLAN');
    expect(credentialEnvNames('deepseek')).toContain('DEEPSEEK_API_KEY');
    expect(credentialEnvNames('qwen')).toContain('QWEN_MANAGEMENT_TOKEN');
  });
});
