import type { CredentialKind, ProviderId, SecretReader } from './types';

const KEY_PREFIX = 'quotaDeck';

const CREDENTIAL_PART: Record<CredentialKind, string> = {
  'token-plan-key': 'tokenPlan',
  'api-key': 'apiKey',
  'session-token': 'sessionToken',
  'web-cookie': 'webCookie',
};

function secretKey(providerId: ProviderId, credential: CredentialKind): string {
  const providerPart =
    providerId === 'minimax-cn' || providerId === 'minimax-global'
      ? `minimax.${providerId === 'minimax-cn' ? 'cn' : 'global'}`
      : providerId;
  return `${KEY_PREFIX}.${providerPart}.${CREDENTIAL_PART[credential]}`;
}

export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export class SecretStore implements SecretReader {
  constructor(private readonly storage: SecretStorageLike) {}

  read(providerId: ProviderId, credential: CredentialKind): Promise<string | undefined> {
    return Promise.resolve(this.storage.get(secretKey(providerId, credential))).then((value) =>
      value === '' ? undefined : value,
    );
  }

  write(providerId: ProviderId, credential: CredentialKind, value: string): Promise<void> {
    return Promise.resolve(this.storage.store(secretKey(providerId, credential), value));
  }

  delete(providerId: ProviderId, credential: CredentialKind): Promise<void> {
    return Promise.resolve(this.storage.delete(secretKey(providerId, credential)));
  }
}
