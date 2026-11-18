import { describe, expect, it } from 'vitest';
import { signAliyunRequest } from './request';

describe('signAliyunRequest', () => {
  it('builds the ACS3 signature and signed headers for an empty RPC request', () => {
    const headers = signAliyunRequest({
      method: 'GET',
      pathname: '/',
      query: {},
      headers: {
        host: 'business.aliyuncs.com',
        'x-acs-action': 'QueryAccountBalance',
        'x-acs-date': '2020-08-25T01:11:01Z',
        'x-acs-signature-nonce': 'd7730860-e66f-11ea-a3a5-d5f3b52e66a1',
        'x-acs-version': '2017-12-14',
      },
      accessKeyId: 'testid',
      accessKeySecret: 'testsecret',
    });

    expect(headers.Authorization).toBe(
      'ACS3-HMAC-SHA256 Credential=testid,' +
        'SignedHeaders=host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version,' +
        'Signature=492674a4807c9f70f70ec3073e0dfeeb32c571aba0228fe7e9e12d3072e57b52',
    );
    expect(headers['x-acs-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
