# QuotaDeck CN Design

> **Status.** Revised on 2026-11-19 against the shipped v0.2.13 implementation. The original
> V1 design is preserved in the repository history (`0f97686`, `6d5c5cd`).
>
> This document describes **what the extension does now** and **what is deliberately deferred**.
> Where it disagrees with the code, the code is right and this document is the defect. The
> verified per-provider response contracts live in [`docs/contracts/`](../../contracts/) and take
> precedence over any field name mentioned here.

## 1. Product Definition

**Brand:** QuotaDeck
**China product name:** QuotaDeck CN
**Marketplace display name:** QuotaDeck CN — MiniMax DeepSeek Qwen
**Extension identifier:** `alexmultiagent.quota-deck`
**Positioning:** 国产大模型额度，一处看全。

QuotaDeck CN is a read-only VS Code extension for monitoring quota, balance, usage, and reset
windows across MiniMax, DeepSeek, and Qwen. It does not proxy model requests and does not provide
chat completion.

One brand name is used everywhere. The marketplace listing adds the provider names purely as a
discovery aid; the extension UI itself uses the brand only. The extension identifier contains
`quota-deck` and never changes for rebranding or for adding a provider.

The extension follows the successful interaction pattern used by established quota extensions: a
compact status bar item, a detailed hover tooltip, an Activity Bar overview tree, and an optional
dashboard for analysis. The status bar and tooltip are the primary experience. The dashboard is
opened only by the user and is never required to inspect current quota.

### Marketplace discovery

- The display name lists the three current providers so marketplace search matches Chinese LLM
  names.
- Description: 国产大模型额度监控 · MiniMax、DeepSeek、Qwen 余额、用量与重置倒计时.
- Keywords include `minimax`, `deepseek`, `qwen`, `quota`, `usage`, `balance`, `token usage`,
  `额度监控`, and `国产大模型`.
- The extension identifier contains `quota-deck`; future branding or display-name changes do not
  require a new extension. Adding a provider is a display-name change only.

### Surfaces

| Surface | Manifest contribution | Implementation |
| --- | --- | --- |
| Status bar | — | `presentation/statusBar.ts` |
| Hover tooltip | — | `presentation/tooltip.ts` |
| Activity Bar overview tree | `contributes.viewsContainers.activitybar` + `contributes.views.quotaDeck.overview` | `presentation/overview/provider.ts`, `presentation/overview/model.ts` |
| Dashboard | — | `presentation/dashboard/` |

All four render **the same coordinator snapshot**. `refreshAll()` in `src/extension.ts` is the only
place that pushes a snapshot into a surface; a surface added without a line there shows data that
no other surface contradicts, so it looks right until it is stale. Each surface then renders that
snapshot through its own derived view model (`buildOverviewItems`, `buildDashboardModel`).

## 2. Scope

### 2.1 Shipped scope

1. MiniMax domestic and international Token Plan quota, subscription expiry, and token usage.
2. DeepSeek account balance by currency.
3. Qwen / Model Studio account balance through the Alibaba Cloud Billing OpenAPI.
4. A status bar that shows every configured provider, or only the primary one.
5. A hover tooltip that is useful without opening another view.
6. An Activity Bar overview tree with per-provider detail.
7. An optional dashboard with a range selector, per-provider detail, and MiniMax history usage.
8. Every credential in VS Code Secret Storage.
9. Simplified Chinese and English.
10. `Asia/Shanghai` and CNY by default while preserving provider-reported currencies.
11. An installable, publishable `.vsix`.

### 2.2 Deferred scope

Four capability families are **not implemented**. They are optional work, not gaps: each one
becomes schedulable only after the feasibility gate in §4.5 is satisfied. They are listed here so
the argument that justified dropping them is not lost.

| Deferred | Would provide | Gate |
| --- | --- | --- |
| `minimax.points` | MiniMax points balance | D1 |
| `deepseek.usageAmount` / `deepseek.usageCost` / `deepseek.accountSummary` | Per-key cost, request and token series, cache breakdown, model breakdown, account-level totals | D2 |
| Dashboard usage charts and the model / usage tables | Time-series figures and per-model tables | D3 — downstream of D2 |
| `qwen.modelQuota` / `qwen.consumption` | Model-level quota and consumption detail | D4 |

The capability ids and their display labels are **reserved**, not deleted. `src/presentation/labels.ts`
still maps `qwen.modelQuota`, `qwen.consumption`, and `qwen.accessKeyValidation` to localized
names, so a future adapter can be dropped in without changing the UI contract.

### 2.3 Non-goals

- API proxying, model chat, prompt execution, or token counting by intercepting requests.
- Treating local estimates or token-derived prices as official account data.
- Automatic extraction of browser cookies.
- **Accepting a browser session as a credential.** No capability may be enabled by a cookie
  header pasted by the user — see §3.2.
- Kimi, GLM, Doubao, Baidu Qianfan, or other provider integrations.
- Currency conversion or combining amounts from different currencies.
- Automatic purchases, recharge, quota resets, or account changes.

## 3. Product Principles

### 3.1 Source integrity

Every user-visible value has exactly one provenance:

- **Account:** returned directly by an official account or platform endpoint.
- **Local:** computed from data persisted or imported by the extension.
- **Estimated:** calculated from tokens and a versioned price table.

**Today every displayed value is account data**, and the tooltip and the Activity Bar tree label
each card 账户实时数据. No local estimate and no token-derived price is surfaced, so the 本地 and
估算 labels do not exist yet — they are introduced together with the first value that needs them,
and the credential kind is deliberately not shown in the UI.

The rule that outlives the current feature set: the UI never labels an estimate as account quota,
and a generic `0%` or `0.00` is never used to mask a failed or unavailable request.

### 3.2 A failed fetch is a state, not a number

Capability states are `ok | stale | unconfigured | unsupported | failed`.

- A missing number is never substituted with `0`.
- A refresh that fails while a previous value survives becomes `stale`: the value stays visible and
  is marked as out of date, rather than the capability disappearing.
- A capability that is not implemented is `unsupported`, not `failed`, and not `0`.

### 3.3 Read-only security

- API requests run only in the extension host.
- The webview never receives raw credentials or raw provider payloads.
- Credentials are stored only in `context.secrets` — never in settings, global state, logs, or
  webview HTML.
- Authorization headers and response bodies containing credentials are never logged. The extension
  writes no console output at all.
- Network origins are fixed in `src/providers/endpoints.json`.
- The webview uses a nonce-based CSP, fixed local resource roots, and exact-key message-schema
  validation.
- Provider-controlled strings are HTML-escaped before entering tooltip markup, and the dashboard
  renders through the DOM API rather than by injecting provider strings into markup.

**No browser-session credential is accepted.** The extension removed the web-session Cookie path
in v0.2.11 together with the cookie allow-list layer (`src/providers/cookies.ts`). A capability
that can only be reached with a browser session is therefore deferred (§4.5), not implemented with
a cookie input.

## 4. Provider Data Contracts

### 4.0 Capability matrix

| Capability id | Provider | Credential | Provenance | State |
| --- | --- | --- | --- | --- |
| `minimax.plan` | MiniMax CN / Global | Token Plan Key | Account | shipped |
| `minimax.subscription` | MiniMax CN / Global | Token Plan Key | Account | shipped |
| `minimax.tokenUsage` | MiniMax CN / Global | Token Plan Key | Account | shipped |
| `deepseek.balance` | DeepSeek | API Key | Account | shipped |
| `qwen.accountBalance` | Qwen | AccessKey ID + Secret | Account | shipped |
| `minimax.points` | MiniMax | — | Account | deferred (D1) |
| `deepseek.usageAmount` | DeepSeek | — | Account | deferred (D2) |
| `deepseek.usageCost` | DeepSeek | — | Account | deferred (D2) |
| `deepseek.accountSummary` | DeepSeek | — | Account | deferred (D2) |
| `qwen.modelQuota` | Qwen | — | Account | deferred (D4) |
| `qwen.consumption` | Qwen | — | Account | deferred (D4) |
| `qwen.accessKeyValidation` | Qwen | — | Account | deferred (D4) |

### 4.1 MiniMax

Domestic and international accounts are separate provider instances with independent credentials
and state. The instance id is `minimax-cn` or `minimax-global`; both use the `minimax` provider id
family but never share state. One `MiniMaxProvider` class serves both, differing only in origin.

**Credential**

- Token Plan Key, required. It authenticates plan, subscription and token-usage queries.

**Endpoints**

| Capability id | Endpoint | Origin |
| --- | --- | --- |
| `minimax.plan` | `/v1/api/openplatform/coding_plan/remains` | `www.minimaxi.com` / `www.minimax.io` |
| `minimax.subscription` | `/v1/api/openplatform/charge/combo/cycle_audio_resource_package` | same |
| `minimax.tokenUsage` | `/account/amount?page=1&limit=100&aggregate=false` | same |

All endpoints and credential environment variables live in `src/providers/endpoints.json`, which is
the single source for both the extension and `scripts/capture-fixture.mjs`.

**Quota normalization**

- Remaining percentage has a strict precedence:
  1. If a total count and a remaining count are both present, the percentage is computed from them
     and tagged `remainingPercentSource: 'computed'`.
  2. Otherwise `current_interval_remaining_percent` is used as-is and tagged
     `remainingPercentSource: 'field'`.
  3. If neither is available the capability reports no percentage at all — `failed` or
     `unsupported`, never `0%`.
- `current_interval_usage_count` is the count **still left**, not the count already spent. The same
  record carries `current_interval_remaining_percent` next to it. A video allowance of 3 with a
  usage count of 3 means 3 remaining. A Token Plan key reports zero counts and only the percentage
  fields, which is why `remainingPercentSource` exists.
- Reset time is read from the epoch-millisecond field (`current_subscribe_end_time_ts`,
  `current_interval_end_time`), never from the locale date string, and is rendered in
  `quotaDeck.timeZone`.
- Cards are generated for returned models only. The extension does not invent an entitlement for a
  plan.
- Model rows are normalized into categories: text/general, video, image, Hailuo, music/lyrics,
  speech, and other.

**Displayed MiniMax data**

- 5-hour and weekly remaining percentage, used/total counts when available, and reset countdown.
- Video, image, Hailuo, music, speech, and other returned quota cards.
- Plan expiry and days remaining.
- Token usage history for the selected range when billing records are available.

### 4.2 DeepSeek

**Credential**

- DeepSeek API Key, required. `Authorization: Bearer <API Key>`.

**Endpoint**

| Capability id | Endpoint |
| --- | --- |
| `deepseek.balance` | `GET https://api.deepseek.com/user/balance` |

**Balance**

- Show availability, total balance, granted balance, and topped-up balance.
- Preserve every returned currency as a separate value.
- CNY is the default display currency when available; other currencies keep their ISO code and are
  never converted or added.

**Peak / off-peak pricing hint**

- A bundled JSON calendar (`src/providers/deepseek/pricing-calendar.json`) carries `version`,
  `coverageStart`, `coverageEnd`, the UTC peak windows, and the Chinese public holidays.
- Peak windows are UTC Monday–Friday `01:00–04:00` and `06:00–10:00`. Weekends and Chinese public
  holidays are entirely off-peak.
- The **Shanghai date** decides holiday and weekend; the **UTC minute-of-day** decides the peak
  window. The two calendars are deliberately mixed.
- The calendar is a hint only. Account-reported values always win over a computed price.
- `coverageEnd` must be extended before it lapses; the release gate fails the build when it is
  under 30 days out.

**Detailed usage is not integrated.** The per-key usage and account-summary endpoints require a
DeepSeek platform session, which the extension does not accept. Users are pointed at
`platform.deepseek.com` instead. See D2 in §4.5.

### 4.3 Qwen

Qwen ships a real adapter. It calls the **Alibaba Cloud Billing OpenAPI**, not a Model Studio API
key.

**Credentials**

- Alibaba Cloud AccessKey ID and AccessKey Secret, stored only in Secret Storage.
- The RAM user needs only the `bss:QueryAccountBalance` permission.

**Endpoint**

| Capability id | Endpoint | Auth |
| --- | --- | --- |
| `qwen.accountBalance` | `POST https://business.aliyuncs.com/` (BSS `QueryAccountBalance`) | ACS3-HMAC-SHA256 |

**Account balance**

- Show available amount, cash amount, credit amount (including the Mybank credit line), and the
  quota limit, each as returned by the API.
- Show the balance update time returned by the API.
- Model-level quota is **not** integrated; it belongs in the Model Studio console.
- Consumption detail needs the separate BSS bill APIs, extra permissions, and pagination, so it is
  not implemented and is never approximated by the balance or by a local estimate.

### 4.4 Ranges

The dashboard's history range is a first-class dimension, not a display filter.

```ts
type RangeId = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth';
```

- Ranges are constructed in `quotaDeck.timeZone`; month and year boundaries are handled in that
  zone, not in UTC.
- The range flows through `coordinator.refreshAll(range)`,
  `provider.fetchSnapshot(signal, range, timeZone)` and `SnapshotCache.load/save(providerId, range)`.
- The cache key is `quotaDeck.snapshot.<providerId>.<range>`, so every range has its own cache entry.
- Only MiniMax consumes the range. DeepSeek and Qwen ignore it, because neither exposes a
  range-scoped endpoint today.
- Selecting a range in the dashboard triggers a full refresh; it is never a client-side filter over
  data that was fetched for a different range.
- The range scopes **history usage only**. Account balances and the 5-hour and weekly windows are
  always current live values, and the dashboard says so.

### 4.5 Deferred capabilities and their feasibility gates

A deferred capability is not scheduled work. It becomes schedulable when its gate is met, and the
gate is a question about the provider, not about the extension's effort.

**D1 — `minimax.points`**

*What it would provide:* the MiniMax points balance, from
`/backend/account/token_plan_credit`.

*Why it is deferred:* the endpoint is authenticated by a web-session Cookie. The extension does
not accept browser sessions (§3.3), so the capability was retired in v0.2.11.
`src/core/cache.ts` lists it in `RETIRED_MINIMAX_CAPABILITIES` and strips it from snapshots cached
before the removal.

**Gate:** all of the following must hold before it is scheduled.

1. A credential that is **not** a browser session exists — either a documented, server-issued
   token whose lifetime the user can manage, or the points value becomes reachable from an
   endpoint that accepts the Token Plan key.
2. The required credential names are confirmed by a live capture, and the session lifetime is long
   enough to justify a configuration step. A session that expires hourly is not a credential.
3. A fixture is captured and sanitized through §11, and the allow-list is enforced per capability
   rather than by forwarding a pasted header.

**D2 — `deepseek.usageAmount` / `deepseek.usageCost` / `deepseek.accountSummary`**

*What they would provide:* per-API-key cost, request and token totals, cache hit/miss breakdown,
model-level breakdown, and account-level totals, plus the range-scoped series that the dashboard
charts would draw.

*Why it is deferred:* all three endpoints live on `platform.deepseek.com` and require a Platform
Session Token plus a Platform Cookie — a browser session.

**Gate:**

1. The platform exposes the same data through a documented endpoint that the API key already
   authenticates. If it does not, D2 stays deferred permanently and the console stays the answer.
2. The account-level aggregation question (OQ1) is answered: whether the account's API key list
   can be enumerated decides whether account totals are summed per key or taken from the account
   summary alone. The two are never added together.
3. Session expiry produces a distinguishable `auth` error rather than a malformed-response error,
   and a recovery path exists.

**D3 — Dashboard usage charts and the model / usage tables**

*Why it is deferred:* the chart and table surfaces were removed in v0.2.11 because there was no
live data behind them; the localization keys survive in the bundles, unused.

**Gate:** D3 is downstream of D2 and has no independent gate. It is scheduled with, or after, D2.
While D2 is deferred the dashboard shows real account values only — a range selector with no
history tiles behind it is not shown either.

**D4 — `qwen.modelQuota` / `qwen.consumption`**

*What they would provide:* Model Studio model-level quota, and consumption detail.

*Why it is deferred:* the Model Studio Usage API (`/usage/summary`, `/usage/trend`) and the `bl
quota show` CLI are recorded as stronger candidate sources, but their authentication, response
fields, and pagination are not contract-verified. The BSS bill APIs need extra permissions and
pagination.

**Gate:**

1. The Usage API's authentication and response fields are contract-verified against a live
   account, with a sanitized fixture committed.
2. Pagination and the per-model shape are confirmed.
3. The result is demonstrably stronger than the account balance for the question being answered;
   otherwise the balance stays the only source.

## 5. Provider Identity and Capability Model

### Identifiers

```text
ProviderId      = 'minimax-cn' | 'minimax-global' | 'deepseek' | 'qwen'
CredentialKind  = 'token-plan-key' | 'api-key' | 'session-token' | 'web-cookie'
                | 'access-key-id' | 'access-key-secret'
CapabilityId    = '<provider>.<capability>'   // e.g. 'minimax.plan', 'deepseek.balance'
```

`session-token` and `web-cookie` remain in the `CredentialKind` union so that the legacy secrets
of an upgraded installation can be deleted, and so that a future gate in §4.5 can be implemented
without changing the type. **No provider reads them.** `src/presentation/credentials.ts` only
deletes them when a credential is reconfigured.

- A **provider instance** is identified by its `ProviderId`. `minimax-cn` and `minimax-global` are
  two instances of the same provider family with entirely separate credentials, caches, and
  snapshots.
- The provider switcher lists all four `ProviderId` values, each showing its own
  configured/unconfigured state. No provider is hidden merely because it is unconfigured.
- `quotaDeck.statusBar.primaryProvider` accepts any of the four values.
- `quotaDeck.statusBar.providerOrder` is an ordered list of `ProviderId` values with no
  duplicates. The default is `['minimax-cn', 'minimax-global', 'deepseek', 'qwen']`. It decides
  **which providers appear and in what order** across all four surfaces; removing a provider from
  the list hides it. An empty or entirely invalid list falls back to the default order.

### Capability state

Every capability resolves to exactly one state. This is what lets one provider be partially
available — balance without usage, plan without points.

```ts
type CapabilityState =
  | { kind: 'ok';         fetchedAt: string; data: unknown }
  | { kind: 'stale';      fetchedAt: string; data: unknown; reason: string }
  | { kind: 'unconfigured'; reason: string }
  | { kind: 'unsupported';  reason: string }
  | { kind: 'failed';     error: NormalizedError; lastGood?: { fetchedAt: string; data: unknown } };

interface ProviderSnapshot {
  readonly providerId: ProviderId;
  readonly fetchedAt: string;
  readonly capabilities: Readonly<Record<CapabilityId, CapabilityState>>;
}
```

`stale` carries the last known value plus its original fetch time. `failed` may carry `lastGood`
so the UI can show the last known value together with an error marker.

### Provider interface

```ts
interface ProviderCapabilities {
  readonly capabilities: readonly CapabilityDescriptor[];
}

interface CapabilityDescriptor {
  readonly id: CapabilityId;
  readonly titleKey: string;          // localization key for the display name
  readonly credential: CredentialKind;
  readonly required: boolean;         // required before the provider counts as configured
}

type ConnectionState =
  | { kind: 'ready';         capabilities: CapabilityId[] }
  | { kind: 'partial';       capabilities: CapabilityId[]; missing: { capability: CapabilityId; credential: CredentialKind }[] }
  | { kind: 'not-configured' }
  | { kind: 'error';         error: NormalizedError };

interface QuotaProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  getCapabilities(): ProviderCapabilities;
  connect(secrets: SecretReader): Promise<ConnectionState>;
  fetchSnapshot(signal: AbortSignal, range?: RangeId, timeZone?: string): Promise<ProviderSnapshot>;
  dispose(): void;                   // clears in-memory credentials and aborts pending work
}

type NormalizedErrorKind = 'auth' | 'rate-limit' | 'timeout' | 'network' | 'malformed' | 'unknown';

interface NormalizedError {
  readonly kind: NormalizedErrorKind;
  readonly message: string;           // localized, never contains credentials
  readonly status?: number;
  readonly retryAfterMs?: number;
}
```

`connect` reports which capabilities the currently stored credentials can reach. `fetchSnapshot`
always returns a snapshot covering every declared capability, using `unconfigured` or
`unsupported` for the ones that cannot be fetched — it never omits a capability and never throws
for a single capability failure.

`dispose` is called when a credential is cleared or the extension is deactivated. It wipes
in-memory credential material and aborts in-flight requests for that provider.

## 6. Architecture

### Extension modules

```text
src/
  extension.ts                     activation, command wiring, refreshAll
  core/
    coordinator.ts                 serial refresh, failure isolation, snapshot aggregation
    cache.ts                       parsed snapshot in globalState, per provider and range
    secrets.ts                     Secret Storage access
    settings.ts                    setting coercion and clamping
    time.ts                        zoned parts, ranges, countdowns, time-zone validation
    types.ts                       ProviderId, CapabilityState, QuotaProvider, NormalizedError
    errors.ts                      error normalization
    http.ts                        HTTP client, timeouts, abort handling
    scheduler.ts                   refresh timer, focus pause, manual debounce
    capability.ts                  typed capability reader
  providers/
    endpoints.json                 single source for every endpoint URL and credential env var
    endpoints.ts                   typed view over endpoints.json
    registry.ts                    buildProviders()
    shape.ts                       vendor-neutral parsing primitives
    minimax/                       provider.ts + shape.ts
    deepseek/                      provider.ts + shape.ts + usage.ts + aggregate.ts + pricing.ts
    qwen/                          provider.ts + shape.ts + request.ts (ACS3 signing)
  presentation/
    statusBar.ts  tooltip.ts  labels.ts  display.ts  quotaTone.ts
    commands.ts  credentials.ts  switcher.ts  onboarding.ts  quickPickFallback.ts
    overview/                      model.ts + provider.ts (Activity Bar tree)
    dashboard/                     panel.ts + protocol.ts + viewModel.ts + webview/
  localization/
    messages.ts (key registry) + index.ts + en-us.ts + zh-cn.ts
  test/
    __mocks__/vscode.ts  fixtures/  helpers/
```

### Provider layer

Each provider adapter owns its endpoints, its parsers, and its fixtures. The adapter is the only
place that knows a raw payload shape. Within an adapter, `shape.ts` reads the raw payload and
`provider.ts` assembles the capabilities over the endpoints; DeepSeek additionally splits raw
parsing (`usage.ts`) from higher-level aggregation (`aggregate.ts`).

### Coordinator

The coordinator is responsible for:

- Serial refresh execution, de-duplicated per in-flight range.
- Per-capability and per-provider failure isolation.
- Saving the last successful snapshot without credentials, per provider and range.
- Emitting one aggregated state to the status bar, tooltip, Activity Bar tree, and dashboard.
- Calling `dispose` on providers whose credentials were cleared.

### Cache

`src/core/cache.ts` persists the **parsed** snapshot in `globalState`, not the raw provider
payload. Changing how a provider parses a field therefore changes the meaning of every snapshot
already on disk, and the cache is painted at startup before the first refresh lands. The cache
drops what it no longer trusts — `withoutRetiredCapabilities()` for retired DeepSeek and MiniMax
capabilities, `withoutLegacyMiniMaxPlan()` for a MiniMax plan cached under the old count rule —
so a parsing change needs its own rule there, or a stale number reaches the UI before the first
refresh replaces it.

### Presentation layer

The presentation layer consumes the normalized snapshot. It does not know provider endpoints,
secrets, or raw payload shapes. It reads capability data through `capabilityValue` and never
through a hand-written cast. Shared display helpers live in `presentation/display.ts`
(`formatMoney`, `selectPrimaryCurrency`, `providerDisplayName`, `pickTightestWindow`,
`remainingBar`) and the shared severity function is `quotaTone(percent, warningThresholdPercent)`
in `presentation/quotaTone.ts`, used by all four surfaces.

## 7. Credential and Configuration Model

### Secret keys

```text
quotaDeck.minimax.cn.tokenPlan
quotaDeck.minimax.global.tokenPlan
quotaDeck.deepseek.apiKey
quotaDeck.qwen.accessKeyId
quotaDeck.qwen.accessKeySecret
```

The legacy keys `quotaDeck.minimax.*.webCookie`, `quotaDeck.deepseek.sessionToken` and
`quotaDeck.deepseek.cookie` are deleted when the corresponding credential is reconfigured.

### Credential shape

A credential is a single opaque string entered in a password-style input box. It is stored
verbatim in Secret Storage and read back only to sign or authenticate a request.

- Existing values are pre-filled into the masked input box so the user can keep them; pressing
  `Enter` keeps the value, `Ctrl+A` followed by a new value replaces it.
- A credential value is never echoed to the user, never written to a fixture, never written to
  global state or settings, and never sent to the webview.
- `QuotaDeck CN: Clear Credential` offers the credentials that are actually stored and deletes the
  picked one after a confirmation.

### Non-secret settings

| Setting | Values | Default |
| --- | --- | --- |
| `quotaDeck.language` | `auto`, `zh-CN`, `en-US` | `auto` |
| `quotaDeck.refreshIntervalMinutes` | 1–60 | 3 |
| `quotaDeck.pauseWhenUnfocused` | boolean | `true` |
| `quotaDeck.statusBar.mode` | `all`, `focused` | `all` |
| `quotaDeck.statusBar.primaryProvider` | `minimax-cn`, `minimax-global`, `deepseek`, `qwen` | `minimax-cn` |
| `quotaDeck.statusBar.providerOrder` | ordered `ProviderId` list, no duplicates | `['minimax-cn', 'minimax-global', 'deepseek', 'qwen']` |
| `quotaDeck.statusBar.warningThresholdPercent` | 11–99 | 20 |
| `quotaDeck.timeZone` | IANA zone name, or `auto` | `auto` — the operating system zone |

No secret is accepted as a VS Code setting, and `scripts/release-gate.mjs` fails the build if
`package.json` declares any setting whose name matches `/cookie|secret|password|token|apikey|session/i`.

Every setting is **coerced and clamped by the extension itself**. The VS Code settings API does
not guarantee a type, and a wrong-typed value must not reach `Intl.DateTimeFormat` or an array
index.

### Commands

| Command id | English title | Chinese title |
| --- | --- | --- |
| `quotaDeck.openDashboard` | QuotaDeck CN: Open Dashboard | QuotaDeck CN: 打开仪表盘 |
| `quotaDeck.refresh` | QuotaDeck CN: Refresh | QuotaDeck CN: 刷新 |
| `quotaDeck.switchProvider` | QuotaDeck CN: Switch Provider | QuotaDeck CN: 切换服务商 |
| `quotaDeck.configureMiniMax` | QuotaDeck CN: Configure MiniMax | QuotaDeck CN: 配置 MiniMax |
| `quotaDeck.configureDeepSeek` | QuotaDeck CN: Configure DeepSeek | QuotaDeck CN: 配置 DeepSeek |
| `quotaDeck.configureQwen` | QuotaDeck CN: Configure Qwen | QuotaDeck CN: 配置 Qwen |
| `quotaDeck.configureProviders` | QuotaDeck CN: Configure Providers | QuotaDeck CN: 配置服务商 |
| `quotaDeck.openSettings` | QuotaDeck CN: Extension Settings | QuotaDeck CN: 插件设置 |
| `quotaDeck.pickTimeZone` | QuotaDeck CN: Pick Time Zone | QuotaDeck CN: 选择时区 |
| `quotaDeck.clearCredential` | QuotaDeck CN: Clear Credential | QuotaDeck CN: 清除凭据 |
| `quotaDeck.showHelp` | QuotaDeck CN: Show Help | QuotaDeck CN: 查看帮助 |

Titles are declared in `package.json` as `%command.<id>.title%` placeholders and resolved from
`package.nls.json` (English) and `package.nls.zh-cn.json` (Chinese).

The Activity Bar overview is a **manifest contribution, not a command**: `package.json` declares
`contributes.viewsContainers.activitybar`, `contributes.views.quotaDeck.overview` and the
`view/title` menu; the tree itself is `presentation/overview/provider.ts`, registered in
`src/extension.ts`. `scripts/activity-bar.test.ts` asserts that manifest shape.

### Onboarding

Onboarding is a **QuickPick flow**, not a webview. Keeping it in the extension host means no
credential ever enters a webview, it works identically on every platform, and it is testable
without a browser.

1. Pick a provider to configure: MiniMax CN, MiniMax Global, DeepSeek, Qwen.
2. Enter the required credential in a password input box.
3. A summary lists which credentials are now present, with actions to configure another provider,
   refresh, open the dashboard, or finish.

A provider counts as configured when the credentials required by its `required: true` capabilities
are present.

## 8. Interaction Design

### Status bar

`all` mode renders one segment per provider in `providerOrder`. MiniMax CN and MiniMax Global
share a single slot, so the bar shows at most three segments.

```text
$(pulse) MM 42% · 2h15m  DS ¥112.80  QW ¥50.00
```

```text
$(pulse) MM 42%
```

**Segment legend**

| Segment | Meaning | Notes |
| --- | --- | --- |
| `MM` | MiniMax remaining quota | The tighter of the 5-hour and weekly windows. An unlimited window is excluded from the comparison. The MiniMax slot shows the primary region, falling back to the other configured region. |
| `DS` | DeepSeek account balance | A balance, not a remaining quota. |
| `QW` | Qwen account balance | A balance, not a remaining quota. |

**Balance currency rule**

CNY renders with the symbol, for example `¥112.80`. Every other currency renders with its ISO
code, for example `USD 12.30`. When a provider returns several currencies, the status bar shows
exactly one, chosen deterministically: CNY first, then USD, EUR, then remaining currencies in
ascending ISO code order. The tooltip shows all of them.

**Countdown rule**

`formatCountdown` renders the time until the next reset: `< 60m` → `25m`; `< 24h` → `2h15m`;
otherwise → `3d4h`.

**Segment order**

`all` mode renders `providerOrder`, except that the `primaryProvider` segment moves to the
front; MiniMax CN and Global collapse into the single MiniMax slot first, so a MiniMax primary
leads as whichever region that slot resolved to. `focused` mode renders only the primary
provider. Choosing a primary is therefore visible in both modes.

**Truncation rule**

The bar keeps at most three segments. If more are rendered, segments are dropped from the right in
reverse `providerOrder` priority and a `+N` marker is appended, where `N` is the number of dropped
segments. The marker is plain text, not a separate click target; the dashboard lists every
provider.

**Severity**

`quotaTone(percent, warningThresholdPercent)` returns `positive | warning | critical`.
`critical` is 5 % and below, `warning` is below the user's `warningThresholdPercent`, and
everything else is `positive`. There is no fourth stage: a hard-coded 50 % yellow band was
removed because it was neither configurable nor described by the setting. The same function drives
the status bar, the tooltip, the Activity Bar tree and the dashboard, so the four surfaces can
never disagree about severity, and it applies to every percentage shown, including the Qwen Token
Plan windows.

**Interaction**

- Left click opens the dashboard, or opens onboarding when no provider is configured at all.
- Hover shows the tooltip immediately.
- If setup is incomplete, the item remains visible and the unconfigured provider segment shows its
  unconfigured state.
- A failed provider shows an error marker without clearing valid values from other providers. A
  failed capability marks only its own card, not the whole provider.
- The extension's actions are reachable from the Command Palette. The Activity Bar title bar
  additionally carries Refresh, Open Dashboard and Extension Settings.

### Hover tooltip

The header shows the brand `QuotaDeck CN`, a models badge, and a localized subtitle. The models
badge is 国产模型 in Chinese and `CN MODELS` in English.

The tooltip always shows all configured provider summaries in `providerOrder`, using compact
two-row cards:

1. Provider, region, source badge, and status.
2. Key metric, remaining percentage, reset countdown, and last update.

MiniMax cards use text progress bars because VS Code tooltip rendering strips much of the CSS. Every
bar is 16 cells of U+2588 `█`, with the filled and the empty part distinguished by color rather
than by character, so every bar keeps exactly the same rendered length under a substituted font.
The dashboard uses real CSS meters.

The tooltip is rendered as a `MarkdownString` with `supportHtml = true` and `isTrusted = false`;
every provider-controlled string is HTML-escaped before it enters the markup.

### Activity Bar overview tree

The tree lists each configured provider as a collapsible item with its detail rows — quota
windows, balances, reset times — and its severity. It renders the same snapshot as the other
surfaces through `buildOverviewItems`. Clicking a provider opens the dashboard.

### Dashboard

The dashboard is an optional singleton webview panel titled `QuotaDeck CN — 用量与洞察` in Chinese
and `QuotaDeck CN — Usage & Insights` in English.

**Overview**

- Lowest remaining quota as the hero figure.
- Account balance.
- Provider health.
- Last successful data by provider.

**MiniMax**

- 5-hour and weekly quota meters with reset countdowns.
- Media quota cards.
- Plan expiry.
- Token usage history for the selected range, shown only when MiniMax actually returned consumption
  records.

**DeepSeek**

- Account status, balance, granted balance and topped-up balance, per currency.
- Current peak/off-peak pricing hint.
- A pointer to `platform.deepseek.com` for the detail the extension does not have.

**Qwen**

- Available amount, cash amount, credit amount, Mybank credit, quota limit, and the update time
  returned by the API.
- A pointer to the Model Studio and Alibaba Cloud billing consoles for what it does not have.

**Settings**

- Language, refresh interval, status bar mode, provider order, warning threshold, time zone.
- Credential configuration and clearing through the extension commands.

**No empty figures.** A tile, a chart or a range selector without data behind it is not rendered.
The dashboard shows real values only.

**Message protocol**

`src/presentation/dashboard/protocol.ts` validates every host↔webview message against an
exact-key schema, in both directions, including the range selection the webview sends back. The
validator is extended whenever a message shape changes. The webview renders through the DOM API
and never injects a provider-controlled string into markup.

The dashboard supports VS Code light, dark, and high-contrast themes. A QuickPick fallback exposes
provider summaries and refresh actions if the webview fails to load.

### Provider switching and color semantics

- The provider switcher lists MiniMax CN, MiniMax Global, DeepSeek, and Qwen, each with its
  configured state.
- The card order follows `providerOrder`.
- `focused` mode displays only the primary provider.
- In `all` mode the primary provider's segment leads the status bar; the tooltip, the tree and
  the dashboard keep `providerOrder`.

Quota status always uses semantic colors:

- Healthy and sufficient: theme positive/green.
- Below the warning threshold: orange.
- At or below 5 %, authentication failure, or service failure: red.
- Not configured or unsupported: muted gray.
- Stale data: muted gray, with a `history` icon and a stale badge.

Provider identity accents are separate from status and are limited to card headings, dots, and
border strips:

- MiniMax: teal — `#1baf7a` light, `#199e70` dark.
- DeepSeek: blue — `#2a78d6` light, `#3987e5` dark.
- Qwen: orange — `#eb6834` light, `#d95926` dark.

Text labels and icons always accompany color so meaning is not color-dependent.

## 9. Refresh and Failure Behavior

- Data refresh interval defaults to five minutes.
- Manual refresh is debounced to prevent request bursts.
- Background refresh pauses when the window is unfocused by default.
- On focus, refresh immediately if data is older than the configured interval.
- Requests use a per-refresh timeout and per-provider failure isolation.
- A rate-limit response stops that capability's automatic refresh until the backoff expires.
- Malformed or structurally changed responses stop parsing that capability and preserve the last
  successful snapshot.
- A stale snapshot includes its original fetch time and a visible stale badge.
- The extension writes no console output, so no credential can reach a log.
- The refresh timer is disposed with the extension's subscriptions.

## 10. Localization and Time

- All command titles, status text, tooltips, dashboard labels, errors, and onboarding are localized
  in `zh-CN` and `en-US`.
- Command titles are localized through `package.nls.json` and `package.nls.zh-cn.json`; in-app
  strings are localized through `src/localization/`.
- `auto` follows the VS Code display language.
- The default time zone is `auto`, meaning the operating system zone, and `quotaDeck.timeZone`
  accepts any IANA zone name. `quotaDeck.pickTimeZone` offers a searchable Quick Pick of every
  zone the runtime supports, each labelled with its UTC offset and local time, because a manifest
  enum cannot enumerate them.
- A user-supplied time zone is validated before it reaches `Intl.DateTimeFormat`, which throws
  `RangeError` for an unknown IANA zone; `resolveTimeZone()` falls back to the system zone.
- Absolute dates are assembled with `formatToParts()`, never `format()`, because `.format()` output
  depends on the ICU data the runtime ships.
- `hourCycle: 'h23'` is used rather than `hour12: false`, because `hour12: false` can render
  midnight as hour `24` and the zoned-parts reader reads that field.
- Relative reset countdowns are derived from absolute timestamps.
- CNY is the default currency presentation; other API-reported currencies are shown separately and
  never silently converted.

## 11. Endpoint Contract Verification

Every provider endpoint in §4 is an external contract that the extension does not control.
Verification is therefore a prerequisite for implementation, not a test-suite afterthought.

The verified contracts live in [`docs/contracts/`](../../contracts/):

| Provider | Verified | Not integrated |
| --- | --- | --- |
| MiniMax | `minimax.plan`, `minimax.subscription`, `minimax.tokenUsage` | `minimax.points` (D1), international host |
| DeepSeek | `deepseek.balance` | the three usage capabilities (D2) |
| Qwen | `qwen.accountBalance` | `qwen.modelQuota`, `qwen.consumption` (D4) |

### Verification spikes

Each spike runs against a dedicated test account, produces a captured fixture, and has an explicit
exit criterion. A spike that fails converts the affected capability into `unsupported` rather than
shipping a fabricated or guessed value.

| Spike | Question | Exit criterion |
| --- | --- | --- |
| S1 | MiniMax plan response: exact field names, whether total/used counts exist, the meaning of `current_interval_remaining_percent`, the reset timestamp format and zone, how an unlimited window is represented | Two fixtures (with and without totals) parse; computed and field-derived remaining percentages agree with the platform UI within one percentage point |
| S2 | MiniMax subscription and token-amount responses | Each capability parses from a fixture |
| S3 | DeepSeek balance response: currency fields, granted versus topped-up fields, multi-currency shape | A multi-currency fixture parses into separate currency values |
| S4 | DeepSeek usage: parameter encoding, inclusivity, returned series granularity, cache fields, model-level shape, and whether the account's API key list can be enumerated | Time ranges produce a response; the aggregation rule is confirmed or revised |
| S5 | DeepSeek session auth: required headers and cookies, session lifetime, error codes on expiry | An expired session produces a distinguishable `auth` error rather than a malformed-response error |

S1, S2 and S3 are done. S4 and S5 belong to D2 and are not scheduled until its gate is met.

### Fixture pipeline

Fixtures are the bridge between the spikes and the test suite, and they are the most likely place
for a credential to leak. The pipeline is:

1. **Capture** — a dev-only script under `scripts/` fetches a live endpoint and writes the raw
   response. The script is never imported by `src/` and is never bundled. Credentials come from
   environment variables only, never from a file or a command-line argument.
2. **Sanitize** — the script replaces the value of every declared sensitive key with a placeholder,
   and replaces any string matching a token-like pattern (long base64 or hex runs, `sk-` prefixed
   values, `Bearer` headers, cookie values) with `<redacted>`. Types and structure are preserved so
   parsers are still exercised.
3. **Annotate** — each fixture records `capturedAt`, the source host, and, for MiniMax plan
   fixtures, an explicit `remainingPercentSource`.
4. **Review** — fixtures are committed to `src/test/fixtures/<provider>/<capability>/<case>.json`
   only through a reviewed change.
5. **Guard** — a check scans committed fixtures for secret-shaped strings and non-zero financial
   values and fails the build on a match.

Sanitization preserves structure but zeroes financial fields, so a fixture is proof of **shape**,
never proof of a real balance.

### Contract drift

A live response that no longer matches a committed fixture is a signal, not an error to swallow.
The runtime marks that capability `failed` with a `malformed` error and preserves the last good
snapshot. The fixture is then updated deliberately in a reviewed commit. Fixtures are never
auto-updated at runtime, and the runtime never writes to the fixtures directory.

**Never invent a provider payload.** A hand-written test payload only encodes the guess it was
written from, so it cannot catch a misread field — the MiniMax video quota stayed inverted through
several releases because the fixture that "proved" it was invented the same way.

## 12. Testing and Verification

### Unit tests

- MiniMax plan parsing, remaining-percent precedence, unlimited detection, and reset timestamps.
- MiniMax media category mapping and the remaining-count rule.
- DeepSeek balance parser with multiple currencies.
- Multi-currency separation; a missing amount is never shown as `0`.
- Time-range construction in `quotaDeck.timeZone`, including month and year boundaries.
- Error normalization for authentication, rate limit, timeout, malformed JSON, and changed response
  shape.
- Capability state resolution: partial credentials, unsupported capability, stale carry-over.
- Setting coercion: a wrong-typed or out-of-range setting falls back to a valid value.
- HTML escaping and webview message validation.
- Status bar formatting: segment order, balance currency selection, countdown format, truncation.

### Integration tests

- Extension activation and command registration.
- Status bar creation and text updates from fixture snapshots.
- Tooltip rendering from mixed valid, stale, failed, and unconfigured states.
- Dashboard message flow using a mocked extension host.
- Secret clearing and re-authentication paths, including that `dispose` clears in-memory
  credentials.
- The credential picker offering only the credentials that are actually stored.
- Onboarding QuickPick flow.

Tests never use real credentials and never require live provider accounts.

### Manual verification

- Install the packaged `.vsix` into a clean VS Code profile.
- Configure no credentials: onboarding and no-data states are clear and error-free.
- Configure MiniMax domestic: quota cards, countdowns and reset times render.
- Configure MiniMax international: region-specific values do not mix.
- Configure DeepSeek: balance renders per currency.
- Configure Qwen: the account balance fields and the update time render.
- Expire or corrupt a credential: only the affected provider and capability report an error.
- Change `quotaDeck.timeZone`, or pick a zone with `QuotaDeck CN: Pick Time Zone`: the reset times
  and the dashboard update immediately.
- Toggle light, dark, high-contrast, Chinese, English, and narrow editor widths.
- Confirm the status bar progress bars render as blocks with no missing-glyph boxes under the
  Windows default font, and that the status bar icon codepoint renders.
- Confirm no credential appears in output logs, global state, settings, or webview HTML.

### Build gates

- TypeScript strict type check passes.
- Unit and integration tests pass.
- The locale key sets in `package.nls.json` and `package.nls.zh-cn.json` match, and every
  `%...%` placeholder in `package.json` resolves in both.
- No production source contains a hardcoded Chinese string literal.
- No committed fixture contains a secret-shaped value or a non-zero financial value.
- Extension and webview bundles build with `sourcemap: false`, and `.vscodeignore` excludes
  `**/*.map`, `src/**`, and `**/*.ts`.
- The packaged `.vsix` contains no absolute local path and no secret-shaped string.
- The packaged `package.json` contains no credential key names and no secret-like setting.
- The pricing calendar `coverageEnd` is at least 30 days out.
- The `package.json` version, the `package-lock.json` version and the newest `CHANGELOG.md` heading
  agree. A new version number is required only when the change alters what the VSIX ships; a
  documentation-only commit packages under the current version.

## 13. Packaging and Marketplace Checklist

The extension is published to the Visual Studio Marketplace. The manifest must satisfy the
marketplace submission requirements.

**Manifest**

- `publisher` and `name` match the extension identifier `alexmultiagent.quota-deck`.
- `displayName` is `QuotaDeck CN — MiniMax DeepSeek Qwen`.
- `description` is the Chinese description from §1.
- `categories` includes `Other` and `Visualization`.
- `keywords` matches §1.
- `icon` is a 128×128 PNG generated by `npm run icon` — never hand-edited.
- `galleryBanner` is set.
- `license` is MIT and a `LICENSE` file is included.
- `repository`, `bugs`, and `homepage` point at the project.
- `engines.vscode` pins the minimum supported VS Code version.
- `pricing` is `Free`.
- `telemetry` declares no collector; the extension makes no network request other than to the
  fixed provider origins in §4.
- `main` points at the bundled extension entry; `browser` is omitted because the extension is
  Node-based.

**Repository files**

- `README.md` describing what the extension does, what it does not do, the credential model, and a
  privacy statement covering telemetry and the fixed request origins.
- `LICENSE`.
- `CHANGELOG.md`.
- `.vscodeignore` excludes source, tests, fixtures, and maps from the package.
- `.vscodeignore` and the package review are checked with `vsce ls` before packaging.

**Publishing**

- The extension is signed with a publisher certificate.
- A release tag and a `CHANGELOG.md` entry are created before each publish.
- The pricing calendar coverage (§4.2) is refreshed and the refresher is recorded in the release
  notes.

## 14. Acceptance Criteria

The current release is complete when:

1. The extension installs and activates without credentials.
2. MiniMax domestic and international plan data can be configured independently.
3. MiniMax quota windows, media quotas and reset countdowns render from account data.
4. MiniMax token history renders for the selected range when consumption records exist.
5. DeepSeek balance renders from an API Key, per currency.
6. Qwen account balance renders from an AccessKey pair, including the update time.
7. DeepSeek's peak/off-peak status is shown consistently across the surfaces.
8. The status bar shows at most three segments, combines the two MiniMax regions into one slot,
   and truncates with a `+N` marker.
9. The provider order decides which providers appear, and in what order, across every surface.
10. Hover presents a complete summary without requiring the dashboard.
11. The dashboard is optional, singleton, theme-aware, and shows no figure without data behind it.
12. All credentials use Secret Storage, can be cleared, and clearing one wipes it from the provider
    instance.
13. Chinese and English UI strings are complete, including command titles.
14. The configured time zone and currency labels are correct, and a change takes effect immediately.
15. Partial failures preserve last-known data and never affect unrelated providers or capabilities.
16. Every capability in §4.0 is either shipped with a committed fixture, or explicitly deferred
    with its gate in §4.5.
17. A verified `.vsix` is produced that satisfies §13.

## 15. Marketplace References

The interaction model was informed by the current marketplace implementations and installation
counts on 2026-11-16:

- `growthjack.claude-code-usage`: status bar, quota tooltip, and click-through dashboard.
- `jlcodes.antigravity-cockpit`: Webview dashboard with QuickPick fallback and status bar.
- `wwenc6621.codebuddy-usage`: status bar plus hover tooltip.
- `n2ns.antigravity-panel`: sidebar/panel analysis plus status bar hover.
- `JochenYang.minimax-status-vscode`: status bar, detailed tooltip, domestic/international MiniMax
  accounts.

These are references for **interaction patterns only**, not for the quota model. Most of them track
a Claude Code or Antigravity subscription allowance, whereas QuotaDeck CN tracks API balance and
platform usage. The status bar layout, tooltip density, dashboard structure, and QuickPick fallback
are the borrowed ideas; the semantics of what is displayed are designed for the Chinese LLM
providers.

Source code is not copied; provider clients, parsers, presentation, tests, and assets are
implemented specifically for QuotaDeck CN.

## 16. Risks and Open Questions

### Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Provider endpoints are undocumented web APIs and can change without notice | A capability stops working for every user | Fixture-gated parsing, per-capability failure isolation, last-good snapshot retention, contract verification in §11 |
| `current_interval_usage_count` is misread as "already spent" | Users see an inverted video allowance | Strict precedence in §4.1, the `remainingPercentSource` annotation, the verified contract in `docs/contracts/minimax.md` |
| A MiniMax credential is rejected with HTTP 200 | A revoked key reads as a malformed response | `credentialRejection()` runs before the shape parsers and maps `base_resp.status_code` to an `auth` failure |
| The DeepSeek pricing and holiday calendar expires | Peak/off-peak hints become wrong | `coverageEnd` field, an explicit unavailable state, a release-gate check |
| MiniMax domestic and international responses diverge | Parsers mis-handle one region | Separate instances, shared parsing with per-origin fixtures |
| Provider strings break the webview or tooltip rendering | Injection or malformed layout | HTML escaping, exact-key message validation, a fixed CSP, DOM rendering in the webview |
| Marketplace naming assumptions are wrong | Weak discovery | The extension identifier is stable; renaming is a manifest-only change |

### Open questions

- OQ1: Does the DeepSeek platform expose the account's API key list? The answer decides whether
  account-level totals are summed per key or taken from the account summary alone. Deferred with
  D2.
- OQ2: Does the DeepSeek usage endpoint return its own series, or only aggregates? This decides
  whether client-side bucketing is required. Deferred with D2.
- OQ3: Which credential names does the MiniMax points endpoint require, and is there one that is
  not a browser session? Deferred with D1.
- OQ4: Does the DeepSeek balance endpoint ever return a non-CNY currency for CNY accounts? This
  affects the status bar currency selection rule.
- OQ5: Can the MiniMax international host be verified with the same Token Plan key shape as the
  domestic host?
