import { describe, expect, it } from 'vitest';
import {
  deviceCodeUrl,
  deviceTokenUrl,
  isManagementTokenExpired,
  parseQwenManagementToken,
  readQwenDeviceInit,
  readQwenDevicePoll,
  serializeQwenManagementToken,
} from './auth';

describe('readQwenDeviceInit', () => {
  it('reads the device code, verification URL, expiry, and interval', () => {
    expect(
      readQwenDeviceInit({
        Success: true,
        Data: {
          Token: 'device-token',
          VerificationUrl: 'https://account.qianwenai.com/sso/OIDCAuth?auth_token=x',
          ExpiresIn: 300,
          Interval: 2,
        },
      }),
    ).toEqual({
      deviceToken: 'device-token',
      verificationUrl: 'https://account.qianwenai.com/sso/OIDCAuth?auth_token=x',
      expiresIn: 300,
      interval: 2,
    });
  });

  it('rejects a response without a verification URL', () => {
    expect(() =>
      readQwenDeviceInit({ Success: true, Data: { Token: 'x', ExpiresIn: 300, Interval: 2 } }),
    ).toThrow();
  });
});

describe('readQwenDevicePoll', () => {
  it('keeps polling while authorization is pending', () => {
    expect(readQwenDevicePoll({ Success: true, Data: { Status: 'authorization_pending' } })).toEqual({
      status: 'authorization_pending',
    });
  });

  it('reads the access token and expiry when complete', () => {
    expect(
      readQwenDevicePoll({
        Success: true,
        Data: {
          Status: 'complete',
          Credentials: {
            AccessToken: 'access-token',
            RefreshToken: 'refresh-token',
            ExpireTime: '2027-01-01T00:00:00.000Z',
            User: { AliyunId: 'user' },
          },
        },
      }),
    ).toEqual({
      status: 'complete',
      accessToken: 'access-token',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('accepts the snake_case fallback shape', () => {
    expect(
      readQwenDevicePoll({
        status: 'complete',
        credentials: { access_token: 'access-token', expire_time: '2027-01-01T00:00:00.000Z' },
      }),
    ).toEqual({
      status: 'complete',
      accessToken: 'access-token',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('rejects an unknown status instead of polling forever', () => {
    expect(() => readQwenDevicePoll({ Success: true, Data: { Status: 'weird' } })).toThrow();
  });

  it('rejects a complete response without an access token', () => {
    expect(() => readQwenDevicePoll({ Success: true, Data: { Status: 'complete' } })).toThrow();
  });
});

describe('management token', () => {
  it('round-trips the stored token', () => {
    const serialized = serializeQwenManagementToken({
      accessToken: 'access-token',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    expect(parseQwenManagementToken(serialized)).toEqual({
      accessToken: 'access-token',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('rejects empty and malformed storage values', () => {
    expect(parseQwenManagementToken(undefined)).toBeUndefined();
    expect(parseQwenManagementToken('')).toBeUndefined();
    expect(parseQwenManagementToken('not json')).toBeUndefined();
    expect(parseQwenManagementToken('{"expiresAt":"x"}')).toBeUndefined();
  });

  it('treats a missing expiry as unknown rather than expired', () => {
    expect(isManagementTokenExpired({ accessToken: 'x', expiresAt: '' })).toBe(false);
  });

  it('detects a past expiry', () => {
    expect(
      isManagementTokenExpired(
        { accessToken: 'x', expiresAt: '2026-01-01T00:00:00.000Z' },
        Date.parse('2026-11-20T00:00:00.000Z'),
      ),
    ).toBe(true);
  });
});

describe('device URLs', () => {
  it('builds the PKCE device-code URL', () => {
    const url = new URL(
      deviceCodeUrl('https://t.qianwenai.com', '/cli/device/code', 'client-id', 'challenge'),
    );
    expect(url.origin).toBe('https://t.qianwenai.com');
    expect(url.pathname).toBe('/cli/device/code');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('code_challenge')).toBe('challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('builds the poll URL with the verifier', () => {
    const url = new URL(
      deviceTokenUrl('https://t.qianwenai.com', '/cli/device/token', 'client-id', 'device', 'verifier'),
    );
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('token')).toBe('device');
    expect(url.searchParams.get('code_verifier')).toBe('verifier');
  });
});
