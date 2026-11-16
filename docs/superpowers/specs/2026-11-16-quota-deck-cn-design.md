# QuotaDeck CN Design

## 1. Product Definition

**Brand:** QuotaDeck
**China product name:** QuotaDeck CN
**Marketplace display name:** QuotaDeck CN — MiniMax DeepSeek Qwen
**Extension identifier:** `alexmultiagent.quota-deck`
**Positioning:** 国产大模型额度，一处看全。

QuotaDeck CN is a read-only VS Code extension for monitoring quota, balance, usage, and reset windows across MiniMax, DeepSeek, and Qwen. It does not proxy model requests and does not provide chat completion.

One brand name is used everywhere. The marketplace listing adds the provider names purely as a discovery aid; the extension UI itself uses the brand only. The extension identifier contains `quota-deck` and never changes for rebranding or for adding a provider.

The extension follows the successful interaction pattern used by established quota extensions: a compact status bar item, a detailed hover tooltip, and an optional dashboard for analysis. The status bar and tooltip are the primary experience. The dashboard is opened only by the user and is never required to inspect current quota.

### Marketplace discovery

- The display name lists the three current providers so marketplace search matches Chinese LLM names.
- Description: 国产大模型额度监控 · MiniMax、DeepSeek、Qwen 余额、用量与重置倒计时.
- Keywords include `minimax`, `deepseek`, `qwen`, `quota`, `usage`, `balance`, `token usage`, `额度监控`, and `国产大模型`.
- The extension identifier contains `quota-deck`; future branding or display-name changes do not require a new extension. Adding a provider is a display-name change only.

## 2. Goals and Scope

### V1 goals

1. Show MiniMax domestic and international Token Plan quotas.
2. Show MiniMax points, subscription expiry, and available media quotas.
3. Show DeepSeek account balance and detailed official-platform usage statistics.
4. Ship a Qwen adapter placeholder with an explicit capability matrix. Qwen performs no network request in V1 and shows no metric.
5. Let users show all providers in the status bar or focus on one.
6. Keep the hover tooltip useful without opening another view.
7. Provide an optional dashboard for range switching, charts, model breakdowns, and settings.
8. Store every credential in VS Code Secret Storage.
9. Support Simplified Chinese and English.
10. Use `Asia/Shanghai` and CNY by default while preserving provider-reported currencies.
11. Produce an installable, publishable `.vsix`.

### V1 non-goals

- API proxying, model chat, prompt execution, or token counting by intercepting requests.
- Treating local estimates or token-derived prices as official account data.
- Automatic extraction of browser cookies.
- Qwen, Alibaba Cloud Bailian, or any other provider integration. The Qwen adapter contract is reserved; no Qwen credential is accepted in V1.
- Kimi, GLM, Doubao, Baidu Qianfan, or other provider integrations.
- Currency conversion or combining amounts from different currencies.
- Automatic purchases, recharge, quota resets, or account changes.

## 3. Product Principles

### Source integrity

Every user-visible value has exactly one provenance:

- **Account:** returned directly by an official account or platform endpoint.
- **Local:** computed from data persisted or imported by the extension.
- **Estimated:** calculated from tokens and a versioned price table.

Provenance and authentication method are orthogonal axes and are labeled separately:

- The **source badge** shows provenance: 账户 / 本地 / 估算 (account / local / estimated).
- The **session badge** shows how the value was reached: API Key or Web Session.

The UI never labels an estimate as account quota, and never marks a web-session value as a stable developer-API value. A generic `0%` or `0.00` is never used to mask a failed or unavailable request. Unavailable is a state, not a number.

### Read-only security

- API requests run only in the extension host.
- The webview never receives raw credentials, raw cookies, or raw provider payloads.
- Credentials are stored only in `context.secrets`.
- Authorization headers, cookies, and response bodies containing credentials are never logged.
- Network origins are fixed in provider code.
- The webview uses a nonce-based CSP, fixed local resource roots, and message-schema validation.
- Provider-controlled strings are HTML-escaped before entering tooltip or webview markup.
- Each provider adapter declares an allow-list of cookie names. Only allow-listed cookies are sent to any endpoint; a pasted cookie header is never forwarded verbatim.

## 4. Provider Data Contracts

### 4.1 MiniMax

Domestic and international accounts are separate provider instances with independent credentials and state. The instance id is `minimax-cn` or `minimax-global`; both use the `minimax` provider id family but never share state.

**Credential types**

- Token Plan Key, required for plan and usage queries.
- Web Session Cookie, optional and used only for points.

**Capabilities**

| Capability id | Endpoint | Credential | Provenance | Required in V1 |
| --- | --- | --- | --- | --- |
| `minimax.plan` | `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains` | Token Plan Key | Account | yes |
| `minimax.subscription` | `https://www.minimaxi.com/v1/api/openplatform/charge/combo/cycle_audio_resource_package` | Token Plan Key | Account | yes |
| `minimax.tokenUsage` | `https://www.minimaxi.com/account/amount` | Token Plan Key | Account | yes |
| `minimax.points` | `https://www.minimaxi.com/backend/account/token_plan_credit` | Web Session Cookie | Account | optional |

The international instance uses the same capability ids with `https://www.minimax.io` origins. Only the origin differs; parsing is shared.

All provider paths are centralized and covered by parser fixtures. If an account endpoint changes, only that provider adapter changes.

**Quota normalization**

- Remaining percentage has a strict precedence:
  1. If both a total count and a used count are present, remaining percent is computed from them.
  2. Otherwise the `current_interval_remaining_percent` field is used as-is and the value is tagged `remainingPercentSource: 'field'`.
  3. If neither is available, the capability is not reported as a percentage at all. It becomes `failed` or `unsupported` — never `0%`.
- The `current_interval_remaining_percent` field is treated as remaining percentage, matching the current MiniMax platform response. Because this is an interpretation of a field name rather than a documented contract, it is verified against the platform UI during contract verification (§11, S1) and every fixture carries an explicit `remainingPercentSource` annotation.
- Usage percentage is calculated only when total and used counts are both available.
- Missing weekly total with a weekly percentage means the weekly allowance remains meaningful and is not reported as unlimited.
- Unlimited is shown only when the response explicitly lacks a meaningful weekly quota and exposes enough evidence to support that state.
- Model rows are normalized into categories: text/general, video, image, Hailuo, music/lyrics, speech, and other.
- Cards are generated for returned models only. The extension does not invent an entitlement for a plan.
- Reset time is stored as an absolute timestamp. Relative countdown text is rendered from that timestamp in `Asia/Shanghai`.

**Displayed MiniMax data**

- 5-hour remaining percentage, used/total counts when available, and reset countdown.
- Weekly remaining percentage, used/total counts when available, and reset countdown.
- Video, image, Hailuo, music, speech, and other returned quota cards.
- Plan expiry and days remaining.
- Token usage summary for yesterday, the last seven days, and the current month when billing records are available.
- Points balance from the optional web session.

### 4.2 DeepSeek

Balance and usage are separate capabilities with separate credentials and are fetched independently. A missing session credential degrades only the usage capabilities; balance keeps working.

**Credentials**

- DeepSeek API Key, required for official balance.
- Platform Session Token, optional, required for detailed usage.
- Platform Cookie, optional, required by the current account usage endpoints.

**Capabilities**

| Capability id | Endpoint | Credential | Provenance | Required in V1 |
| --- | --- | --- | --- | --- |
| `deepseek.balance` | `GET https://api.deepseek.com/user/balance` | API Key | Account | yes |
| `deepseek.usageAmount` | `GET https://platform.deepseek.com/api/v0/usage/by_api_key/amount` | Session Token + Cookie | Account | optional |
| `deepseek.usageCost` | `GET https://platform.deepseek.com/api/v0/usage/by_api_key/cost` | Session Token + Cookie | Account | optional |
| `deepseek.accountSummary` | `GET https://platform.deepseek.com/api/v0/users/get_user_summary` | Session Token + Cookie | Account | optional |

**Balance**

- Authentication: `Authorization: Bearer <API Key>`.
- Show availability, total balance, granted balance, and topped-up balance.
- Preserve every returned currency as a separate value.
- CNY is the default display currency when available.

**Detailed usage**

- Authentication uses the platform Session Token and Cookie.
- These are official DeepSeek web-account endpoints, not a stable public developer API. The UI marks them as **Web Session** and provides a session-expired recovery path.

**Account-level aggregation rule**

`by_api_key` endpoints are scoped to a single API key, while `get_user_summary` is account-level. The two are never added together and are never presented as one number.

- When the platform exposes the account's full API key list, account-level totals are the sum of the per-key rows. The dashboard labels these values 汇总 (aggregated) and shows the key count.
- When the key list cannot be enumerated, account-level totals come solely from `get_user_summary`, and the per-key views are marked unavailable.
- The dashboard never mixes a summary total with a summed per-key total in the same figure or the same table.
- The specific key-set discovery mechanism is resolved during contract verification (§11, S4).

**Time ranges**

Ranges are constructed in `Asia/Shanghai`. `start` and `end` are epoch **seconds** (UTC instants) and `tz` is the IANA name `Asia/Shanghai`. `end` is exclusive; `start` is inclusive. The parameter encoding is confirmed during contract verification (§11, S4).

| Range | Start | End | Bucket |
| --- | --- | --- | --- |
| Today | today 00:00:00 | now | hour |
| Yesterday | yesterday 00:00:00 | today 00:00:00 | day |
| Last 7 days | today 00:00:00 minus 6 days | now | day |
| Last 30 days | today 00:00:00 minus 29 days | now | day |
| This month | first day of the current month 00:00:00 | now | day |
| Last month | first day of the previous month 00:00:00 | first day of the current month 00:00:00 | day |

The bucket column is the client-side aggregation granularity. If the API returns its own series, the client aggregates into these buckets. Month boundaries and year boundaries are handled in `Asia/Shanghai`, not in UTC.

**Usage metrics**

- Cost by currency.
- API request count.
- Total tokens.
- Input tokens that hit the prompt cache.
- Input tokens that missed the prompt cache.
- Output tokens.
- Cache hit rate.
- Cost, request, and token series by time bucket.
- Usage by model.

Currencies are never added together. Cost charts show one selected currency at a time. Token and request totals are currency-independent.

**Pricing guidance**

- Use account-reported cost whenever available.
- Show DeepSeek peak/off-peak status for the current `Asia/Shanghai` time.
- Use a versioned local pricing and holiday calendar for hints only.
- The calendar is a bundled JSON file with `version` and `coverageEnd` fields. It is refreshed before each release, and the release checklist records who refreshed it. A user-supplied calendar is out of scope for V1.
- If the pricing calendar does not cover the current date, show `pricing calendar unavailable` rather than assuming standard rates.
- When price must be calculated from tokens, label the result **Estimated** and include the price-table version.

### 4.3 Qwen

V1 ships a Qwen adapter placeholder. It performs **no network request**, accepts **no credential**, and shows **no metric**.

The capability matrix is defined now so that a future Bailian adapter can be dropped in without changing the UI contract:

| Capability id | V1 state | Note |
| --- | --- | --- |
| `qwen.accountBalance` | `unsupported` | Bailian account endpoint not implemented |
| `qwen.modelQuota` | `unsupported` | Rate-limit and quota endpoint not implemented |
| `qwen.consumption` | `unsupported` | Usage endpoint not implemented |
| `qwen.accessKeyValidation` | `unsupported` | Access-key signing not implemented |

The Qwen dashboard card shows the matrix with every row marked 不支持 / not supported in V1, plus a one-line statement of what a future release would add. No `0`, no `—%`, no fabricated quota.

The adapter uses the `CapabilityState` vocabulary from §5. Only one state is reachable in V1:

- `unsupported` — the V1 state. Every Qwen capability resolves to `unsupported` with the reason "not implemented in V1".
- `unconfigured` — reserved for a future release that exposes credential input but has none.
- `ok` — reserved for a future adapter implementation.

## 5. Provider Identity and Capability Model

### Identifiers

```text
ProviderId      = 'minimax-cn' | 'minimax-global' | 'deepseek' | 'qwen'
CredentialKind  = 'token-plan-key' | 'api-key' | 'session-token' | 'web-cookie'
CapabilityId    = '<provider>.<capability>'   // e.g. 'minimax.plan', 'deepseek.balance'
```

- A **provider instance** is identified by its `ProviderId`. `minimax-cn` and `minimax-global` are two instances of the same provider family with entirely separate credentials, caches, and snapshots.
- The provider switcher always lists all four `ProviderId` values, each showing its own configured/unconfigured state. No provider is hidden merely because it is unconfigured.
- `quotaDeck.statusBar.primaryProvider` accepts any of the four values. `minimax-global` is a valid primary provider.
- `quotaDeck.statusBar.providerOrder` is an ordered list of `ProviderId` values with no duplicates. The default is `['minimax-cn', 'minimax-global', 'deepseek', 'qwen']`.

### Capability state

Every capability resolves to exactly one state. This is what lets one provider be partially available — balance without usage, plan without points.

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

`stale` carries the last known value plus its original fetch time. `failed` may carry `lastGood` so the UI can show the last known value together with an error marker.

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
  fetchSnapshot(signal: AbortSignal): Promise<ProviderSnapshot>;
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

`connect` reports which capabilities the currently stored credentials can reach. `fetchSnapshot` always returns a snapshot covering every declared capability, using `unconfigured` or `unsupported` for the ones that cannot be fetched — it never omits a capability and never throws for a single capability failure.

`dispose` is called when a credential is cleared or the extension is deactivated. It wipes in-memory credential material and aborts in-flight requests for that provider.

## 6. Architecture

### Extension modules

```text
src/
  extension.ts
  core/
    coordinator.ts
    cache.ts
    secrets.ts
    settings.ts
    time.ts
    types.ts            // ProviderId, CapabilityState, QuotaProvider, NormalizedError
    errors.ts           // error normalization
  providers/
    minimax/
      cn.ts
      global.ts
      parse.ts
      cookies.ts
    deepseek/
      parse.ts
      cookies.ts
      timeRange.ts
    qwen/
      capabilities.ts
  presentation/
    statusBar.ts
    tooltip.ts
    onboarding.ts
    quickPickFallback.ts
    dashboard/
      panel.ts
      main.ts
      render/
  localization/
    index.ts
    zh-cn.ts
    en-us.ts
  test/
    fixtures/
package.nls.json
package.nls.zh-cn.json
```

### Provider layer

Each provider adapter owns its endpoints, its cookie allow-list, its parsers, and its fixtures. The adapter is the only place that knows a raw payload shape.

### Coordinator

The coordinator is responsible for:

- Serial refresh execution.
- Per-capability and per-provider failure isolation.
- Combining account instances into one aggregated state.
- Applying request timeouts and short-lived rate limiting.
- Saving the last successful snapshot without credentials.
- Emitting one aggregated state to the status bar, tooltip, and dashboard.
- Calling `dispose` on providers whose credentials were cleared.

The presentation layer consumes the normalized snapshot. It does not know provider endpoints, secrets, or raw payload shapes.

## 7. Credential and Configuration Model

### Secret keys

```text
quotaDeck.minimax.cn.tokenPlan
quotaDeck.minimax.cn.webCookie
quotaDeck.minimax.global.tokenPlan
quotaDeck.minimax.global.webCookie
quotaDeck.deepseek.apiKey
quotaDeck.deepseek.sessionToken
quotaDeck.deepseek.cookie
```

Qwen secret keys are not created, stored, or read in V1. The names `quotaDeck.qwen.accessKeyId` and `quotaDeck.qwen.accessKeySecret` are reserved for a future release and do not appear in the V1 manifest, so no user is prompted to configure them.

### Cookie credential shape

A web-cookie credential is a **complete cookie header string**, for example `sessionId=abc; acw_tc=def`. It is parsed into name/value pairs at capture time and stored as the original string in Secret Storage.

- Each provider adapter declares the cookie names it requires, for example `minimax.points` requires `[{ name: 'token_plan_session' }]` and the DeepSeek usage capabilities require `[{ name: 'sessionId' }, { name: 'acw_tc' }]`. The exact names are confirmed during contract verification (§11, S2 and S5).
- Only allow-listed cookie names are sent to any endpoint. The stored header is never forwarded verbatim.
- If a required cookie name is missing, the affected capability resolves to `unconfigured` with a reason naming the missing cookie.
- The raw header string is never logged, never echoed back to the user, never written to a fixture, and never sent to the webview.

### Non-secret settings

| Setting | Values | Default |
| --- | --- | --- |
| `quotaDeck.language` | `auto`, `zh-CN`, `en-US` | `auto` |
| `quotaDeck.refreshIntervalMinutes` | 1–60 | 5 |
| `quotaDeck.pauseWhenUnfocused` | boolean | `true` |
| `quotaDeck.statusBar.mode` | `all`, `focused` | `all` |
| `quotaDeck.statusBar.primaryProvider` | `minimax-cn`, `minimax-global`, `deepseek`, `qwen` | `minimax-cn` |
| `quotaDeck.statusBar.providerOrder` | ordered `ProviderId` list, no duplicates | `['minimax-cn', 'minimax-global', 'deepseek', 'qwen']` |
| `quotaDeck.timeZone` | IANA zone name | `Asia/Shanghai` |

No secret is accepted as a VS Code setting.

### Commands

| Command id | English title | Chinese title |
| --- | --- | --- |
| `quotaDeck.openDashboard` | QuotaDeck CN: Open Dashboard | QuotaDeck CN: 打开仪表盘 |
| `quotaDeck.refresh` | QuotaDeck CN: Refresh | QuotaDeck CN: 刷新 |
| `quotaDeck.switchProvider` | QuotaDeck CN: Switch Provider | QuotaDeck CN: 切换服务商 |
| `quotaDeck.configureMiniMax` | QuotaDeck CN: Configure MiniMax | QuotaDeck CN: 配置 MiniMax |
| `quotaDeck.configureDeepSeek` | QuotaDeck CN: Configure DeepSeek | QuotaDeck CN: 配置 DeepSeek |
| `quotaDeck.showHelp` | QuotaDeck CN: Show Help | QuotaDeck CN: 查看帮助 |

Titles are declared in `package.json` as `%command.<id>.title%` placeholders and resolved from `package.nls.json` (English) and `package.nls.zh-cn.json` (Chinese).

Credential commands use password-style input boxes. Existing values are never prefilled or echoed. Users can clear individual credentials.

### Onboarding

Onboarding is a **QuickPick flow**, not a webview. Keeping it in the extension host means no credential ever enters a webview, it works identically on every platform, and it is testable without a browser.

The flow is launched when the status bar item is left-clicked while no provider is configured, and from `Show Help`:

1. Pick a provider to configure: MiniMax CN, MiniMax Global, DeepSeek.
2. Enter the required credential in a password input box, then optionally the optional credentials. Each step offers a Skip action.
3. A summary QuickPick lists which credentials are now present, with actions: Configure another, Refresh now, Open dashboard, Finish.

A provider counts as configured when the credentials required by its `required: true` capabilities are present.

## 8. Interaction Design

### Status bar

`all` mode renders one segment per provider in `providerOrder`. Every provider in the list gets a segment, including unconfigured ones.

```text
$(pulse) CN Quota  MM 42%  MG —  DS ¥112.80  QW —
```

```text
$(pulse) CN Quota  MM 42% · 2h15m
```

**Segment legend**

| Segment | Meaning | Notes |
| --- | --- | --- |
| `MM` | MiniMax domestic remaining quota | The tighter of the 5-hour and weekly windows. A window that is unlimited is excluded from the comparison. If only one window is available, that one is used. |
| `MG` | MiniMax international remaining quota | Same rule as `MM`. `MG` appears only when `minimax-global` is in `providerOrder`. |
| `DS` | DeepSeek account balance | A balance, not a remaining quota. |
| `QW` | Qwen | `—` in V1: the adapter is not implemented. |
| `· 25m` | Time until the next reset of that segment's quota window | `< 60m` → `Nm`; `< 24h` → `NhMm`; otherwise `NdNh`. |

**Balance currency rule**

CNY renders with the symbol, for example `¥112.80`. Every other currency renders with its ISO code, for example `USD 12.30`. When a provider returns several currencies, the status bar shows exactly one, chosen deterministically: CNY first, then USD, EUR, then remaining currencies in ascending ISO code order. The tooltip shows all of them.

**Truncation rule**

If the rendered text exceeds the available status bar width, segments are dropped from the right in reverse `providerOrder` priority and a `+N` marker is appended, where `N` is the number of dropped segments. The marker is plain text, not a separate click target; the dashboard lists every provider.

**Interaction**

- Left click opens the dashboard, or opens onboarding when no provider is configured at all.
- Hover shows the tooltip immediately.
- If setup is incomplete, the item remains visible and the unconfigured provider segment shows its unconfigured state.
- A failed provider shows an error marker without clearing valid values from other providers. A failed capability marks only its own card, not the whole provider.
- The extension's actions — Refresh, Switch Provider, Settings, Help — are reachable from the Command Palette and from the dashboard. VS Code's `StatusBarItem` exposes a single click command and has no right-click hook, so V1 does not provide a separate status bar context menu.

### Hover tooltip

The header shows the brand `QuotaDeck CN`, a models badge, and a localized subtitle. The models badge is 国产模型 in Chinese and `CN MODELS` in English. The subtitle is 国产大模型额度 in Chinese and `Chinese LLM quota` in English.

The tooltip always shows all configured provider summaries in `providerOrder`. It uses compact two-row cards inspired by MiniMax Status:

1. Provider, region, source badge, session badge, and status.
2. Key metric, remaining percentage, reset countdown, and last update.

MiniMax cards use geometric progress bars because VS Code tooltip rendering strips much of the CSS. The bars use U+2588 `█` for filled and U+2591 `░` for empty, both of which are present in the Windows default UI font. The filled count is `round(remainingPercent / 10)`, with a minimum of one filled cell when remaining is greater than zero. The dashboard uses real CSS bars.

DeepSeek provides a compact summary in the tooltip:

- Balance by currency.
- Today and last-seven-day spend.
- Today and last-seven-day requests and tokens.
- Cache hit rate.
- Session-expired warning when detailed usage is unavailable.

The tooltip footer shows the last successful refresh time in `Asia/Shanghai` and a hint to open the dashboard for deeper analysis.

### Dashboard

The dashboard is an optional singleton webview panel titled `QuotaDeck CN — 用量与洞察` in Chinese and `QuotaDeck CN — Usage & Insights` in English.

**Overview**

- Lowest remaining quota.
- Account balance.
- Today tokens and cost.
- Provider health.
- Last successful data by provider.
- Data source legend showing both the source badge and the session badge vocabulary.

**MiniMax**

- Domestic/international tabs.
- 5-hour and weekly quota cards.
- Media and bonus quota cards.
- Points.
- Plan expiry.
- Token usage summary.
- Model-level detail table.

**DeepSeek**

- Balance breakdown by currency.
- Usage range selector.
- Cost, requests, and tokens charts.
- Cache hit/miss/output breakdown.
- Model-level table.
- Current peak/off-peak pricing hint.

**Qwen**

- The capability matrix with every row marked not supported in V1.
- No fabricated values.

**Settings**

- Language.
- Refresh interval.
- Status bar mode and provider order.
- Credential configuration and clearing through extension commands.

**Dashboard charts**

Every figure is chosen for the job the data does, and every chart has a table-view twin.

| Data | Form | Notes |
| --- | --- | --- |
| Overview headline numbers | KPI row of stat tiles | Lowest remaining quota, balance, today tokens, today cost. One hero figure per view: the lowest remaining quota. |
| A remaining percentage against its limit | Meter | A quota card is a meter, not a bar chart. The unfilled track is a lighter step of the same hue. |
| Cost, requests, or tokens over time | Single-series line with a 10% area wash | One series, so no legend box; the card title names what is plotted. |
| Cache hit, cache miss, and output tokens | Stacked bar, three series | Series colors are blue `#2a78d6`, orange `#eb6834`, and aqua `#1baf7a` in light mode and `#3987e5`, `#d95926`, `#199e70` in dark mode. A legend is always present. |
| Usage by model | Table | More than seven models carry meaning, so they become a table rather than more colors. |
| Balance by currency | Table | Currencies are never added together. |

- The usage range selector is one filter row above every chart it scopes. All charts, tiles, and tables re-render against the same slice.
- Charts hover with a crosshair that snaps to the nearest data position, and every value a tooltip shows is also reachable from the table view. A tooltip never gates a value.
- While data reloads, the previous render is held at reduced opacity. No skeleton, no layout jump.
- Marks are thin: 2px lines, a 4px rounded data-end on bars, an 8px marker with a 2px surface ring, and a 2px surface gap between touching fills.
- Gridlines and axes are solid hairlines one step off the surface, never dashed.
- Text never wears a series color. Identity comes from a colored mark beside the text.

The dashboard supports VS Code light, dark, and high-contrast themes, keyboard navigation, responsive layout, and reduced motion. A QuickPick fallback exposes provider summaries and refresh actions if the webview fails.

### Provider switching and color semantics

- The provider switcher lists MiniMax CN, MiniMax Global, DeepSeek, and Qwen, each with its configured state.
- The dashboard card order follows `providerOrder`.
- The status bar default displays all segments in `providerOrder`.
- Focused mode displays only the primary provider.

Quota status always uses semantic colors:

- Healthy and sufficient: theme positive/green.
- Attention: amber.
- Exhausted, authentication failure, or service failure: red.
- Not configured or unsupported: muted gray.
- Stale data: yellow warning.

Provider identity accents are separate from status and are limited to card headings, dots, and border strips:

- MiniMax: teal — `#1baf7a` light, `#199e70` dark.
- DeepSeek: blue — `#2a78d6` light, `#3987e5` dark.
- Qwen: orange — `#eb6834` light, `#d95926` dark.

The three accents are validated as a set against both the light and the dark surface. The worst all-pairs colorblind separation is ΔE 9.2 light and 9.4 dark, and the worst normal-vision separation is ΔE 24.0 light and 20.9 dark. A previous violet accent for Qwen was rejected because violet and blue measured ΔE 10.5, below the ΔE 15 floor for telling two accents apart.

Text labels and icons always accompany color so meaning is not color-dependent. The teal accent sits below 3:1 against a light surface, so the relief rule applies: the provider name is always rendered next to the accent.

## 9. Refresh and Failure Behavior

- Data refresh interval defaults to five minutes.
- Countdown labels update every 30 seconds from cached reset timestamps without another network request.
- Manual refresh is debounced to prevent request bursts.
- Background refresh pauses when the window is unfocused by default.
- On focus, refresh immediately if data is older than the configured interval.
- Requests use per-provider timeouts and exponential backoff after transient failures.
- HTTP 401/403 opens a re-authentication action; it does not retry aggressively. A failure on one capability does not disable the provider's other capabilities.
- HTTP 429 stops that capability's automatic refresh until backoff expires.
- Malformed or structurally changed responses stop parsing that capability and preserve the last successful snapshot.
- A stale snapshot includes its original fetch time and a visible stale badge.
- The extension never writes provider errors at a level that includes cookies or authorization headers.

## 10. Localization and Time

- All command titles, status text, tooltips, dashboard labels, errors, and onboarding are localized in `zh-CN` and `en-US`.
- Command titles are localized through `package.nls.json` and `package.nls.zh-cn.json`; in-app strings are localized through `src/localization/`.
- `auto` follows the VS Code display language.
- Default time zone is `Asia/Shanghai`.
- Relative reset countdowns use absolute timestamps.
- Absolute dates and times include the `Asia/Shanghai` label where ambiguity is possible.
- Number notation adapts by locale while preserving exact values in detailed views.
- CNY is the default currency presentation; USD or other API-reported currencies are shown separately and never silently converted.

## 11. Endpoint Contract Verification

Every provider endpoint in §4 is an external contract that the extension does not control. The behavior described in this document depends on field names, semantics, parameter encodings, and cookie requirements that are not published as a stable API. Verification is therefore a prerequisite for implementation, not a test-suite afterthought.

### Verification spikes

Each spike runs against a dedicated test account, produces a captured fixture, and has an explicit exit criterion. A spike that fails converts the affected capability into `unsupported` in V1 rather than shipping a fabricated or guessed value.

| Spike | Question | Exit criterion |
| --- | --- | --- |
| S1 | MiniMax plan response: exact field names, whether total/used counts exist, the meaning of `current_interval_remaining_percent`, the reset timestamp format and zone, how an unlimited window is represented | Two fixtures (with and without totals) parse; computed and field-derived remaining percentages agree with the platform UI within one percentage point |
| S2 | MiniMax subscription, token-amount, and points responses; the cookie names the points endpoint requires | Each capability parses from a fixture; the required cookie list is recorded in the adapter |
| S3 | DeepSeek balance response: currency fields, granted versus topped-up fields, multi-currency shape | A multi-currency fixture parses into separate currency values |
| S4 | DeepSeek usage: `start`/`end`/`tz` encoding, inclusivity, returned series granularity, cache-hit and cache-miss field names, model-level response shape, and whether the account's API key list can be enumerated | Time ranges in §4 produce a response; the aggregation rule in §4.2 is confirmed or revised |
| S5 | DeepSeek session auth: required headers and cookies, session lifetime, error codes on expiry | An expired session produces a distinguishable `auth` error rather than a malformed-response error |

### Fixture pipeline

Fixtures are the bridge between the spikes and the test suite, and they are the most likely place for a credential to leak. The pipeline is:

1. **Capture** — a dev-only script under `scripts/` fetches a live endpoint and writes the raw response. The script is never imported by `src/` and is never bundled.
2. **Sanitize** — the script replaces the value of every declared sensitive key with a placeholder, and replaces any string matching a token-like pattern (long base64 or hex runs, `sk-` prefixed values, `Bearer` headers, cookie values) with `<redacted>`. Types and structure are preserved so parsers are still exercised.
3. **Annotate** — each fixture records `capturedAt`, the source host, and, for MiniMax plan fixtures, an explicit `remainingPercentSource`.
4. **Review** — fixtures are committed to `src/test/fixtures/<provider>/<capability>/<case>.json` only through a reviewed change.
5. **Guard** — a CI check scans committed fixtures for secret-shaped strings and fails the build on a match. The check runs on fixtures and on the packaged `.vsix`.

### Contract drift

A live response that no longer matches a committed fixture is a signal, not an error to swallow. The runtime marks that capability `failed` with a `malformed` error and preserves the last good snapshot. The fixture is then updated deliberately in a reviewed commit. Fixtures are never auto-updated at runtime, and the runtime never writes to the fixtures directory.

## 12. Testing and Verification

### Unit tests

- MiniMax plan parsing, remaining-percent precedence, unlimited detection, and reset timestamps.
- MiniMax media category mapping and points parsing.
- DeepSeek balance parser with multiple currencies.
- DeepSeek usage parsers for today, multi-day, month boundaries, cache fields, and model aggregation.
- Account-level aggregation rule: summary totals and summed per-key totals are never combined.
- Multi-currency separation.
- Time-range construction in `Asia/Shanghai`, including month and year boundaries, and bucket assignment.
- Error normalization for authentication, rate limit, timeout, malformed JSON, and changed response shape.
- Capability state resolution: partial credentials, unsupported capability, stale carry-over.
- Cookie allow-list enforcement: a non-allow-listed cookie is never attached to a request.
- HTML escaping and webview message validation.
- Status bar formatting: segment order, balance currency selection, countdown format, truncation.

### Integration tests

- Extension activation and command registration.
- Status bar creation and text updates from fixture snapshots.
- Tooltip rendering from mixed valid, stale, failed, and unconfigured states.
- Dashboard message flow using a mocked extension host.
- Secret clearing and re-authentication paths, including that `dispose` clears in-memory credentials.
- Onboarding QuickPick flow, including the skip paths.

Tests never use real credentials and never require live provider accounts.

### Manual verification

- Install the packaged `.vsix` into a clean VS Code profile.
- Configure no credentials: onboarding and no-data states are clear and error-free.
- Configure MiniMax domestic: quota cards, points unavailable state, and countdowns render.
- Configure MiniMax international: region-specific values do not mix.
- Configure DeepSeek balance only: balance renders while detailed usage explains missing session credentials.
- Configure DeepSeek Web Session: range switching, charts, model totals, and multi-currency states render.
- Expire or corrupt a credential: only the affected provider and capability report an error.
- Toggle light, dark, high-contrast, Chinese, English, and narrow editor widths.
- Confirm the status bar progress bars render as blocks with no missing-glyph boxes under the Windows default font, and that the status bar icon codicon renders.
- Confirm no credential appears in output logs, global state, settings, or webview HTML.

### Build gates

- TypeScript strict type check passes.
- Unit and integration tests pass.
- The locale key sets in `package.nls.json` and `package.nls.zh-cn.json` match, and every `%...%` placeholder in `package.json` resolves in both.
- No committed fixture contains a secret-shaped value.
- Extension and webview bundles build with `sourcemap: false`, and `.vscodeignore` excludes `**/*.map`, `src/**`, and `**/*.ts`.
- The packaged `.vsix` contains no absolute local path and no secret-shaped string.
- The packaged `package.json` contains no credential key names and no secret-like setting.
- `@vscode/vsce package` produces `quota-deck-*.vsix`.
- `code --install-extension` succeeds for the generated package during local verification.

## 13. Packaging and Marketplace Checklist

The extension is published to the Visual Studio Marketplace. The manifest must satisfy the marketplace submission requirements before the first publish.

**Manifest**

- `publisher` and `name` match the extension identifier `alexmultiagent.quota-deck`.
- `displayName` is `QuotaDeck CN — MiniMax DeepSeek Qwen`.
- `description` is the Chinese description from §1.
- `categories` includes `Other` and `Visualization`.
- `keywords` matches §1.
- `icon` is a 128×128 PNG.
- `galleryBanner` is set.
- `license` is MIT and a `LICENSE` file is included.
- `repository`, `bugs`, and `homepage` point at the project.
- `engines.vscode` pins the minimum supported VS Code version.
- `pricing` is `Free`.
- `telemetry` declares no collector; the extension makes no network request other than to the fixed provider origins in §4.
- `main` points at the bundled extension entry; `browser` is omitted because the extension is Node-based.

**Repository files**

- `README.md` describing what the extension does, what it does not do, the credential model, and a privacy statement covering telemetry and the fixed request origins.
- `LICENSE`.
- `CHANGELOG.md`.
- `CONTRIBUTING.md` is optional.
- `.vscodeignore` excludes source, tests, fixtures, and maps from the package.
- `.vscodeignore` and the package review are checked with `vsce ls` before packaging.

**Publishing**

- The extension is signed with a publisher certificate.
- A release tag and a `CHANGELOG.md` entry are created before the first publish.
- The pricing calendar coverage (§4.2) is refreshed and the refresher is recorded in the release notes.

## 14. Acceptance Criteria

V1 is complete when:

1. The extension installs and activates without credentials.
2. MiniMax domestic and international plan data can be configured independently.
3. MiniMax points render when the optional web session is valid.
4. MiniMax dynamic quota cards and reset countdowns render from account data.
5. DeepSeek balance renders from an API Key.
6. DeepSeek detailed usage renders from an optional platform session.
7. DeepSeek supports all six time ranges and shows cost, requests, tokens, cache details, models, and currencies.
8. Qwen is visible as an adapter placeholder with an honest, fully-unavailable capability matrix and performs no network request.
9. The status bar can show all providers or a focused provider, and can switch the primary provider between any of the four provider ids.
10. Hover presents a complete summary without requiring the dashboard.
11. The dashboard is optional, singleton, theme-aware, and keyboard accessible.
12. All credentials use Secret Storage, and clearing a credential wipes it from the provider instance.
13. Chinese and English UI strings are complete, including command titles.
14. Beijing time and currency labels are correct.
15. Partial failures preserve last-known data and never affect unrelated providers or capabilities.
16. Every capability in §4 has a committed fixture captured and sanitized through §11, or is explicitly marked `unsupported`.
17. A verified `.vsix` is produced that satisfies §13.

## 15. Marketplace References

The interaction model was informed by the current marketplace implementations and installation counts on 2026-11-16:

- `growthjack.claude-code-usage`: status bar, quota tooltip, and click-through dashboard.
- `jlcodes.antigravity-cockpit`: Webview dashboard with QuickPick fallback and status bar.
- `wwenc6621.codebuddy-usage`: status bar plus hover tooltip.
- `n2ns.antigravity-panel`: sidebar/panel analysis plus status bar hover.
- `JochenYang.minimax-status-vscode`: status bar, detailed tooltip, domestic/international MiniMax accounts.

These are references for **interaction patterns only**, not for the quota model. Most of them track a Claude Code or Antigravity subscription allowance, whereas QuotaDeck CN tracks API balance and platform usage. The status bar layout, tooltip density, dashboard structure, and QuickPick fallback are the borrowed ideas; the semantics of what is displayed are designed for the Chinese LLM providers.

The implementation will use these patterns as product references. Source code is not copied; provider clients, parsers, presentation, tests, and assets are implemented specifically for QuotaDeck CN.

## 16. Risks and Open Questions

### Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Provider endpoints are undocumented web APIs and can change without notice | A capability stops working for every user | Fixture-gated parsing, per-capability failure isolation, last-good snapshot retention, contract verification in §11 |
| The `current_interval_remaining_percent` interpretation is wrong | Users see a wrong remaining percentage | Strict precedence in §4.1, `remainingPercentSource` annotation, verification against the platform UI in spike S1 |
| Session cookies expire frequently | Detailed usage disappears for users who configured it | Capability-level `auth` errors, a re-authentication action, an explicit unavailable state instead of a blank card |
| The DeepSeek pricing and holiday calendar expires | Peak/off-peak hints become wrong | `coverageEnd` field, an explicit "pricing calendar unavailable" state, a release-checklist item |
| MiniMax domestic and international responses diverge | Parsers mis-handle one region | Separate instances, shared parsing with per-origin fixtures, spike S1 covers both origins |
| Provider strings break the webview or tooltip rendering | Injection or malformed layout | HTML escaping, message-schema validation, a fixed CSP |
| Marketplace naming assumptions are wrong | Weak discovery | The extension identifier is stable; renaming is a manifest-only change |

### Open questions

- OQ1: Does the DeepSeek platform expose the account's API key list? The answer decides whether account-level totals are summed per key or taken from the account summary alone.
- OQ2: Does the DeepSeek usage endpoint return its own series, or only aggregates? This decides whether client-side bucketing is required.
- OQ3: Which cookie names does the MiniMax points endpoint require? A single stored header may need to carry more than one.
- OQ4: Does the DeepSeek balance endpoint ever return a non-CNY currency for CNY accounts? This affects the status bar currency selection rule.
