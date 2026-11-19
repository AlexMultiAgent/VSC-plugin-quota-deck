# Qwen / Model Studio contract inventory

Checked on 2026-11-18.

This document separates sources used by the extension from stronger Qwen /
Model Studio sources that are available but not yet integrated. Listing a
source here does not claim that its live response shape has been verified in
this implementation environment.

## Source inventory

| Source | Capability | Credential | Status |
| --- | --- | --- | --- |
| Alibaba Cloud BSS `QueryAccountBalance` | Account available, cash, credit, and quota-limit amounts | Alibaba Cloud AccessKey ID and Secret | Integrated as `qwen.accountBalance` |
| Qianwen management API (OAuth device flow) | Personal Token Plan usage window and subscription | Qianwen management access token from `t.qianwenai.com` | Integrated as `qwen.tokenPlan` / `qwen.tokenPlanSubscription`; live-captured |
| Model Studio Usage API `GET /usage/summary` | Usage totals for a selected period | Not yet verified | Candidate runtime source |
| Model Studio Usage API `GET /usage/trend` | Usage time series for a selected period | Not yet verified | Candidate runtime source |
| Model Studio CLI `bl quota show` | Account quota inspection from a terminal | User-installed CLI session | Diagnostic/reference only |

The balance query uses the BSS OpenAPI endpoint at
`https://business.aliyuncs.com/`. The Usage API and CLI entries do not add any
runtime network request in the current version.

## Why the usage sources are stronger

The integrated balance query describes the Alibaba Cloud account. It cannot
show how many tokens a Qwen model consumed, which models were used, or how
usage changed over time. The public `/usage/summary` and `/usage/trend`
endpoints can provide those dimensions and are therefore a stronger future
basis for the Qwen dashboard than the balance-only capability.

`bl quota show` can be useful when manually checking quota behavior or
capturing a fixture. The extension should not depend on it at runtime by
default because it requires a separately installed CLI, imports an external
authentication context, and makes error handling and support harder.

## Integration gates

Before any Usage API capability changes from candidate to integrated, capture
and sanitize representative responses for all supported periods, then confirm:

- the API origin and authentication method;
- exact query parameters, timezone handling, and allowed range values;
- field names and units for request, token, model, and cost totals;
- pagination, rate limits, and empty-period behavior;
- whether the endpoint reports free quota, paid usage, or both;
- the RAM permissions required beyond `bss:QueryAccountBalance`.

Until those checks pass, the dashboard must not turn candidate usage data into
zeros or present it as live account usage.

## capability status

| Capability | Status |
| --- | --- |
| `qwen.accountBalance` | Implemented and unit-tested; not live-captured here |
| `qwen.tokenPlan` | Implemented; live-captured 2026-11-20 |
| `qwen.tokenPlanSubscription` | Implemented; live-captured 2026-11-20 |
| `qwen.usageSummary` | Candidate; not implemented |
| `qwen.usageTrend` | Candidate; not implemented |
| `qwen.quotaCli` | Reference only; not implemented |


## Personal Token Plan quota (OAuth management login)

Checked live on 2026-11-20 with the Qianwen AI Platform account used for development.

### Why OAuth, not AK/SK

The 千问AI平台 Token Plan key (`sk-sp-…`) authorizes model calls only. Using it against the quota
backend returns `BailianGateway.Login.NotLogined`. An Alibaba Cloud AK/SK can reach the same
backend, but only after the RAM user is joined to a Bailian workspace; both gateway sites returned
`BailianGateway.Team.NotAuthorised` in this environment, and fixing that requires the
account-modifying `bl workspace init`. The official management OAuth device flow reaches the quota
without a workspace and was verified end to end.

### Flow

1. Device code + PKCE (S256):
   `POST https://t.qianwenai.com/cli/device/code?client_id=<uuid>&code_challenge=<S256>&code_challenge_method=S256`
   → `{ Success: true, Data: { Token, VerificationUrl, ExpiresIn, Interval } }`.
2. Poll:
   `POST https://t.qianwenai.com/cli/device/token?client_id=<uuid>&token=<device>&code_verifier=<verifier>`
   → `Data.Status`, and on `complete` `Data.Credentials.AccessToken` + `ExpireTime`.
3. Console token:
   `POST https://cli.qianwenai.com/data/v2/api.json` with
   `Authorization: Bearer <management access token>` and
   `{ product: "ModelStudioRegional", action: "GenerateCLIAccessToken", region: "cn-beijing",
   params: {}, version: "2026-02-10" }` → `{ code: "200", data: { cliAccessToken } }`.
4. Gateway:
   `POST https://cs-data.qianwenai.com/cli/api.json?action=BroadScopeAspnGateway&product=sfm_bailian&api=<api>`
   with `Authorization: Bearer <cliAccessToken>` and form body
   `params=<json>&region=cn-beijing`. `cornerstoneParam` uses `protocol: "V2"`,
   `console: "ONE_CONSOLE"`, `productCode: "p_efm"`, `switchUserType: 3`,
   `consoleSite: "QIANWENAI"`.

### APIs and fields

| API | Fields |
| --- | --- |
| `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage` | `per1MonthPercentage` (used ratio 0..1) and `per1MonthResetTime` (epoch ms); legacy plans may return `per1WeekPercentage` / `per1WeekResetTime` |
| `zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription` with `Data.commodityCode = sfm_tokenplansolo_public_cn` | `status: "VALID"`, `specCode` (`lite` / `essential` / `standard` / `pro`), `remainingDays`, `startTime`, `endTime`, `autoRenewFlag`, `instanceCode` |

Live values observed: `per1MonthPercentage = 0.0262…`, `per1MonthResetTime = 1797782400000`,
`specCode = "essential"`, `remainingDays = 30`, `status = "VALID"`.

### Envelope

`{ code: "200", successResponse: true, data: { success: true, errorCode: "",
DataV2: { ret: ["SUCCESS::…"], data: { code: "SUCCESS", success: true, data: { …fields } } } } }`

`ret` was present in the live response; the parser validates it when present and tolerates its
absence. The usage payload has no absolute credit totals in this flow; `quota-config` is a separate
API and is not called.

### Errors

| Signal | Meaning | UI |
| --- | --- | --- |
| `BailianGateway.Login.NotLogined` | The derived console token was rejected | Refresh the console token once and retry; then `error.qwen.loginExpired` |
| `BailianGateway.Team.NotAuthorised` | The account is not authorized for the business space | `error.qwen.tokenPlanForbidden` |
| Any other non-success envelope or field drift | Contract drift | `error.malformed` |
| Missing management token | The user has not signed in | `unconfigured` |
| Expired management token | The stored `expiresAt` has passed | `error.qwen.loginExpired` |

### Credentials and storage

The management access token and `ExpireTime` are stored as JSON in VS Code Secret Storage under
`qwen` / `management-token`. The token is never logged, shown, or written elsewhere. The official
CLI has no refresh grant; an expired token means the user re-runs
`QuotaDeck CN: 登录千问AI平台`. The account-balance capability keeps using the Alibaba Cloud
AccessKey pair; the two credential groups fail independently.

### Capture

`scripts/capture-qwen-fixtures.mjs` performs the device flow once and writes both fixtures under
`src/test/fixtures/qwen/`. The committed fixtures were captured this way; `steps[0]` is the
`GenerateCLIAccessToken` response with `data.cliAccessToken` redacted, and `response` is the
gateway response.
