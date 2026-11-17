import type { HttpClient, JsonResult } from '../../core/http';
import type {
  CapabilityDescriptor,
  CapabilityState,
  ConnectionState,
  ProviderCapabilities,
  ProviderSnapshot,
  QuotaProvider,
  SecretReader,
} from '../../core/types';
import { rangeFor, SHANGHAI, type RangeId } from '../../core/time';
import { selectAccountTotals } from './aggregate';
import { parseCookieHeader, selectAllowedCookies } from '../cookies';
import { ENDPOINTS, ORIGINS } from '../endpoints';
import { readDeepSeekBalance } from './shape';
import {
  mergeDeepSeekUsage,
  readDeepSeekAmount,
  readDeepSeekCost,
  readDeepSeekSummary,
} from './usage';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'deepseek.balance', titleKey: 'capability.deepseek.balance', credential: 'api-key', required: true },
  { id: 'deepseek.usageAmount', titleKey: 'capability.deepseek.usageAmount', credential: 'session-token', required: false },
  { id: 'deepseek.usageCost', titleKey: 'capability.deepseek.usageCost', credential: 'session-token', required: false },
  { id: 'deepseek.accountSummary', titleKey: 'capability.deepseek.accountSummary', credential: 'session-token', required: false },
];

const PLATFORM_COOKIE_NAMES: readonly string[] = [
  'sessionid',
  'sessionId',
  'token',
  'access_token',
  'auth_token',
  'userToken',
  'deepseek_token',
  'ds_session',
  '__Secure-next-auth.session-token',
];

const USAGE_ENDPOINTS = {
  'deepseek.usageAmount': ENDPOINTS['deepseek.usageAmount'],
  'deepseek.usageCost': ENDPOINTS['deepseek.usageCost'],
  'deepseek.accountSummary': ENDPOINTS['deepseek.accountSummary'],
} as const;

function parseCapability(
  fetchedAt: string,
  read: () => unknown,
): CapabilityState {
  try {
    return { kind: 'ok', fetchedAt, data: read() };
  } catch {
    return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
  }
}

export class DeepSeekProvider implements QuotaProvider {
  readonly id = 'deepseek' as const;
  readonly displayName = 'DeepSeek';
  private apiKey: string | undefined;
  private sessionToken: string | undefined;
  private cookie: string | undefined;

  constructor(private readonly http: HttpClient) {}

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(secrets: SecretReader): Promise<ConnectionState> {
    this.apiKey = await secrets.read(this.id, 'api-key');
    this.sessionToken = await secrets.read(this.id, 'session-token');
    this.cookie = await secrets.read(this.id, 'web-cookie');

    if (this.apiKey === undefined) return { kind: 'not-configured' };
    if (this.sessionToken === undefined || this.cookie === undefined) {
      return {
        kind: 'partial',
        capabilities: ['deepseek.balance'],
        missing: [
          { capability: 'deepseek.usageAmount', credential: 'session-token' },
          { capability: 'deepseek.usageCost', credential: 'session-token' },
          { capability: 'deepseek.accountSummary', credential: 'session-token' },
        ],
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
    capabilities['deepseek.balance'] = await this.fetchBalance(fetchedAt, signal);

    const platform = await this.fetchPlatformRange(range, timeZone, signal);
    if (platform.kind !== 'ok') {
      capabilities['deepseek.usageAmount'] = platform;
      capabilities['deepseek.usageCost'] = platform;
      capabilities['deepseek.accountSummary'] = platform;
    } else {
      const { usageAmount, usageCost, accountSummary } = platform.data;
      if (!usageAmount.ok) {
        capabilities['deepseek.usageAmount'] = { kind: 'failed', error: usageAmount.error };
      } else if (!usageCost.ok) {
        capabilities['deepseek.usageAmount'] = { kind: 'failed', error: usageCost.error };
      } else {
        capabilities['deepseek.usageAmount'] = parseCapability(fetchedAt, () => ({
          ...mergeDeepSeekUsage(readDeepSeekAmount(usageAmount.body), readDeepSeekCost(usageCost.body)),
          rangeId: range,
        }));
      }
      capabilities['deepseek.usageCost'] = usageCost.ok
        ? parseCapability(fetchedAt, () => ({ ...readDeepSeekCost(usageCost.body), rangeId: range }))
        : { kind: 'failed', error: usageCost.error };
      capabilities['deepseek.accountSummary'] = accountSummary.ok
        ? parseCapability(fetchedAt, () => {
            const summaryTotals = readDeepSeekSummary(accountSummary.body);
            const selection = selectAccountTotals({
              summaryTotals: summaryTotals.map((entry) => ({
                currency: entry.currency,
                amount: entry.amount,
              })),
              perKeyRows: [],
              knownKeyIds: undefined,
            });
            return { totals: selection.totals, source: selection.source, keyCount: selection.keyCount, rangeId: range };
          })
        : { kind: 'failed', error: accountSummary.error };
    }

    return { providerId: this.id, fetchedAt, capabilities };
  }

  dispose(): void {
    this.apiKey = undefined;
    this.sessionToken = undefined;
    this.cookie = undefined;
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

  private async fetchPlatformRange(
    rangeId: RangeId,
    timeZone: string,
    signal: AbortSignal,
  ): Promise<
    | { kind: 'ok'; data: { usageAmount: JsonResult; usageCost: JsonResult; accountSummary: JsonResult } }
    | Exclude<CapabilityState, { kind: 'ok' | 'stale' }>
  > {
    if (this.sessionToken === undefined || this.cookie === undefined) {
      return { kind: 'unconfigured', reason: 'missing platform session' };
    }
    const selection = selectAllowedCookies(parseCookieHeader(this.cookie), PLATFORM_COOKIE_NAMES);
    if (selection.cookies.length === 0) {
      return { kind: 'unconfigured', reason: 'no allow-listed session cookie' };
    }
    const sessionToken = this.sessionToken;
    const range = rangeFor(rangeId, Date.now(), timeZone);
    const request = (capability: keyof typeof USAGE_ENDPOINTS): Promise<JsonResult> => {
      const url = new URL(`${ORIGINS['deepseek-platform']}${USAGE_ENDPOINTS[capability]}`);
      if (capability !== 'deepseek.accountSummary') {
        url.searchParams.set('start', String(Math.floor(range.start / 1000)));
        url.searchParams.set('end', String(Math.floor(range.end / 1000)));
        url.searchParams.set('tz', timeZone);
      }
      return this.http.getJson(url.toString(), {
        bearer: sessionToken,
        headers: { Cookie: selection.header },
        signal,
      });
    };
    const [usageAmount, usageCost, accountSummary] = await Promise.all([
      request('deepseek.usageAmount'),
      request('deepseek.usageCost'),
      request('deepseek.accountSummary'),
    ]);
    return { kind: 'ok', data: { usageAmount, usageCost, accountSummary } };
  }
}
