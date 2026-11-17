import {
  CREDENTIAL_FIELD_PATTERN,
  CREDENTIAL_PATTERNS,
} from './secret-patterns.mjs';

export const SECRET_PATTERNS = [...CREDENTIAL_PATTERNS, CREDENTIAL_FIELD_PATTERN];
export const SECRET_KEY_PATTERN = /token|secret|password|cookie|authorization|api_?key/i;
export const FINANCIAL_KEY_PATTERN = /balance|cost|amount/i;
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
      if ((typeof entry === 'number' || typeof entry === 'string') && FINANCIAL_KEY_PATTERN.test(key)) {
        result[key] = typeof entry === 'number' ? 0 : '0.00';
        continue;
      }
      result[key] = sanitizeValue(entry, sensitiveKeys);
    }
    return result;
  }
  if (typeof value === 'string' && isSecretLike('value', value)) return REDACTED;
  return value;
}
