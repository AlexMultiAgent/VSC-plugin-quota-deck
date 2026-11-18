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
  const { tokenPlanEnv, cookieEnv } = credentials[provider];
  const path = endpoints[capability];
  if (path === undefined) throw new Error(`unknown MiniMax capability: ${capability}`);
  const auth =
    capability === 'minimax.points'
      ? { kind: 'cookie', env: cookieEnv }
      : { kind: 'bearer', env: tokenPlanEnv };
  return [{ url: `${origin}${path}`, auth }];
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

function specsFor(provider, capability) {
  if (provider === 'minimax-cn' || provider === 'minimax-global') {
    return minimaxEndpoints(provider, capability);
  }
  if (provider === 'deepseek') return deepseekEndpoints(capability);
  throw new Error(`unknown provider: ${provider}`);
}

function headersFor(spec) {
  const headers = { Accept: 'application/json' };
  if (spec.auth.kind === 'bearer') {
    const token = process.env[spec.auth.env];
    if (!token) throw new Error(`missing environment variable ${spec.auth.env}`);
    headers.Authorization = `Bearer ${token}`;
  } else if (spec.auth.kind === 'cookie') {
    const cookie = process.env[spec.auth.env];
    if (!cookie) throw new Error(`missing environment variable ${spec.auth.env}`);
    headers.Cookie = cookie;
  } else {
    throw new Error(`unsupported auth kind: ${spec.auth.kind}`);
  }
  return headers;
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
  const response = await fetch(url, { headers: headersFor(spec) });
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

const payload =
  bodies.length === 1 ? bodies[0] : { capturedAt: new Date().toISOString(), responses: bodies };

const fixture = {
  capturedAt: new Date().toISOString(),
  provider,
  capability,
  case: caseName,
  sourceHost: new URL(specs[0].url).host,
  sourceUrls: specs.map((spec) => spec.url),
  response: sanitizeValue(payload, sensitiveKeys),
};

const tail = capability.includes('.') ? capability.slice(capability.indexOf('.') + 1) : capability;
const target = join(process.cwd(), 'src', 'test', 'fixtures', provider, tail, `${caseName}.json`);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
console.log(`wrote ${relative(process.cwd(), target)}`);
