import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpClient, JsonResult } from '../../core/http';
import { QwenDeviceLoginError, runQwenDeviceLogin } from './login';

function httpFor(poll: JsonResult): HttpClient {
  let calls = 0;
  return {
    postEmpty: vi.fn().mockImplementation(async () => {
      calls += 1;
      return calls === 1
        ? {
            ok: true,
            body: {
              Success: true,
              Data: {
                Token: 'device-token',
                VerificationUrl: 'https://verify.example.com/approve',
                ExpiresIn: 30,
                Interval: 1,
              },
            },
          }
        : poll;
    }),
  } as unknown as HttpClient;
}

describe('runQwenDeviceLogin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes the abort listener when a poll sleep completes', async () => {
    vi.useFakeTimers();
    let added = 0;
    let removed = 0;
    const signal = {
      aborted: false,
      addEventListener: () => {
        added += 1;
      },
      removeEventListener: () => {
        removed += 1;
      },
    } as unknown as AbortSignal;

    const login = runQwenDeviceLogin({
      http: httpFor({
        ok: true,
        body: { Success: true, Data: { Status: 'expired_token' } },
      }),
      authOrigin: 'https://t.example.com',
      codePath: '/cli/device/code',
      tokenPath: '/cli/device/token',
      clientId: 'client-id',
      signal,
      onVerificationUrl: () => undefined,
    });
    const failure = login.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(await failure).toBeInstanceOf(QwenDeviceLoginError);
    expect(added).toBe(1);
    expect(removed).toBe(1);
  });
});
