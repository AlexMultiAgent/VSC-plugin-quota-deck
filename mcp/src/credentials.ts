import type { CredentialKind, ProviderId, SecretReader } from '../../src/core/types';
import { CREDENTIAL_ENV } from '../../src/providers/endpoints';

/**
 * The MCP server reads credentials from the environment only. It never touches
 * VS Code Secret Storage and never logs a value it reads.
 */
const ENV_KEYS: Record<ProviderId, Partial<Record<CredentialKind, string>>> = {
  'minimax-cn': { 'token-plan-key': CREDENTIAL_ENV['minimax-cn'].tokenPlanEnv },
  'minimax-global': { 'token-plan-key': CREDENTIAL_ENV['minimax-global'].tokenPlanEnv },
  deepseek: { 'api-key': CREDENTIAL_ENV.deepseek.apiKeyEnv },
  qwen: { 'management-token': 'QWEN_MANAGEMENT_TOKEN' },
};

/** The environment variables that can configure a provider, for messages. */
export function credentialEnvNames(providerId: ProviderId): string[] {
  return Object.values(ENV_KEYS[providerId]).filter(
    (name): name is string => typeof name === 'string',
  );
}

export function envSecretReader(env: NodeJS.ProcessEnv = process.env): SecretReader {
  return {
    async read(providerId: ProviderId, credential: CredentialKind): Promise<string | undefined> {
      const name = ENV_KEYS[providerId][credential];
      if (name === undefined) return undefined;
      const value = env[name];
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    },
  };
}
