import { normalizeError } from './errors';
import type { NormalizedError } from './types';

export interface HttpOptions {
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly backoffBaseMs?: number;
}

export interface RequestOptions {
  readonly bearer?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

export type JsonResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly error: NormalizedError };

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMs(headers: Headers): number | undefined {
  const raw = headers.get('Retry-After');
  if (raw === null) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export class HttpClient {
  constructor(private readonly options: HttpOptions) {}

  async getJson(url: string, options: RequestOptions = {}): Promise<JsonResult> {
    let attempt = 0;
    for (;;) {
      const result = await this.attempt(url, options);
      if (result.ok) return result;
      const retryable = result.error.kind === 'network' || result.error.kind === 'timeout';
      attempt += 1;
      if (!retryable || attempt >= this.options.maxAttempts) return result;
      const base = this.options.backoffBaseMs ?? 1_000;
      await delay(base * 2 ** (attempt - 1));
    }
  }

  private async attempt(url: string, options: RequestOptions): Promise<JsonResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    try {
      const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
      if (options.bearer !== undefined) headers.Authorization = `Bearer ${options.bearer}`;

      const response = await fetch(url, { headers, signal: controller.signal });

      if (!response.ok) {
        const retry = retryAfterMs(response.headers);
        return {
          ok: false,
          error: normalizeError({
            status: response.status,
            ...(retry !== undefined ? { retryAfterMs: retry } : {}),
          }),
        };
      }

      const text = await response.text();
      try {
        return { ok: true, body: JSON.parse(text) as unknown };
      } catch {
        return { ok: false, error: normalizeError({ status: response.status, malformed: true }) };
      }
    } catch (error) {
      const raw = error as { name?: string; message?: string };
      return {
        ok: false,
        error: normalizeError({
          ...(raw.name !== undefined ? { name: raw.name } : {}),
          ...(raw.message !== undefined ? { message: raw.message } : {}),
        }),
      };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}
