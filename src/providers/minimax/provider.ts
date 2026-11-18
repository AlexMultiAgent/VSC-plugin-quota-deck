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
import { parseCookieHeader, selectAllowedCookies } from '../cookies';
import { ENDPOINTS } from '../endpoints';
import { numberOrNull } from '../shape';
import {
  readMiniMaxPlan,
  readMiniMaxPoints,
  readMiniMaxSubscription,
  readMiniMaxTokenUsage,
} from './shape';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'minimax.plan', titleKey: 'capability.minimax.plan', credential: 'token-plan-key', required: true },
  { id: 'minimax.subscription', titleKey: 'capability.minimax.subscription', credential: 'token-plan-key', required: true },
  { id: 'minimax.tokenUsage', titleKey: 'capability.minimax.tokenUsage', credential: 'token-plan-key', required: true },
  { id: 'minimax.points', titleKey: 'capability.minimax.points', credential: 'web-cookie', required: false },
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

/**
 * MiniMax's account UI uses a cookie-authenticated points endpoint. These names
 * are a narrow compatibility set; unlisted cookies are never forwarded.
 */
const POINTS_COOKIE_NAMES: readonly string[] = [
  'sessionId',
  'sessionid',
  'token',
  'minimax_token',
  '_token',
  'csrf_token',
  '_csrf',
  'jwt',
];

export class MiniMaxProvider implements QuotaProvider {
  private tokenPlanKey: string | undefined;
  private webCookie: string | undefined;

  constructor(
    readonly id: Extract<ProviderId, 'minimax-cn' | 'minimax-global'>,
    readonly origin: string,
    private readonly http: HttpClient,
  ) {}

  get displayName(): string {
    return this.id === 'minimax-cn' ? 'MiniMax CN' : 'MiniMax Global';
  }

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(secrets: SecretReader): Promise<ConnectionState> {
    this.tokenPlanKey = await secrets.read(this.id, 'token-plan-key');
    this.webCookie = await secrets.read(this.id, 'web-cookie');

    if (this.tokenPlanKey === undefined) return { kind: 'not-configured' };
    if (this.webCookie === undefined) {
      return {
        kind: 'partial',
        capabilities: ['minimax.plan', 'minimax.subscription', 'minimax.tokenUsage'],
        missing: [{ capability: 'minimax.points', credential: 'web-cookie' }],
      };
    }
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
    capabilities['minimax.tokenUsage'] = await this.fetchSimple(
      'minimax.tokenUsage',
      ENDPOINTS['minimax.tokenUsage'],
      fetchedAt,
      signal,
      (body) => readMiniMaxTokenUsage(body, range, Date.now(), timeZone),
    );
    capabilities['minimax.points'] = await this.fetchPoints(fetchedAt, signal);

    return { providerId: this.id, fetchedAt, capabilities };
  }

  dispose(): void {
    this.tokenPlanKey = undefined;
    this.webCookie = undefined;
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

  private async fetchPoints(fetchedAt: string, signal: AbortSignal): Promise<CapabilityState> {
    if (this.webCookie === undefined) return { kind: 'unconfigured', reason: 'missing web session cookie' };
    const selection = selectAllowedCookies(parseCookieHeader(this.webCookie), POINTS_COOKIE_NAMES);
    if (selection.missing.length === POINTS_COOKIE_NAMES.length) {
      return { kind: 'unconfigured', reason: 'no allow-listed session cookie' };
    }
    const result = await this.http.getJson(`${this.origin}${ENDPOINTS['minimax.points']}`, {
      headers: { Cookie: selection.header },
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    const rejection = credentialRejection(result.body);
    if (rejection !== undefined) return { kind: 'failed', error: rejection };
    try {
      return { kind: 'ok', fetchedAt, data: readMiniMaxPoints(result.body) };
    } catch {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }
}
