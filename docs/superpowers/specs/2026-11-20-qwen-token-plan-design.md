# QuotaDeck CN — Qianwen AI Platform Token Plan Quota

> **Status.** Design approved 2026-11-20, revised the same day after a live probe. The first
> credential route (Alibaba Cloud AK/SK → `GenerateCLIAccessToken` → Bailian console gateway) was
> proven to fail with `BailianGateway.Team.NotAuthorised` for both gateway sites: the RAM user is
> not a member of the Bailian workspace, and fixing that requires an account-modifying
> `bl workspace init`. The approved replacement is the **official Qianwen management OAuth device
> flow**, which the live probe verified end to end. The verified response contract lives in
> [`docs/contracts/qwen.md`](../../contracts/qwen.md) and takes precedence over this document.

## 1. Context

QuotaDeck currently reports the Qwen / Model Studio **account balance** through the Alibaba Cloud
Billing OpenAPI (`qwen.accountBalance`, `business.aliyuncs.com`) with an AccessKey pair. The
千问AI平台 (Qianwen AI Platform, `platform.qianwenai.com`) also sells a **Token Plan** with a
monthly Credits allowance and a hard stop when it is exhausted.

The platform documents that Token Plan credits are viewable only in its console
([用量与额度](https://platform.qianwenai.com/docs/token-plan/token-plan-usage-quota)). A Token Plan
key (`sk-sp-…`) authorizes model calls only; the quota backend rejects it with
`BailianGateway.Login.NotLogined`. The official `qianwen` CLI signs in with an OAuth device flow
and reaches the quota backend through `cs-data.qianwenai.com`; the official `bl` CLI reaches the
same backend with an Alibaba Cloud AK/SK, but only after the RAM user is joined to a Bailian
workspace.

**Live probe result (2026-11-20):** the OAuth device flow works end to end with the user's
Qianwen account. It returned `per1MonthPercentage = 0.0262…`,
`per1MonthResetTime = 1797782400000`, and a `VALID` `essential` subscription with 30 remaining
days. The raw responses are committed as fixtures.

**Goal.** Show the Token Plan quota in all four QuotaDeck surfaces next to the existing Qwen
balance, using the Qianwen platform's official management credential — never a browser cookie.

## 2. Goals and non-goals

### Goals

1. Add a one-time "sign in to Qianwen AI" device-flow command; store the resulting OAuth access
   token in Secret Storage and never show it.
2. Fetch the personal Token Plan usage window(s) and subscription with that token.
3. Render remaining percentage, reset time, plan tier, and expiry in the status bar, tooltip,
   Activity Bar tree, and dashboard.
4. Keep failures isolated: a Token Plan failure must not hide the account balance, and a
   subscription failure must not poison the usage windows.
5. Preserve the project invariants: credentials only in Secret Storage, no zeros for missing
   data, no invented payloads, localized UI strings, endpoints centralized in `endpoints.json`.
6. Capture and document the real response before the parser is trusted.

### Non-goals

- Absolute Credits remaining or a Credits total from `quota-config`. V1 shows percentages, reset
  times, plan tier, and expiry only.
- Team Token Plan, seat summaries, shared packages, add-on packages, or purchase APIs.
- Usage breakdown, per-model telemetry, or account balance changes.
- A browser cookie, a pasted session token, or reading another tool's stored login state.
- Model-level quota (`qwen.modelQuota`) or consumption detail (`qwen.consumption`).

## 3. Capability model and credentials

Three capabilities on the existing `qwen` provider:

| Capability | Title key | Credential | Data |
| --- | --- | --- | --- |
| `qwen.accountBalance` | `capability.qwen.accountBalance` | `access-key-id` (+ secret) | `QwenAccountBalance` |
| `qwen.tokenPlan` | `capability.qwen.tokenPlan` | `management-token` | `QwenTokenPlan` |
| `qwen.tokenPlanSubscription` | `capability.qwen.tokenPlanSubscription` | `management-token` | `QwenTokenPlanSubscription` |

`CREDENTIAL_KINDS` gains `management-token`. `SecretStore` maps it to
`quotaDeck.qwen.managementToken`. The stored value is JSON:

```json
{ "accessToken": "<opaque>", "expiresAt": "2027-01-01T00:00:00.000Z" }
```

`connect()` reads all credential kinds and reports `ready` only when both groups are complete;
otherwise it reports `partial` with the ready capabilities and the missing credential per
capability. A provider with neither group is `not-configured`.

### Types (`src/providers/qwen/shape.ts`)

```ts
export interface QwenTokenPlanWindow {
  readonly cycle: 'monthly' | 'weekly';
  /** Official semantic: used ratio in 0..1, never remaining. */
  readonly usedRatio: number;
  readonly resetAt: number | null;
}

export interface QwenTokenPlan {
  readonly windows: readonly QwenTokenPlanWindow[];
}

export type QwenTokenPlanStatus = 'active' | 'none' | 'unknown';

export interface QwenTokenPlanSubscription {
  readonly status: QwenTokenPlanStatus;
  readonly specCode: string | null;
  readonly expiresAt: number | null;
  readonly remainingDays: number | null;
}
```

Rules:

- `per1MonthPercentage` / `per1MonthResetTime` and `per1WeekPercentage` /
  `per1WeekResetTime` are read independently. If both are present, both windows are shown.
  Neither falls back to the other.
- A percentage outside 0..1, or a reset time that is not a safe integer epoch, is contract drift:
  the capability fails as `malformed`. A missing percentage produces no window — never a zero.
- Subscription: `status === 'VALID'` is `active`; a SUCCESS response with no `data` is `none`;
  any other state is `unknown`. Missing `specCode` / `endTime` / `remainingDays` stays `null`.
- `quota-config` is not called in v1.

## 4. Transport

### 4.1 Device-flow login (new command)

Auth origin: `https://t.qianwenai.com`.

1. Generate a persistent `client_id` (UUID) in `context.globalState` under
   `quotaDeck.qianwen.clientId`, a PKCE verifier (32 random bytes, base64url) and an S256
   challenge.
2. `POST /cli/device/code?client_id=…&code_challenge=…&code_challenge_method=S256`
   → `{ Success: true, Data: { Token, VerificationUrl, ExpiresIn, Interval } }`.
3. Open `VerificationUrl` with `vscode.env.openExternal` and poll
   `POST /cli/device/token?client_id=…&token=…&code_verifier=…` every `Interval` seconds until
   `ExpiresIn`, honoring `slow_down`.
4. On `Status === 'complete'`, read `Data.Credentials.AccessToken` and `ExpireTime` (snake_case
   fallbacks are accepted). Write `{ accessToken, expiresAt }` to Secret Storage.
5. On `expired_token` / `access_denied`, show an error and store nothing.

The command is `quotaDeck.loginQwen` ("Sign in to Qianwen AI / 登录千问AI平台") and is reachable
from the manifest, the configure-Qwen flow, and the command palette. The token is never logged,
shown, or written outside Secret Storage. Expired tokens produce `error.qwen.loginExpired` and the
user re-runs the command; there is no refresh grant.

### 4.2 Console token

`POST https://cli.qianwenai.com/data/v2/api.json` with
`Authorization: Bearer <management access token>` and JSON body:

```json
{
  "product": "ModelStudioRegional",
  "action": "GenerateCLIAccessToken",
  "region": "cn-beijing",
  "params": {},
  "version": "2026-02-10"
}
```

The response is a flat envelope `{ code: "200", data: { cliAccessToken: "…" } }`. The console
token is issued once per refresh and shared by the usage and subscription calls; a
`BailianGateway.Login.NotLogined` gateway answer refreshes it once and retries that call.

### 4.3 Console gateway

`POST https://cs-data.qianwenai.com/cli/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=<api>`
with `Authorization: Bearer <cliAccessToken>`, `Content-Type: application/x-www-form-urlencoded`,
body `params=<json>&region=cn-beijing`, where `params` is:

```json
{
  "Api": "<api>",
  "V": "1.0",
  "Data": {
    "cornerstoneParam": {
      "protocol": "V2",
      "console": "ONE_CONSOLE",
      "productCode": "p_efm",
      "switchUserType": 3,
      "consoleSite": "QIANWENAI"
    }
  }
}
```

`api` is `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage`; the subscription uses the same
path with `/subscription` and adds `"commodityCode": "sfm_tokenplansolo_public_cn"` to `Data`.

### 4.4 Endpoints and credentials

`src/providers/endpoints.json` is the single source:

- origins: `qwen-api` (BSS balance), `qwen-auth` (`https://t.qianwenai.com`), `qwen-cli`
  (`https://cli.qianwenai.com`), `qwen-data` (`https://cs-data.qianwenai.com`);
- endpoints: `qwen.deviceCode` (`/cli/device/code`), `qwen.devicePoll`
  (`/cli/device/token`), `qwen.consoleAccess` (`/data/v2/api.json`),
  `qwen.tokenPlanUsage`, `qwen.tokenPlanSubscription`;
- no Qwen credential environment variable: the extension reads the management token from Secret
  Storage and the balance AccessKey pair from Secret Storage.

## 5. Response envelope and parsing

Verified 2026-11-20 (fixtures under `src/test/fixtures/qwen/`):

1. outer: `code === '200'` and `successResponse === true`;
2. gateway: `data.success === true`, empty `errorCode`;
3. `DataV2.ret` is present in the live response and starts with `SUCCESS::`; the parser validates
   it when present and does not fail when absent;
4. business: `DataV2.data.code === 'SUCCESS'` and `DataV2.data.success === true`;
5. the payload fields live under `DataV2.data.data`.

Gateway business errors map to capability states:

| Gateway signal | State |
| --- | --- |
| `BailianGateway.Login.NotLogined` after one retry | `failed` / `auth` |
| `BailianGateway.Team.NotAuthorised` | `failed` / `auth` with `error.qwen.tokenPlanForbidden` |
| Envelope or field drift | `failed` / `malformed` |
| Network, timeout, 429, 5xx | normalized by `HttpClient` as today |
| Previous good value exists | coordinator turns the capability into `stale` |
| Missing management token | `unconfigured` |
| Expired management token | `failed` / `auth` with `error.qwen.loginExpired` |

## 6. Surfaces

All four surfaces consume the same coordinator snapshot through their existing view models.

### Status bar

- Qwen segment: `<balance> · <percent>%`, where the percent is the tightest live Token Plan window
  and the icon uses `quotaTone(percent, warningThresholdPercent)`.
- When no plan window is available, fall back to today's balance-only rendering.
- `visibleTone()` includes Qwen plan windows, so a critical plan turns the status bar red.
- The countdown is omitted from the Qwen segment; the tooltip carries the reset time.

### Tooltip

Balance rows stay first. A `Token Plan` section follows: one row per window with bar, remaining
percent, and reset time; `套餐` with the `specCode`; `到期` with the expiry; `未订阅 Token Plan`
when the subscription is `none`; nothing for `unknown`; the normalized error when a capability
failed.

### Activity Bar tree

One child per window with remaining/used percent and reset time; muted children for the plan tier
and expiry; a muted `未订阅 Token Plan` child for `none`; a failed child with the normalized
message; the provider row uses the tightest live window tone (like MiniMax).

### Dashboard

One `QuotaMeter` per window (the existing generic meter renderer), details for plan tier and
expiry, and the updated `dashboard.qwen.unsupportedDetail` note (account balance and Token Plan
included; model-level quota and consumption remain console-only). The `hero` includes the plan
windows automatically.

## 7. Localization

New keys in `messages.ts`, `en-us.ts`, `zh-cn.ts`:

- `capability.qwen.tokenPlan`, `capability.qwen.tokenPlanSubscription`
- `tooltip.window.monthly`
- `dashboard.qwen.tokenPlanSection`, `dashboard.qwen.planTier`, `dashboard.qwen.notSubscribed`
- `error.qwen.tokenPlanForbidden`, `error.qwen.loginExpired`
- `credentials.qwen.managementToken`, `credentials.qwen.loginTitle`,
  `credentials.qwen.loginOpen`, `credentials.qwen.loginWaiting`, `credentials.qwen.loginSuccess`,
  `credentials.qwen.loginFailed`, `credentials.qwen.loginExpired`
- `command.loginQwen.title` in `package.nls.json` and `package.nls.zh-cn.json`

Existing keys reused: `tooltip.window.weekly`, `tooltip.resetAt`, `tooltip.expires`,
`tooltip.remaining`, `tooltip.used`, `state.failed`, `state.stale`.

The configure-Qwen flow offers two actions: configure the balance AccessKey pair, or sign in for
Token Plan. The login command is also registered directly.

## 8. Capture, contract, and tests

### 8.1 Live capture

The OAuth device flow was exercised with a throwaway `scripts/capture-fixture.mjs` probe on
2026-11-20; the sanitized responses are committed as
`src/test/fixtures/qwen/tokenPlan/standard.json` and
`src/test/fixtures/qwen/tokenPlanSubscription/standard.json`. The fixtures include the
`GenerateCLIAccessToken` response (token redacted) under `steps` and the gateway response under
`response`. Future re-captures use the same device flow; credentials are never written to disk
except the Secret Storage entry the extension itself owns.

### 8.2 Tests

- `shape.test.ts`: month/week/both window selection, 0..1 bounds, reset timestamps, subscription
  `active` / `none` / `unknown`, envelope drift, `NotLogined` and `NotAuthorised`.
- `auth.test.ts`: device init and poll parsing, PKCE parameters, management-token parsing and
  expiry.
- `qwenLogin.test.ts`: opens the verification URL, polls to completion, stores the token, handles
  expiry and denial, never exposes the token.
- `provider.test.ts`: console-token issuance, shared token, `NotLogined` retry, `NotAuthorised`,
  expired management token, unconfigured plan, balance isolation.
- `overview/model.test.ts`, `tooltip.test.ts`, `statusBar.test.ts`, `viewModel.test.ts`: window
  rendering, tone, not-subscribed, failure, stale.
- A manifest test asserts `quotaDeck.loginQwen` is contributed and registered.
- `npm run typecheck`, `npm test`, `npm run build`, `npm run check:locales`, `npm run check:i18n`,
  `npm run guard:fixtures`, `npm run guard:package`.

## 9. Risks

- The console gateway is undocumented, like MiniMax's. Shape drift surfaces as `malformed`; it is
  never papered over.
- The OAuth device flow is the official CLI's route but is not a documented public API. A server
  change breaks login; the command reports the failure and stores nothing.
- The management access token has no refresh grant in the official CLI. On expiry the user signs
  in again; the UI says so.
- Token Plan key policy restricts `sk-sp-…` keys to interactive tools. This feature never uses
  that key; it queries account data with the user's management login.
- An unauthenticated or expired login disables only the Token Plan capabilities; the balance
  keeps working.

## 10. Release

Update `CHANGELOG.md` (Chinese) with a `feat:` entry, bump the `package.json` /
`package-lock.json` version to `0.2.19`, and let `scripts/release-gate.mjs` verify the tag state
at packaging time. `README.md` (both language sections), `CLAUDE.md`, and
`docs/contracts/qwen.md` are updated in the same change.
