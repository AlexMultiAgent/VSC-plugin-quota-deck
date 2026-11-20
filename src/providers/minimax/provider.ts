import type { HttpClient } from '../../core/http';
import { SHANGHAI, type RangeId } from '../../core/time';
import type {
  CapabilityDescriptor,
  CapabilityState,
  ConnectionState,
  NormalizedError,
  ProviderCapabilities,
  ProviderId,
  ProviderSnapshot,
  QuotaProvider,
  SecretReader,
} from '../../core/types';
import { ENDPOINTS } from '../endpoints';
import { numberOrNull } from '../shape';
import {
  readMiniMaxAccountBalance,
  readMiniMaxPlan,
  readMiniMaxSubscription,
  readMiniMaxTokenUsage,
} from './shape';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'minimax.plan', titleKey: 'capability.minimax.plan', credential: 'token-plan-key', required: true },
  { id: 'minimax.subscription', titleKey: 'capability.minimax.subscription', credential: 'token-plan-key', required: true },
  { id: 'minimax.tokenUsage', titleKey: 'capability.minimax.tokenUsage', credential: 'token-plan-key', required: true },
  { id: 'minimax.accountBalance', titleKey: 'capability.minimax.accountBalance', credential: 'token-plan-key', required: true },
];

/**
 * MiniMax answers HTTP 200 even when it rejects the credential and reports the
 * refusal in `base_resp.status_code` instead — an invalid key comes back as
 * `1004 cookie is missing, log in again`. Without this check a rejected
 * credential looks like an unexpected response shape.
 */
function credentialRejection(body: unknown): NormalizedError | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const baseResp = (body as { base_resp?: unknown }).base_resp;
  if (typeof baseResp !== 'object' || baseResp === null) return undefined;
  const statusCode = numberOrNull((baseResp as { status_code?: unknown }).status_code);
  if (statusCode === null || statusCode === 0) return undefined;
  return { kind: 'auth', message: 'error.auth' };
}

export class MiniMaxProvider implements QuotaProvider {
  private tokenPlanKey: string | undefined;

  constructor(
    readonly id: Extract<ProviderId, 'minimax-cn' | 'minimax-global'>,
    readonly origin: string,
    private readonly http: HttpClient,
  ) {}

  get displayName(): string {
    return this.id === 'minimax-cn' ? 'MiniMax CN' : 'MiniMax Global';
  }

  /** `/account/query_balance` carries no currency field. */
  private get currency(): string {
    return this.id === 'minimax-cn' ? 'CNY' : 'USD';
  }

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(secrets: SecretReader): Promise<ConnectionState> {
    this.tokenPlanKey = await secrets.read(this.id, 'token-plan-key');

    if (this.tokenPlanKey === undefined) return { kind: 'not-configured' };
    return { kind: 'ready', capabilities: CAPABILITIES.map((capability) => capability.id) };
  }

  async fetchSnapshot(
    signal: AbortSignal,
    range: RangeId = 'last7',
    timeZone: string = SHANGHAI,
  ): Promise<ProviderSnapshot> {
    const fetchedAt = new Date().toISOString();
    const capabilities: Record<string, CapabilityState> = {};

    capabilities['minimax.plan'] = await this.fetchPlan(fetchedAt, signal);
    capabilities['minimax.subscription'] = await this.fetchSimple(
      'minimax.subscription',
      ENDPOINTS['minimax.subscription'],
      fetchedAt,
      signal,
      readMiniMaxSubscription,
    );
    capabilities['minimax.tokenUsage'] = await this.fetchTokenUsage(
      fetchedAt,
      range,
      timeZone,
      signal,
    );
    capabilities['minimax.accountBalance'] = await this.fetchSimple(
      'minimax.accountBalance',
      ENDPOINTS['minimax.accountBalance'],
      fetchedAt,
      signal,
      (body) => readMiniMaxAccountBalance(body, this.currency),
    );

    return { providerId: this.id, fetchedAt, capabilities };
  }

  dispose(): void {
    this.tokenPlanKey = undefined;
  }

  private async fetchPlan(fetchedAt: string, signal: AbortSignal): Promise<CapabilityState> {
    if (this.tokenPlanKey === undefined) return { kind: 'unconfigured', reason: 'missing token plan key' };
    const result = await this.http.getJson(`${this.origin}${ENDPOINTS['minimax.plan']}`, {
      bearer: this.tokenPlanKey,
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    const rejection = credentialRejection(result.body);
    if (rejection !== undefined) return { kind: 'failed', error: rejection };
    try {
      return { kind: 'ok', fetchedAt, data: readMiniMaxPlan(result.body) };
    } catch {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }

  private async fetchSimple(
    capabilityId: string,
    path: string,
    fetchedAt: string,
    signal: AbortSignal,
    read: (response: unknown) => unknown,
  ): Promise<CapabilityState> {
    if (this.tokenPlanKey === undefined) return { kind: 'unconfigured', reason: 'missing token plan key' };
    const result = await this.http.getJson(`${this.origin}${path}`, {
      bearer: this.tokenPlanKey,
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    const rejection = credentialRejection(result.body);
    if (rejection !== undefined) return { kind: 'failed', error: rejection };
    try {
      return { kind: 'ok', fetchedAt, data: read(result.body) };
    } catch {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }

  private async fetchTokenUsage(
    fetchedAt: string,
    range: RangeId,
    timeZone: string,
    signal: AbortSignal,
  ): Promise<CapabilityState> {
    if (this.tokenPlanKey === undefined) {
      return { kind: 'unconfigured', reason: 'missing token plan key' };
    }

    const now = Date.now();
    const records: unknown[] = [];
    let firstBody: Record<string, unknown> | undefined;
    let totalCount: number | null = null;
    let page = 1;

    while (totalCount === null || records.length < totalCount) {
      const url = new URL(`${this.origin}${ENDPOINTS['minimax.tokenUsage']}`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', '100');
      const result = await this.http.getJson(url.toString(), {
        bearer: this.tokenPlanKey,
        signal,
      });
      if (!result.ok) return { kind: 'failed', error: result.error };
      const rejection = credentialRejection(result.body);
      if (rejection !== undefined) return { kind: 'failed', error: rejection };
      if (typeof result.body !== 'object' || result.body === null) {
        return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
      }

      const body = result.body as Record<string, unknown>;
      firstBody ??= body;
      const pageRecords = Array.isArray(body.charge_records) ? body.charge_records : [];
      records.push(...pageRecords);
      totalCount = numberOrNull(body.total_cnt);
      if (pageRecords.length < 100) break;
      if (totalCount === null && pageRecords.length === 0) break;
      page += 1;
    }

    try {
      return {
        kind: 'ok',
        fetchedAt,
        data: readMiniMaxTokenUsage(
          { ...firstBody, charge_records: records },
          range,
          now,
          timeZone,
          this.currency,
        ),
      };
    } catch {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }
}
