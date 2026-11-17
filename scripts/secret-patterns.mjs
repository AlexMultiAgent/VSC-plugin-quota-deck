/**
 * The shapes a credential can take.
 *
 * Both the fixture sanitizer and the package guard need this list, so a new
 * credential shape is recognized by every check at once.
 */

/** A bearer token, a prefixed API key, or a long opaque credential. */
export const CREDENTIAL_PATTERNS = [
  /sk-[A-Za-z0-9]{16,}/,
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/,
  /[A-Fa-f0-9]{32,}/,
  /sessionId=[A-Za-z0-9_-]{8,}/,
];

/** A credential that appears as a named field of a JSON payload. */
export const CREDENTIAL_FIELD_PATTERN =
  /(?:token|secret|password|api_?key|cookie|authorization)["']?\s*[:=]\s*["']?[A-Za-z0-9+/_-]{16,}/i;

/** A cookie header value in a JSON payload. */
export const COOKIE_HEADER_PATTERN = /"Cookie"\s*:\s*"[^"]{8,}"/i;

/** A local path that must never be shipped. */
export const LOCAL_PATH_PATTERN = /[A-Za-z]:\\Users\\|\/home\/[a-z0-9_-]+\//i;
