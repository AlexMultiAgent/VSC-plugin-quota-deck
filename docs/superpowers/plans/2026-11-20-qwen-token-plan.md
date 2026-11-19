# Qianwen Token Plan Quota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the personal Qianwen AI Platform Token Plan quota (monthly/weekly remaining percent, reset time, plan tier, expiry) in all four QuotaDeck surfaces using the Alibaba Cloud AccessKey pair already used for the Qwen account balance.

**Architecture:** `QwenProvider` gains two capabilities, `qwen.tokenPlan` and `qwen.tokenPlanSubscription`. Each refresh issues one short-lived console token with `GenerateCLIAccessToken` (ACS3-HMAC-SHA256 signed with the existing AK/SK), then calls the console gateway twice with that token. Parsers live in `src/providers/qwen/shape.ts`; the response envelope is pinned by a live capture before any parser is trusted. Presentation changes are confined to the existing Qwen branches of the four surfaces.

**Tech Stack:** TypeScript (strict, ES2022, Node16), esbuild, Vitest with a hand-written `vscode` mock, Node `fetch`, ACS3-HMAC-SHA256 signing via `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-11-20-qwen-token-plan-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `src/providers/endpoints.json` | Single source for the two new origins, three endpoint paths, and the capture-only env var names |
| `src/core/http.ts` | Add `postForm()` for `application/x-www-form-urlencoded` |
| `scripts/capture-fixture.mjs` | Add the chained signed Qwen flow; write the two fixtures |
| `src/providers/qwen/shape.ts` | Console-token reader, usage parser, subscription parser, typed errors |
| `src/providers/qwen/provider.ts` | Issue the console token, call the gateway, map failures to capability states |
| `src/providers/registry.ts` | Pass the three Qwen origins to the provider |
| `src/presentation/overview/model.ts` | Add Token Plan children to the Qwen tree item |
| `src/presentation/tooltip.ts` | Add the Token Plan section to the Qwen tooltip card |
| `src/presentation/statusBar.ts` | Append the tightest window percent to the Qwen segment and include it in the tone |
| `src/presentation/dashboard/viewModel.ts` | Add Token Plan meters and subscription details |
| `src/localization/messages.ts` + `en-us.ts` + `zh-cn.ts` | New UI strings |
| `docs/contracts/qwen.md` | Verified Token Plan contract |
| `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `package.json`, `package-lock.json` | Documentation and release metadata |

## Revision 2026-11-20: OAuth management login (supersedes Tasks 1–4 transport)

The AK/SK route failed live with `BailianGateway.Team.NotAuthorised` on both gateway sites; the
user approved switching to the official Qianwen management OAuth device flow. The live probe
succeeded, and the real responses are already committed under
`src/test/fixtures/qwen/tokenPlan/standard.json` and `.../tokenPlanSubscription/standard.json`.
The design authority is the revised
[`2026-11-20-qwen-token-plan-design.md`](../specs/2026-11-20-qwen-token-plan-design.md).

For the OAuth revision:

- **Task 1 endpoints** become: `qwen-auth` (`https://t.qianwenai.com`), `qwen-cli`
  (`https://cli.qianwenai.com`), `qwen-data` (`https://cs-data.qianwenai.com`); endpoints
  `qwen.deviceCode` (`/cli/device/code`), `qwen.deviceToken` (`/cli/device/token`),
  `qwen.tokenPlanToken` (`/data/v2/api.json`), `qwen.tokenPlanUsage`, and
  `qwen.tokenPlanSubscription` on `/cli/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=…`.
  There is no Qwen credential environment variable. `postForm()` is still required.
- **Task 2 is complete:** the fixtures were captured through the device flow; no second capture is
  needed. The fixture `steps[0]` is the flat `GenerateCLIAccessToken` response with
  `data.cliAccessToken = "<redacted>"`.
- **Task 3** keeps the typed parsers and tests, and adds `src/providers/qwen/auth.ts` for the
  device-code response, poll response, and stored management token.
- **Task 4** is replaced by the OAuth provider and the login command:
  - new credential kind `management-token` in `CREDENTIAL_KINDS` and `CREDENTIAL_PART`;
  - `connect()` reads AK/SK and the management token, returning `partial` when only one group is
    present;
  - the provider issues the console token through
    `POST https://cli.qianwenai.com/data/v2/api.json` (JSON body `product: ModelStudioRegional`,
    `action: GenerateCLIAccessToken`, `version: 2026-02-10`, `params: {}`) with the management
    bearer, then calls `https://cs-data.qianwenai.com/cli/api.json` with
    `consoleSite: QIANWENAI`;
  - a new `quotaDeck.loginQwen` command performs the device flow, opens the verification URL, and
    stores `{ accessToken, expiresAt }` in Secret Storage; it is contributed in `package.json`,
    registered in `commands.ts`, and reachable from the configure-Qwen flow;
  - expired or missing management tokens disable only the two Token Plan capabilities
    (`error.qwen.loginExpired` / `unconfigured`), never the balance.

Tasks 5–9 (localization, tree, tooltip, status bar, dashboard) remain valid unchanged: the data
types and presentation shape are identical. Task 10's docs/release steps remain, with the OAuth
capture and login command included.

---

## Go/no-go gate

The live capture is complete. The parser and provider may now be written against the committed
fixtures. If a future re-capture disagrees with a fixture, stop and update the contract first.

---

### Task 1: Add the Token Plan endpoints and form POST support

**Files:**

- Modify: `src/providers/endpoints.json`
- Modify: `src/core/http.ts:41-58`
- Test: `src/core/http.test.ts`, `scripts/endpoints.test.ts`

- [ ] **Step 1: Write the failing HTTP test**

Append to `describe('HttpClient', ...)` in `src/core/http.test.ts`, after the existing `postJson` test:

```ts
  it('sends a form body with POST and its content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock;
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });

    await client.postForm(
      'https://api.example.com/v1/action',
      'params=%7B%7D&region=cn-beijing',
    );

    const [url, init] = fetchMock.mock.calls.at(-1)! as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/action');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('params=%7B%7D&region=cn-beijing');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
  });
```

- [ ] **Step 2: Write the failing endpoint test**

Append to `scripts/endpoints.test.ts`:

```ts
  it('names the Qwen Token Plan origins and endpoints', () => {
    expect(ORIGINS['qwen-modelstudio']).toBe('https://modelstudio.cn-beijing.aliyuncs.com');
    expect(ORIGINS['qwen-console']).toBe('https://bailian-cs.console.aliyun.com');
    expect(ENDPOINTS['qwen.tokenPlanToken']).toBe(
      '/modelstudio/cli/generateAccessToken?Action=GenerateCLIAccessToken&Version=2026-02-10',
    );
    expect(ENDPOINTS['qwen.tokenPlanUsage']).toContain(
      'zeldaHttp.apikeyMgr.%2Ftokenplan%2Fpersonal%2Fapi%2Fv2%2Fusage',
    );
    expect(ENDPOINTS['qwen.tokenPlanSubscription']).toContain(
      'zeldaHttp.apikeyMgr.%2Ftokenplan%2Fpersonal%2Fapi%2Fv2%2Fsubscription',
    );
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/core/http.test.ts scripts/endpoints.test.ts`
Expected: FAIL — `client.postForm is not a function` and the three Qwen endpoint assertions fail.

- [ ] **Step 4: Add the endpoints**

Replace `src/providers/endpoints.json` with:

```json
{
  "origins": {
    "minimax-cn": "https://www.minimaxi.com",
    "minimax-global": "https://www.minimax.io",
    "deepseek-api": "https://api.deepseek.com",
    "qwen-api": "https://business.aliyuncs.com",
    "qwen-modelstudio": "https://modelstudio.cn-beijing.aliyuncs.com",
    "qwen-console": "https://bailian-cs.console.aliyun.com"
  },
  "endpoints": {
    "minimax.plan": "/v1/api/openplatform/coding_plan/remains",
    "minimax.subscription": "/v1/api/openplatform/charge/combo/cycle_audio_resource_package?biz_line=2&cycle_type=1&resource_package_type=7",
    "minimax.tokenUsage": "/account/amount?page=1&limit=100&aggregate=false",
    "deepseek.balance": "/user/balance",
    "qwen.tokenPlanToken": "/modelstudio/cli/generateAccessToken?Action=GenerateCLIAccessToken&Version=2026-02-10",
    "qwen.tokenPlanUsage": "/cli/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=zeldaHttp.apikeyMgr.%2Ftokenplan%2Fpersonal%2Fapi%2Fv2%2Fusage",
    "qwen.tokenPlanSubscription": "/cli/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=zeldaHttp.apikeyMgr.%2Ftokenplan%2Fpersonal%2Fapi%2Fv2%2Fsubscription"
  },
  "credentials": {
    "minimax-cn": {
      "tokenPlanEnv": "MINIMAX_CN_TOKEN_PLAN"
    },
    "minimax-global": {
      "tokenPlanEnv": "MINIMAX_GLOBAL_TOKEN_PLAN"
    },
    "deepseek": {
      "apiKeyEnv": "DEEPSEEK_API_KEY"
    },
    "qwen": {
      "accessKeyIdEnv": "ALIBABA_CLOUD_ACCESS_KEY_ID",
      "accessKeySecretEnv": "ALIBABA_CLOUD_ACCESS_KEY_SECRET"
    }
  }
}
```

- [ ] **Step 5: Add `postForm` to `HttpClient`**

In `src/core/http.ts`, insert this method immediately after `postJson`:

```ts
  /**
   * Send an `application/x-www-form-urlencoded` POST. The console gateway
   * accepts a form body, not JSON, and its signature covers the exact string.
   */
  async postForm(
    url: string,
    body: string,
    options: RequestOptions = {},
  ): Promise<JsonResult> {
    const headers = Object.fromEntries(
      Object.entries(options.headers ?? {}).filter(
        ([key]) => key.toLowerCase() !== 'content-type',
      ),
    );
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    return this.requestJson('POST', url, body, { ...options, headers });
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/core/http.test.ts scripts/endpoints.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/providers/endpoints.json src/core/http.ts src/core/http.test.ts scripts/endpoints.test.ts
git commit -m "feat: add Qwen Token Plan endpoints"
```

---

### Task 2: Extend the capture script and capture the live fixtures (go/no-go)

**Files:**

- Modify: `scripts/capture-fixture.mjs`
- Create: `src/test/fixtures/qwen/tokenPlan/standard.json`
- Create: `src/test/fixtures/qwen/tokenPlanSubscription/standard.json`

- [ ] **Step 1: Replace `scripts/capture-fixture.mjs` with the chained-flow version**

```js
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
```

- [ ] **Step 2: Verify the capture credentials are present without printing them**

Run:

```bash
[ -n "$ALIBABA_CLOUD_ACCESS_KEY_ID" ] && [ -n "$ALIBABA_CLOUD_ACCESS_KEY_SECRET" ] && echo ready || echo missing
```

Expected: `ready`.

If `missing`, ask the user to set both as user-level environment variables and restart the shell. Do not accept a value on the command line or from a file.

- [ ] **Step 3: Capture the usage fixture**

Run:

```bash
node scripts/capture-fixture.mjs --provider qwen --capability qwen.tokenPlan --case standard
```

Expected: `wrote src/test/fixtures/qwen/tokenPlan/standard.json`

If the script exits 2 with `gateway rejected the request: BailianGateway.Login.NotLogined`, stop the plan. The AK/SK could not obtain a usable console token; report the failure.

- [ ] **Step 4: Capture the subscription fixture**

Run:

```bash
node scripts/capture-fixture.mjs --provider qwen --capability qwen.tokenPlanSubscription --case standard
```

Expected: `wrote src/test/fixtures/qwen/tokenPlanSubscription/standard.json`

If the script exits 2 with `gateway rejected the request: BailianGateway.Team.NotAuthorised`, stop the plan and report that the RAM user must be joined to the Model Studio / Qianwen business space.

- [ ] **Step 5: Inspect the captured envelopes**

Run:

```bash
node -e "const f=require('./src/test/fixtures/qwen/tokenPlan/standard.json'); console.log(JSON.stringify(f.response).slice(0,2000))"
node -e "const f=require('./src/test/fixtures/qwen/tokenPlanSubscription/standard.json'); console.log(JSON.stringify(f.response).slice(0,2000))"
```

Confirm the usage fixture contains at least one of `per1MonthPercentage` or `per1WeekPercentage`, and the subscription fixture contains `status` and `specCode`. Record in a scratch note (not committed) the exact paths to those fields if they differ from `response.data.DataV2.data.data`. If the paths differ, the parser in Task 3 must be adjusted together with its tests; the capture is the authority.

- [ ] **Step 6: Run the fixture guard**

Run: `npm run guard:fixtures`
Expected: `Fixture guard OK` and the new files are scanned. The token response under `steps` must show `"cliAccessToken": "<redacted>"`.

- [ ] **Step 7: Commit**

```bash
git add scripts/capture-fixture.mjs src/test/fixtures/qwen
git commit -m "chore: capture Qwen Token Plan fixtures"
```

---

### Task 3: Parse the console token, usage, and subscription

**Files:**

- Modify: `src/providers/qwen/shape.ts`
- Test: `src/providers/qwen/shape.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Append to `src/providers/qwen/shape.test.ts`. Add these imports at the top:

```ts
import {
  QwenConsoleAuthError,
  QwenConsoleForbiddenError,
  readQwenConsoleToken,
  readQwenTokenPlan,
  readQwenTokenPlanSubscription,
} from './shape';
import { loadFixture } from '../../test/helpers/fixture';
```

Then append:

```ts
type Captured = { response: any; steps?: any[] };

function capture(capability: 'qwen.tokenPlan' | 'qwen.tokenPlanSubscription'): Captured {
  return JSON.parse(
    JSON.stringify(loadFixture('qwen', capability, 'standard')),
  ) as Captured;
}

function usageResponse(fields: Record<string, unknown>): any {
  const fixture = capture('qwen.tokenPlan');
  const entity = fixture.response.data.DataV2.data.data;
  delete entity.per1MonthPercentage;
  delete entity.per1MonthResetTime;
  delete entity.per1WeekPercentage;
  delete entity.per1WeekResetTime;
  Object.assign(entity, fields);
  return fixture.response;
}

function subscriptionResponse(data: unknown): any {
  const fixture = capture('qwen.tokenPlanSubscription');
  fixture.response.data.DataV2.data.data = data;
  return fixture.response;
}

function gatewayError(errorCode: string): any {
  const fixture = capture('qwen.tokenPlan');
  fixture.response.data.success = false;
  fixture.response.data.errorCode = errorCode;
  return fixture.response;
}

describe('readQwenConsoleToken', () => {
  it('reads the token from the captured issuance response', () => {
    const fixture = capture('qwen.tokenPlan');
    expect(readQwenConsoleToken(fixture.steps?.[0])).toBe('<redacted>');
  });

  it('reads a token from a wrapped Data object', () => {
    expect(readQwenConsoleToken({ Data: { cliAccessToken: 'token' } })).toBe('token');
  });

  it('rejects a response without a token', () => {
    expect(() => readQwenConsoleToken({})).toThrow();
  });
});

describe('readQwenTokenPlan', () => {
  it('maps the monthly window from the captured envelope', () => {
    expect(
      readQwenTokenPlan(
        usageResponse({ per1MonthPercentage: 0.62, per1MonthResetTime: 1790000000000 }),
      ),
    ).toEqual({
      windows: [{ cycle: 'monthly', usedRatio: 0.62, resetAt: 1790000000000 }],
    });
  });

  it('maps the legacy weekly window', () => {
    expect(
      readQwenTokenPlan(usageResponse({ per1WeekPercentage: 0.25 })),
    ).toEqual({
      windows: [{ cycle: 'weekly', usedRatio: 0.25, resetAt: null }],
    });
  });

  it('keeps monthly and weekly independent when both are present', () => {
    expect(
      readQwenTokenPlan(
        usageResponse({
          per1MonthPercentage: 0.5,
          per1WeekPercentage: 0.75,
          per1WeekResetTime: 1780000000000,
        }),
      ),
    ).toEqual({
      windows: [
        { cycle: 'monthly', usedRatio: 0.5, resetAt: null },
        { cycle: 'weekly', usedRatio: 0.75, resetAt: 1780000000000 },
      ],
    });
  });

  it('returns no windows when the payload has no percentage', () => {
    expect(readQwenTokenPlan(usageResponse({}))).toEqual({ windows: [] });
  });

  it('rejects a percentage outside 0..1 instead of clamping it', () => {
    expect(() => readQwenTokenPlan(usageResponse({ per1MonthPercentage: 62 }))).toThrow();
  });

  it('rejects a non-integer reset time', () => {
    expect(() =>
      readQwenTokenPlan(usageResponse({ per1MonthPercentage: 0.1, per1MonthResetTime: 1.5 })),
    ).toThrow();
  });

  it('turns a missing usage payload into no windows', () => {
    const fixture = capture('qwen.tokenPlan');
    fixture.response.data.DataV2.data.data = null;
    expect(readQwenTokenPlan(fixture.response)).toEqual({ windows: [] });
  });

  it('raises a dedicated error for NotLogined', () => {
    expect(() => readQwenTokenPlan(gatewayError('BailianGateway.Login.NotLogined'))).toThrow(
      QwenConsoleAuthError,
    );
  });

  it('raises a dedicated error for Team.NotAuthorised', () => {
    expect(() => readQwenTokenPlan(gatewayError('BailianGateway.Team.NotAuthorised'))).toThrow(
      QwenConsoleForbiddenError,
    );
  });
});

describe('readQwenTokenPlanSubscription', () => {
  it('reads an active subscription from the captured envelope', () => {
    expect(
      readQwenTokenPlanSubscription(
        subscriptionResponse({
          status: 'VALID',
          specCode: 'pro',
          endTime: 1790000000000,
          remainingDays: 12,
        }),
      ),
    ).toEqual({
      status: 'active',
      specCode: 'pro',
      expiresAt: 1790000000000,
      remainingDays: 12,
    });
  });

  it('reports none when the payload has no subscription', () => {
    expect(readQwenTokenPlanSubscription(subscriptionResponse(null))).toEqual({
      status: 'none',
      specCode: null,
      expiresAt: null,
      remainingDays: null,
    });
  });

  it('reports unknown for a status other than VALID', () => {
    expect(
      readQwenTokenPlanSubscription(subscriptionResponse({ status: 'EXPIRED' })),
    ).toEqual({
      status: 'unknown',
      specCode: null,
      expiresAt: null,
      remainingDays: null,
    });
  });

  it('does not invent a missing expiry or tier', () => {
    expect(
      readQwenTokenPlanSubscription(subscriptionResponse({ status: 'VALID' })),
    ).toEqual({
      status: 'active',
      specCode: null,
      expiresAt: null,
      remainingDays: null,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/providers/qwen/shape.test.ts`
Expected: FAIL — the new exports do not exist.

- [ ] **Step 3: Implement the parsers**

Replace `src/providers/qwen/shape.ts` with:

```ts
import { ShapeError, asRecord, numberOrNull, requireNumber } from '../shape';

export interface QwenAccountBalance {
  readonly availableAmount: number;
  readonly creditAmount: number;
  readonly mybankCreditAmount: number;
  readonly availableCashAmount: number;
  readonly quotaLimit: number | null;
  readonly currency: string;
}

export interface QwenTokenPlanWindow {
  readonly cycle: 'monthly' | 'weekly';
  /** Official semantic: used ratio in 0..1, never remaining. */
  readonly usedRatio: number;
  readonly resetAt: number | null;
}

export interface QwenTokenPlan {
  /** Only windows the backend actually returned a percentage for. */
  readonly windows: readonly QwenTokenPlanWindow[];
}

export type QwenTokenPlanStatus = 'active' | 'none' | 'unknown';

export interface QwenTokenPlanSubscription {
  readonly status: QwenTokenPlanStatus;
  readonly specCode: string | null;
  readonly expiresAt: number | null;
  readonly remainingDays: number | null;
}

/** The console gateway rejected the derived token even after a refresh. */
export class QwenConsoleAuthError extends Error {
  constructor() {
    super('BailianGateway.Login.NotLogined');
    this.name = 'QwenConsoleAuthError';
  }
}

/** The AccessKey is valid but not joined to the Model Studio business space. */
export class QwenConsoleForbiddenError extends Error {
  constructor() {
    super('BailianGateway.Team.NotAuthorised');
    this.name = 'QwenConsoleForbiddenError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('expected an object');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('expected a non-empty string');
  }
  return value;
}

function amount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(text(value));
  if (!Number.isFinite(parsed)) throw new TypeError('expected a finite amount');
  return parsed;
}

export function readQwenAccountBalance(response: unknown): QwenAccountBalance {
  const root = record(response);
  if (root.Code !== '200' || root.Success !== true) {
    throw new Error('the balance query failed');
  }
  const data = record(root.Data);
  const quotaLimit = data.QuotaLimit === undefined ? null : amount(data.QuotaLimit);
  return {
    availableAmount: amount(data.AvailableAmount),
    creditAmount: amount(data.CreditAmount),
    mybankCreditAmount: amount(data.MybankCreditAmount),
    availableCashAmount: amount(data.AvailableCashAmount),
    quotaLimit,
    currency: text(data.Currency),
  };
}

function tokenIn(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const token = (value as Record<string, unknown>).cliAccessToken;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

export function readQwenConsoleToken(response: unknown): string {
  const root = asRecord(response, 'root');
  const token = tokenIn(root) ?? tokenIn(root.Data) ?? tokenIn(root.data);
  if (token === undefined) throw new ShapeError('cliAccessToken');
  return token;
}

/**
 * Validate the console gateway envelope and return the business record. The
 * usage and subscription payloads both live at `DataV2.data.data`; `ret` is
 * checked when the gateway sends it and is not required when it does not.
 */
function gatewayBusiness(response: unknown): Record<string, unknown> {
  const root = asRecord(response, 'root');
  if (root.code !== '200' || root.successResponse !== true) {
    throw new ShapeError('code');
  }
  const gateway = asRecord(root.data, 'data');
  const errorCode = typeof gateway.errorCode === 'string' ? gateway.errorCode : '';
  if (gateway.success === false && errorCode === 'BailianGateway.Login.NotLogined') {
    throw new QwenConsoleAuthError();
  }
  if (gateway.success === false && errorCode === 'BailianGateway.Team.NotAuthorised') {
    throw new QwenConsoleForbiddenError();
  }
  if (gateway.success !== true || errorCode !== '') throw new ShapeError('success');

  const dataV2 = asRecord(gateway.DataV2, 'DataV2');
  const ret = dataV2.ret;
  if (
    ret !== undefined &&
    (!Array.isArray(ret) || typeof ret[0] !== 'string' || !ret[0].startsWith('SUCCESS::'))
  ) {
    throw new ShapeError('ret');
  }
  const business = asRecord(dataV2.data, 'business');
  if (business.code !== 'SUCCESS' || business.success !== true) {
    throw new ShapeError('business');
  }
  return business;
}

function timestampOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

const USAGE_CYCLES = [
  { cycle: 'monthly', percentage: 'per1MonthPercentage', resetTime: 'per1MonthResetTime' },
  { cycle: 'weekly', percentage: 'per1WeekPercentage', resetTime: 'per1WeekResetTime' },
] as const;

export function readQwenTokenPlan(response: unknown): QwenTokenPlan {
  const business = gatewayBusiness(response);
  if (business.data === undefined || business.data === null) return { windows: [] };
  const payload = asRecord(business.data, 'usage');
  const windows: QwenTokenPlanWindow[] = [];

  for (const { cycle, percentage, resetTime } of USAGE_CYCLES) {
    if (!Object.hasOwn(payload, percentage)) continue;
    const usedRatio = requireNumber(payload[percentage], percentage);
    if (usedRatio < 0 || usedRatio > 1) throw new ShapeError(percentage);

    const rawReset = payload[resetTime];
    let resetAt: number | null = null;
    if (rawReset !== undefined && rawReset !== null) {
      const parsed = requireNumber(rawReset, resetTime);
      if (!Number.isSafeInteger(parsed) || parsed < 0) throw new ShapeError(resetTime);
      resetAt = parsed;
    }

    windows.push({ cycle, usedRatio, resetAt });
  }

  return { windows };
}

export function readQwenTokenPlanSubscription(
  response: unknown,
): QwenTokenPlanSubscription {
  const business = gatewayBusiness(response);
  if (business.data === undefined || business.data === null) {
    return { status: 'none', specCode: null, expiresAt: null, remainingDays: null };
  }
  const entity = asRecord(business.data, 'subscription');
  if (entity.status !== 'VALID') {
    return { status: 'unknown', specCode: null, expiresAt: null, remainingDays: null };
  }
  return {
    status: 'active',
    specCode:
      typeof entity.specCode === 'string' && entity.specCode.length > 0
        ? entity.specCode
        : null,
    expiresAt: timestampOrNull(entity.endTime),
    remainingDays: numberOrNull(entity.remainingDays),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/providers/qwen/shape.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/qwen/shape.ts src/providers/qwen/shape.test.ts
git commit -m "feat: parse Qianwen Token Plan quota"
```

---

### Task 4: Fetch the console token and gateway data

**Files:**

- Modify: `src/providers/qwen/provider.ts`
- Modify: `src/providers/registry.ts:8-19`
- Test: `src/providers/qwen/provider.test.ts`, `src/providers/registry.test.ts`

- [ ] **Step 1: Replace `src/providers/qwen/provider.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { HttpClient, JsonResult } from '../../core/http';
import type { CredentialKind, SecretReader } from '../../core/types';
import { loadFixture } from '../../test/helpers/fixture';
import { QwenProvider } from './provider';

const ORIGINS = {
  balance: 'https://business.aliyuncs.com',
  modelStudio: 'https://modelstudio.example.com',
  console: 'https://console.example.com',
};
const SIGNAL = new AbortController().signal;

function secrets(values: Partial<Record<CredentialKind, string>>): SecretReader {
  return {
    read: vi.fn<SecretReader['read']>().mockImplementation(
      async (_providerId, credential) => values[credential],
    ),
  };
}

const BALANCE_RESPONSE = {
  Code: '200',
  Message: 'success',
  RequestId: 'request-id',
  Success: true,
  Data: {
    AvailableAmount: '-12.34',
    CreditAmount: '5.00',
    MybankCreditAmount: '6.00',
    Currency: 'CNY',
    AvailableCashAmount: '-18.34',
    QuotaLimit: '1000.00',
  },
};

function captured(capability: 'qwen.tokenPlan' | 'qwen.tokenPlanSubscription'): unknown {
  return JSON.parse(
    JSON.stringify(loadFixture('qwen', capability, 'standard')),
  ).response;
}

const TOKEN_RESPONSE = { cliAccessToken: 'console-token' };
const USAGE_RESPONSE = captured('qwen.tokenPlan');
const SUBSCRIPTION_RESPONSE = captured('qwen.tokenPlanSubscription');

interface ClientOptions {
  readonly balance?: JsonResult;
  readonly token?: (attempt: number) => JsonResult;
  readonly usage?: (attempt: number) => JsonResult;
  readonly subscription?: (attempt: number) => JsonResult;
}

function client(options: ClientOptions = {}) {
  let tokenCalls = 0;
  let usageCalls = 0;
  let subscriptionCalls = 0;
  const postJson = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('generateAccessToken')) {
      tokenCalls += 1;
      return (options.token ?? (() => ({ ok: true, body: TOKEN_RESPONSE })))(tokenCalls);
    }
    return options.balance ?? { ok: true, body: BALANCE_RESPONSE };
  });
  const postForm = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/usage')) {
      usageCalls += 1;
      return (options.usage ?? (() => ({ ok: true, body: USAGE_RESPONSE })))(usageCalls);
    }
    subscriptionCalls += 1;
    return (options.subscription ?? (() => ({ ok: true, body: SUBSCRIPTION_RESPONSE })))(
      subscriptionCalls,
    );
  });
  return { http: { postJson, postForm } as unknown as HttpClient, postJson, postForm };
}

async function connected(options: ClientOptions = {}) {
  const mock = client(options);
  const provider = new QwenProvider(ORIGINS, mock.http);
  await provider.connect(
    secrets({ 'access-key-id': 'access-id', 'access-key-secret': 'access-secret' }),
  );
  return { provider, ...mock };
}

function notLoggedIn(): JsonResult {
  const response = JSON.parse(JSON.stringify(USAGE_RESPONSE)) as any;
  response.data.success = false;
  response.data.errorCode = 'BailianGateway.Login.NotLogined';
  return { ok: true, body: response };
}

function notAuthorised(): JsonResult {
  const response = JSON.parse(JSON.stringify(USAGE_RESPONSE)) as any;
  response.data.success = false;
  response.data.errorCode = 'BailianGateway.Team.NotAuthorised';
  return { ok: true, body: response };
}

describe('QwenProvider', () => {
  it('declares account balance and both Token Plan capabilities', () => {
    const { http } = client();
    const provider = new QwenProvider(ORIGINS, http);
    expect(provider.getCapabilities().capabilities.map((capability) => capability.id)).toEqual([
      'qwen.accountBalance',
      'qwen.tokenPlan',
      'qwen.tokenPlanSubscription',
    ]);
  });

  it('reads both AccessKey parts from SecretStorage and becomes ready', async () => {
    const { provider } = await connected();
    const state = await provider.connect(
      secrets({ 'access-key-id': 'access-id', 'access-key-secret': 'access-secret' }),
    );
    expect(state).toEqual({
      kind: 'ready',
      capabilities: ['qwen.accountBalance', 'qwen.tokenPlan', 'qwen.tokenPlanSubscription'],
    });
  });

  it('reports a missing AccessKey Secret as partial instead of ready', async () => {
    const { provider } = await connected();
    expect(await provider.connect(secrets({ 'access-key-id': 'access-id' }))).toEqual({
      kind: 'partial',
      capabilities: [],
      missing: [{ capability: 'qwen.accountBalance', credential: 'access-key-secret' }],
    });
  });

  it('queries the balance, issues one console token, and calls both gateway endpoints', async () => {
    const { provider, postJson, postForm } = await connected();
    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toMatchObject({
      kind: 'ok',
      data: { availableAmount: -12.34, currency: 'CNY' },
    });
    expect(snapshot.capabilities['qwen.tokenPlan']).toMatchObject({ kind: 'ok' });
    expect(snapshot.capabilities['qwen.tokenPlanSubscription']).toMatchObject({ kind: 'ok' });
    expect(Object.keys(snapshot.capabilities)).toEqual([
      'qwen.accountBalance',
      'qwen.tokenPlan',
      'qwen.tokenPlanSubscription',
    ]);

    expect(postJson).toHaveBeenCalledTimes(2);
    const tokenCall = postJson.mock.calls.find(([url]) =>
      String(url).includes('generateAccessToken'),
    )!;
    expect(tokenCall[0]).toBe(
      `${ORIGINS.modelStudio}/modelstudio/cli/generateAccessToken` +
        '?Action=GenerateCLIAccessToken&Version=2026-02-10',
    );
    expect(tokenCall[2]?.headers).toMatchObject({
      host: 'modelstudio.example.com',
      'x-acs-action': 'GenerateCLIAccessToken',
      'x-acs-version': '2026-02-10',
    });
    expect(tokenCall[2]?.headers?.Authorization).toMatch(
      /^ACS3-HMAC-SHA256 Credential=access-id,/,
    );

    expect(postForm).toHaveBeenCalledTimes(2);
    for (const [url, body, options] of postForm.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/console\.example\.com\/cli\/api\.json\?/);
      expect(options?.bearer).toBe('console-token');
      expect(String(body)).toContain('region=cn-beijing');
      expect(String(body)).toContain('cornerstoneParam');
    }
    const subscriptionCall = postForm.mock.calls.find(([url]) =>
      String(url).includes('subscription'),
    )!;
    expect(String(subscriptionCall[1])).toContain('commodityCode');
  });

  it('retries once with a fresh token after NotLogined', async () => {
    const { provider, postJson, postForm } = await connected({
      usage: (attempt) => (attempt === 1 ? notLoggedIn() : { ok: true, body: USAGE_RESPONSE }),
    });

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.tokenPlan']).toMatchObject({ kind: 'ok' });
    expect(postJson).toHaveBeenCalledTimes(3);
    expect(
      postForm.mock.calls.filter(([url]) => String(url).includes('/usage')),
    ).toHaveLength(2);
  });

  it('reports Team.NotAuthorised as an actionable authentication failure', async () => {
    const { provider } = await connected({ usage: () => notAuthorised() });

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.tokenPlan']).toEqual({
      kind: 'failed',
      error: { kind: 'auth', message: 'error.qwen.tokenPlanForbidden' },
    });
  });

  it('keeps the balance when the console token cannot be issued', async () => {
    const { provider } = await connected({
      token: () => ({ ok: false, error: { kind: 'network', message: 'error.network' } }),
    });

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toMatchObject({ kind: 'ok' });
    expect(snapshot.capabilities['qwen.tokenPlan']).toEqual({
      kind: 'failed',
      error: { kind: 'network', message: 'error.network' },
    });
    expect(snapshot.capabilities['qwen.tokenPlanSubscription']).toEqual({
      kind: 'failed',
      error: { kind: 'network', message: 'error.network' },
    });
  });

  it('returns the HTTP failure from the balance query without failing the plan', async () => {
    const { provider } = await connected({
      balance: { ok: false, error: { kind: 'auth', message: 'error.auth' } },
    });

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toEqual({
      kind: 'failed',
      error: { kind: 'auth', message: 'error.auth' },
    });
    expect(snapshot.capabilities['qwen.tokenPlan']).toMatchObject({ kind: 'ok' });
  });

  it('reports an unexpected response as malformed', async () => {
    const { provider } = await connected({
      balance: { ok: true, body: { Success: false } },
    });

    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.accountBalance']).toEqual({
      kind: 'failed',
      error: { kind: 'malformed', message: 'error.malformed' },
    });
  });

  it('reports unconfigured plan capabilities without a bearer request', async () => {
    const { http, postJson, postForm } = client();
    const provider = new QwenProvider(ORIGINS, http);
    const snapshot = await provider.fetchSnapshot(SIGNAL);

    expect(snapshot.capabilities['qwen.tokenPlan']).toEqual({
      kind: 'unconfigured',
      reason: 'missing Alibaba Cloud AccessKey',
    });
    expect(snapshot.capabilities['qwen.tokenPlanSubscription']).toEqual({
      kind: 'unconfigured',
      reason: 'missing Alibaba Cloud AccessKey',
    });
    expect(postJson).not.toHaveBeenCalled();
    expect(postForm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/providers/qwen/provider.test.ts`
Expected: FAIL — the constructor still takes a single origin and the plan capabilities do not exist.

- [ ] **Step 3: Replace `src/providers/qwen/provider.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { HttpClient, JsonResult } from '../../core/http';
import type {
  CapabilityDescriptor,
  CapabilityState,
  ConnectionState,
  NormalizedError,
  ProviderCapabilities,
  ProviderSnapshot,
  QuotaProvider,
  SecretReader,
} from '../../core/types';
import { ENDPOINTS } from '../endpoints';
import {
  QwenConsoleAuthError,
  QwenConsoleForbiddenError,
  readQwenAccountBalance,
  readQwenConsoleToken,
  readQwenTokenPlan,
  readQwenTokenPlanSubscription,
} from './shape';
import { signAliyunRequest } from './request';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'qwen.accountBalance', titleKey: 'capability.qwen.accountBalance', credential: 'access-key-id', required: true },
  { id: 'qwen.tokenPlan', titleKey: 'capability.qwen.tokenPlan', credential: 'access-key-id', required: true },
  { id: 'qwen.tokenPlanSubscription', titleKey: 'capability.qwen.tokenPlanSubscription', credential: 'access-key-id', required: true },
];

export interface QwenOrigins {
  readonly balance: string;
  readonly modelStudio: string;
  readonly console: string;
}

type ConsoleToken = { kind: 'ok'; token: string } | { kind: 'failed'; error: NormalizedError };
type TokenPlanEndpoint = 'qwen.tokenPlanUsage' | 'qwen.tokenPlanSubscription';

const CONSOLE_CORNERSTONE = {
  protocol: 'V2',
  console: 'ONE_CONSOLE',
  productCode: 'p_efm',
  switchUserType: 3,
  consoleSite: 'BAILIAN_ALIYUN',
} as const;

export class QwenProvider implements QuotaProvider {
  readonly id = 'qwen' as const;
  readonly displayName = 'Qwen';
  private accessKeyId: string | undefined;
  private accessKeySecret: string | undefined;
  private consoleToken: Promise<ConsoleToken> | undefined;

  constructor(
    readonly origins: QwenOrigins,
    private readonly http: HttpClient,
  ) {}

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(secrets: SecretReader): Promise<ConnectionState> {
    this.accessKeyId = await secrets.read(this.id, 'access-key-id');
    this.accessKeySecret = await secrets.read(this.id, 'access-key-secret');

    if (this.accessKeyId === undefined && this.accessKeySecret === undefined) {
      return { kind: 'not-configured' };
    }
    if (this.accessKeyId === undefined || this.accessKeySecret === undefined) {
      return {
        kind: 'partial',
        capabilities: [],
        missing: [{
          capability: 'qwen.accountBalance',
          credential: this.accessKeyId === undefined ? 'access-key-id' : 'access-key-secret',
        }],
      };
    }
    return { kind: 'ready', capabilities: CAPABILITIES.map((capability) => capability.id) };
  }

  async fetchSnapshot(signal: AbortSignal): Promise<ProviderSnapshot> {
    const fetchedAt = new Date().toISOString();
    const capabilities: Record<string, CapabilityState> = {};
    this.consoleToken = undefined;

    capabilities['qwen.accountBalance'] = await this.fetchBalance(fetchedAt, signal);
    capabilities['qwen.tokenPlan'] = await this.fetchTokenPlan(
      'qwen.tokenPlanUsage',
      {},
      readQwenTokenPlan,
      fetchedAt,
      signal,
    );
    capabilities['qwen.tokenPlanSubscription'] = await this.fetchTokenPlan(
      'qwen.tokenPlanSubscription',
      { commodityCode: 'sfm_tokenplansolo_public_cn' },
      readQwenTokenPlanSubscription,
      fetchedAt,
      signal,
    );

    return { providerId: this.id, fetchedAt, capabilities };
  }

  dispose(): void {
    this.accessKeyId = undefined;
    this.accessKeySecret = undefined;
    this.consoleToken = undefined;
  }

  private async fetchBalance(
    fetchedAt: string,
    signal: AbortSignal,
  ): Promise<CapabilityState> {
    if (this.accessKeyId === undefined || this.accessKeySecret === undefined) {
      return { kind: 'unconfigured', reason: 'missing Alibaba Cloud AccessKey' };
    }

    const headers = signAliyunRequest({
      method: 'POST',
      pathname: '/',
      query: {},
      headers: {
        host: new URL(this.origins.balance).host,
        'content-type': 'application/json',
        'x-acs-action': 'QueryAccountBalance',
        'x-acs-date': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        'x-acs-signature-nonce': randomUUID(),
        'x-acs-version': '2017-12-14',
      },
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
    });
    const result = await this.http.postJson(`${this.origins.balance}/`, undefined, {
      headers,
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    try {
      return { kind: 'ok', fetchedAt, data: readQwenAccountBalance(result.body) };
    } catch {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }

  private async fetchTokenPlan<T>(
    endpointId: TokenPlanEndpoint,
    extraData: Record<string, unknown>,
    read: (response: unknown) => T,
    fetchedAt: string,
    signal: AbortSignal,
  ): Promise<CapabilityState> {
    if (this.accessKeyId === undefined || this.accessKeySecret === undefined) {
      return { kind: 'unconfigured', reason: 'missing Alibaba Cloud AccessKey' };
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.consoleTokenFor(signal, attempt > 0);
      if (token.kind === 'failed') return { kind: 'failed', error: token.error };

      const result = await this.callTokenPlanApi(endpointId, token.token, extraData, signal);
      if (!result.ok) return { kind: 'failed', error: result.error };

      try {
        return { kind: 'ok', fetchedAt, data: read(result.body) };
      } catch (error) {
        if (error instanceof QwenConsoleAuthError && attempt === 0) continue;
        if (error instanceof QwenConsoleAuthError) {
          return { kind: 'failed', error: { kind: 'auth', message: 'error.auth' } };
        }
        if (error instanceof QwenConsoleForbiddenError) {
          return {
            kind: 'failed',
            error: { kind: 'auth', message: 'error.qwen.tokenPlanForbidden' },
          };
        }
        return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
      }
    }

    return { kind: 'failed', error: { kind: 'auth', message: 'error.auth' } };
  }

  private consoleTokenFor(signal: AbortSignal, force: boolean): Promise<ConsoleToken> {
    if (force || this.consoleToken === undefined) {
      this.consoleToken = this.issueConsoleToken(signal);
    }
    return this.consoleToken;
  }

  private async issueConsoleToken(signal: AbortSignal): Promise<ConsoleToken> {
    if (this.accessKeyId === undefined || this.accessKeySecret === undefined) {
      return { kind: 'failed', error: { kind: 'auth', message: 'error.auth' } };
    }

    const url = `${this.origins.modelStudio}${ENDPOINTS['qwen.tokenPlanToken']}`;
    const body = '{}';
    const headers = signAliyunRequest({
      method: 'POST',
      pathname: '/modelstudio/cli/generateAccessToken',
      query: { Action: 'GenerateCLIAccessToken', Version: '2026-02-10' },
      headers: {
        host: new URL(this.origins.modelStudio).host,
        'content-type': 'application/json',
        'x-acs-action': 'GenerateCLIAccessToken',
        'x-acs-date': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        'x-acs-signature-nonce': randomUUID(),
        'x-acs-version': '2026-02-10',
      },
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      body,
    });
    const result = await this.http.postJson(url, {}, { headers, signal });
    if (!result.ok) return { kind: 'failed', error: result.error };
    try {
      return { kind: 'ok', token: readQwenConsoleToken(result.body) };
    } catch {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }

  private async callTokenPlanApi(
    endpointId: TokenPlanEndpoint,
    token: string,
    extraData: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<JsonResult> {
    const url = `${this.origins.console}${ENDPOINTS[endpointId]}`;
    const api = new URL(url).searchParams.get('api');
    if (api === null) {
      return { ok: false, error: { kind: 'malformed', message: 'error.malformed' } };
    }
    const params = {
      Api: api,
      V: '1.0',
      Data: { ...extraData, cornerstoneParam: CONSOLE_CORNERSTONE },
    };
    const body = new URLSearchParams({
      params: JSON.stringify(params),
      region: 'cn-beijing',
    }).toString();
    return this.http.postForm(url, body, { bearer: token, signal });
  }
}
```

- [ ] **Step 4: Update `src/providers/registry.ts`**

Replace the Qwen fragments with:

```ts
import type { HttpClient } from '../core/http';
import type { QuotaProvider } from '../core/types';
import { DeepSeekProvider } from './deepseek/provider';
import { MiniMaxProvider } from './minimax/provider';
import { QwenProvider } from './qwen/provider';
import { ORIGINS } from './endpoints';

export const MINIMAX_CN_ORIGIN = ORIGINS['minimax-cn'];
export const MINIMAX_GLOBAL_ORIGIN = ORIGINS['minimax-global'];
export const QWEN_API_ORIGIN = ORIGINS['qwen-api'];
export const QWEN_MODELSTUDIO_ORIGIN = ORIGINS['qwen-modelstudio'];
export const QWEN_CONSOLE_ORIGIN = ORIGINS['qwen-console'];

export function buildProviders(http: HttpClient): QuotaProvider[] {
  return [
    new MiniMaxProvider('minimax-cn', MINIMAX_CN_ORIGIN, http),
    new MiniMaxProvider('minimax-global', MINIMAX_GLOBAL_ORIGIN, http),
    new DeepSeekProvider(http),
    new QwenProvider(
      {
        balance: QWEN_API_ORIGIN,
        modelStudio: QWEN_MODELSTUDIO_ORIGIN,
        console: QWEN_CONSOLE_ORIGIN,
      },
      http,
    ),
  ];
}
```

- [ ] **Step 5: Update the registry test**

In `src/providers/registry.test.ts`, replace the last test with:

```ts
  it('gives Qwen the Alibaba Cloud and Qianwen console origins', () => {
    const providers = buildProviders({} as HttpClient);
    const qwen = providers.find((provider) => provider.id === 'qwen') as QwenProvider;
    expect(qwen.origins.balance).toBe('https://business.aliyuncs.com');
    expect(qwen.origins.modelStudio).toBe('https://modelstudio.cn-beijing.aliyuncs.com');
    expect(qwen.origins.console).toBe('https://bailian-cs.console.aliyun.com');
  });
```

- [ ] **Step 6: Run the provider and registry tests**

Run: `npx vitest run src/providers/qwen/provider.test.ts src/providers/registry.test.ts`
Expected: PASS. If the NotLogined test fails because the captured envelope uses a different business path, fix `gatewayBusiness` in `shape.ts` and the test helper together — the capture wins.

- [ ] **Step 7: Run the full suite to catch constructor call sites**

Run: `npx vitest run`
Expected: PASS. If another test constructs `QwenProvider`, update it to the origins object.

- [ ] **Step 8: Commit**

```bash
git add src/providers/qwen/provider.ts src/providers/qwen/provider.test.ts src/providers/registry.ts src/providers/registry.test.ts
git commit -m "feat: fetch Qianwen Token Plan quota with AK/SK"
```

---

### Task 5: Add the localization keys and Qwen credential copy

**Files:**

- Modify: `src/localization/messages.ts`
- Modify: `src/localization/en-us.ts`
- Modify: `src/localization/zh-cn.ts`

- [ ] **Step 1: Add the keys to `src/localization/messages.ts`**

After `'capability.qwen.accountBalance'`, add:

```ts
  'capability.qwen.tokenPlan': 'Token Plan 额度',
  'capability.qwen.tokenPlanSubscription': 'Token Plan 订阅',
```

After `'tooltip.window.fiveHour'`, add:

```ts
  'tooltip.window.monthly': '每月',
```

After `'dashboard.qwen.quotaLimit'`, add:

```ts
  'dashboard.qwen.tokenPlanSection': 'Token Plan',
  'dashboard.qwen.planTier': '套餐',
  'dashboard.qwen.notSubscribed': '未订阅 Token Plan',
```

After `'error.unknown'`, add:

```ts
  'error.qwen.tokenPlanForbidden': '阿里云 AccessKey 未被授权访问千问 Token Plan（需加入百炼业务空间）。',
```

Replace the three Qwen credential strings:

```ts
  'credentials.qwen.setupDetail': '账户余额与 Token Plan 额度查询都使用阿里云 RAM AccessKey，不是百炼 API Key。请在 RAM 控制台创建专用用户并授予 bss:QueryAccountBalance；Token Plan 额度还要求该 RAM 用户已加入百炼/千问业务空间。创建 AccessKey 时选择“本地开发环境中使用”。',
  'credentials.qwen.accessKeyIdPrompt': '① 在阿里云 RAM 控制台创建专用用户并授予 bss:QueryAccountBalance；② 将该 RAM 用户加入百炼/千问业务空间以查询 Token Plan 额度；③ 创建 AccessKey 时选择“本地开发环境中使用”；④ 粘贴 AccessKey ID（不是百炼 API Key）。凭证仅保存在 VS Code SecretStorage。',
  'credentials.qwen.required': '请填写阿里云 AccessKey；账户余额与 Token Plan 额度查询需要 AccessKey ID 和 Secret。',
```

Replace `'dashboard.qwen.unsupportedDetail'`:

```ts
  'dashboard.qwen.unsupportedDetail': '账户余额与 Token Plan 额度已接入。模型级额度与消费明细请在千问AI平台/百炼控制台查看。',
```

- [ ] **Step 2: Mirror every key in `src/localization/en-us.ts`**

Add:

```ts
  'capability.qwen.tokenPlan': 'Token Plan quota',
  'capability.qwen.tokenPlanSubscription': 'Token Plan subscription',
  'tooltip.window.monthly': 'Monthly',
  'dashboard.qwen.tokenPlanSection': 'Token Plan',
  'dashboard.qwen.planTier': 'Plan',
  'dashboard.qwen.notSubscribed': 'No Token Plan subscription',
  'error.qwen.tokenPlanForbidden': 'The Alibaba Cloud AccessKey is not authorized for Qianwen Token Plan (join the Model Studio business space).',
```

Replace the Qwen credential strings:

```ts
  'credentials.qwen.setupDetail': 'Account balance and Token Plan quota both use an Alibaba Cloud RAM AccessKey, not a Model Studio API Key. Create a dedicated RAM user with bss:QueryAccountBalance; Token Plan quota also requires that user to be joined to the Model Studio / Qianwen business space. Choose “local development environment” when creating the AccessKey.',
  'credentials.qwen.accessKeyIdPrompt': '1. Create a dedicated RAM user with bss:QueryAccountBalance. 2. Join that user to the Model Studio / Qianwen business space for Token Plan quota. 3. Choose “local development environment” when creating the AccessKey. 4. Paste the AccessKey ID, not a Model Studio API Key. Credentials are stored only in VS Code SecretStorage.',
  'credentials.qwen.required': 'Enter the Alibaba Cloud AccessKey. Balance and Token Plan queries require both the AccessKey ID and Secret.',
  'dashboard.qwen.unsupportedDetail': 'Account balance and Token Plan quota are included. Model-level quota and consumption remain in the Qianwen AI / Model Studio console.',
```

- [ ] **Step 3: Mirror every key in `src/localization/zh-cn.ts`**

Copy the Chinese values from Step 1 into the same positions; the zh-cn bundle is the source text for `messages.ts`.

- [ ] **Step 4: Verify the bundles and the hardcoded-Chinese gate**

Run:

```bash
npm run typecheck
npm run check:i18n
npm run check:locales
```

Expected: all pass. `MessageBundle = Record<MessageKey, string>` fails compilation if either bundle is missing a key.

- [ ] **Step 5: Commit**

```bash
git add src/localization/messages.ts src/localization/en-us.ts src/localization/zh-cn.ts
git commit -m "feat: localize Qianwen Token Plan quota"
```

---

### Task 6: Render Token Plan windows in the Activity Bar tree

**Files:**

- Modify: `src/presentation/overview/model.ts:402-465`
- Test: `src/presentation/overview/model.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/presentation/overview/model.test.ts`:

```ts
  it('adds Token Plan windows, plan, and expiry to the Qwen item', () => {
    const items = buildOverviewItems({
      snapshots: {
        qwen: makeSnapshot('qwen', {
          'qwen.accountBalance': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              availableAmount: 1.25,
              availableCashAmount: 0.5,
              creditAmount: 0.75,
              mybankCreditAmount: 0,
              quotaLimit: null,
              currency: 'CNY',
            },
          },
          'qwen.tokenPlan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              windows: [
                { cycle: 'monthly', usedRatio: 0.62, resetAt: Date.parse('2026-12-01T00:00:00Z') },
              ],
            },
          },
          'qwen.tokenPlanSubscription': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              status: 'active',
              specCode: 'pro',
              expiresAt: Date.parse('2027-01-01T00:00:00Z'),
              remainingDays: 40,
            },
          },
        }),
      },
      configured: { qwen: true },
      order: ['qwen'],
      t,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });

    expect(items[0]?.description).toBe('¥1.25 CNY · Monthly 38%');
    expect(items[0]?.state).toBe('caution');
    const monthly = items[0]?.children.find(
      (child) => child.id === 'provider:qwen:tokenPlan:monthly',
    );
    expect(monthly?.description).toBe('Remaining 38% · Used 62%');
    expect(monthly?.tooltip).toContain('Resets 2026-12-01 08:00');
    expect(items[0]?.children.map((child) => child.label)).toContain('Plan');
    expect(items[0]?.children.map((child) => child.label)).toContain('Expires');
  });

  it('shows the unsubscribed state without inventing a window', () => {
    const items = buildOverviewItems({
      snapshots: {
        qwen: makeSnapshot('qwen', {
          'qwen.accountBalance': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              availableAmount: 1,
              availableCashAmount: 1,
              creditAmount: 0,
              mybankCreditAmount: 0,
              quotaLimit: null,
              currency: 'CNY',
            },
          },
          'qwen.tokenPlanSubscription': {
            kind: 'ok',
            fetchedAt: 'x',
            data: { status: 'none', specCode: null, expiresAt: null, remainingDays: null },
          },
        }),
      },
      configured: { qwen: true },
      order: ['qwen'],
      t,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });

    expect(items[0]?.description).toBe('¥1.00 CNY');
    expect(items[0]?.children.map((child) => child.label)).toContain(
      'No Token Plan subscription',
    );
    expect(items[0]?.children.some((child) => child.id.includes('tokenPlan:'))).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/overview/model.test.ts`
Expected: FAIL — `Monthly` and the plan children are missing.

- [ ] **Step 3: Extend `qwenItem`**

In `src/presentation/overview/model.ts`, update the Qwen import:

```ts
import type {
  QwenAccountBalance,
  QwenTokenPlan,
  QwenTokenPlanSubscription,
} from '../../providers/qwen/shape';
```

Add these helpers above `qwenItem`:

```ts
interface QwenTokenPlanWindowView {
  readonly cycle: 'monthly' | 'weekly';
  readonly remainingPercent: number;
  readonly resetAt: number | null;
}

function qwenTokenPlanWindows(
  snapshot: ProviderSnapshot | undefined,
): QwenTokenPlanWindowView[] {
  const plan = capabilityValue<QwenTokenPlan>(snapshot, 'qwen.tokenPlan');
  return (plan?.windows ?? []).map((window) => ({
    cycle: window.cycle,
    remainingPercent: (1 - window.usedRatio) * 100,
    resetAt: window.resetAt,
  }));
}

function tokenPlanWindowLabel(
  cycle: QwenTokenPlanWindowView['cycle'],
  t: Translator,
): string {
  return cycle === 'weekly' ? t('tooltip.window.weekly') : t('tooltip.window.monthly');
}
```

Replace `qwenItem` with:

```ts
function qwenItem(options: OverviewOptions): OverviewItem {
  const snapshot = options.snapshots.qwen;
  const status = primaryStatus(snapshot, 'qwen.accountBalance', options.t);
  const balance = capabilityValue<QwenAccountBalance>(snapshot, 'qwen.accountBalance');
  const children: OverviewItem[] = [];

  if (balance !== undefined) {
    const fields: Array<{ id: string; label: string; amount: number }> = [
      {
        id: 'available',
        label: options.t('dashboard.qwen.availableBalance'),
        amount: balance.availableAmount,
      },
      {
        id: 'available-cash',
        label: options.t('dashboard.qwen.availableCash'),
        amount: balance.availableCashAmount,
      },
      {
        id: 'credit',
        label: options.t('dashboard.qwen.credit'),
        amount: balance.creditAmount,
      },
      {
        id: 'mybank-credit',
        label: options.t('dashboard.qwen.mybankCredit'),
        amount: balance.mybankCreditAmount,
      },
    ];
    if (balance.quotaLimit !== null) {
      fields.push({
        id: 'quota-limit',
        label: options.t('dashboard.qwen.quotaLimit'),
        amount: balance.quotaLimit,
      });
    }
    for (const field of fields) {
      const amount = qwenAmount(field.amount, balance.currency);
      children.push({
        id: `provider:qwen:${field.id}`,
        label: field.label,
        description: amount,
        tooltip: detailTooltip(field.label, amount),
        state: 'muted',
        stateLabel: '',
        action: null,
        children: [],
      });
    }
  }

  for (const window of qwenTokenPlanWindows(snapshot)) {
    const percent = Math.round(window.remainingPercent);
    const used = Math.max(0, 100 - percent);
    const label = tokenPlanWindowLabel(window.cycle, options.t);
    const quota = quotaRow(label, percent, options.warningThresholdPercent, options.t);
    const reset =
      window.resetAt === null
        ? undefined
        : `${options.t('tooltip.resetAt')} ${instantLabel(window.resetAt, options.timeZone) ?? ''}`;
    const description =
      `${options.t('tooltip.remaining')} ${percent}% · ` +
      `${options.t('tooltip.used')} ${used}%`;
    children.push({
      id: `provider:qwen:tokenPlan:${window.cycle}`,
      label,
      description,
      tooltip: detailTooltip(label, description, reset),
      state: quota.state,
      stateLabel: quota.stateLabel,
      action: null,
      children: [],
    });
  }

  const subscription = capabilityValue<QwenTokenPlanSubscription>(
    snapshot,
    'qwen.tokenPlanSubscription',
  );
  if (subscription?.status === 'active') {
    if (subscription.specCode !== null) {
      children.push({
        id: 'provider:qwen:plan',
        label: options.t('dashboard.qwen.planTier'),
        description: subscription.specCode,
        tooltip: detailTooltip(
          options.t('dashboard.qwen.planTier'),
          subscription.specCode,
        ),
        state: 'muted',
        stateLabel: '',
        action: null,
        children: [],
      });
    }
    if (subscription.expiresAt !== null) {
      const expiry = instantLabel(subscription.expiresAt, options.timeZone);
      if (expiry !== undefined) {
        children.push({
          id: 'provider:qwen:expires',
          label: options.t('tooltip.expires'),
          description: expiry,
          tooltip: detailTooltip(options.t('tooltip.expires'), expiry),
          state: 'muted',
          stateLabel: '',
          action: null,
          children: [],
        });
      }
    }
  } else if (subscription?.status === 'none') {
    children.push({
      id: 'provider:qwen:notSubscribed',
      label: options.t('dashboard.qwen.notSubscribed'),
      description: '',
      tooltip: options.t('dashboard.qwen.notSubscribed'),
      state: 'muted',
      stateLabel: '',
      action: null,
      children: [],
    });
  }

  const failed = [
    snapshot?.capabilities['qwen.tokenPlan'],
    snapshot?.capabilities['qwen.tokenPlanSubscription'],
  ].find((state) => state?.kind === 'failed');
  if (failed?.kind === 'failed') {
    const message = options.t(failed.error.message);
    children.push({
      id: 'provider:qwen:tokenPlanFailed',
      label: options.t('capability.qwen.tokenPlan'),
      description: message,
      tooltip: message,
      state: 'failed',
      stateLabel: options.t('state.failed'),
      action: null,
      children: [],
    });
  }

  const windows = qwenTokenPlanWindows(snapshot);
  const tightest = windows.reduce<QwenTokenPlanWindowView | undefined>(
    (lowest, window) =>
      lowest === undefined || window.remainingPercent < lowest.remainingPercent
        ? window
        : lowest,
    undefined,
  );
  const balanceText =
    balance === undefined
      ? ''
      : qwenAmount(balance.availableAmount, balance.currency);
  let state = status.state;
  let stateLabel = status.label;
  let description = stateDescription(status);
  if (status.state === 'positive') {
    if (tightest === undefined) {
      description = balanceText;
    } else {
      const percent = Math.round(tightest.remainingPercent);
      const quota = quotaRow(
        tokenPlanWindowLabel(tightest.cycle, options.t),
        percent,
        options.warningThresholdPercent,
        options.t,
      );
      state = quota.state;
      stateLabel = quota.stateLabel;
      const planText = `${tokenPlanWindowLabel(tightest.cycle, options.t)} ${percent}%`;
      description = [balanceText, planText].filter((part) => part.length > 0).join(' · ');
    }
  }

  return providerItem(
    'qwen',
    providerDisplayName('qwen'),
    state,
    stateLabel,
    description,
    children,
    options,
    status.detail,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/overview/model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/overview/model.ts src/presentation/overview/model.test.ts
git commit -m "feat: show Token Plan quota in the Qwen tree item"
```

---

### Task 7: Render Token Plan windows in the hover tooltip

**Files:**

- Modify: `src/presentation/tooltip.ts:120-140, 232-249`
- Test: `src/presentation/tooltip.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/presentation/tooltip.test.ts`:

```ts
  it('shows Qwen Token Plan windows, plan, and expiry after the balance rows', () => {
    const snapshots = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            availableAmount: 1,
            availableCashAmount: 1,
            creditAmount: 0,
            mybankCreditAmount: 0,
            quotaLimit: null,
            currency: 'CNY',
          },
        },
        'qwen.tokenPlan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [
              {
                cycle: 'monthly',
                usedRatio: 0.62,
                resetAt: Date.parse('2026-12-01T00:00:00Z'),
              },
            ],
          },
        },
        'qwen.tokenPlanSubscription': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            status: 'active',
            specCode: 'pro',
            expiresAt: Date.parse('2027-01-01T00:00:00Z'),
            remainingDays: 40,
          },
        },
      }),
    };

    const html = renderTooltip(snapshots, ['qwen'], t);

    expect(html).toContain('<tr><td colspan="4">Token Plan</td></tr>');
    expect(html).toContain('Monthly');
    expect(html).toContain('38%');
    expect(html).toContain('Resets 2026-12-01 08:00');
    expect(html).toContain('>Plan<');
    expect(html).toContain('pro');
    expect(html).toContain('Expires');
  });

  it('shows the unsubscribed and failed states instead of a zero window', () => {
    const unsubscribed = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': { kind: 'unconfigured', reason: 'missing' },
        'qwen.tokenPlanSubscription': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { status: 'none', specCode: null, expiresAt: null, remainingDays: null },
        },
      }),
    };
    expect(renderTooltip(unsubscribed, ['qwen'], t)).toContain('No Token Plan subscription');

    const failed = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': { kind: 'unconfigured', reason: 'missing' },
        'qwen.tokenPlan': {
          kind: 'failed',
          error: { kind: 'auth', message: 'error.qwen.tokenPlanForbidden' },
        },
      }),
    };
    expect(renderTooltip(failed, ['qwen'], t)).toContain(
      'The Alibaba Cloud AccessKey is not authorized for Qianwen Token Plan',
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/tooltip.test.ts`
Expected: FAIL — the Token Plan section is missing.

- [ ] **Step 3: Extend the tooltip**

In `src/presentation/tooltip.ts`, update the Qwen import:

```ts
import type {
  QwenAccountBalance,
  QwenTokenPlan,
  QwenTokenPlanSubscription,
} from '../providers/qwen/shape';
```

Add this helper above `providerRows`:

```ts
function tokenPlanWindowLabel(cycle: 'monthly' | 'weekly', t: Translator): string {
  return cycle === 'weekly' ? t('tooltip.window.weekly') : t('tooltip.window.monthly');
}

function qwenTokenPlanRows(
  snapshot: ProviderSnapshot,
  t: Translator,
  timeZone: string,
): string {
  const plan = capabilityValue<QwenTokenPlan>(snapshot, 'qwen.tokenPlan');
  const subscription = capabilityValue<QwenTokenPlanSubscription>(
    snapshot,
    'qwen.tokenPlanSubscription',
  );
  let rows = '';

  if (plan !== undefined && plan.windows.length > 0) {
    rows += `<tr><td colspan="4">${escapeHtml(t('dashboard.qwen.tokenPlanSection'))}</td></tr>`;
    for (const window of plan.windows) {
      const remaining = Math.max(0, Math.min(100, (1 - window.usedRatio) * 100));
      const label = tokenPlanWindowLabel(window.cycle, t);
      rows +=
        `<tr><td>${escapeHtml(label)}</td>` +
        `<td>${bar(remaining)}${quotaValue(`${Math.round(remaining)}%`)}</td>` +
        `${resetCell(window.resetAt, timeZone, t)}</tr>`;
    }
  }

  if (subscription?.status === 'active') {
    if (subscription.specCode !== null) {
      rows +=
        `<tr><td>${escapeHtml(t('dashboard.qwen.planTier'))}</td>` +
        `<td>${escapeHtml(subscription.specCode)}</td><td></td><td></td></tr>`;
    }
    if (subscription.expiresAt !== null) {
      const expiry = zonedTime(new Date(subscription.expiresAt).toISOString(), timeZone);
      rows +=
        `<tr><td>${escapeHtml(t('tooltip.expires'))}</td>` +
        `<td>${escapeHtml(expiry)}</td><td></td><td></td></tr>`;
    }
  } else if (subscription?.status === 'none') {
    rows +=
      `<tr><td colspan="4" class="t-muted">` +
      `${escapeHtml(t('dashboard.qwen.notSubscribed'))}</td></tr>`;
  }

  const failed = [
    snapshot.capabilities['qwen.tokenPlan'],
    snapshot.capabilities['qwen.tokenPlanSubscription'],
  ].find((state) => state?.kind === 'failed');
  if (failed?.kind === 'failed') {
    rows +=
      `<tr><td colspan="4" class="t-failed">` +
      `${escapeHtml(t(failed.error.message))}</td></tr>`;
  }

  return rows;
}
```

Change the signature of `providerRows` to accept the provider id and dispatch Qwen by id:

```ts
function providerRows(
  id: ProviderId,
  snapshot: ProviderSnapshot | undefined,
  t: Translator,
  timeZone: string,
): string {
```

At the start of the body, after the `snapshot === undefined` guard, replace the Qwen balance block with:

```ts
  if (id === 'qwen') {
    const qwenBalance = capabilityValue<QwenAccountBalance>(snapshot, 'qwen.accountBalance');
    let rows = '';
    if (qwenBalance !== undefined) {
      const row = (label: string, amount: number, suffix = '') =>
        `<tr><td>${escapeHtml(label)}</td>` +
        `<td>${escapeHtml(formatMoney(amount, qwenBalance.currency))}</td>` +
        `<td class="t-muted">${escapeHtml(qwenBalance.currency)}${escapeHtml(suffix)}</td><td></td></tr>`;
      rows =
        row(t('dashboard.qwen.availableBalance'), qwenBalance.availableAmount) +
        row(t('dashboard.qwen.availableCash'), qwenBalance.availableCashAmount) +
        row(t('dashboard.qwen.credit'), qwenBalance.creditAmount) +
        row(t('dashboard.qwen.mybankCredit'), qwenBalance.mybankCreditAmount);
      if (qwenBalance.quotaLimit !== null) {
        rows += row(t('dashboard.qwen.quotaLimit'), qwenBalance.quotaLimit);
      }
    }
    rows += qwenTokenPlanRows(snapshot, t, timeZone);
    if (rows.length > 0) return rows;
  }
```

Update the call site in `renderTooltip` from `providerRows(snapshot, t, timeZone)` to `providerRows(id, snapshot, t, timeZone)`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/tooltip.test.ts`
Expected: PASS. The existing test `'emphasizes provider names instead of MiniMax quota labels and values'` still passes because the section header is not a `<strong>` element.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/tooltip.ts src/presentation/tooltip.test.ts
git commit -m "feat: show Token Plan quota in the Qwen tooltip"
```

---

### Task 8: Show the tightest Token Plan window in the status bar

**Files:**

- Modify: `src/presentation/statusBar.ts`
- Test: `src/presentation/statusBar.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/presentation/statusBar.test.ts`:

```ts
  it('adds the tightest Qwen Token Plan window to the balance segment', () => {
    const snapshots = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            availableAmount: -12.34,
            creditAmount: 5,
            mybankCreditAmount: 6,
            availableCashAmount: -18.34,
            quotaLimit: 1000,
            currency: 'CNY',
          },
        },
        'qwen.tokenPlan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [
              { cycle: 'monthly', usedRatio: 0.62, resetAt: null },
              { cycle: 'weekly', usedRatio: 0.9, resetAt: null },
            ],
          },
        },
      }),
    };

    expect(renderStatusBarText(snapshots, ['qwen'], t)).toBe(
      '$(pulse) QW $(warning) ¥-12.34 · 10%',
    );
  });

  it('keeps the Qwen balance when the Token Plan capability failed', () => {
    const snapshots = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            availableAmount: -12.34,
            creditAmount: 5,
            mybankCreditAmount: 6,
            availableCashAmount: -18.34,
            quotaLimit: 1000,
            currency: 'CNY',
          },
        },
        'qwen.tokenPlan': {
          kind: 'failed',
          error: { kind: 'auth', message: 'error.qwen.tokenPlanForbidden' },
        },
      }),
    };

    expect(renderStatusBarText(snapshots, ['qwen'], t)).toBe(
      '$(pulse) QW $(dashboard) ¥-12.34',
    );
  });

  it('shows a live Qwen window when the balance is unavailable', () => {
    const snapshots = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': {
          kind: 'failed',
          error: { kind: 'auth', message: 'error.auth' },
        },
        'qwen.tokenPlan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { windows: [{ cycle: 'monthly', usedRatio: 0.62, resetAt: null }] },
        },
      }),
    };

    expect(renderStatusBarText(snapshots, ['qwen'], t)).toBe('$(pulse) QW $(warning) 38%');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/presentation/statusBar.test.ts`
Expected: FAIL — the Qwen segment still shows only the balance.

- [ ] **Step 3: Extend the status bar**

In `src/presentation/statusBar.ts`, update the Qwen import and add helpers:

```ts
import type { QwenAccountBalance, QwenTokenPlan } from '../providers/qwen/shape';

interface QwenTokenPlanWindowView {
  readonly cycle: 'monthly' | 'weekly';
  readonly remainingPercent: number;
  readonly resetAt: number | null;
}

function qwenTokenPlanWindows(
  snapshot: ProviderSnapshot | undefined,
): QwenTokenPlanWindowView[] {
  const plan = capabilityValue<QwenTokenPlan>(snapshot, 'qwen.tokenPlan');
  return (plan?.windows ?? []).map((window) => ({
    cycle: window.cycle,
    remainingPercent: (1 - window.usedRatio) * 100,
    resetAt: window.resetAt,
  }));
}

function tightestQwenWindow(
  snapshot: ProviderSnapshot | undefined,
): QwenTokenPlanWindowView | undefined {
  return qwenTokenPlanWindows(snapshot).reduce<QwenTokenPlanWindowView | undefined>(
    (lowest, window) =>
      lowest === undefined || window.remainingPercent < lowest.remainingPercent
        ? window
        : lowest,
    undefined,
  );
}
```

Update `visibleTone`:

```ts
function visibleTone(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  visible: readonly ProviderId[],
  warningThresholdPercent: number,
): QuotaTone {
  const tones = visible.flatMap((id) => {
    if (id === 'qwen') {
      const window = tightestQwenWindow(snapshots[id]);
      return window === undefined
        ? []
        : [quotaTone(window.remainingPercent, warningThresholdPercent)];
    }
    const window = preferredWindow(snapshots[id]);
    return window === undefined || window.remainingPercent === null
      ? []
      : [quotaTone(window.remainingPercent, warningThresholdPercent)];
  });
  if (tones.includes('critical')) return 'critical';
  if (tones.includes('warning')) return 'warning';
  if (tones.includes('caution')) return 'caution';
  return 'positive';
}
```

Replace the Qwen branch in `renderStatusBarText` with:

```ts
    if (id === 'qwen') {
      const balanceState = snapshot.capabilities['qwen.accountBalance'];
      const balanceLive = balanceState?.kind === 'ok' || balanceState?.kind === 'stale';
      const window = tightestQwenWindow(snapshot);
      if (balanceLive || window !== undefined) {
        const parts: string[] = [];
        if (balanceLive) parts.push(formatBalance(qwenBalance(snapshot)));
        if (window !== undefined) parts.push(`${Math.round(window.remainingPercent)}%`);
        const stale =
          balanceState?.kind === 'stale' ||
          snapshot.capabilities['qwen.tokenPlan']?.kind === 'stale'
            ? ` ${t('state.stale')}`
            : '';
        const icon =
          window === undefined
            ? STATUS_ICON.neutral
            : STATUS_ICON[quotaTone(window.remainingPercent, warningThresholdPercent)];
        return `${label} ${icon} ${parts.join(' · ')}${stale}`;
      }
      const state = unavailableState(snapshot, t);
      return `${label} ${state.icon} ${state.label}`;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/statusBar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/statusBar.ts src/presentation/statusBar.test.ts
git commit -m "feat: show Token Plan quota in the Qwen status bar segment"
```

---

### Task 9: Add Token Plan meters to the dashboard

**Files:**

- Modify: `src/presentation/dashboard/viewModel.ts`
- Test: `src/presentation/dashboard/viewModel.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/presentation/dashboard/viewModel.test.ts`:

```ts
  it('adds Qwen Token Plan meters and subscription details', () => {
    const model = buildDashboardModel(
      options({
        order: ['qwen'],
        now: Date.parse('2026-11-20T00:00:00Z'),
        snapshots: {
          qwen: makeSnapshot('qwen', {
            'qwen.accountBalance': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                availableAmount: 1,
                availableCashAmount: 1,
                creditAmount: 0,
                mybankCreditAmount: 0,
                quotaLimit: null,
                currency: 'CNY',
              },
            },
            'qwen.tokenPlan': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                windows: [
                  {
                    cycle: 'monthly',
                    usedRatio: 0.62,
                    resetAt: Date.parse('2026-12-01T00:00:00Z'),
                  },
                ],
              },
            },
            'qwen.tokenPlanSubscription': {
              kind: 'ok',
              fetchedAt: '2026-11-16T00:00:00.000Z',
              data: {
                status: 'active',
                specCode: 'pro',
                expiresAt: Date.parse('2027-01-01T00:00:00Z'),
                remainingDays: 40,
              },
            },
          }),
        },
      }),
    );

    const provider = model.providers[0]!;
    expect(provider.meters).toEqual([
      {
        key: 'qwen-token-plan:monthly',
        label: 'Monthly',
        percent: 38,
        valueLabel: '38%',
        resetLabel: 'Resets 2026-12-01 08:00 · Remaining 11d',
        tone: 'caution',
      },
    ]);
    expect(provider.details).toContainEqual({ label: 'Plan', value: 'pro' });
    expect(provider.details).toContainEqual({
      label: 'Expires',
      value: '2027-01-01 08:00',
    });
    expect(model.hero?.sourceLabel).toBe('Qwen · Monthly');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/dashboard/viewModel.test.ts`
Expected: FAIL — `provider.meters` is empty and the details lack the plan.

- [ ] **Step 3: Extend the dashboard view model**

In `src/presentation/dashboard/viewModel.ts`, update the Qwen import:

```ts
import type {
  QwenAccountBalance,
  QwenTokenPlan,
  QwenTokenPlanSubscription,
} from '../../providers/qwen/shape';
```

Add this helper near `mediaMeters`:

```ts
function qwenTokenPlanMeters(
  snapshot: ProviderSnapshot | undefined,
  warningThresholdPercent: number,
  timeZone: string,
  now: number,
  t: Translator,
): QuotaMeter[] {
  const plan = capabilityValue<QwenTokenPlan>(snapshot, 'qwen.tokenPlan');
  return (plan?.windows ?? []).map((window) => {
    const percent = Math.max(0, Math.min(100, (1 - window.usedRatio) * 100));
    return {
      key: `qwen-token-plan:${window.cycle}`,
      label:
        window.cycle === 'weekly'
          ? t('tooltip.window.weekly')
          : t('tooltip.window.monthly'),
      percent,
      valueLabel: `${Math.round(percent)}%`,
      resetLabel:
        window.resetAt === null ? null : resetLabel(window.resetAt, timeZone, now, t),
      tone: quotaTone(percent, warningThresholdPercent),
    };
  });
}
```

In `buildDashboardModel`, extend the `meters` expression:

```ts
    const meters: QuotaMeter[] = windows(snapshot)
      .map((window) => {
        const percent = window.remainingPercent;
        const meterTone: QuotaMeter['tone'] =
          percent === null ? 'muted' : quotaTone(percent, warningThresholdPercent);
        return {
          key: String(window.window),
          label: window.window === 'weekly'
            ? t('tooltip.window.weekly')
            : t('tooltip.window.fiveHour'),
          percent,
          valueLabel: percent === null ? null : `${Math.round(percent)}%`,
          resetLabel:
            window.resetAt === null
              ? null
              : resetLabel(window.resetAt, timeZone, now, t),
          tone: meterTone,
        };
      })
      .concat(mediaMeters(snapshot, warningThresholdPercent, timeZone, now, t))
      .concat(qwenTokenPlanMeters(snapshot, warningThresholdPercent, timeZone, now, t));
```

In `providerDetails`, inside the `if (id === 'qwen')` block after the balance details, add:

```ts
    const tokenPlan = capabilityValue<QwenTokenPlanSubscription>(
      snapshot,
      'qwen.tokenPlanSubscription',
    );
    if (tokenPlan?.status === 'active') {
      if (tokenPlan.specCode !== null) {
        details.push({
          label: t('dashboard.qwen.planTier'),
          value: tokenPlan.specCode,
        });
      }
      if (tokenPlan.expiresAt !== null) {
        details.push({
          label: t('tooltip.expires'),
          value: zonedDateTime(tokenPlan.expiresAt, timeZone),
        });
      }
    } else if (tokenPlan?.status === 'none') {
      details.push({
        label: t('dashboard.qwen.planTier'),
        value: t('dashboard.qwen.notSubscribed'),
      });
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/dashboard/viewModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/dashboard/viewModel.ts src/presentation/dashboard/viewModel.test.ts
git commit -m "feat: show Token Plan quota in the dashboard"
```

---

### Task 10: Document the contract, update the docs, and release

**Files:**

- Modify: `docs/contracts/qwen.md`
- Modify: `docs/contracts/README.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Record the verified contract in `docs/contracts/qwen.md`**

Add this section at the end of the file:

```markdown
## Token Plan quota (personal)

Captured live from the account used for development; the exact date and hosts are recorded in
`src/test/fixtures/qwen/tokenPlan/standard.json` and
`src/test/fixtures/qwen/tokenPlanSubscription/standard.json`.

| Item | Value |
| --- | --- |
| Capability | `qwen.tokenPlan`, `qwen.tokenPlanSubscription` |
| Credential | Alibaba Cloud AccessKey ID + Secret (`access-key-id`, `access-key-secret`) |
| Token issuance | `POST https://modelstudio.cn-beijing.aliyuncs.com/modelstudio/cli/generateAccessToken?Action=GenerateCLIAccessToken&Version=2026-02-10`, ACS3-HMAC-SHA256, body `{}` |
| Console gateway | `POST https://bailian-cs.console.aliyun.com/cli/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=<api>` |
| Gateway auth | `Authorization: Bearer <cliAccessToken>`, form body `params=<json>&region=cn-beijing` |
| Usage API | `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage` |
| Subscription API | `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription` with `Data.commodityCode = sfm_tokenplansolo_public_cn` |
| Cornerstone | `protocol: V2`, `console: ONE_CONSOLE`, `productCode: p_efm`, `switchUserType: 3`, `consoleSite: BAILIAN_ALIYUN` |

### Fields

- `per1MonthPercentage` / `per1MonthResetTime`: current production cycle. The percentage is a
  **used ratio in 0..1**; the reset time is epoch milliseconds.
- `per1WeekPercentage` / `per1WeekResetTime`: legacy cycle. Read independently from the monthly
  fields; never conflated and never used as a fallback.
- `subscription.status === 'VALID'` means active; `specCode`, `endTime`, and `remainingDays` are
  copied only when valid.
- A missing percentage means the window does not exist. It is never rendered as 0.

### Envelope

`{ code: '200', successResponse: true, data: { success: true, DataV2: { ret?: ['SUCCESS::…'],
data: { code: 'SUCCESS', success: true, data: { …fields } } } } }`

### Errors

| Signal | Meaning | UI |
| --- | --- | --- |
| `BailianGateway.Login.NotLogined` | The derived console token was rejected | One silent token refresh and retry; then `error.auth` |
| `BailianGateway.Team.NotAuthorised` | The RAM user is not joined to the business space | `error.qwen.tokenPlanForbidden` |
| Any other non-success envelope or field drift | Contract drift | `error.malformed` |

### Permissions

The AccessKey is the same RAM user used for `qwen.accountBalance`. In addition to
`bss:QueryAccountBalance`, Token Plan quota requires the RAM user to be joined to the Model
Studio / Qianwen business space. The official `bl workspace init` flow performs that join.
```

Update the capability status table in the same file:

```markdown
| `qwen.tokenPlan` | Implemented; live-captured |
| `qwen.tokenPlanSubscription` | Implemented; live-captured |
```

- [ ] **Step 2: Update the contracts index**

In `docs/contracts/README.md`, change the Qwen row to:

```markdown
- [Qwen / Model Studio](qwen.md): account balance and personal Token Plan quota integrated; public usage APIs remain candidates
```

- [ ] **Step 3: Update `README.md`**

In the Chinese Qwen table row, change the provider description to:

```markdown
| Qwen / 百炼 | 阿里云账户可用余额、现金余额、信控额度和额度上限；千问AI平台个人 Token Plan 额度与重置时间 | Alibaba Cloud AccessKey ID + Secret |
```

Replace the Chinese paragraph after the table with:

```markdown
Qwen 同时查询阿里云账户级余额和千问AI平台个人 Token Plan 额度。Token Plan 额度来自控制台网关，
使用同一对阿里云 AccessKey 换取临时控制台令牌；需要该 RAM 用户已加入百炼/千问业务空间。
模型级额度与消费明细仍需在对应控制台查看。
```

In the Chinese “Qwen / 百炼余额获取方式” list, replace the `bss:QueryAccountBalance` bullet with:

```markdown
- 余额查询授予 `bss:QueryAccountBalance`；Token Plan 额度还要求该 RAM 用户已加入百炼/千问业务空间。
```

In the privacy table, add:

```markdown
| `modelstudio.cn-beijing.aliyuncs.com` | 换取千问 Token Plan 控制台令牌 |
| `bailian-cs.console.aliyun.com` | 千问 Token Plan 额度与订阅 |
```

In the Known limitations section, replace the Qwen bullet with:

```markdown
- Qwen 余额来自阿里云账户级接口，Token Plan 额度来自未公开的控制台网关；平台调整后可能暂时返回“获取失败”。
  模型级额度与消费明细需前往千问AI平台/百炼控制台查看。
```

In the English section, change the Qwen paragraph to:

```markdown
Qwen currently reports both the Alibaba Cloud account balance and the personal Qianwen AI Platform
Token Plan quota. The Token Plan quota is read through the console gateway with a temporary token
derived from the same Alibaba Cloud AccessKey; the RAM user must be joined to the Model Studio /
Qianwen business space. Model-level quota and consumption remain in the console.
```

- [ ] **Step 4: Update `CLAUDE.md`**

In the “Architecture” section, after the `core`/`providers` paragraph, add:

```markdown
The Qwen adapter is the only two-step credential flow: it signs `GenerateCLIAccessToken` with the
stored AccessKey pair, then calls the console gateway with the derived token. The token is issued
once per refresh and shared by the usage and subscription calls; a `NotLogined` gateway rejection
refreshes it once. `qwen.tokenPlan` and `qwen.tokenPlanSubscription` are separate capabilities so a
subscription failure cannot hide the usage window, mirroring MiniMax.
```

In the gotchas, add:

```markdown
- **Qianwen Token Plan quota is a console gateway, not a model API.** `sk-sp-` Token Plan keys
  cannot query quota (`BailianGateway.Login.NotLogined`). The flow is AK/SK →
  `GenerateCLIAccessToken` → `bailian-cs.console.aliyun.com`; the verified contract is in
  `docs/contracts/qwen.md`. `per1MonthPercentage` is a **used** ratio in 0..1; monthly and weekly
  are independent and never conflated.
```

Update the `endpoints.json` paragraph's Qwen sentence to:

```markdown
Qwen's AccessKey pair is not an environment variable for the extension — it lives only in Secret
Storage. `endpoints.json` names `ALIBABA_CLOUD_ACCESS_KEY_ID` / `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
for the capture script only.
```

- [ ] **Step 5: Add the CHANGELOG entry and bump the version**

Run:

```bash
npm version 0.2.19 --no-git-tag-version
```

Prepend to `CHANGELOG.md`:

```markdown
## 0.2.19 — 2026-11-20

- 接入千问AI平台个人 Token Plan 额度：使用现有阿里云 AccessKey 换取临时控制台令牌，显示月度/每周额度剩余百分比、重置时间、套餐档位与到期时间。
- Token Plan 额度在状态栏、悬浮详情、Activity Bar 概览和仪表盘四处同步展示；额度查询失败不影响账户余额显示。
- 新增 `docs/contracts/qwen.md` Token Plan 契约小节与真实抓包 fixture。
- 更新 Qwen 凭据引导：Token Plan 额度查询要求 RAM 用户已加入百炼/千问业务空间。
```

- [ ] **Step 6: Run the full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
npm run check:locales
npm run check:i18n
npm run guard:fixtures
npm run guard:package
```

Expected: all pass. `guard:package` requires the `dist/` bundles, which `npm run build` produces.

- [ ] **Step 7: Run the packaging gate**

Run: `npm run package`

Expected: the release gate passes, `vsce` produces a `.vsix`, and the package guard passes. If the
gate complains that `v0.2.19` exists or the tag is behind HEAD, report it before changing anything.

- [ ] **Step 8: Commit**

```bash
git add docs/contracts/qwen.md docs/contracts/README.md README.md CLAUDE.md CHANGELOG.md package.json package-lock.json
git commit -m "chore(release): v0.2.19"
```

---

## Self-review notes

- Every spec section has a task: transport (Tasks 1, 4), parsers and semantics (Task 3), four
  surfaces (Tasks 6–9), localization (Task 5), capture and contract (Tasks 2, 10), release
  (Task 10), failure isolation and retry (Tasks 3, 4).
- The parser is written after the live capture; no fixture is hand-authored.
- Type names are consistent across tasks: `QwenTokenPlan`, `QwenTokenPlanWindow`,
  `QwenTokenPlanSubscription`, `QwenOrigins`, `QwenTokenPlanWindowView` (presentation-local).
- The new capability ids are `qwen.tokenPlan` and `qwen.tokenPlanSubscription` everywhere; the
  endpoint ids are `qwen.tokenPlanToken`, `qwen.tokenPlanUsage`, and
  `qwen.tokenPlanSubscription`.
