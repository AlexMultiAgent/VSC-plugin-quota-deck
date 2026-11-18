import { createHash, createHmac } from 'node:crypto';

export interface AliyunRequestSignature {
  readonly method: string;
  readonly pathname: string;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly accessKeyId: string;
  readonly accessKeySecret: string;
  readonly body?: string;
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function signAliyunRequest(
  request: AliyunRequestSignature,
): Record<string, string> {
  const payload = request.body ?? '';
  const payloadHash = sha256Hex(payload);
  const headers = { ...request.headers, 'x-acs-content-sha256': payloadHash };
  const signable = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
    .filter(([key]) => key === 'host' || key === 'content-type' || key.startsWith('x-acs-'))
    .sort(([left], [right]) => left.localeCompare(right));
  const signedHeaders = signable.map(([key]) => key).join(';');
  const canonicalHeaders = signable.map(([key, value]) => `${key}:${value}\n`).join('');
  const canonicalQuery = Object.entries(request.query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join('&');
  const canonicalRequest = [
    request.method.toUpperCase(),
    request.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const stringToSign = `ACS3-HMAC-SHA256\n${sha256Hex(canonicalRequest)}`;
  const signature = createHmac('sha256', request.accessKeySecret)
    .update(stringToSign, 'utf8')
    .digest('hex');

  return {
    ...headers,
    Authorization:
      `ACS3-HMAC-SHA256 Credential=${request.accessKeyId},` +
      `SignedHeaders=${signedHeaders},Signature=${signature}`,
  };
}
