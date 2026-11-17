export class ShapeError extends Error {
  constructor(path: string) {
    super(`unknown response shape: ${path}`);
    this.name = 'ShapeError';
  }
}

export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ShapeError(path);
  }
  return value as Record<string, unknown>;
}

/**
 * A number the provider must have supplied. A missing or non-numeric value is
 * contract drift, so it throws rather than becoming a zero.
 */
export function requireNumber(value: unknown, path: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new ShapeError(path);
}

/** A number the provider may legitimately omit. */
export function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
