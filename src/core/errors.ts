import type { MessageKey } from '../localization/messages';
import type { NormalizedError, NormalizedErrorKind } from './types';

export interface RawError {
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly name?: string;
  readonly message?: string;
  readonly malformed?: boolean;
}

function kindOf(raw: RawError): NormalizedErrorKind {
  if (raw.malformed === true) return 'malformed';
  if (raw.status === 401 || raw.status === 403) return 'auth';
  if (raw.status === 429) return 'rate-limit';
  if (raw.name === 'AbortError') return 'timeout';
  if (raw.status !== undefined && raw.status >= 500) return 'network';
  if (raw.status !== undefined) return 'unknown';
  return 'network';
}

const MESSAGE_BY_KIND: Record<NormalizedErrorKind, MessageKey> = {
  auth: 'error.auth',
  'rate-limit': 'error.rateLimit',
  timeout: 'error.timeout',
  network: 'error.network',
  malformed: 'error.malformed',
  unknown: 'error.unknown',
};

export function normalizeError(raw: RawError): NormalizedError {
  const kind = kindOf(raw);
  return {
    kind,
    message: MESSAGE_BY_KIND[kind],
    ...(raw.status !== undefined ? { status: raw.status } : {}),
    ...(raw.retryAfterMs !== undefined ? { retryAfterMs: raw.retryAfterMs } : {}),
  };
}
