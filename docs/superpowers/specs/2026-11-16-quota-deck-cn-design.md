# QuotaDeck CN Design

## 1. Product Definition

**Marketplace display name:** AI Quota Deck — MiniMax DeepSeek Qwen  
**Extension identifier:** `alexmultiagent.quota-deck`  
**Product brand:** QuotaDeck  
**China product name:** QuotaDeck CN  
**Positioning:** 国产大模型额度，一处看全。

QuotaDeck CN is a read-only VS Code extension for monitoring quota, balance, usage, and reset windows across MiniMax, DeepSeek, and Qwen. It does not proxy model requests and does not provide chat completion.

The extension follows the successful interaction pattern used by established quota extensions: a compact status bar item, a detailed hover tooltip, and an optional dashboard for analysis. The status bar and tooltip are the primary experience. The dashboard is opened only by the user and is never required to inspect current quota.

### Marketplace discovery

- Display name includes all three current providers.
- Description: 国产大模型额度监控 · MiniMax、DeepSeek、Qwen 余额、用量与重置倒计时.
- Keywords include `minimax`, `deepseek`, `qwen`, `quota`, `usage`, `balance`, `token usage`, `额度监控`, and `国产大模型`.
- The permanent extension ID remains `quota-deck`; future Global branding or display-name changes do not require a new extension.

## 2. Goals and Scope

### V1 goals

1. Show MiniMax domestic and international Token Plan quotas.
2. Show MiniMax points, subscription expiry, and available media quotas.
3. Show DeepSeek account balance and detailed official-platform usage statistics.
4. Provide a Qwen provider adapter and clear capability state without fabricated metrics.
5. Let users show all three providers in the status bar or focus on one.
6. Keep the hover tooltip useful without opening another view.
7. Provide an optional dashboard for range switching, charts, model breakdowns, and settings.
8. Store every credential in VS Code Secret Storage.
9. Support Simplified Chinese and English.
10. Use `Asia/Shanghai` and CNY by default while preserving provider-reported currencies.
11. Produce an installable `.vsix`.

### V1 non-goals

- API proxying, model chat, prompt execution, or token counting by intercepting requests.
- Treating local estimates or token-derived prices as official account data.
- Automatic extraction of browser cookies.
- Kimi, GLM, Doubao, Baidu Qianfan, or other provider integrations.
- Currency conversion or combining amounts from different currencies.
- Automatic purchases, recharge, quota resets, or account changes.

## 3. Product Principles

### Source integrity

Every user-visible value has one provenance:

- **Account:** returned directly by an official account or platform endpoint.
- **Local:** computed from data persisted or imported by the extension.
- **Estimated:** calculated from tokens and a versioned price table.

The UI never labels an estimate as account quota. A generic `0%` or `0.00` is never used to mask a failed or unavailable request.

### Read-only security

- API requests run only in the extension host.
- The webview never receives raw credentials.
- Credentials are stored only in `context.secrets`.
- Authorization headers, cookies, and response bodies containing credentials are never logged.
- Network origins are fixed in provider code.
- The webview uses a nonce-based CSP, fixed local resource roots, and message-schema validation.
- Provider-controlled strings are HTML-escaped before entering tooltip or webview markup.

## 4. Provider Data Contracts

### 4.1 MiniMax

Domestic and international accounts are separate provider instances with independent credentials and state.

**Credential types**

- Token Plan Key, required for plan and usage queries.
- Web Session Cookie, optional and used only for points.

**Endpoints and capabilities**

| Capability | Domestic endpoint | International endpoint | Authentication | Provenance |
|---|---|---|---|---|
| Plan and quota windows | `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains` | `https://www.minimax.io/v1/api/openplatform/coding_plan/remains` | Token Plan Key | Account |
| Subscription details | `https://www.minimaxi.com/v1/api/openplatform/charge/combo/cycle_audio_resource_package` | `https://www.minimax.io/v1/api/openplatform/charge/combo/cycle_audio_resource_package` | Token Plan Key | Account |
| Token billing usage | `https://www.minimaxi.com/account/amount` | `https://www.minimax.io/account/amount` | Token Plan Key | Account |
| Points | `https://www.minimaxi.com/backend/account/token_plan_credit` | `https://www.minimax.io/backend/account/token_plan_credit` | Web Session Cookie | Account |

All provider paths are centralized and covered by parser fixtures. If an account endpoint changes, only that provider adapter changes.

**Quota normalization**

- `current_interval_remaining_percent` is treated as remaining percentage, matching the current MiniMax platform response.
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

Balance and usage are separate capabilities and are fetched independently.

**Credentials**

- DeepSeek API Key, required for official balance.
- Platform Session Token, optional, required for detailed usage.
- Platform Cookie, optional, required by the current account usage endpoints.

**Balance**

- Endpoint: `https://api.deepseek.com/user/balance`.
- Authentication: `Authorization: Bearer <API Key>`.
- Show availability, total balance, granted balance, and topped-up balance.
- Preserve every returned currency as a separate value.
- CNY is the default display currency when available.

**Detailed usage**

- Base host: `https://platform.deepseek.com`.
- Usage windows use `GET /api/v0/usage/by_api_key/amount?start=...&end=...&tz=...`.
- Cost windows use `GET /api/v0/usage/by_api_key/cost?start=...&end=...&tz=...`.
- Account summary uses `GET /api/v0/users/get_user_summary`.
- Authentication uses the platform Session Token and Cookie.

These are official DeepSeek web-account endpoints, not a stable public developer API. The UI marks them as **Web Session** and provides a session-expired recovery path.

**Time ranges**

- Today
- Yesterday
- Last 7 days
- Last 30 days
- This month
- Last month

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
- If the pricing calendar does not cover the current date, show `pricing calendar unavailable` rather than assuming standard rates.
- When price must be calculated from tokens, label the result **Estimated** and include the price-table version.

### 4.3 Qwen

V1 exposes a Qwen provider adapter with explicit capability states:

- Not configured
- Adapter available, account authorization not configured
- Unsupported account capability

It does not show invented quota or zero usage. The adapter contract is prepared for future Alibaba Cloud Bailian account or access-key integration. Qwen appears in the provider switcher and dashboard so the three-provider information architecture is complete.

## 5. Architecture

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
    types.ts
  providers/
    minimax/
    deepseek/
    qwen/
  presentation/
    statusBar.ts
    tooltip.ts
    quickPickFallback.ts
    dashboard/
  localization/
  test/
```

### Provider interface

Each provider implements:

```ts
interface QuotaProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  getCapabilities(): ProviderCapabilities;
  connect(secrets: SecretReader): Promise<ConnectionState>;
  fetchSnapshot(signal: AbortSignal): Promise<ProviderSnapshot>;
}
```

The coordinator is responsible for:

- Serial refresh execution.
- Per-provider failure isolation.
- Combining account instances.
- Applying request timeouts and short-lived rate limiting.
- Saving the last successful snapshot without credentials.
- Emitting one aggregated state to the status bar, tooltip, and dashboard.

The presentation layer consumes the normalized snapshot. It does not know provider endpoints, secrets, or raw payload shapes.

## 6. Credential and Configuration Model

### Secret keys

```text
quotaDeck.minimax.cn.tokenPlan
quotaDeck.minimax.cn.webCookie
quotaDeck.minimax.global.tokenPlan
quotaDeck.minimax.global.webCookie
quotaDeck.deepseek.apiKey
quotaDeck.deepseek.sessionToken
quotaDeck.deepseek.cookie
quotaDeck.qwen.accessKeyId
quotaDeck.qwen.accessKeySecret
```

The Qwen keys are reserved for the future adapter and are not exposed as functional setup fields in V1.

### Non-secret settings

- `quotaDeck.language`: `auto`, `zh-CN`, `en-US`.
- `quotaDeck.refreshIntervalMinutes`: default 5, range 1–60.
- `quotaDeck.pauseWhenUnfocused`: default true.
- `quotaDeck.statusBar.mode`: `all`, `focused`.
- `quotaDeck.statusBar.primaryProvider`: `minimax-cn`, `deepseek`, or `qwen`.
- `quotaDeck.statusBar.providerOrder`: ordered list of visible provider IDs.
- `quotaDeck.timeZone`: default `Asia/Shanghai`.

No secret is accepted as a VS Code setting.

### Commands

- `QuotaDeck CN: Open Dashboard`
- `QuotaDeck CN: Refresh`
- `QuotaDeck CN: Switch Provider`
- `QuotaDeck CN: Configure MiniMax`
- `QuotaDeck CN: Configure DeepSeek`
- `QuotaDeck CN: Show Help`

Credential commands use password-style input boxes. Existing values are never prefilled or echoed. Users can clear individual credentials.

## 7. Interaction Design

### Status bar

Default `all` mode:

```text
$(pulse) CN Quota  MM 0%  DS ¥112.80  QW —
```

Focused mode:

```text
$(pulse) CN Quota  MM 0% · 25m
```

- Left click opens the optional dashboard.
- Right click exposes Refresh, Switch Provider, Settings, and Help.
- Hover shows the tooltip immediately.
- If setup is incomplete, the item remains visible and opens onboarding.
- A failed provider shows an error marker without clearing valid values from other providers.

### Hover tooltip

The header uses `QUOTADECK CN`, the `CN MODELS` badge, and the subtitle `CHINESE LLM QUOTA`.

The tooltip always shows all configured provider summaries in a stable order. It uses compact two-row cards inspired by MiniMax Status:

1. Provider, region, source badge, and status.
2. Key metric, remaining percentage, reset countdown, and last update.

MiniMax cards use geometric `▰` / `▱` progress bars because VS Code tooltip rendering strips much of the CSS. The dashboard uses real CSS bars.

DeepSeek provides a compact summary in the tooltip:

- Balance by currency.
- Today and last-seven-day spend.
- Today and last-seven-day requests and tokens.
- Cache hit rate.
- Session-expired warning when detailed usage is unavailable.

The tooltip footer shows the last successful refresh time in `Asia/Shanghai` and a hint to open the dashboard for deeper analysis.

### Dashboard

The dashboard is an optional singleton editor Webview named `QuotaDeck CN — Usage & Insights`.

**Overview**

- Lowest remaining quota.
- Account balance.
- Today tokens and cost.
- Provider health.
- Last successful data by provider.
- Data source legend.

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

- Capability state and adapter status.
- No fabricated values.

**Settings**

- Language.
- Refresh interval.
- Status bar mode and provider order.
- Credential configuration and clearing through extension commands.

The dashboard supports VS Code light, dark, and high-contrast themes, keyboard navigation, responsive layout, and reduced motion. A QuickPick fallback exposes provider summaries and refresh actions if the webview fails.

### Provider switching and color semantics

- The provider switcher includes MiniMax CN, MiniMax Global when configured, DeepSeek, and Qwen.
- The dashboard card order follows the configured provider order.
- The status bar default displays all provider segments.
- Focused mode displays the selected primary provider.

Quota status always uses semantic colors:

- Healthy and sufficient: theme positive/green.
- Attention: amber.
- Exhausted, authentication failure, or service failure: red.
- Not configured or unsupported: muted gray.
- Stale data: yellow warning.

Provider identity accents are separate from status and are limited to card headings, dots, and border strips:

- MiniMax: teal.
- DeepSeek: blue.
- Qwen: violet.

Text labels and icons always accompany color so meaning is not color-dependent.

## 8. Refresh and Failure Behavior

- Data refresh interval defaults to five minutes.
- Countdown labels update every 30 seconds from cached reset timestamps without another network request.
- Manual refresh is debounced to prevent request bursts.
- Background refresh pauses when the window is unfocused by default.
- On focus, refresh immediately if data is older than the configured interval.
- Requests use per-provider timeouts and exponential backoff after transient failures.
- HTTP 401/403 opens a re-authentication action; it does not retry aggressively.
- HTTP 429 stops that provider's automatic refresh until backoff expires.
- Malformed or structurally changed responses stop parsing that provider and preserve the last successful snapshot.
- A stale snapshot includes its original fetch time and a visible stale badge.
- The extension never writes provider errors at a level that includes cookies or authorization headers.

## 9. Localization and Time

- All command titles, status text, tooltips, dashboard labels, errors, and onboarding are localized in `zh-CN` and `en-US`.
- `auto` follows the VS Code display language.
- Default time zone is `Asia/Shanghai`.
- Relative reset countdowns use absolute timestamps.
- Absolute dates and times include the `Asia/Shanghai` label where ambiguity is possible.
- Number notation adapts by locale while preserving exact values in detailed views.
- CNY is the default currency presentation; USD or other API-reported currencies are shown separately and never silently converted.

## 10. Testing and Verification

### Unit tests

- MiniMax plan parsing, remaining-percent semantics, unlimited detection, and reset timestamps.
- MiniMax media category mapping and points parsing.
- DeepSeek balance parser with multiple currencies.
- DeepSeek usage parsers for today, multi-day, month boundaries, cache fields, and model aggregation.
- Multi-currency separation.
- Time-range construction in `Asia/Shanghai`, including month and year boundaries.
- Error normalization for authentication, rate limit, timeout, malformed JSON, and changed response shape.
- HTML escaping and webview message validation.

### Integration tests

- Extension activation and command registration.
- Status bar creation and text updates from fixture snapshots.
- Tooltip rendering from mixed valid, stale, failed, and unconfigured states.
- Dashboard message flow using a mocked extension host.
- Secret clearing and re-authentication paths.

Tests never use real credentials and never require live provider accounts.

### Manual verification

- Install the packaged `.vsix` into a clean VS Code profile.
- Configure no credentials: onboarding and no-data states are clear and error-free.
- Configure MiniMax domestic: quota cards, points unavailable state, and countdowns render.
- Configure MiniMax international: region-specific values do not mix.
- Configure DeepSeek balance only: balance renders while detailed usage explains missing session credentials.
- Configure DeepSeek Web Session: range switching, charts, model totals, and multi-currency states render.
- Expire or corrupt a credential: only the affected provider reports an error.
- Toggle light, dark, high-contrast, Chinese, English, and narrow editor widths.
- Confirm no credential appears in output logs, global state, settings, or webview HTML.

### Build gates

- TypeScript strict type check passes.
- Unit and integration tests pass.
- Extension and webview bundles build with no source maps containing secrets or local paths.
- `@vscode/vsce package` produces `quota-deck-*.vsix`.
- `code --install-extension` succeeds for the generated package during local verification.

## 11. Acceptance Criteria

V1 is complete when:

1. The extension installs and activates without credentials.
2. MiniMax domestic and international plan data can be configured independently.
3. MiniMax points render when the optional web session is valid.
4. MiniMax dynamic quota cards and reset countdowns render from account data.
5. DeepSeek balance renders from an API Key.
6. DeepSeek detailed usage renders from an optional platform session.
7. DeepSeek supports all six time ranges and shows cost, requests, tokens, cache details, models, and currencies.
8. Qwen is visible as an adapter with honest capability states.
9. The status bar can show all providers or a focused provider and can switch the primary provider.
10. Hover presents a complete summary without requiring the dashboard.
11. The dashboard is optional, singleton, theme-aware, and keyboard accessible.
12. All credentials use Secret Storage.
13. Chinese and English UI strings are complete.
14. Beijing time and currency labels are correct.
15. Partial failures preserve last-known data and never affect unrelated providers.
16. A verified `.vsix` is produced.

## 12. Marketplace References

The interaction model was informed by the current marketplace implementations and installation counts on 2026-11-16:

- `growthjack.claude-code-usage`: status bar, quota tooltip, and click-through dashboard.
- `jlcodes.antigravity-cockpit`: Webview dashboard with QuickPick fallback and status bar.
- `wwenc6621.codebuddy-usage`: status bar plus hover tooltip.
- `n2ns.antigravity-panel`: sidebar/panel analysis plus status bar hover.
- `JochenYang.minimax-status-vscode`: status bar, detailed tooltip, domestic/international MiniMax accounts.

The implementation will use these patterns as product references. Source code is not copied; provider clients, parsers, presentation, tests, and assets are implemented specifically for QuotaDeck CN.
