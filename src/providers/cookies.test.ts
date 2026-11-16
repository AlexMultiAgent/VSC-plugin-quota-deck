import { describe, expect, it } from 'vitest';
import { parseCookieHeader, selectAllowedCookies } from './cookies';

describe('parseCookieHeader', () => {
  it('parses a cookie header into name and value pairs', () => {
    expect(parseCookieHeader('sessionId=abc; acw_tc=def')).toEqual([
      { name: 'sessionId', value: 'abc' },
      { name: 'acw_tc', value: 'def' },
    ]);
  });

  it('ignores empty segments', () => {
    expect(parseCookieHeader('a=1;;b=2')).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
    ]);
  });

  it('keeps a value that contains an equals sign', () => {
    expect(parseCookieHeader('token=abc=def')).toEqual([{ name: 'token', value: 'abc=def' }]);
  });

  it('returns an empty list for an empty header', () => {
    expect(parseCookieHeader('')).toEqual([]);
  });
});

describe('selectAllowedCookies', () => {
  it('keeps only the allow-listed names', () => {
    const cookies = parseCookieHeader('sessionId=abc; tracking=xyz; acw_tc=def');
    expect(selectAllowedCookies(cookies, ['sessionId', 'acw_tc']).cookies).toEqual([
      { name: 'sessionId', value: 'abc' },
      { name: 'acw_tc', value: 'def' },
    ]);
  });

  it('reports the allow-listed names that are missing', () => {
    const cookies = parseCookieHeader('sessionId=abc');
    const missing = selectAllowedCookies(cookies, ['sessionId', 'acw_tc']).missing;
    expect(missing).toEqual(['acw_tc']);
  });

  it('renders the selected cookies as a request header', () => {
    const cookies = parseCookieHeader('sessionId=abc; acw_tc=def');
    expect(selectAllowedCookies(cookies, ['sessionId']).header).toBe('sessionId=abc');
  });
});
