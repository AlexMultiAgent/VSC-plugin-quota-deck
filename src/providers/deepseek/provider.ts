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
import { SHANGHAI, type RangeId } from '../../core/time';
import { ENDPOINTS, ORIGINS } from '../endpoints';
import { readDeepSeekBalance } from './shape';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'deepseek.balance', titleKey: 'capability.deepseek.balance', credential: 'api-key', required: true },
];

export class DeepSeekProvider implements QuotaProvider {
  readonly id = 'deepseek' as const;
  readonly displayName = 'DeepSeek';
  private apiKey: string | undefined;

  constructor(private readonly http: HttpClient) {}

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(secrets: SecretReader): Promise<ConnectionState> {
    this.apiKey = await secrets.read(this.id, 'api-key');

    if (this.apiKey === undefined) return { kind: 'not-configured' };
    return { kind: 'ready', capabilities: CAPABILITIES.map((capability) => capability.id) };
  }

  async fetchSnapshot(
    signal: AbortSignal,
    range: RangeId = 'last7',
    timeZone: string = SHANGHAI,
  ): Promise<ProviderSnapshot> {
    const fetchedAt = new Date().toISOString();
    const capabilities: Record<string, CapabilityState> = {};
    capabilities['deepseek.balance'] = await this.fetchBalance(fetchedAt, signal);

    return { providerId: this.id, fetchedAt, capabilities };
  }

  dispose(): void {
    this.apiKey = undefined;
  }

  private async fetchBalance(fetchedAt: string, signal: AbortSignal): Promise<CapabilityState> {
    if (this.apiKey === undefined) return { kind: 'unconfigured', reason: 'missing api key' };
    const result = await this.http.getJson(`${ORIGINS['deepseek-api']}${ENDPOINTS['deepseek.balance']}`, {
      bearer: this.apiKey,
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    try {
      return { kind: 'ok', fetchedAt, data: readDeepSeekBalance(result.body) };
    } catch {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }

}
