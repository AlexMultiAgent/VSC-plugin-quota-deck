import { describe, expect, it, vi } from 'vitest';
import type { HttpClient, JsonResult } from '../../core/http';
import type { CredentialKind, SecretReader } from '../../core/types';
import { loadFixture } from '../../test/helpers/fixture';
import { QwenProvider } from './provider';

const ORIGINS = {
  balance: 'https://business.aliyuncs.com',
  cli: 'https://cli.example.com',
  data: 'https://data.example.com',
};
const SIGNAL = new AbortController().signal;

function secrets(values: Partial<Record<CredentialKind, string>>): SecretReader {
  return {
    read: vi.fn<SecretReader['read']>().mockImplementation(
      async (_providerId, credential) => values[credential],
    ),
  };
}

function managementToken(expiresAt = '2099-01-01T00:00:00.000Z'): string {
  return JSON.stringify({ accessToken: 'oauth-token', expiresAt });
}

const BALANCE_RESPONSE = {
  Code: '200',
  Message: 'success',
  RequestId: 'request-id',
  Success: true,
  Data: {
    AvailableAmount: '-12.34',
    CreditAmount: '5.00',
    MybankCreditAmount: '6.00',
    Currency: 'CNY',
    AvailableCashAmount: '-18.34',
    QuotaLimit: '1000.00',
  },
};

function captured(capability: 'qwen.tokenPlan' | 'qwen.tokenPlanSubscription'): unknown {
  return JSON.parse(
    JSON.stringify(loadFixture('qwen', capability, 'standard')),
  ).response;
}

const TOKEN_RESPONSE = { code: '200', data: { cliAccessToken: 'console-token' } };
const USAGE_RESPONSE = captured('qwen.tokenPlan');
const SUBSCRIPTION_RESPONSE = captured('qwen.tokenPlanSubscription');

interface ClientOptions {
  readonly balance?: JsonResult;
  readonly token?: (attempt: number) => JsonResult;
  readonly usage?: (attempt: number) => JsonResult;
  readonly subscription?: (attempt: number) => JsonResult;
}

function client(options: ClientOptions = {}) {
  let tokenCalls = 0;
  let usageCalls = 0;
  let subscriptionCalls = 0;
  const postJson = vi.fn().mockImplementation(async (url: string) => {
    if (String(url).includes('cli.example.com')) {
      tokenCalls += 1;
      return (options.token ?? (() => ({ ok: true, body: TOKEN_RESPONSE })))(tokenCalls);
    }
    return options.balance ?? { ok: true, body: BALANCE_RESPONSE };
  });
  const postForm = vi.fn().mockImplementation(async (url: string) => {
    if (String(url).includes('usage')) {
      usageCalls += 1;
      return (options.usage ?? (() => ({ ok: true, body: USAGE_RESPONSE })))(usageCalls);
    }
    subscriptionCalls += 1;
    return (options.subscription ?? (() => ({ ok: true, body: SUBSCRIPTION_RESPONSE })))(
      subscriptionCalls,
    );
  });
  return { http: { postJson, postForm } as unknown as HttpClient, postJson, postForm };
}

async function connected(options: ClientOptions = {}) {
  const mock = client(options);
  const provider = new QwenProvider(ORIGINS, mock.http);
  await provider.connect(
    secrets({
      'access-key-id': 'access-id',
      'access-key-secret': 'access-secret',
      'management-token': managementToken(),
    }),
  );
  return { provider, ...mock };
}

function gatewayFailure(errorCode: string): JsonResult {
  const response = JSON.parse(JSON.stringify(USAGE_RESPONSE)) as any;
  response.data.success = false;
  response.data.errorCode = errorCode;
  return { ok: true, body: response };
}

describe('QwenProvider', () => {
  it('declares account balance and both Token Plan capabilities', () => {
    const { http } = client();
    const provider = new QwenProvider(ORIGINS, http);
    expect(provider.getCapabilities().capabilities.map((capability) => capability.id)).toEqual([
      'qwen.accountBalance',
      'qwen.tokenPlan',
      'qwen.tokenPlanSubscription',
    ]);
  });

  it('becomes ready when both credential groups are present', async () => {
    const { provider } = await connected();
    expect(
      await provider.connect(
        secrets({
          'access-key-id': 'access-id',
          'access-key-secret': 'access-secret',
          'management-token': managementToken(),
        }),
      ),
    ).toEqual({
      kind: 'ready',
      capabilities: ['qwen.accountBalance', 'qwen.tokenPlan', 'qwen.tokenPlanSubscription'],
    });
  });

  it('reports a partial state with only the balance AccessKey pair', async () => {
    const { provider } = await connected();
    expect(
      await provider.connect(
        secrets({ 'access-key-id': 'access-id', 'access-key-secret': 'access-secret' }),
      ),
    ).toEqual({
      kind: 'partial',
      capabilities: ['qwen.accountBalance'],
      missing: [
        { capability: 'qwen.tokenPlan', credential: 'management-token' },
        { capability: 'qwen.tokenPlanSubscription', credential: 'management-token' },
      ],
    });
  });

  it('reports a partial state with only the management token', async () => {
    const { provider } = await connected();
    expect(
      await provider.connect(secrets({ 'management-token': managementToken() })),
    ).toEqual({
      kind: 'partial',
      capabilities: ['qwen.tokenPlan', 'qwen.tokenPlanSubscription'],
      missing: [{ capability: 'qwen.accountBalance', credential: 'access-key-id' }],
    });
  });

  it('reports not-configured when neither credential group is present', async () => {
    const { provider } = await connected();
    expect(await provider.connect(secrets({}))).toEqual({ kind: 'not-configured' });
  });

  it('issues one console token and calls both gateway endpoints', async () => {
    const { provider, postJson, postForm } = await connected();
    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toMatchObject({
      kind: 'ok',
      data: { availableAmount: -12.34, currency: 'CNY' },
    });
    expect(snapshot.capabilities['qwen.tokenPlan']).toMatchObject({ kind: 'ok' });
    expect(snapshot.capabilities['qwen.tokenPlanSubscription']).toMatchObject({ kind: 'ok' });
    expect(Object.keys(snapshot.capabilities)).toEqual([
      'qwen.accountBalance',
      'qwen.tokenPlan',
      'qwen.tokenPlanSubscription',
    ]);

    expect(postJson).toHaveBeenCalledTimes(2);
    const tokenCall = postJson.mock.calls.find(([url]) =>
      String(url).includes('cli.example.com'),
    )!;
    expect(tokenCall[0]).toBe('https://cli.example.com/data/v2/api.json');
    expect(tokenCall[1]).toEqual({
      product: 'ModelStudioRegional',
      action: 'GenerateCLIAccessToken',
      region: 'cn-beijing',
      params: {},
      version: '2026-02-10',
    });
    expect(tokenCall[2]?.bearer).toBe('oauth-token');

    expect(postForm).toHaveBeenCalledTimes(2);
    for (const [url, body, options] of postForm.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/data\.example\.com\/cli\/api\.json\?/);
      expect(options?.bearer).toBe('console-token');
      expect(String(body)).toContain('region=cn-beijing');
      expect(String(body)).toContain('QIANWENAI');
    }
    const subscriptionCall = postForm.mock.calls.find(([url]) =>
      String(url).includes('subscription'),
    )!;
    expect(String(subscriptionCall[1])).toContain('commodityCode');
  });

  it('retries once with a fresh console token after NotLogined', async () => {
    const { provider, postJson, postForm } = await connected({
      usage: (attempt) =>
        attempt === 1 ? gatewayFailure('BailianGateway.Login.NotLogined') : { ok: true, body: USAGE_RESPONSE },
    });

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.tokenPlan']).toMatchObject({ kind: 'ok' });
    expect(postJson).toHaveBeenCalledTimes(3);
    expect(postForm.mock.calls.filter(([url]) => String(url).includes('usage'))).toHaveLength(2);
  });

  it('reports Team.NotAuthorised as an actionable failure', async () => {
    const { provider } = await connected({
      usage: () => gatewayFailure('BailianGateway.Team.NotAuthorised'),
    });

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.tokenPlan']).toEqual({
      kind: 'failed',
      error: { kind: 'auth', message: 'error.qwen.tokenPlanForbidden' },
    });
    expect(snapshot.capabilities['qwen.tokenPlanSubscription']).toMatchObject({ kind: 'ok' });
  });

  it('treats an expired management token as a login failure without network calls', async () => {
    const mock = client();
    const provider = new QwenProvider(ORIGINS, mock.http);
    await provider.connect(
      secrets({
        'access-key-id': 'access-id',
        'access-key-secret': 'access-secret',
        'management-token': managementToken('2020-01-01T00:00:00.000Z'),
      }),
    );

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toMatchObject({ kind: 'ok' });
    expect(snapshot.capabilities['qwen.tokenPlan']).toEqual({
      kind: 'failed',
      error: { kind: 'auth', message: 'error.qwen.loginExpired' },
    });
    expect(snapshot.capabilities['qwen.tokenPlanSubscription']).toEqual({
      kind: 'failed',
      error: { kind: 'auth', message: 'error.qwen.loginExpired' },
    });
    expect(mock.postJson).toHaveBeenCalledTimes(1);
    expect(mock.postForm).not.toHaveBeenCalled();
  });

  it('reports the plan as unconfigured when only the balance is configured', async () => {
    const mock = client();
    const provider = new QwenProvider(ORIGINS, mock.http);
    await provider.connect(
      secrets({ 'access-key-id': 'access-id', 'access-key-secret': 'access-secret' }),
    );

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toMatchObject({ kind: 'ok' });
    expect(snapshot.capabilities['qwen.tokenPlan']).toEqual({
      kind: 'unconfigured',
      reason: 'missing Qianwen management token',
    });
    expect(snapshot.capabilities['qwen.tokenPlanSubscription']).toEqual({
      kind: 'unconfigured',
      reason: 'missing Qianwen management token',
    });
    expect(mock.postForm).not.toHaveBeenCalled();
  });

  it('maps a rejected management token to login expired', async () => {
    const { provider, postForm } = await connected({
      token: () => ({ ok: false, error: { kind: 'auth', message: 'error.auth' } }),
    });

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toMatchObject({ kind: 'ok' });
    expect(snapshot.capabilities['qwen.tokenPlan']).toEqual({
      kind: 'failed',
      error: { kind: 'auth', message: 'error.qwen.loginExpired' },
    });
    expect(postForm).not.toHaveBeenCalled();
  });

  it('keeps the Token Plan when the balance query fails', async () => {
    const { provider } = await connected({
      balance: { ok: false, error: { kind: 'auth', message: 'error.auth' } },
    });

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toEqual({
      kind: 'failed',
      error: { kind: 'auth', message: 'error.auth' },
    });
    expect(snapshot.capabilities['qwen.tokenPlan']).toMatchObject({ kind: 'ok' });
  });

  it('reports an unexpected balance response as malformed', async () => {
    const { provider } = await connected({
      balance: { ok: true, body: { Success: false } },
    });

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toEqual({
      kind: 'failed',
      error: { kind: 'malformed', message: 'error.malformed' },
    });
  });
});
