import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { __reset, SecretStorage, state } from '../test/__mocks__/vscode';
import { SecretStore } from '../core/secrets';
import { translatorFor } from '../localization';
import type { HttpClient, JsonResult } from '../core/http';
import { loginQwen } from './qwenLogin';

const t = translatorFor('en-US');
const AUTH = {
  origin: 'https://t.example.com',
  codePath: '/cli/device/code',
  tokenPath: '/cli/device/token',
};

function context(): vscode.ExtensionContext {
  return {
    globalState: {
      get: () => undefined,
      update: async () => undefined,
    },
  } as unknown as vscode.ExtensionContext;
}

function initResponse(): JsonResult {
  return {
    ok: true,
    body: {
      Success: true,
      Data: {
        Token: 'device-token',
        VerificationUrl: 'https://verify.example.com/approve',
        ExpiresIn: 30,
        Interval: 0.001,
      },
    },
  };
}

function completeResponse(): JsonResult {
  return {
    ok: true,
    body: {
      Success: true,
      Data: {
        Status: 'complete',
        Credentials: {
          AccessToken: 'access-token',
          ExpireTime: '2099-01-01T00:00:00.000Z',
        },
      },
    },
  };
}

function httpFor(poll: JsonResult): HttpClient {
  let calls = 0;
  return {
    postEmpty: vi.fn().mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? initResponse() : poll;
    }),
  } as unknown as HttpClient;
}

describe('loginQwen', () => {
  beforeEach(() => __reset());
  afterEach(() => vi.restoreAllMocks());

  it('opens the verification URL, polls, and stores the management token', async () => {
    const store = new SecretStore(SecretStorage);
    const ok = await loginQwen(store, context(), t, httpFor(completeResponse()), AUTH);

    expect(ok).toBe(true);
    expect(state.openedExternal).toContain('https://verify.example.com/approve');
    const stored = state.secrets.get('quotaDeck.qwen.managementToken');
    expect(stored).toBeDefined();
    expect(JSON.parse(stored!)).toEqual({
      accessToken: 'access-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    expect(state.output.join(' ')).not.toContain('access-token');
  });

  it('returns as soon as the token is stored instead of waiting for the notification to close', async () => {
    // VS Code resolves a message promise only when the notification is
    // dismissed. A pending notification must not hold back the caller's
    // reconnect and refresh, or the provider keeps the expired token.
    const pending = new Promise<never>(() => undefined);
    const show = vi.spyOn(vscode.window, 'showInformationMessage').mockReturnValue(pending);

    const store = new SecretStore(SecretStorage);
    const ok = await loginQwen(store, context(), t, httpFor(completeResponse()), AUTH);

    expect(ok).toBe(true);
    expect(show).toHaveBeenCalledWith('Signed in to Qianwen AI.');
    expect(state.secrets.has('quotaDeck.qwen.managementToken')).toBe(true);
  }, 1_000);

  it('reports an expired device flow without storing a token', async () => {
    const store = new SecretStore(SecretStorage);
    const ok = await loginQwen(
      store,
      context(),
      t,
      httpFor({ ok: true, body: { Success: true, Data: { Status: 'expired_token' } } }),
      AUTH,
    );

    expect(ok).toBe(false);
    expect(state.secrets.has('quotaDeck.qwen.managementToken')).toBe(false);
    expect(state.output.join(' ')).toContain('expired');
  });

  it('reports a network failure without storing a token', async () => {
    const store = new SecretStore(SecretStorage);
    const http = {
      postEmpty: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'network', message: 'error.network' },
      }),
    } as unknown as HttpClient;

    expect(await loginQwen(store, context(), t, http, AUTH)).toBe(false);
    expect(state.secrets.has('quotaDeck.qwen.managementToken')).toBe(false);
  });
});
