import type { HttpClient, JsonResult } from '../../core/http';
import type {
  CapabilityDescriptor,
  CapabilityState,
  ConnectionState,
  NormalizedError,
  ProviderCapabilities,
  ProviderSnapshot,
  QuotaProvider,
  SecretReader,
} from '../../core/types';
import { ENDPOINTS } from '../endpoints';
import {
  isManagementTokenExpired,
  parseQwenManagementToken,
  type QwenManagementToken,
} from './auth';
import {
  QwenConsoleAuthError,
  QwenConsoleForbiddenError,
  readQwenAccountBalance,
  readQwenConsoleToken,
  readQwenTokenPlan,
  readQwenTokenPlanSubscription,
} from './shape';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'qwen.accountBalance', titleKey: 'capability.qwen.accountBalance', credential: 'management-token', required: true },
  { id: 'qwen.tokenPlan', titleKey: 'capability.qwen.tokenPlan', credential: 'management-token', required: true },
  { id: 'qwen.tokenPlanSubscription', titleKey: 'capability.qwen.tokenPlanSubscription', credential: 'management-token', required: true },
];

export interface QwenOrigins {
  readonly cli: string;
  readonly data: string;
}

type ConsoleToken = { kind: 'ok'; token: string } | { kind: 'failed'; error: NormalizedError };
type TokenPlanEndpoint = 'qwen.tokenPlanUsage' | 'qwen.tokenPlanSubscription';

const CONSOLE_CORNERSTONE = {
  protocol: 'V2',
  console: 'ONE_CONSOLE',
  productCode: 'p_efm',
  switchUserType: 3,
  consoleSite: 'QIANWENAI',
} as const;

const FUND_BALANCE_BODY = {
  product: 'BssOpenAPI-V3',
  action: 'GetFundAccountAvailableAmount',
  region: 'cn-beijing',
  params: {},
} as const;

const CONSOLE_TOKEN_BODY = {
  product: 'ModelStudioRegional',
  action: 'GenerateCLIAccessToken',
  region: 'cn-beijing',
  params: {},
  version: '2026-02-10',
} as const;

export class QwenProvider implements QuotaProvider {
  readonly id = 'qwen' as const;
  readonly displayName = 'Qwen';
  private managementTokenValue: string | undefined;
  private consoleToken: Promise<ConsoleToken> | undefined;

  constructor(
    readonly origins: QwenOrigins,
    private readonly http: HttpClient,
  ) {}

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(secrets: SecretReader): Promise<ConnectionState> {
    this.managementTokenValue = await secrets.read(this.id, 'management-token');
    if (this.managementTokenValue === undefined) return { kind: 'not-configured' };
    return {
      kind: 'ready',
      capabilities: ['qwen.accountBalance', 'qwen.tokenPlan', 'qwen.tokenPlanSubscription'],
    };
  }

  async fetchSnapshot(signal: AbortSignal): Promise<ProviderSnapshot> {
    const fetchedAt = new Date().toISOString();
    const capabilities: Record<string, CapabilityState> = {};
    this.consoleToken = undefined;

    const management = parseQwenManagementToken(this.managementTokenValue);
    const unavailable = this.managementUnavailable(management);
    if (unavailable !== undefined) {
      capabilities['qwen.accountBalance'] = unavailable;
      capabilities['qwen.tokenPlan'] = unavailable;
      capabilities['qwen.tokenPlanSubscription'] = unavailable;
      return { providerId: this.id, fetchedAt, capabilities };
    }
    const token = management as QwenManagementToken;

    capabilities['qwen.accountBalance'] = await this.fetchBalance(token, fetchedAt, signal);
    capabilities['qwen.tokenPlan'] = await this.fetchTokenPlan(
      token,
      'qwen.tokenPlanUsage',
      {},
      readQwenTokenPlan,
      fetchedAt,
      signal,
    );
    capabilities['qwen.tokenPlanSubscription'] = await this.fetchTokenPlan(
      token,
      'qwen.tokenPlanSubscription',
      { commodityCode: 'sfm_tokenplansolo_public_cn' },
      readQwenTokenPlanSubscription,
      fetchedAt,
      signal,
    );

    return { providerId: this.id, fetchedAt, capabilities };
  }

  dispose(): void {
    this.managementTokenValue = undefined;
    this.consoleToken = undefined;
  }

  private managementUnavailable(
    management: QwenManagementToken | undefined,
  ): CapabilityState | undefined {
    if (management === undefined) {
      return { kind: 'unconfigured', reason: 'missing Qianwen management token' };
    }
    if (isManagementTokenExpired(management)) {
      return { kind: 'failed', error: { kind: 'auth', message: 'error.qwen.loginExpired' } };
    }
    return undefined;
  }

  private async fetchBalance(
    management: QwenManagementToken,
    fetchedAt: string,
    signal: AbortSignal,
  ): Promise<CapabilityState> {
    const url = `${this.origins.cli}${ENDPOINTS['qwen.fundBalance']}`;
    const result = await this.http.postJson(url, FUND_BALANCE_BODY, {
      bearer: management.accessToken,
      signal,
    });
    if (!result.ok) {
      return {
        kind: 'failed',
        error:
          result.error.kind === 'auth'
            ? { kind: 'auth', message: 'error.qwen.loginExpired' }
            : result.error,
      };
    }
    try {
      return { kind: 'ok', fetchedAt, data: readQwenAccountBalance(result.body) };
    } catch {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }

  private async fetchTokenPlan<T>(
    management: QwenManagementToken,
    endpointId: TokenPlanEndpoint,
    extraData: Record<string, unknown>,
    read: (response: unknown) => T,
    fetchedAt: string,
    signal: AbortSignal,
  ): Promise<CapabilityState> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.consoleTokenFor(management, signal, attempt > 0);
      if (token.kind === 'failed') return { kind: 'failed', error: token.error };

      const result = await this.callTokenPlanApi(endpointId, token.token, extraData, signal);
      if (!result.ok) return { kind: 'failed', error: result.error };

      try {
        return { kind: 'ok', fetchedAt, data: read(result.body) };
      } catch (error) {
        if (error instanceof QwenConsoleAuthError && attempt === 0) continue;
        if (error instanceof QwenConsoleAuthError) {
          return {
            kind: 'failed',
            error: { kind: 'auth', message: 'error.qwen.loginExpired' },
          };
        }
        if (error instanceof QwenConsoleForbiddenError) {
          return {
            kind: 'failed',
            error: { kind: 'auth', message: 'error.qwen.tokenPlanForbidden' },
          };
        }
        return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
      }
    }

    return {
      kind: 'failed',
      error: { kind: 'auth', message: 'error.qwen.loginExpired' },
    };
  }

  private consoleTokenFor(
    management: QwenManagementToken,
    signal: AbortSignal,
    force: boolean,
  ): Promise<ConsoleToken> {
    if (force || this.consoleToken === undefined) {
      this.consoleToken = this.issueConsoleToken(management, signal);
    }
    return this.consoleToken;
  }

  private async issueConsoleToken(
    management: QwenManagementToken,
    signal: AbortSignal,
  ): Promise<ConsoleToken> {
    const url = `${this.origins.cli}${ENDPOINTS['qwen.consoleAccess']}`;
    const result = await this.http.postJson(url, CONSOLE_TOKEN_BODY, {
      bearer: management.accessToken,
      signal,
    });
    if (!result.ok) {
      return {
        kind: 'failed',
        error:
          result.error.kind === 'auth'
            ? { kind: 'auth', message: 'error.qwen.loginExpired' }
            : result.error,
      };
    }
    try {
      return {
        kind: 'ok',
        token: readQwenConsoleToken(result.body),
      };
    } catch {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }

  private async callTokenPlanApi(
    endpointId: TokenPlanEndpoint,
    token: string,
    extraData: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<JsonResult> {
    const url = `${this.origins.data}${ENDPOINTS[endpointId]}`;
    const api = new URL(url).searchParams.get('api');
    if (api === null) {
      return { ok: false, error: { kind: 'malformed', message: 'error.malformed' } };
    }
    const params = {
      Api: api,
      V: '1.0',
      Data: { ...extraData, cornerstoneParam: CONSOLE_CORNERSTONE },
    };
    const body = new URLSearchParams({
      params: JSON.stringify(params),
      region: 'cn-beijing',
    }).toString();
    return this.http.postForm(url, body, { bearer: token, signal });
  }
}
