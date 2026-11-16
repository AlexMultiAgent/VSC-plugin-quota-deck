export interface Cookie {
  readonly name: string;
  readonly value: string;
}

export interface CookieSelection {
  readonly cookies: Cookie[];
  readonly missing: string[];
  readonly header: string;
}

export function parseCookieHeader(header: string): Cookie[] {
  return header
    .split(';')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const separator = segment.indexOf('=');
      if (separator === -1) return { name: segment, value: '' };
      return { name: segment.slice(0, separator).trim(), value: segment.slice(separator + 1).trim() };
    })
    .filter((cookie) => cookie.name.length > 0);
}

export function selectAllowedCookies(cookies: Cookie[], allowed: readonly string[]): CookieSelection {
  const selected = allowed
    .map((name) => cookies.find((cookie) => cookie.name === name))
    .filter((cookie): cookie is Cookie => cookie !== undefined);
  const missing = allowed.filter((name) => !cookies.some((cookie) => cookie.name === name));
  return {
    cookies: selected,
    missing,
    header: selected.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
  };
}
