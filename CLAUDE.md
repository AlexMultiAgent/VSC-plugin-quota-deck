# QuotaDeck CN

Read-only VS Code extension (`alexmultiagent.quota-deck`) that shows MiniMax / DeepSeek / Qwen
quota, balance, usage and reset windows in the status bar, a hover tooltip, an Activity Bar
overview tree, and an optional dashboard. It never proxies model requests and never provides chat
completion.

## Commands

```bash
npm run typecheck        # tsc --noEmit
npm test                 # vitest run via scripts/run-vitest.mjs
npm run test:watch       # vitest in watch mode via scripts/run-vitest.mjs
npm run build            # esbuild → dist/extension.js + dist/webview.js
npm run watch            # rebuild both bundles on change
npm run icon             # regenerate media/icon.png from scripts/make-icon.mjs
npm run check:locales    # package.nls*.json key parity + manifest %placeholder% resolution
npm run check:i18n       # production sources must not contain hardcoded Chinese UI text
npm run guard:fixtures   # committed fixtures: no secret-shaped or non-zero financial values
npm run guard:package    # shipped files: no secrets, no absolute local paths, activity-bar icon present
npm run package          # build → locale/i18n checks → guard:fixtures → release-gate → vsce package → guard:package

# MCP server (separate package, never part of the VSIX)
npm --prefix mcp install
npm --prefix mcp run build
npm --prefix mcp run typecheck
npm --prefix mcp test
npm --prefix mcp run start    # run the MCP server over stdio

node scripts/check-calendar.mjs  # DeepSeek pricing-calendar check (warns at 60 days left)

# CI and release workflows live in `.github/workflows/`: `ci.yml` (typecheck, tests, build,
# locale/i18n checks, fixture and package guards), `mcp.yml` (the MCP package, including a live
# `--once` provider probe), `codeql.yml`, `scorecard.yml`, `calendar.yml` (the pricing-calendar
# warning) and `publish.yml` (tag → Marketplace).
```

`guard:package` reads `dist/extension.js` and `dist/webview.js` and runs `npx vsce ls`, so it is
**not** a standalone check — run `npm run build` first. `npm run package` does this for you.

`npm run package` writes `quota-deck-<version>.vsix` to the repo root; it does not publish.
Pushing a `v*` tag runs `.github/workflows/publish.yml`, which re-runs typecheck, tests and
`npm run package`, then publishes that VSIX through Marketplace Trusted Publishing
(`npx @vscode/vsce@4.1.1 publish --oidc`, no PAT) and attaches the same VSIX to a GitHub Release named
after the tag. The publisher's Trusted Publishing policy must name this repository and workflow.
Publishing by hand is `npx vsce publish --packagePath quota-deck-<version>.vsix` with a Marketplace
PAT (`VSCE_PAT`). A successful "Publish to the Visual Studio Marketplace" step does not mean the
version is visible: the public listing lags the publish by several minutes while the gallery
validates the VSIX. Verify with `npx --yes @vscode/vsce@4.1.1 show alexmultiagent.quota-deck` (or the
gallery `extensionquery` API) before announcing the release.

`gh` talks to `api.github.com`, so `gh run list --workflow=publish.yml` and
`gh run watch <id> --exit-status` work and are how to confirm the publish job succeeded.
This machine's git transport is flaky over HTTPS; the workaround and the local
paths live in `CLAUDE.local.md`, which is not checked in.

## Architecture

Two esbuild bundles, two targets:

| Entry | Output | Platform |
| --- | --- | --- |
| `src/extension.ts` | `dist/extension.js` | node / cjs, `vscode` marked external |
| `src/presentation/dashboard/webview/main.ts` | `dist/webview.js` | browser / iife |

The extension bundle targets `node22`; the manifest requires VS Code `^1.101.0` (Electron 35 /
Node 22.14) and the MCP package requires Node `>=22.14.0`. Raising the floor means updating
`engines.vscode`, `@types/vscode`, `@types/node` and both esbuild targets together.

The webview script is loaded via `webview.asWebviewUri()` — never a raw `file://` path — and
`localResourceRoots` must keep `dist` in scope, or the script silently fails to load.

```text
src/
  core/          provider-agnostic: types, coordinator, scheduler, http, cache, secrets, settings, time,
                 errors, capability (typed reader for capability data)
  providers/     one folder per vendor class (three folders, four providers — MiniMaxProvider is
                 instantiated for both minimax-cn and minimax-global); each owns its endpoints,
                 credentials, request signing and parsers
                 endpoints.json is the single source for every endpoint and credential env var
                 endpoints.ts = typed view over that JSON; registry.ts = buildProviders()
                 shape.ts = vendor-neutral primitives; <vendor>/shape.ts = raw payload shapes
                 only deepseek/ splits raw (usage.ts) from higher-level (aggregate.ts); minimax/ and
                 qwen/ parse and assemble inside shape.ts + provider.ts; qwen/auth.ts parses the
                 management device flow and stored token, qwen/login.ts runs it
  presentation/  statusBar, tooltip, overview/ (Activity Bar tree), onboarding, commands, credentials,
                 qwenLogin, switcher, help, health, labels, display, quotaTone, quickPickFallback,
                 timeZonePicker, dashboard/
  localization/  messages.ts (key registry) + en-us.ts / zh-cn.ts bundles + index.ts (resolver)
  test/          __mocks__/vscode.ts, fixtures/, helpers/
```

Layering rules: `core` knows nothing about any vendor. Within an adapter, `shape.ts` is the only
place that knows a raw payload shape, `provider.ts` assembles capabilities over the endpoints, and
`usage.ts` / `aggregate.ts` (DeepSeek only) build higher-level values. `presentation` consumes
normalized snapshots and never touches endpoints, secrets, or raw payloads.

The status bar, the hover tooltip, the Activity Bar tree (`presentation/overview/`) and the dashboard
all render the *same* coordinator snapshot. `refreshAll()` is the main paint path but not the only
one: the startup block after `scheduler.start()` paints every surface from the cache before the
first refresh, `switchProvider` repaints only the status bar and tooltip, and `openDashboard`
repaints the dashboard before refreshing. A new surface needs a paint line in `refreshAll()` **and**
in the startup cache block, or it stays empty until the first refresh and then lags the rest.

The `quotaDeck.checkConnection` output channel is on-demand: it refreshes first, then rewrites its
diagnostic report. It is not one of the continuously painted surfaces and needs no startup paint.

Each surface renders that snapshot through its own derived view model:
`presentation/overview/model.ts` (`buildOverviewItems`) and
`presentation/dashboard/viewModel.ts` (`buildDashboardModel`) turn the snapshot into display
records, and `dashboard/webview/render.ts` turns the dashboard model into DOM. A derived value
belongs in the view model, not in the surface. The dashboard model carries `lastUpdated` (the
newest provider fetch time, formatted in `quotaDeck.timeZone`) and the webview renders it in the
action row. The dashboard's refresh action calls `scheduler.refreshNow(true)` to bypass the 2 s
manual debounce: an explicit click must always produce a new state, or a visible loading state
that clears when that state arrives.

`quotaDeck.statusBar.providerOrder` decides **which** providers appear and in what order — the
four painted surfaces and the connection-check report filter by it, so removing a provider from
the list hides it everywhere. It is not an ordering-only preference.

`quotaDeck.statusBar.primaryProvider` re-orders one surface only: in `all` mode its segment is
moved to the front of the status bar, while the tooltip, the tree and the dashboard keep
`providerOrder`. It also picks which MiniMax region occupies the single MiniMax slot, but only
among the regions `providerOrder` still lists — a region removed from the order is never
reintroduced merely because it has a credential. In `focused` mode the status bar shows the
primary only when `providerOrder` still lists it, and the `Switch Provider` picker offers only
the providers in that order. `visibleProviderIds()` in `src/presentation/statusBar.ts` owns the
display rules.

The MiniMax status-bar segment labels both windows — `5小时` / `周` in zh, `5h` / `Week` in en — and
takes its icon and colour from the tighter of the two. The reset countdown lives in the tooltip,
the dashboard and the tree, not in the status bar. A segment whose primary quota capability failed
without a usable percentage uses the `warning` tone and an error icon; it must never read as
healthy green.

VS Code supports one colour and one background per status bar item, so `StatusBarPresenter` creates
one item per visible provider segment (`renderStatusBarSegments` supplies each segment's tone). Each
item gets that provider's own tooltip from `refreshTooltip()` (`renderTooltip` with `[id]`); the
cross-provider summary lives in the Activity Bar overview and the dashboard. Do not merge the
segments back into a single item: a critical MiniMax window would then repaint DeepSeek and Qwen red
as well. Per-provider tooltips also keep hover identities distinct — VS Code keys a hover by the
tooltip's `value`, so identical tooltips would make only one segment hoverable while that hover is
open.

Snapshots are fetched per **range** (`RangeId` in `src/core/time.ts`:
`today | yesterday | last7 | last30 | thisMonth | lastMonth`). The range flows through
`coordinator.refreshAll(range)`, `provider.fetchSnapshot(signal, range, timeZone)` and
`SnapshotCache.load/save(providerId, range)` — the cache key is
`quotaDeck.snapshot.<providerId>.<range>`, so every range has its own cache entry. Only MiniMax
consumes the range; DeepSeek and Qwen ignore it. Choosing a range in the dashboard calls
`selectRange()` in `src/extension.ts`, which re-runs the whole `refreshAll()`.

`Coordinator.refreshAll()` runs at most one range at a time. A request for another range while a
run is active is queued; only the latest requested range runs, and callers waiting on a superseded
range adopt the latest run's result. After each provider fetch the coordinator converts a
per-capability `failed` state into `stale` using the cached snapshot for the same range, so the
last good value survives the failure and is written back to the cache as stale. `refreshAll()` in
`src/extension.ts` also keeps a generation counter: an older result that arrives after a newer
refresh, or after a range switch, must not paint.

`src/core/cache.ts` persists the **parsed** snapshot in `globalState`, not the raw provider payload.
Changing how a provider parses a field therefore changes the meaning of every snapshot already on
disk, and the cache is painted at startup before the first refresh lands. The cache drops what it no
longer trusts — `withoutRetiredCapabilities()` for retired DeepSeek and MiniMax capabilities,
`withoutLegacyMiniMaxPlan()` for a plan cached under the old count rule — so a parsing change needs
its own rule there, or a stale number reaches the UI before the first refresh replaces it.

A flag derived from *other* fields needs no cache rule at all: derive it when the snapshot is
**read**, not only when it is parsed, so a snapshot cached before the flag existed still reads
correctly when the cache is painted at startup. `withAvailability()` in
`src/providers/minimax/shape.ts` is the pattern. Snapshot data is also partial at runtime —
hand-built test data and old caches omit fields the type declares — so a reader must tolerate a
missing field instead of trusting the type.

`src/providers/shape.ts` holds the vendor-neutral parsing primitives. Use `requireNumber` when the
provider must have supplied a number (a missing one is contract drift and throws) and
`numberOrNull` when the provider may legitimately omit it. Never substitute `0` for a missing
number.

`src/presentation/display.ts` holds the shared display helpers: `formatMoney`,
`selectPrimaryCurrency`, `providerDisplayName`, `pickTightestWindow`, `formatDateTime`,
`formatExpiryRemaining`, `formatRemainingDays`. Use them instead of writing another copy.
`src/presentation/quotaTone.ts` is the shared severity function
(`quotaTone(percent, warningThresholdPercent)` → `positive | warning | critical`) used by
the status bar, the dashboard and the Activity Bar tree — the `warning` line follows the user's
`warningThresholdPercent` and `critical` is hard-coded at 5 %. There is deliberately no fourth
stage: the old 50 % yellow `caution` band was neither configurable nor described by the setting,
so a window at 45 % read as a warning nobody could tune away. The threshold applies to every
percentage the extension shows, including the Qwen Token Plan windows.

An empty window is labelled rather than shown as a bare 0 % (`已用尽` / `Exhausted`), and a window
that another exhausted window holds back keeps its own number and gains a marker
(`受每周额度限制` / `Blocked by weekly quota`). The decision lives in one shared helper,
`quotaStateText()` in `src/presentation/display.ts`, not in each surface.

`src/core/capability.ts` reads capability data in a typed way. Presentation code imports the
provider's exported types and reads through `capabilityValue`, never a hand-written `as` cast.

`src/providers/endpoints.json` is the single source for every endpoint URL and credential
environment variable. The extension, `scripts/capture-fixture.mjs` and
`scripts/capture-qwen-fixtures.mjs` all read it, so a changed endpoint can never leave a capture
script pointing at a URL the extension does not call. It is JSON rather than a `.ts` module because
the capture scripts must read it without importing anything from `src/`. Qwen has no environment
credential: its management token is obtained through the device flow and lives only in Secret
Storage. `scripts/endpoints.test.ts` asserts that every endpoint id a provider source mentions
exists in `endpoints.json`.

`mcp/` is a standalone Node package (`quota-deck-mcp`) that bundles `src/core`,
`src/providers`, and the vscode-free presentation/localization modules it reuses
(`dashboard/viewModel`, `display`, `labels`, `quotaTone`, `localization`) to expose the same
snapshots over MCP. It is excluded from the VSIX by
`.vscodeignore`, keeps its own lockfile, tests and esbuild config, and is not covered by the root
`typecheck`/`test` commands — run `npm --prefix mcp …` for it. It reads credentials from
environment variables only, never from Secret Storage, and its bundle must stay free of `vscode`
imports. CI greps `mcp/dist/index.js` for a `vscode` import and fails the build if one appears.

`src/presentation/dashboard/protocol.ts` validates every host↔webview message against an
exact-key schema — including the range selection the webview sends back. Extend that validator
whenever a message shape changes. The module is compiled into **both** bundles: the extension
validates what the webview sends (`isWebviewMessage`) and the webview validates what the host
sends (`isHostMessage`). A new dashboard model field therefore touches four places — the model
interface, the validator's key list and type check, the builder in `viewModel.ts`, and the
renderer in `webview/render.ts`.

The dashboard webview owns no translated strings: `presentation/dashboard/locale.ts` builds a
`DashboardLocalization` payload, the panel injects it as `data-` attributes and also sends it as
the `locale` host message, and the webview falls back to those attributes — and finally to
English — until the message arrives. A new webview string needs four edits: the message key, both
bundles, the `DashboardLocalization` payload, and the protocol validator.

The dashboard panel registers a `WebviewPanelSerializer` (`onWebviewPanel:quotaDeck.dashboard`)
and `DashboardPanel.restore()` reattaches the restored tab, repaints it from the current snapshot,
and refreshes. Without it a window reload leaves the restored DOM showing pre-reload values with
no host listener, while the status bar and other surfaces keep updating.

## Invariants

These are product and security rules, not implementation details — do not trade them away.

- **Credentials live only in VS Code Secret Storage** (`context.secrets`). Never in settings, global
  state, logs, or webview HTML. `scripts/release-gate.mjs` fails `npm run package` if `package.json`
  declares any setting matching `/cookie|secret|password|token|apikey|session/i`.
- **Only API credentials are used — never a browser session.** Since v0.2.11 the web-session Cookie
  path is gone: MiniMax uses the Token Plan key, DeepSeek the API key, and Qwen uses only the
  official Qianwen management OAuth token for both its account balance and the Token Plan.
  `CREDENTIAL_KINDS` in `src/core/types.ts` still lists `session-token` and `web-cookie`, but no
  provider reads them — `src/presentation/credentials.ts` only *deletes* the legacy secrets. The
  `management-token` kind is an OAuth access token from the platform's official device flow, not a
  browser cookie, and it is obtained only by the `quotaDeck.loginQwen` command.
- **A failed fetch is a state, not a number.** Capability states are `ok | stale | unconfigured |
  unsupported | failed`. Never substitute `0` or `0.00` for missing data — the UI must say why.
  A refresh that fails while a previous value survives becomes `stale`, which keeps the value
  visible and says it is out of date.
- **Currencies are never added together.** Token counts are currency-independent and may be
  summed; monetary amounts may not. Keep one row per currency and label the currency.
- **Provenance is explicit, and everything shown today is account data.** The tooltip and the
  Activity Bar tree label each card 账户实时数据. No local estimate or token-derived price is
  surfaced, and the credential type is deliberately not shown. A future estimated value must carry
  its own label — never let it borrow the account one.
- **Qwen uses one credential for both the balance and the Token Plan.** The management token from
  `quotaDeck.loginQwen` queries the fund account directly with
  `BssOpenAPI-V3.GetFundAccountAvailableAmount` at `cli.qianwenai.com/data/v2/api.json`, then issues
  a console token for the Token Plan calls at `cs-data.qianwenai.com`. There is no Alibaba Cloud
  AccessKey path; `access-key-id` / `access-key-secret` remain only as legacy secrets for
  `quotaDeck.clearCredential` to delete. The fund-account response has no `MybankCreditAmount`, so
  the 网商信控额度 row is retired; `QuotaAmount` supplies the 额度上限 row. An `sk-sp-…` Token Plan
  key cannot query quota. Model-level quota and consumption detail remain console-only and are not
  integrated; consumption detail needs the separate BSS bill APIs and pagination.
- **DeepSeek only uses the public balance endpoint.** The extension never asks for or forwards a
  platform session token or Cookie. Detailed DeepSeek usage, cost, and account summaries belong on
  `platform.deepseek.com`.
- **The Activity Bar view is a manifest contribution, not a command.** `package.json` declares
  `contributes.viewsContainers.activitybar`, `contributes.views.quotaDeck.overview` and the
  `view/title` menu; the tree itself is `presentation/overview/provider.ts`, registered in
  `src/extension.ts`. `scripts/activity-bar.test.ts` asserts that manifest shape — adding a title
  action means editing the manifest *and* that test.

## Gotchas

- **The `vscode` module is aliased in tests.** `vitest.config.ts` maps `vscode` →
  `src/test/__mocks__/vscode.ts`, a hand-written mock. If new code touches a VS Code API the mock
  does not implement, add it to the mock — do not import the real module.
- **Vitest 5 must be launched through `scripts/run-vitest.mjs`.** Vitest resolves its runtime from
  the process cwd, while the worker loads it through the canonical Windows path. When the cwd uses a
  lowercase drive letter (`d:\...`, as Git Bash does), Node evaluates the runtime twice and every
  `describe()` fails with `Cannot read properties of undefined (reading 'config')`. The wrapper
  launches `node_modules/vitest/vitest.mjs` through `realpathSync.native`; both `npm test` and
  `npm --prefix mcp test` use it. A direct `npx vitest` reproduces the crash on Windows.
- **TypeScript 7 has no compiler API entry point.** Its main entry exports only `version`; the
  compiler API is under `typescript/unstable/*`. `scripts/check-ui-localization.mjs` scans string and
  template tokens with `createScanner` — note `SyntaxKind.EndOfFileToken` is now
  `SyntaxKind.EndOfFile`. The root `tsconfig.json` needs `"types": ["node"]` because TypeScript 7 no
  longer auto-includes Node globals. Do not reintroduce a `typescript` 5.x import in `scripts/`.
- **Localization is a three-file edit, and no UI text may be hardcoded.** Add the key to
  `src/localization/messages.ts`, then to both `en-us.ts` and `zh-cn.ts`. `MessageBundle =
  Record<MessageKey, string>` makes a missing bundle key a compile error. `quotaDeck.language`
  selects the bundle (`auto` follows `vscode.env.language`); any `quotaDeck.*` configuration change
  re-resolves the translator and re-runs `refreshAll()`. `npm run check:i18n`
  fails the build on any Chinese string literal in a production source, so a label written straight
  into `tooltip.ts` breaks the build. Manifest strings live separately in `package.nls.json` /
  `package.nls.zh-cn.json` and must stay key-identical; `displayName` and `description` are
  `%extension.displayName%` / `%extension.description%` placeholders resolved from them and pinned
  by `scripts/locales.test.ts`.
- **The DeepSeek pricing calendar expires.** `scripts/release-gate.mjs` fails the build when
  `coverageEnd` in `src/providers/deepseek/pricing-calendar.json` is under 30 days out. Extend
  `coverageEnd` and `holidays` before it lapses. `.github/workflows/calendar.yml` warns at 60 days
  and opens or updates a maintenance issue; `node scripts/check-calendar.mjs` is the same check
  locally. Peak windows are UTC Monday–Friday `01:00–04:00` and `06:00–10:00`; weekends and
  Chinese public holidays are entirely off-peak.
- **A version bump is required only when the change ships.** `scripts/release-gate.mjs` checks that
  the `package.json` version, the `package-lock.json` version and the newest `## X.Y.Z` heading in
  `CHANGELOG.md` agree, and that `v<version>` either does not exist yet or still points at HEAD.
  When the tag is behind HEAD, the gate compares the two commits and fails when a changed file
  ships in the VSIX: `src/`, `media/`, `package.json`, `package-lock.json`, `package.nls*.json`,
  `README.md`, `CHANGELOG.md`, `LICENSE`, `esbuild.mjs`, `.vscodeignore`.
  A docs-only commit — `CLAUDE.md`, `docs/**`, `scripts/**`, `.github/**` — packages under the
  current version. A `package.nls*.json` edit is a shipped change, not docs-only.
- **The `minimatch` override is load-bearing.** `@vscode/vsce@4.1.1` requires `minimatch@^10.2.6`,
  which is vulnerable (GHSA-g3hv-75wg-m249). `package.json` overrides it to `^11.0.1` (resolved
  11.0.9) for that subtree, and `.github/dependabot.yml` ignores `minimatch` so Dependabot does not
  "fix" the advisory by downgrading `@vscode/vsce` to 3.9.1 — the only path it finds when it cannot
  see the override. Dropping the override, or un-ignoring the dependency, reintroduces the
  advisory; `npm audit` in CI still covers it.
- **The bot workflows declare permissions per job, and Scorecard declares none at the workflow
  level.** `permissions: {}` at the top of `scorecard.yml`, with `security-events: write` and
  `id-token: write` on the job, is the layout Scorecard requires: a workflow-level write makes the
  Scorecard API reject the upload ("global perm is set to write"), the workflow still goes green,
  and nothing is published — no badge and no alerts. A job-level `permissions:` block *replaces*
  the workflow-level one rather than extending it, so every job that reads the repository has to
  repeat `contents: read` itself.
- **The settings manifest is pinned by a test.** `scripts/settings.test.ts` asserts the exact set of
  `contributes.configuration.properties`, that every one is `scope: 'window'` with a
  `%config.<key>.description%` `markdownDescription`, and that `statusBar.mode` carries two
  `enumDescriptions` while `providerOrder` is `uniqueItems`. Adding a setting means editing
  `package.json` *and* that test.
- **A registered command is not a reachable command.** `quotaDeck.clearCredential` once had its
  handler, its confirmation dialog and its tests, but was absent from `contributes.commands` and
  invoked by no surface, so no user could reach it. A command the user should reach needs both a
  manifest entry and a call site. `scripts/commands.test.ts` now asserts that every
  `registerCommand(...)` id is contributed with a `%command.*.title%` placeholder present in both
  `package.nls*.json` bundles.
- **`showInformationMessage` / `showErrorMessage` resolve when the notification is dismissed, not
  when it is shown.** The toast auto-hiding after a few seconds does not resolve them; only
  `onDidClose` does, so awaiting one before state-changing work can stall that work until the user
  clears the notification — possibly forever. `loginQwen` once awaited the success message before
  `extension.ts` reconnected the provider and refreshed, so a successful Qianwen sign-in stored the
  new token but left every surface on the old, expired one until the notification was dismissed.
  Fire-and-forget these messages (`void vscode.window.showInformationMessage(...)`).
- **The design spec gates the deferred capabilities.** `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md`
  §4.5 gates `minimax.points`, the DeepSeek usage capabilities, the dashboard charts and the Qwen
  model capabilities behind questions about the *provider*, not about effort. Each gate needs a
  captured fixture and a verified contract in `docs/contracts/` before the capability is scheduled.
  The extension accepts no browser-session credential, so none of them can be enabled by adding a
  cookie input.
- **Provider endpoints mix public and web APIs.** Qwen account balance and DeepSeek balance use
  public APIs. MiniMax's account endpoints are undocumented web APIs; the domestic plan,
  subscription and usage calls are now verified (`docs/contracts/minimax.md`), but the global host
  is not. Treat an unexpected response shape as contract drift to investigate, not something to
  paper over.
- **Never invent a provider payload.** A hand-written test payload only encodes the guess it was
  written from, so it cannot catch a misread field — the MiniMax video quota stayed inverted
  through several releases because the fixture that "proved" it was invented the same way. Capture
  the real response with `scripts/capture-fixture.mjs`, keep the confirmed semantics in
  `docs/contracts/`, and read that contract before trusting or changing a parser.
- **`current_interval_usage_count` is the count still left, not the count spent.** MiniMax
  reports the remaining count beside `current_interval_remaining_percent` in the same record, so
  a video allowance of 3 with a usage count of 3 is 3 remaining, not 3 spent. `readQuota()` in
  `src/providers/minimax/shape.ts` derives `remaining`, `used` and the percentage from it; a
  Token Plan key reports zero counts and only the percentage fields, which is why
  `remainingPercentSource` exists. The verified contract is in `docs/contracts/minimax.md`.
- **`minimax.points` is a retired capability.** The points endpoint needs a web-session Cookie, so it
  was dropped. `src/core/cache.ts` lists it in `RETIRED_MINIMAX_CAPABILITIES` and strips it from
  snapshots cached before the removal. Do not reintroduce it without a verified credential.
- **An empty weekly window blocks the 5-hour window.** MiniMax's text and voice models need both
  windows to have remaining quota, and refreshing the 5-hour window does not restore the week's
  usage, so a weekly percentage of 0 means the 5-hour balance cannot be spent. The extension marks
  the blocked window instead of hiding its number: the percentage stays, the row gains
  `受每周额度限制` / `Blocked by weekly quota`, and the status bar shows only the window that
  decides what can be used. The rule lives in `withAvailability()` in
  `src/providers/minimax/shape.ts` and is derived at read time, so a snapshot cached before the
  rule existed still reads correctly when the cache is painted at startup. The rule and its
  source are in `docs/contracts/minimax.md`.
- **The Qianwen management token is a device-flow token, not a Token Plan key.** The login command
  uses `t.qianwenai.com` with PKCE, queries the fund account at `cli.qianwenai.com/data/v2/api.json`
  with `BssOpenAPI-V3.GetFundAccountAvailableAmount`, exchanges the OAuth bearer for a console token
  at the same route, then queries `cs-data.qianwenai.com` with `consoleSite: "QIANWENAI"`. The
  official CLI has no refresh grant: an expired `expiresAt` means the user re-runs
  `QuotaDeck CN: 登录千问AI平台`. `per1MonthPercentage` is a **used** ratio in 0..1; monthly and
  weekly are independent. The verified contracts are in `docs/contracts/qwen.md`.
- **MiniMax credits, account balance, boosts, and unlimited windows are separate concepts.** The
  console's 积分 (credit balance) is not reachable with an API key: it comes from
  `/backend/account/token_plan_credit` (`balance_breakdown`), which the console calls with a Cookie
  session. The subscription response's `credit_info.total_credit` is a legacy field (0.00 on annual
  plans) and must not be surfaced as 积分; the dashboard and tooltip say the balance is
  console-only. The account balance comes
  from `/account/query_balance` (available / cash / voucher / credit / owed) with the same Token
  Plan key; the response has no currency field, so the provider labels CN amounts CNY and global
  amounts USD. `weekly_boost_permille` is a per-mille multiplier on the weekly percentage (1500 =
  1.5×, capped at 200%). `current_weekly_status: 3` means unlimited, but when both totals are zero
  and both statuses are 3 the model is not in the plan — do not mark that as unlimited. An
  unlimited window renders as 无限 / Unlimited with no meter track, never as `0%` or `—`;
  `pickTightestWindow()` already ignores unlimited windows.
- **MiniMax rejects a credential with HTTP 200.** The refusal lives in `base_resp.status_code`
  (`1004` for a bad key), so `credentialRejection()` in `src/providers/minimax/provider.ts` runs
  before the shape parsers — otherwise a revoked key reads as a malformed response.
- **The MiniMax expiry has an epoch field.** `current_subscribe_end_time` is a locale date
  string such as `"07/06/2027"`, which `Date.parse` resolves to local midnight; read
  `current_subscribe_end_time_ts` instead and render it in `quotaDeck.timeZone`.
- **The marketplace icon is generated.** `media/icon.png` comes from `npm run icon`; never
  hand-edit the PNG. The generator is deterministic, so a regeneration that shows a diff means the
  geometry changed. The release gate rejects an icon that is not 128 × 128.
- **`media/activity-bar.svg` is hand-authored; only `media/icon.png` is generated.** `npm run icon`
  regenerates the marketplace PNG and nothing else. The Activity Bar glyph is theme-aware
  (`currentColor`) and `scripts/activity-bar.test.ts` pins its exact path data, so editing the
  shape breaks that test until the pinned paths are updated to match.
- **User-supplied time zones must be validated.** `Intl.DateTimeFormat` throws `RangeError` for
  an unknown IANA zone, and `quotaDeck.timeZone` is user-editable — route it through
  `resolveTimeZone()` in `src/core/time.ts` before it reaches `Intl`. It maps the `auto`
  default, and any unrecognized value, to `systemTimeZone()` rather than to a hard-coded city.
  The setting stays free text because a manifest enum cannot list the hundreds of IANA zones; the
  real chooser is the `quotaDeck.pickTimeZone` Quick Pick
  (`src/presentation/timeZonePicker.ts`), whose handler calls `coordinator.setTimeZone()` and
  repaints, the same way the `onDidChangeConfiguration` block does.
- **Use `hourCycle: 'h23'`, not `hour12: false`.** `hour12: false` can render midnight as hour
  `24`, and `zonedParts()` (`src/core/time.ts`) reads that `hour` field.
  `src/providers/deepseek/pricing.ts` deliberately mixes calendars: the **Shanghai date** decides
  the holiday and the coverage window, the **UTC minute-of-day** decides the peak window, and the
  weekend is decided by the **UTC** weekday (`getUTCDay()`) — not by the Shanghai date, which puts
  Sunday 16:00 UTC on a Monday in Shanghai.
- **Assemble dates with `formatToParts()`, not `format()`.** `.format()` output depends on the
  ICU data the runtime ships; `formatToParts()` gives named fields to compose from.
- **`scripts/` is outside `tsconfig.json`'s `include`.** `npm run typecheck` only checks `src/**`,
  so a type error in a script passes both typecheck and vitest.
- **The `vscode` mock does no schema validation.** `workspace.getConfiguration().get()` returns
  the raw configured value, so a wrong-typed setting (e.g. `refreshIntervalMinutes: "5"`) passes
  silently in tests — `readSettings()` must coerce and clamp every value itself.
- **An already-aborted `AbortSignal` never fires its `abort` listener.** In `src/core/http.ts` the
  `signal.aborted` check must come before `addEventListener('abort', …)`, or the request hangs.
- **An installed extension keeps running its old bundle until the window reloads.**
  `code --install-extension quota-deck-<version>.vsix` only stages the files; the running extension
  host keeps the previous version until "Developer: Reload Window". A stale install makes fresh
  code look like a no-op — `CLAUDE.local.md` has the install path to check.
- **To tell a stale surface from a stale fetch, read the extension's own cache.** The parsed
  snapshots live in VS Code's global state as JSON keyed
  `quotaDeck.snapshot.<providerId>.<range>`. If the cached `fetchedAt` is current but a surface
  still shows old numbers, that surface did not paint; if the cache is old too, the provider fetch
  itself is the problem. `CLAUDE.local.md` has the cache location.

## Fixtures

`src/test/fixtures/<provider>/<capability>/<case>.json`. The pipeline is capture → sanitize →
annotate → review → guard:

```bash
node scripts/capture-fixture.mjs --provider deepseek --capability deepseek.balance --case standard
npm run guard:fixtures
```

Credentials come from environment variables only (`DEEPSEEK_API_KEY`, `MINIMAX_CN_TOKEN_PLAN`,
`MINIMAX_GLOBAL_TOKEN_PLAN`) — never from a file or a command-line argument.
`scripts/capture-fixture.mjs` is dev-only and must never be imported from `src/`.
It covers MiniMax and DeepSeek only. The script sends a bearer Token Plan key for `minimax.plan`,
`minimax.subscription` and `minimax.tokenUsage`; `headersFor()` supports bearer auth only.
Qwen fixtures come from `scripts/capture-qwen-fixtures.mjs`, which runs the official OAuth device
flow once, opens the verification URL, and writes the fund-account and both Token Plan fixtures; the
access token stays in memory and the console token is redacted in the fixture. Never hand-write a
Qwen fee payload or reuse a token response as a fixture.

Sanitization preserves structure but zeroes financial fields (`balance|cost|amount` → `0` / `0.00`)
and redacts secret-shaped values. Fixtures are therefore proof of *shape*, never proof of a real
balance.

## Testing

Vitest, over `src/**/*.test.ts` and `scripts/**/*.test.ts`, with each test file colocated beside
the source it covers. Tests never use real credentials and never require a live provider account
— mock `fetch` and drive providers through fixtures. Run them through `npm test` /
`npm --prefix mcp test`; both go through `scripts/run-vitest.mjs` (see Gotchas).

`tsconfig.json` is strict plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; index
access and optional-property assignment both need explicit handling.

## Commits

Every commit is authored by AlexMultiAgent only. Never add a `Co-Authored-By:` trailer naming
Claude or any other assistant — GitHub parses those trailers and lists the trailer's author as a
repository contributor.

Commit messages use the conventional prefixes the history already uses: `feat:`, `fix:`,
`docs:`, `refactor:`, and `chore(release): vX.Y.Z` for the version bump.

Release tags are annotated, named `vX.Y.Z`, and placed on the commit that writes that version's
`CHANGELOG.md` section.

## Reference

- `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md` — the product design: what the
  extension does, what is deferred, and behind which gate (§4.5). Revised against the shipped
  implementation; where it disagrees with the code, the code is right.
- `docs/superpowers/specs/2026-11-18-quota-deck-activity-bar-design.md` — intent for the Activity Bar overview
- `docs/contracts/` — the verified response contract per provider; read it before changing a parser
- `docs/superpowers/plans/` — the historical implementation plans (structure has since drifted)
