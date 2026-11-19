import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeValue } from './sanitize.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { origins, endpoints, credentials } = JSON.parse(
  readFileSync(join(root, 'src', 'providers', 'endpoints.json'), 'utf8'),
);

function minimaxEndpoints(provider, capability) {
  const origin = process.env.MINIMAX_ORIGIN ?? origins[provider];
  const { tokenPlanEnv } = credentials[provider];
  const path = endpoints[capability];
  if (path === undefined) throw new Error(`unknown MiniMax capability: ${capability}`);
  return [{ url: `${origin}${path}`, auth: { kind: 'bearer', env: tokenPlanEnv } }];
}

function deepseekEndpoints(capability) {
  const path = endpoints[capability];
  if (path === undefined) throw new Error(`unknown DeepSeek capability: ${capability}`);
  if (capability !== 'deepseek.balance') {
    throw new Error(`unsupported DeepSeek capability: ${capability}`);
  }
  return [{
    url: `${origins['deepseek-api']}${path}`,
    auth: { kind: 'bearer', env: credentials.deepseek.apiKeyEnv },
  }];
}

function encode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function signAliyunRequest({ method, pathname, query, headers, accessKeyId, accessKeySecret, body }) {
  const payload = body ?? '';
  const payloadHash = sha256Hex(payload);
  const signedHeaders = { ...headers, 'x-acs-content-sha256': payloadHash };
  const signable = Object.entries(signedHeaders)
    .map(([key, value]) => [key.toLowerCase(), value.trim()])
    .filter(([key]) => key === 'host' || key === 'content-type' || key.startsWith('x-acs-'))
    .sort(([left], [right]) => left.localeCompare(right));
  const signedHeaderNames = signable.map(([key]) => key).join(';');
  const canonicalHeaders = signable.map(([key, value]) => `${key}:${value}\n`).join('');
  const canonicalQuery = Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join('&');
  const canonicalRequest = [
    method.toUpperCase(),
    pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join('\n');
  const signature = createHmac('sha256', accessKeySecret)
    .update(`ACS3-HMAC-SHA256\n${sha256Hex(canonicalRequest)}`, 'utf8')
    .digest('hex');
  return {
    ...signedHeaders,
    Authorization:
      `ACS3-HMAC-SHA256 Credential=${accessKeyId},` +
      `SignedHeaders=${signedHeaderNames},Signature=${signature}`,
  };
}

function readConsoleToken(body) {
  const token = body?.cliAccessToken ?? body?.Data?.cliAccessToken ?? body?.data?.cliAccessToken;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('the console token response did not contain cliAccessToken');
  }
  return token;
}

function qwenSteps(capability) {
  if (capability !== 'qwen.tokenPlan' && capability !== 'qwen.tokenPlanSubscription') {
    throw new Error(`unknown Qwen capability: ${capability}`);
  }
  const accessKeyId = process.env[credentials.qwen.accessKeyIdEnv];
  const accessKeySecret = process.env[credentials.qwen.accessKeySecretEnv];
  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      `missing environment variables ${credentials.qwen.accessKeyIdEnv} / ` +
        credentials.qwen.accessKeySecretEnv,
    );
  }

  const tokenUrl = new URL(`${origins['qwen-modelstudio']}${endpoints['qwen.tokenPlanToken']}`);
  const tokenHeaders = signAliyunRequest({
    method: 'POST',
    pathname: tokenUrl.pathname,
    query: { Action: 'GenerateCLIAccessToken', Version: '2026-02-10' },
    headers: {
      host: tokenUrl.host,
      'content-type': 'application/json',
      'x-acs-action': 'GenerateCLIAccessToken',
      'x-acs-date': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      'x-acs-signature-nonce': randomUUID(),
      'x-acs-version': '2026-02-10',
    },
    accessKeyId,
    accessKeySecret,
    body: '{}',
  });

  const endpoint = capability === 'qwen.tokenPlan'
    ? endpoints['qwen.tokenPlanUsage']
    : endpoints['qwen.tokenPlanSubscription'];
  const gatewayUrl = `${origins['qwen-console']}${endpoint}`;
  const api = new URL(gatewayUrl).searchParams.get('api');
  if (api === null) throw new Error(`the ${capability} endpoint is missing its api query`);
  const params = {
    Api: api,
    V: '1.0',
    Data: {
      ...(capability === 'qwen.tokenPlanSubscription'
        ? { commodityCode: 'sfm_tokenplansolo_public_cn' }
        : {}),
      cornerstoneParam: {
        protocol: 'V2',
        console: 'ONE_CONSOLE',
        productCode: 'p_efm',
        switchUserType: 3,
        consoleSite: 'BAILIAN_ALIYUN',
      },
    },
  };

  return [
    {
      url: tokenUrl.toString(),
      method: 'POST',
      headers: { ...tokenHeaders, Accept: 'application/json' },
      body: '{}',
    },
    {
      url: gatewayUrl,
      method: 'POST',
      headers: (responses) => ({
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${readConsoleToken(responses[0])}`,
      }),
      body: new URLSearchParams({
        params: JSON.stringify(params),
        region: 'cn-beijing',
      }).toString(),
    },
  ];
}

function specsFor(provider, capability) {
  if (provider === 'minimax-cn' || provider === 'minimax-global') {
    return minimaxEndpoints(provider, capability);
  }
  if (provider === 'deepseek') return deepseekEndpoints(capability);
  if (provider === 'qwen') return qwenSteps(capability);
  throw new Error(`unknown provider: ${provider}`);
}

function headersFor(spec) {
  const headers = { Accept: 'application/json' };
  if (spec.auth === undefined) return headers;
  if (spec.auth.kind === 'bearer') {
    const token = process.env[spec.auth.env];
    if (!token) throw new Error(`missing environment variable ${spec.auth.env}`);
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  throw new Error(`unsupported auth kind: ${spec.auth.kind}`);
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) throw new Error(`missing --${name}`);
  return process.argv[index + 1];
}

const provider = argument('provider');
const capability = argument('capability');
const caseName = argument('case');
const sensitiveKeys = (process.env.FIXTURE_SENSITIVE_KEYS ?? '').split(',').filter(Boolean);

const specs = specsFor(provider, capability);
const bodies = [];

for (const spec of specs) {
  const url = new URL(spec.url);
  for (const [key, value] of Object.entries(spec.query ?? {})) url.searchParams.set(key, value);
  const headers = typeof spec.headers === 'function'
    ? spec.headers(bodies)
    : { ...headersFor(spec), ...(spec.headers ?? {}) };
  const body = typeof spec.body === 'function' ? spec.body(bodies) : spec.body;
  const response = await fetch(url, {
    method: spec.method ?? 'GET',
    headers,
    ...(body === undefined ? {} : { body }),
  });
  const text = await response.text();
  if (!response.ok) {
    console.error(`${spec.url} returned ${response.status} with a ${text.length} byte body`);
    process.exit(2);
  }
  try {
    bodies.push(JSON.parse(text));
  } catch {
    console.error(`${spec.url} returned a non-JSON body`);
    process.exit(2);
  }
}

const final = bodies[bodies.length - 1];
if (final?.successResponse === false || final?.data?.success === false) {
  console.error(
    `gateway rejected the request: ${final?.data?.errorCode ?? final?.code ?? 'unknown'}`,
  );
  process.exit(2);
}

const fixture = {
  capturedAt: new Date().toISOString(),
  provider,
  capability,
  case: caseName,
  sourceHost: new URL(specs[specs.length - 1].url).host,
  sourceUrls: specs.map((spec) => spec.url),
  response: sanitizeValue(final, sensitiveKeys),
  ...(bodies.length > 1 ? { steps: sanitizeValue(bodies, sensitiveKeys) } : {}),
};

const tail = capability.includes('.') ? capability.slice(capability.indexOf('.') + 1) : capability;
const target = join(process.cwd(), 'src', 'test', 'fixtures', provider, tail, `${caseName}.json`);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
console.log(`wrote ${relative(process.cwd(), target)}`);
