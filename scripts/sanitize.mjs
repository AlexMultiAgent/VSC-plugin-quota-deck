export const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /[A-Fa-f0-9]{32,}/,
  /[A-Za-z0-9+/=_-]{40,}/,
  /sessionId=[A-Za-z0-9_-]{8,}/,
  /(?:token|secret|password|api_?key)["']?\s*[:=]\s*["']?[A-Za-z0-9+/_-]{16,}/i,
];

export const SECRET_KEY_PATTERN = /token|secret|password|cookie|authorization|api_?key/i;
export const REDACTED = '<redacted>';

function isSecretLike(key, value) {
  if (typeof value !== 'string') return false;
  if (SECRET_KEY_PATTERN.test(key)) return true;
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function sanitizeValue(value, sensitiveKeys = []) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, sensitiveKeys));
  }
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string' && (sensitiveKeys.includes(key) || isSecretLike(key, entry))) {
        result[key] = REDACTED;
        continue;
      }
      result[key] = sanitizeValue(entry, sensitiveKeys);
    }
    return result;
  }
  if (typeof value === 'string' && isSecretLike('value', value)) return REDACTED;
  return value;
}
