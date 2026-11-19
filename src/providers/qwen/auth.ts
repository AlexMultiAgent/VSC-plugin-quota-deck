import { ShapeError, asRecord } from '../shape';

export interface QwenDeviceInit {
  readonly deviceToken: string;
  readonly verificationUrl: string;
  readonly expiresIn: number;
  readonly interval: number;
}

export type QwenDevicePollStatus =
  | 'authorization_pending'
  | 'slow_down'
  | 'complete'
  | 'expired_token'
  | 'access_denied';

export interface QwenDevicePoll {
  readonly status: QwenDevicePollStatus;
  readonly accessToken?: string;
  readonly expiresAt?: string;
}

export interface QwenManagementToken {
  readonly accessToken: string;
  readonly expiresAt: string;
}

const POLL_STATUSES: readonly QwenDevicePollStatus[] = [
  'authorization_pending',
  'slow_down',
  'complete',
  'expired_token',
  'access_denied',
];

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new ShapeError(path);
  return value;
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ShapeError(path);
  }
  return value;
}

export function readQwenDeviceInit(response: unknown): QwenDeviceInit {
  const root = asRecord(response, 'root');
  if (root.Success !== true) throw new ShapeError('Success');
  const data = asRecord(root.Data, 'Data');
  return {
    deviceToken: text(data.Token, 'Token'),
    verificationUrl: text(data.VerificationUrl, 'VerificationUrl'),
    expiresIn: numberValue(data.ExpiresIn, 'ExpiresIn'),
    interval: numberValue(data.Interval, 'Interval'),
  };
}

export function readQwenDevicePoll(response: unknown): QwenDevicePoll {
  const root = asRecord(response, 'root');
  if (root.Success === false) throw new ShapeError('Success');
  const data = root.Data === undefined ? root : asRecord(root.Data, 'Data');
  const raw = data.Status ?? root.status;
  const status = typeof raw === 'string' ? raw.toLowerCase() : 'authorization_pending';
  if (!POLL_STATUSES.includes(status as QwenDevicePollStatus)) {
    throw new ShapeError('Status');
  }
  const typed = status as QwenDevicePollStatus;
  if (typed !== 'complete') return { status: typed };

  const credentials = asRecord(
    data.Credentials ?? root.credentials,
    'Credentials',
  );
  const accessToken = credentials.AccessToken ?? credentials.access_token;
  const expiresAt = credentials.ExpireTime ?? credentials.expire_time;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new ShapeError('AccessToken');
  }
  return {
    status: 'complete',
    accessToken,
    expiresAt: typeof expiresAt === 'string' ? expiresAt : '',
  };
}

export function parseQwenManagementToken(
  value: string | undefined,
): QwenManagementToken | undefined {
  if (value === undefined || value.length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const accessToken = record.accessToken;
  if (typeof accessToken !== 'string' || accessToken.length === 0) return undefined;
  return {
    accessToken,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : '',
  };
}

export function serializeQwenManagementToken(token: QwenManagementToken): string {
  return JSON.stringify({ accessToken: token.accessToken, expiresAt: token.expiresAt });
}

export function isManagementTokenExpired(
  token: QwenManagementToken,
  now = Date.now(),
): boolean {
  if (token.expiresAt.length === 0) return false;
  const expiresAt = Date.parse(token.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function deviceCodeUrl(
  origin: string,
  path: string,
  clientId: string,
  challenge: string,
): string {
  const url = new URL(path, origin);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function deviceTokenUrl(
  origin: string,
  path: string,
  clientId: string,
  deviceToken: string,
  verifier: string,
): string {
  const url = new URL(path, origin);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('token', deviceToken);
  url.searchParams.set('code_verifier', verifier);
  return url.toString();
}
