import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { sanitizeValue } from './sanitize.mjs';

const MINIMAX_ORIGIN = process.env.MINIMAX_ORIGIN ?? 'https://www.minimaxi.com';
const MINIMAX_GLOBAL_ORIGIN = process.env.MINIMAX_GLOBAL_ORIGIN ?? 'https://www.minimax.io';

function minimaxEndpoints(provider, capability) {
  const origin = provider === 'minimax-cn' ? MINIMAX_ORIGIN : MINIMAX_GLOBAL_ORIGIN;
  const tokenEnv = provider === 'minimax-cn' ? 'MINIMAX_CN_TOKEN_PLAN' : 'MINIMAX_GLOBAL_TOKEN_PLAN';
  const cookieEnv = provider === 'minimax-cn' ? 'MINIMAX_CN_WEB_COOKIE' : 'MINIMAX_GLOBAL_WEB_COOKIE';
  switch (capability) {
    case 'minimax.plan':
      return [{ url: `${origin}/v1/api/openplatform/coding_plan/remains`, auth: { kind: 'bearer', env: tokenEnv } }];
    case 'minimax.subscription':
      return [{ url: `${origin}/v1/api/openplatform/charge/combo/cycle_audio_resource_package`, auth: { kind: 'bearer', env: tokenEnv } }];
    case 'minimax.tokenUsage':
      return [{ url: `${origin}/account/amount`, auth: { kind: 'bearer', env: tokenEnv } }];
    case 'minimax.points':
      return [{ url: `${origin}/backend/account/token_plan_credit`, auth: { kind: 'cookie', env: cookieEnv } }];
    default:
      throw new Error(`unknown MiniMax capability: ${capability}`);
  }
}

function deepseekEndpoints(capability) {
  switch (capability) {
    case 'deepseek.balance':
      return [{ url: 'https://api.deepseek.com/user/balance', auth: { kind: 'bearer', env: 'DEEPSEEK_API_KEY' } }];
    case 'deepseek.usageAmount':
      return [{ url: 'https://platform.deepseek.com/api/v0/usage/by_api_key/amount', auth: { kind: 'session', env: 'DEEPSEEK_SESSION_TOKEN', cookieEnv: 'DEEPSEEK_COOKIE' } }];
    case 'deepseek.usageCost':
      return [{ url: 'https://platform.deepseek.com/api/v0/usage/by_api_key/cost', auth: { kind: 'session', env: 'DEEPSEEK_SESSION_TOKEN', cookieEnv: 'DEEPSEEK_COOKIE' } }];
    case 'deepseek.accountSummary':
      return [{ url: 'https://platform.deepseek.com/api/v0/users/get_user_summary', auth: { kind: 'session', env: 'DEEPSEEK_SESSION_TOKEN', cookieEnv: 'DEEPSEEK_COOKIE' } }];
    default:
      throw new Error(`unknown DeepSeek capability: ${capability}`);
  }
}

function endpoints(provider, capability) {
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
    const token = process.env[spec.auth.env];
    const cookie = process.env[spec.auth.cookieEnv];
    if (!token) throw new Error(`missing environment variable ${spec.auth.env}`);
    if (!cookie) throw new Error(`missing environment variable ${spec.auth.cookieEnv}`);
    headers.Authorization = `Bearer ${token}`;
    headers.Cookie = cookie;
    headers['x-client-locale'] = 'zh_CN';
    headers['x-client-platform'] = 'web';
    headers.Referer = 'https://platform.deepseek.com/usage';
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

const specs = endpoints(provider, capability);
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
