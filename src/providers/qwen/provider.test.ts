import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../../core/http';
import type { CredentialKind, SecretReader } from '../../core/types';
import { QwenProvider } from './provider';

const ORIGIN = 'https://business.aliyuncs.com';
const SIGNAL = new AbortController().signal;

function secrets(values: Partial<Record<CredentialKind, string>>): SecretReader {
  return {
    read: vi.fn<SecretReader['read']>().mockImplementation(
      async (_providerId, credential) => values[credential],
    ),
  };
}

function http(result: Awaited<ReturnType<HttpClient['postJson']>>) {
  return {
    postJson: vi.fn().mockResolvedValue(result),
  } as unknown as HttpClient;
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

describe('QwenProvider', () => {
  it('declares only the account balance it actually queries', () => {
    const provider = new QwenProvider(ORIGIN, http({ ok: true, body: {} }));
    expect(provider.getCapabilities().capabilities.map((capability) => capability.id)).toEqual([
      'qwen.accountBalance',
    ]);
  });

  it('reads both AccessKey parts from SecretStorage and becomes ready', async () => {
    const provider = new QwenProvider(ORIGIN, http({ ok: true, body: {} }));
    const state = await provider.connect(
      secrets({
        'access-key-id': 'access-id',
        'access-key-secret': 'access-secret',
      }),
    );

    expect(state).toEqual({
      kind: 'ready',
      capabilities: ['qwen.accountBalance'],
    });
  });

  it('reports a missing AccessKey Secret as partial instead of ready', async () => {
    const provider = new QwenProvider(ORIGIN, http({ ok: true, body: {} }));
    expect(await provider.connect(secrets({ 'access-key-id': 'access-id' }))).toEqual({
      kind: 'partial',
      capabilities: [],
      missing: [{ capability: 'qwen.accountBalance', credential: 'access-key-secret' }],
    });
  });

  it('queries only account balance with a signed POST', async () => {
    const client = http({ ok: true, body: BALANCE_RESPONSE });
    const provider = new QwenProvider(ORIGIN, client);
    await provider.connect(
      secrets({
        'access-key-id': 'access-id',
        'access-key-secret': 'access-secret',
      }),
    );

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toMatchObject({
      kind: 'ok',
      data: {
        availableAmount: -12.34,
        creditAmount: 5,
        mybankCreditAmount: 6,
        availableCashAmount: -18.34,
        quotaLimit: 1000,
        currency: 'CNY',
      },
    });
    expect(Object.keys(snapshot.capabilities)).toEqual(['qwen.accountBalance']);

    const post = vi.mocked(client.postJson);
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, options] = post.mock.calls[0]!;
    if (options === undefined) throw new Error('expected request options');
    expect(url).toBe(`${ORIGIN}/`);
    expect(body).toBeUndefined();
    expect(options.signal).toBe(SIGNAL);
    expect(options.headers).toMatchObject({
      host: 'business.aliyuncs.com',
      'x-acs-action': 'QueryAccountBalance',
      'x-acs-version': '2017-12-14',
    });
    expect(options.headers?.['x-acs-date']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(options.headers?.['x-acs-signature-nonce']).toMatch(/^[0-9a-f-]{36}$/);
    expect(options.headers?.Authorization).toMatch(
      /^ACS3-HMAC-SHA256 Credential=access-id,SignedHeaders=.+,Signature=[0-9a-f]{64}$/,
    );
  });

  it('returns the HTTP failure from the balance query', async () => {
    const provider = new QwenProvider(
      ORIGIN,
      http({
        ok: false,
        error: { kind: 'auth', message: 'error.auth' },
      }),
    );
    await provider.connect(
      secrets({
        'access-key-id': 'access-id',
        'access-key-secret': 'access-secret',
      }),
    );

    expect((await provider.fetchSnapshot(SIGNAL)).capabilities['qwen.accountBalance']).toEqual({
      kind: 'failed',
      error: { kind: 'auth', message: 'error.auth' },
    });
  });

  it('reports an unexpected response as malformed', async () => {
    const provider = new QwenProvider(ORIGIN, http({ ok: true, body: { Success: false } }));
    await provider.connect(
      secrets({
        'access-key-id': 'access-id',
        'access-key-secret': 'access-secret',
      }),
    );

    expect((await provider.fetchSnapshot(SIGNAL)).capabilities['qwen.accountBalance']).toEqual({
      kind: 'failed',
      error: { kind: 'malformed', message: 'error.malformed' },
    });
  });
});
