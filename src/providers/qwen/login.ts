import { createHash, randomBytes } from 'node:crypto';
import type { HttpClient } from '../../core/http';
import {
  deviceCodeUrl,
  deviceTokenUrl,
  readQwenDeviceInit,
  readQwenDevicePoll,
  type QwenManagementToken,
} from './auth';

export type QwenDeviceLoginFailure =
  | 'network'
  | 'expired_token'
  | 'access_denied'
  | 'cancelled'
  | 'unexpected';

export class QwenDeviceLoginError extends Error {
  constructor(readonly code: QwenDeviceLoginFailure) {
    super(code);
    this.name = 'QwenDeviceLoginError';
  }
}

export interface QwenDeviceLoginOptions {
  readonly http: HttpClient;
  readonly authOrigin: string;
  readonly codePath: string;
  readonly tokenPath: string;
  readonly clientId: string;
  readonly signal: AbortSignal;
  readonly onVerificationUrl: (url: string) => void;
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

function defaultSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new QwenDeviceLoginError('cancelled'));
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new QwenDeviceLoginError('cancelled'));
    };
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Run the official Qianwen device flow with PKCE. The access token is returned
 * to the caller and never logged, stored, or written by this module.
 */
export async function runQwenDeviceLogin(
  options: QwenDeviceLoginOptions,
): Promise<QwenManagementToken> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const codeUrl = deviceCodeUrl(
    options.authOrigin,
    options.codePath,
    options.clientId,
    challenge,
  );
  const initResult = await options.http.postEmpty(codeUrl, {
    signal: options.signal,
  });
  if (!initResult.ok) throw new QwenDeviceLoginError('network');

  let init;
  try {
    init = readQwenDeviceInit(initResult.body);
  } catch {
    throw new QwenDeviceLoginError('unexpected');
  }
  options.onVerificationUrl(init.verificationUrl);

  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + init.expiresIn * 1000;
  let interval = init.interval * 1000;

  while (Date.now() < deadline) {
    await sleep(interval, options.signal);
    if (options.signal.aborted) throw new QwenDeviceLoginError('cancelled');

    const pollUrl = deviceTokenUrl(
      options.authOrigin,
      options.tokenPath,
      options.clientId,
      init.deviceToken,
      verifier,
    );
    const pollResult = await options.http.postEmpty(pollUrl, {
      signal: options.signal,
    });
    if (!pollResult.ok) throw new QwenDeviceLoginError('network');

    let poll;
    try {
      poll = readQwenDevicePoll(pollResult.body);
    } catch {
      throw new QwenDeviceLoginError('unexpected');
    }

    if (poll.status === 'complete') {
      if (poll.accessToken === undefined) {
        throw new QwenDeviceLoginError('unexpected');
      }
      return { accessToken: poll.accessToken, expiresAt: poll.expiresAt ?? '' };
    }
    if (poll.status === 'slow_down') {
      interval += 5000;
      continue;
    }
    if (poll.status === 'expired_token' || poll.status === 'access_denied') {
      throw new QwenDeviceLoginError(poll.status);
    }
  }

  throw new QwenDeviceLoginError('expired_token');
}
