import type { MessageKey } from '../localization/messages';
import type { RangeId } from './time';

export const PROVIDER_IDS = ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export const CREDENTIAL_KINDS = ['token-plan-key', 'api-key', 'session-token', 'web-cookie'] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export type CapabilityId = string;

export type NormalizedErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'timeout'
  | 'network'
  | 'malformed'
  | 'unknown';

export interface NormalizedError {
  readonly kind: NormalizedErrorKind;
  readonly message: MessageKey;
  readonly status?: number;
  readonly retryAfterMs?: number;
}

export type CapabilityState =
  | { readonly kind: 'ok'; readonly fetchedAt: string; readonly data: unknown }
  | { readonly kind: 'stale'; readonly fetchedAt: string; readonly data: unknown; readonly reason: string }
  | { readonly kind: 'unconfigured'; readonly reason: string }
  | { readonly kind: 'unsupported'; readonly reason: string }
  | {
      readonly kind: 'failed';
      readonly error: NormalizedError;
      readonly lastGood?: { readonly fetchedAt: string; readonly data: unknown };
    };

export interface ProviderSnapshot {
  readonly providerId: ProviderId;
  readonly fetchedAt: string;
  readonly capabilities: Readonly<Record<CapabilityId, CapabilityState>>;
}

export interface CapabilityDescriptor {
  readonly id: CapabilityId;
  readonly titleKey: MessageKey;
  readonly credential: CredentialKind;
  readonly required: boolean;
}

export interface ProviderCapabilities {
  readonly capabilities: readonly CapabilityDescriptor[];
}

export type ConnectionState =
  | { readonly kind: 'ready'; readonly capabilities: CapabilityId[] }
  | {
      readonly kind: 'partial';
      readonly capabilities: CapabilityId[];
      readonly missing: { readonly capability: CapabilityId; readonly credential: CredentialKind }[];
    }
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'error'; readonly error: NormalizedError };

export interface SecretReader {
  read(providerId: ProviderId, credential: CredentialKind): Promise<string | undefined>;
}

export interface QuotaProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  getCapabilities(): ProviderCapabilities;
  connect(secrets: SecretReader): Promise<ConnectionState>;
  fetchSnapshot(signal: AbortSignal, range?: RangeId): Promise<ProviderSnapshot>;
  dispose(): void;
}
