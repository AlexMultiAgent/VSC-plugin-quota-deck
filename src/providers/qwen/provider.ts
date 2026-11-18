import { randomUUID } from 'node:crypto';
import type { HttpClient } from '../../core/http';
import type {
  CapabilityDescriptor,
  CapabilityState,
  ConnectionState,
  ProviderCapabilities,
  ProviderSnapshot,
  QuotaProvider,
  SecretReader,
} from '../../core/types';
import { readQwenAccountBalance } from './shape';
import { signAliyunRequest } from './request';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'qwen.accountBalance', titleKey: 'capability.qwen.accountBalance', credential: 'access-key-id', required: true },
  { id: 'qwen.modelQuota', titleKey: 'capability.qwen.modelQuota', credential: 'access-key-id', required: false },
  { id: 'qwen.consumption', titleKey: 'capability.qwen.consumption', credential: 'access-key-id', required: false },
];

export class QwenProvider implements QuotaProvider {
  readonly id = 'qwen' as const;
  readonly displayName = 'Qwen';
  private accessKeyId: string | undefined;
  private accessKeySecret: string | undefined;

  constructor(
    readonly origin: string,
    private readonly http: HttpClient,
  ) {}

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(secrets: SecretReader): Promise<ConnectionState> {
    this.accessKeyId = await secrets.read(this.id, 'access-key-id');
    this.accessKeySecret = await secrets.read(this.id, 'access-key-secret');

    if (this.accessKeyId === undefined && this.accessKeySecret === undefined) {
      return { kind: 'not-configured' };
    }
    if (this.accessKeyId === undefined || this.accessKeySecret === undefined) {
      return {
        kind: 'partial',
        capabilities: [],
        missing: [{
          capability: 'qwen.accountBalance',
          credential: this.accessKeyId === undefined ? 'access-key-id' : 'access-key-secret',
        }],
      };
    }
    return {
      kind: 'ready',
      capabilities: CAPABILITIES.map((capability) => capability.id),
    };
  }

  async fetchSnapshot(signal: AbortSignal): Promise<ProviderSnapshot> {
    const fetchedAt = new Date().toISOString();
    const capabilities: Record<string, CapabilityState> = {};
    capabilities['qwen.accountBalance'] = await this.fetchBalance(fetchedAt, signal);
    capabilities['qwen.modelQuota'] = {
      kind: 'unsupported',
      reason: 'no public API for free or model quota remaining',
    };
    capabilities['qwen.consumption'] = {
      kind: 'unsupported',
      reason: 'consumption detail is not available from the balance API',
    };
    return { providerId: this.id, fetchedAt, capabilities };
  }

  dispose(): void {
    this.accessKeyId = undefined;
    this.accessKeySecret = undefined;
  }

  private async fetchBalance(
    fetchedAt: string,
    signal: AbortSignal,
  ): Promise<CapabilityState> {
    if (this.accessKeyId === undefined || this.accessKeySecret === undefined) {
      return { kind: 'unconfigured', reason: 'missing Alibaba Cloud AccessKey' };
    }

    const headers = signAliyunRequest({
      method: 'POST',
      pathname: '/',
      query: {},
      headers: {
        host: new URL(this.origin).host,
        'content-type': 'application/json',
        'x-acs-action': 'QueryAccountBalance',
        'x-acs-date': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        'x-acs-signature-nonce': randomUUID(),
        'x-acs-version': '2017-12-14',
      },
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
    });
    const result = await this.http.postJson(`${this.origin}/`, undefined, {
      headers,
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    try {
      return { kind: 'ok', fetchedAt, data: readQwenAccountBalance(result.body) };
    } catch {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }
}
