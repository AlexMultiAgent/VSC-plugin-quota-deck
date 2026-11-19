# QuotaDeck CN — Qianwen AI Platform Token Plan Quota

> **Status.** Design approved 2026-11-20. The transport contract is pinned by a live capture
> before any parser is written; until that capture lands, every field name below is a
> pre-verification target drawn from the official `qianwen` CLI and a community measurement, not a
> shipped contract. The verified contract belongs in [`docs/contracts/qwen.md`](../../contracts/qwen.md)
> and takes precedence over this document.

## 1. Context

QuotaDeck currently reports the Qwen / Model Studio **account balance** through the Alibaba Cloud
Billing OpenAPI (`qwen.accountBalance`, `business.aliyuncs.com`). The 千问AI平台 (Qianwen AI
Platform, `platform.qianwenai.com`) also sells a **Token Plan**: a subscription with a monthly
Credits allowance, an optional legacy weekly window, and a hard stop when the allowance is
exhausted. That quota is not exposed by any public API.

The platform documentation says Token Plan credits are viewable only in the Token Plan console
([用量与额度](https://platform.qianwenai.com/docs/token-plan/token-plan-usage-quota)). A Token Plan
key (`sk-sp-…`) authorizes model calls only; using it against the quota backend returns
`BailianGateway.Login.NotLogined`. The official `qianwen` CLI therefore signs in with an OAuth
device flow, and the official `bl` CLI reaches the same backend with an Alibaba Cloud AK/SK. This
feature uses the AK/SK route because QuotaDeck already stores and signs with an Alibaba Cloud
AccessKey pair for `qwen.accountBalance`.

**Goal.** Show the Token Plan quota in all four QuotaDeck surfaces, next to the existing Qwen
balance, without adding a browser-session credential, a login flow, or a new credential kind.

## 2. Goals and non-goals

### Goals

1. Fetch the personal Token Plan usage window(s) and subscription state with the existing Qwen
   AccessKey ID + Secret.
2. Render the remaining percentage, reset time, plan tier, and expiry in the status bar, tooltip,
   Activity Bar tree, and dashboard.
3. Keep failures isolated: a Token Plan failure must not hide the account balance, and a
   subscription failure must not poison the usage windows.
4. Preserve the project invariants: credentials only in Secret Storage, no zeros for missing data,
   no invented payloads, localized UI strings, endpoints centralized in `endpoints.json`.
5. Capture and document the real response before the parser is trusted.

### Non-goals

- Absolute Credits remaining or a Credits total from `quota-config`. V1 shows percentages, reset
  times, plan tier, and expiry only. A configured tier allowance is not a reading and must not be
  presented as one.
- Team Token Plan, seat summaries, shared packages, add-on packages, or purchase APIs.
- Usage breakdown, per-model telemetry, or account balance changes.
- An OAuth device-flow login, a browser cookie, or reading another tool's stored session.
- Model-level quota (`qwen.modelQuota`) or consumption detail (`qwen.consumption`), which remain
  deferred under the product design spec.

## 3. Capability model

Two capabilities are added to the existing `qwen` provider, mirroring the MiniMax
`minimax.plan` / `minimax.subscription` split. Both use the existing `access-key-id` credential
descriptor; the provider's `connect()` already reports a missing secret as `access-key-secret`.

| Capability | Title key | Credential | Data |
| --- | --- | --- | --- |
| `qwen.tokenPlan` | `capability.qwen.tokenPlan` | `access-key-id` | `QwenTokenPlan` |
| `qwen.tokenPlanSubscription` | `capability.qwen.tokenPlanSubscription` | `access-key-id` | `QwenTokenPlanSubscription` |

`qwen.accountBalance` is unchanged.

### Types (`src/providers/qwen/shape.ts`)

```ts
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
```

Rules:

- `per1MonthPercentage` / `per1MonthResetTime` and `per1WeekPercentage` /
  `per1WeekResetTime` are read independently. If both are present, both windows are shown. Neither
  falls back to the other; the parser never conflates monthly and weekly.
- A percentage outside 0..1, or a reset time that is not a safe integer epoch, is contract drift:
  the capability fails as `malformed`. A missing percentage simply produces no window for that
  cycle — never a zero.
- `quota-config` is not called in v1.
- Subscription: `status === 'VALID'` is `active`; a SUCCESS response with no `data` is `none`; any
  other state is `unknown`. `specCode`, `endTime`, and `remainingDays` are copied only when the
  corresponding fields are valid.

## 4. Transport

### 4.1 Two-step flow

1. **Issue a console token.** `POST https://modelstudio.cn-beijing.aliyuncs.com/modelstudio/cli/generateAccessToken?Action=GenerateCLIAccessToken&Version=2026-02-10`,
   signed with `signAliyunRequest()` (ACS3-HMAC-SHA256), `Content-Type: application/json`, body
   `{}`. The response carries `cliAccessToken`.
2. **Query the console gateway.** `POST https://bailian-cs.console.aliyun.com/cli/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=<api>`,
   `Authorization: Bearer <cliAccessToken>`, `Content-Type: application/x-www-form-urlencoded`,
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
         "consoleSite": "BAILIAN_ALIYUN"
       }
     }
   }
   ```

   `api` is `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage` for usage and the same with
   `/subscription` for the subscription; the subscription request adds
   `"commodityCode": "sfm_tokenplansolo_public_cn"` to `Data`.

The console token is issued once per refresh and shared by both gateway calls. If the gateway
answers `BailianGateway.Login.NotLogined`, the provider issues one fresh token and retries that
call exactly once.

The official CLI reaches the same backend through `cs-data.qianwenai.com` with
`consoleSite: "QIANWENAI"`. The live probe decides which host/site accepts an AK/SK-derived token;
the losing variant is not implemented. The endpoints and their `consoleSite` are recorded in the
contract doc.

### 4.2 HTTP client

`src/core/http.ts` gains `postForm(url, body, options)` because `postJson()` forces
`application/json` and JSON.stringify. The token call continues to use `postJson()`.

### 4.3 Endpoints and credentials

`src/providers/endpoints.json` is the single source:

- origins: `qwen-modelstudio` (`https://modelstudio.cn-beijing.aliyuncs.com`) and `qwen-console`
  (`https://bailian-cs.console.aliyun.com`);
- endpoints: `qwen.tokenPlanToken`, `qwen.tokenPlanUsage`, `qwen.tokenPlanSubscription`
  (path plus fixed query, as with `minimax.subscription`);
- credentials: `qwen.accessKeyIdEnv` / `qwen.accessKeySecretEnv`
  (`ALIBABA_CLOUD_ACCESS_KEY_ID` / `ALIBABA_CLOUD_ACCESS_KEY_SECRET`). These are **capture-script
  only**; the extension itself still reads the pair from Secret Storage. `CLAUDE.md`'s note that
  the Qwen pair is not an environment variable is updated to say "not an environment variable for
  the extension".

The `QwenProvider` constructor changes from one origin to a typed origins object. The provider
still never reads a raw payload shape outside `shape.ts`.

## 5. Response envelope and parsing

The official `qianwen` CLI validates the envelope in `unwrapCsDataResponse` and parses the fields
in `parseSoloUsage` / `parseSoloSubscription`; this parser mirrors those checks:

1. outer: `code === '200'` and `successResponse === true`;
2. gateway: `data.success === true`; when `data.DataV2.ret` exists, `ret[0]` starts with
   `SUCCESS::`;
3. business: `DataV2.data.code === 'SUCCESS'` and `DataV2.data.success === true`;
4. the payload fields live under `DataV2.data.data`.

The community measurement of the Bailian host omitted `ret`; the probe decides whether it is
present. The parser validates `ret` when present and never fails solely because it is absent.

Gateway business errors map to capability states rather than numbers:

| Gateway signal | State |
| --- | --- |
| `BailianGateway.Login.NotLogined` after one retry | `failed` / `auth` |
| `BailianGateway.Team.NotAuthorised` | `failed` / `auth` with `error.qwen.tokenPlanForbidden` |
| Envelope or field drift | `failed` / `malformed` |
| Network, timeout, 429, 5xx | normalized by `HttpClient` as today |
| Previous good value exists | coordinator turns the capability into `stale` |

## 6. Surfaces

All four surfaces consume the same coordinator snapshot through their existing view models.

### Status bar (`presentation/statusBar.ts`)

- Qwen segment: `<balance> · <percent>%`, where the percent is the tightest live Token Plan window
  and the icon uses `quotaTone(percent, warningThresholdPercent)`.
- When no plan window is available, the segment falls back to today's balance-only rendering.
- `visibleTone()` includes Qwen plan windows, so a critical plan turns the status bar red.
- The countdown is omitted from the Qwen segment to keep the balance and percent in one short
  segment; the tooltip carries the reset time.

### Tooltip (`presentation/tooltip.ts`)

Balance rows stay first. A `Token Plan` section follows:

- one row per window: label, bar, remaining/used percent, reset time;
- `套餐` row with the `specCode` (data, not translated);
- `到期` row with the expiry in `quotaDeck.timeZone`;
- `未订阅 Token Plan` when the subscription says `none`;
- nothing for `unknown` — an unconfirmed subscription is not a claim that no plan exists;
- the normalized error message when either capability failed.

### Activity Bar tree (`presentation/overview/model.ts`)

- one child per window with the remaining/used percent, reset time, and quota tone;
- muted children for the plan tier and expiry;
- a muted `未订阅 Token Plan` child when `status === 'none'`;
- a failed child with the normalized message when a capability failed;
- the provider row uses the tightest live window tone (like MiniMax) when the balance itself is
  healthy.

### Dashboard (`presentation/dashboard/viewModel.ts`)

- one `QuotaMeter` per window (the existing generic meter renderer needs no change);
- details for plan tier and expiry;
- the `dashboard.qwen.unsupportedDetail` note is rewritten: account balance and Token Plan quota
  are included; model-level quota and consumption remain console-only;
- the `hero` (lowest remaining) automatically includes plan windows because they are not
  `model:` meters.

## 7. Localization

New keys in `src/localization/messages.ts`, `en-us.ts`, and `zh-cn.ts`:

- `capability.qwen.tokenPlan`
- `capability.qwen.tokenPlanSubscription`
- `tooltip.window.monthly`
- `dashboard.qwen.tokenPlanSection`
- `dashboard.qwen.planTier`
- `dashboard.qwen.notSubscribed`
- `error.qwen.tokenPlanForbidden`

Existing keys reused: `tooltip.window.weekly`, `tooltip.resetAt`, `tooltip.expires`,
`tooltip.remaining`, `tooltip.used`, `state.failed`, `state.stale`.

The dashboard webview receives no new string: all new labels are rendered by the host view model
into `QuotaMeter` and `ProviderDetail` records. No `DashboardLocalization` or protocol change is
needed.

The Qwen credential prompts are updated to mention that Token Plan quota additionally requires the
RAM user to be joined to the Model Studio / Qianwen business space; the exact policy name is
recorded after the live probe.

## 8. Capture, contract, and tests

### 8.1 Live probe (go/no-go, before code)

With `ALIBABA_CLOUD_ACCESS_KEY_ID` and `ALIBABA_CLOUD_ACCESS_KEY_SECRET` set by the user in the
current shell session:

1. issue a console token;
2. call the usage endpoint;
3. call the subscription endpoint;
4. record the exact host/site combination that worked and the observed fields.

If the probe fails, implementation stops and the credential route is revisited before any parser
is written. Nothing is inferred from a failed probe.

### 8.2 Capture script

`scripts/capture-fixture.mjs` gains a chained spec for `qwen`:

- `POST` support, ACS3 signing, and a `dependsOn` step that extracts `cliAccessToken` from the
  first response and uses it as the bearer for the second;
- the final response becomes `response`; a multi-step capture also records the earlier bodies under
  `steps`;
- the existing sanitizer redacts `cliAccessToken` (key matches `token`) and zeroes financial keys;
- credentials come only from the environment; no file or CLI argument.

Fixtures:

- `src/test/fixtures/qwen/tokenPlan/<case>.json`
- `src/test/fixtures/qwen/tokenPlanSubscription/<case>.json`

At least one live `standard` capture per capability. Negative-state tests derive from the captured
files by removing fields or setting `data` to null — they never rewrite a payload with guessed
field names.

### 8.3 Tests

- `shape.test.ts`: window selection (monthly only, weekly only, both), used-ratio bounds, reset
  timestamps, subscription `active`/`none`/`unknown`, envelope drift.
- `provider.test.ts`: two-step success; shared token across both calls; `NotLogined` retry once;
  `Team.NotAuthorised`; token issuance failure; balance unaffected by a plan failure.
- `overview/model.test.ts`, `tooltip.test.ts`, `dashboard/viewModel.test.ts`, `statusBar.test.ts`:
  window rendering, tone, not-subscribed, failure, stale.
- `npm run typecheck`, `npm test`, `npm run build`, `npm run guard:fixtures`.

## 9. Risks

- The console gateway is undocumented, like MiniMax's. A shape change is treated as contract drift
  and surfaces as `malformed`; it is never papered over.
- The AK/SK-derived token path is backed by a community measurement and the official `bl` CLI flow,
  not by public documentation. The live probe is the authority.
- The account must authorize the RAM user for the Model Studio / Qianwen business space. Without
  that, the capability fails with an actionable message while the balance keeps working.
- Issuing a console token on every refresh adds one signed request per cycle. This is accepted for
  v1; caching is a later optimization only if the token response exposes a usable lifetime.
- The Token Plan key policy restricts `sk-sp-…` keys to interactive tools. This feature never uses
  that key; it queries account data with the AK/SK pair the user already configured.

## 10. Release

This is a shipped feature: update `CHANGELOG.md` (Chinese) with a `feat:` entry, bump the
`package.json` / `package-lock.json` version, and let `scripts/release-gate.mjs` verify the tag
state at packaging time. `README.md` (Chinese and English sections) and
`docs/contracts/qwen.md` are updated in the same change.
