import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeValue } from './sanitize.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { origins, endpoints } = JSON.parse(
  readFileSync(join(root, 'src', 'providers', 'endpoints.json'), 'utf8'),
);

const AUTH = origins['qwen-auth'];
const CLI = origins['qwen-cli'];
const DATA = origins['qwen-data'];

function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', ...headers },
    ...(body === undefined ? {} : { body }),
  }).then(async (response) => {
    const text = await response.text();
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${url} returned a non-JSON body`);
    }
  });
}

function statusOf(body) {
  return String(body?.Data?.Status ?? body?.status ?? 'authorization_pending').toLowerCase();
}

function accessTokenOf(body) {
  return body?.Data?.Credentials?.AccessToken ?? body?.credentials?.access_token ?? null;
}

async function deviceLogin() {
  const clientId = randomUUID();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const init = await postJson(
    `${AUTH}${endpoints['qwen.deviceCode']}?client_id=${encodeURIComponent(clientId)}` +
      `&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`,
  );
  if (init?.Success !== true || !init.Data) throw new Error('device flow init failed');
  const deviceToken = init.Data.Token;
  const expiresIn = Number(init.Data.ExpiresIn) || 600;
  let intervalMs = Math.max(1, Number(init.Data.Interval) || 5) * 1000;
  console.error(`Open this URL and approve the login: ${init.Data.VerificationUrl}`);
  console.error(`The link expires in ${expiresIn}s.`);
  const deadline = Date.now() + expiresIn * 1000;
  let accessToken = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const poll = await postJson(
      `${AUTH}${endpoints['qwen.devicePoll']}?client_id=${encodeURIComponent(clientId)}` +
        `&token=${encodeURIComponent(deviceToken)}&code_verifier=${encodeURIComponent(verifier)}`,
    );
    const status = statusOf(poll);
    if (status === 'complete') {
      accessToken = accessTokenOf(poll);
      break;
    }
    if (status === 'slow_down') {
      intervalMs += 5000;
      continue;
    }
    if (status === 'expired_token' || status === 'access_denied') {
      throw new Error(`device flow ${status}`);
    }
  }
  if (!accessToken) throw new Error('device flow expired');
  return accessToken;
}

async function issueConsoleToken(accessToken) {
  const url = `${CLI}${endpoints['qwen.consoleAccess']}`;
  const response = await postJson(
    url,
    JSON.stringify({
      product: 'ModelStudioRegional',
      action: 'GenerateCLIAccessToken',
      region: 'cn-beijing',
      params: {},
      version: '2026-02-10',
    }),
    { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  );
  const token = response?.data?.cliAccessToken;
  if (response?.code !== '200' || typeof token !== 'string') {
    throw new Error('GenerateCLIAccessToken did not return cliAccessToken');
  }
  return { token, response };
}

async function gateway(consoleToken, capability) {
  const endpoint = capability === 'qwen.tokenPlan'
    ? endpoints['qwen.tokenPlanUsage']
    : endpoints['qwen.tokenPlanSubscription'];
  const url = `${DATA}${endpoint}`;
  const api = new URL(url).searchParams.get('api');
  if (api === null) throw new Error(`missing api query in ${capability}`);
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
        consoleSite: 'QIANWENAI',
      },
    },
  };
  const response = await postJson(
    url,
    new URLSearchParams({ params: JSON.stringify(params), region: 'cn-beijing' }).toString(),
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${consoleToken}`,
    },
  );
  if (response?.successResponse === false || response?.data?.success === false) {
    throw new Error(
      `gateway rejected the request: ${response?.data?.errorCode ?? response?.code ?? 'unknown'}`,
    );
  }
  return { response, url };
}

function writeFixture(capability, caseName, consoleStep, gatewayStep) {
  const fixture = {
    capturedAt: new Date().toISOString(),
    provider: 'qwen',
    capability,
    case: caseName,
    sourceHost: new URL(gatewayStep.url).host,
    sourceUrls: [consoleStep.url, gatewayStep.url],
    response: sanitizeValue(gatewayStep.response),
    steps: [sanitizeValue(consoleStep.response), sanitizeValue(gatewayStep.response)],
  };
  const tail = capability.slice(capability.indexOf('.') + 1);
  const target = join(process.cwd(), 'src', 'test', 'fixtures', 'qwen', tail, `${caseName}.json`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log(`wrote ${relative(process.cwd(), target)}`);
}

const accessToken = await deviceLogin();
const consoleStep = await issueConsoleToken(accessToken);
const usage = await gateway(consoleStep.token, 'qwen.tokenPlan');
writeFixture('qwen.tokenPlan', 'standard', { url: `${CLI}${endpoints['qwen.consoleAccess']}`, response: consoleStep.response }, usage);
const subscription = await gateway(consoleStep.token, 'qwen.tokenPlanSubscription');
writeFixture(
  'qwen.tokenPlanSubscription',
  'standard',
  { url: `${CLI}${endpoints['qwen.consoleAccess']}`, response: consoleStep.response },
  subscription,
);
