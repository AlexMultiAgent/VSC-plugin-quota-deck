# QuotaDeck CN

Read-only VS Code extension (`alexmultiagent.quota-deck`) that shows MiniMax / DeepSeek / Qwen
quota, balance, usage and reset windows in the status bar, a hover tooltip, and an optional
dashboard. It never proxies model requests and never provides chat completion.

## Commands

```bash
npm run typecheck        # tsc --noEmit
npm test                 # vitest run
npm run build            # esbuild → dist/extension.js + dist/webview.js
npm run watch            # rebuild both bundles on change
npm run icon             # regenerate media/icon.png from scripts/make-icon.mjs
npm run check:locales    # package.nls*.json key parity + manifest %placeholder% resolution
npm run guard:fixtures   # committed fixtures: no secret-shaped or non-zero financial values
npm run guard:package    # shipped files: no secrets, no absolute local paths
npm run package          # build → guard:fixtures → release-gate → vsce package → guard:package
```

`guard:package` reads `dist/extension.js` and `dist/webview.js` and runs `npx vsce ls`, so it is
**not** a standalone check — run `npm run build` first. `npm run package` does this for you.

## Architecture

Two esbuild bundles, two targets:

| Entry | Output | Platform |
| --- | --- | --- |
| `src/extension.ts` | `dist/extension.js` | node / cjs, `vscode` marked external |
| `src/presentation/dashboard/webview/main.ts` | `dist/webview.js` | browser / iife |

The webview script is loaded via `webview.asWebviewUri()` — never a raw `file://` path — and
`localResourceRoots` must keep `dist` in scope, or the script silently fails to load.

```text
src/
  core/          provider-agnostic: types, coordinator, http, cache, secrets, settings, time, errors,
                 capability (typed reader for capability data)
  providers/     one adapter per vendor; each owns its endpoints, credentials, request signing and parsers
                 endpoints.json is the single source for every endpoint and credential env var
                 shape.ts = vendor-neutral primitives; <vendor>/shape.ts = raw payload shapes
  presentation/  statusBar, tooltip, onboarding, commands, credentials, switcher, labels, display,
                 dashboard/
  localization/  messages.ts (key registry) + en-us.ts / zh-cn.ts bundles
  test/          __mocks__/vscode.ts, fixtures/, helpers/
```

Layering rules: `core` knows nothing about any vendor. Within an adapter, `shape.ts` is the only
place that knows a raw payload shape, `usage.ts` / `aggregate.ts` build higher-level values, and
`provider.ts` assembles capabilities over the endpoints. `presentation` consumes normalized
snapshots and never touches endpoints, secrets, or raw payloads.

`src/providers/shape.ts` holds the vendor-neutral parsing primitives. Use `requireNumber` when the
provider must have supplied a number (a missing one is contract drift and throws) and
`numberOrNull` when the provider may legitimately omit it. Never substitute `0` for a missing
number.

`src/presentation/display.ts` holds the shared display helpers: `formatMoney`,
`selectPrimaryCurrency`, `providerDisplayName`, `pickTightestWindow`, `remainingBar`. Use them
instead of writing another copy.

`src/core/capability.ts` reads capability data in a typed way. Presentation code imports the
provider's exported types and reads through `capabilityValue`, never a hand-written `as` cast.

`src/providers/endpoints.json` is the single source for every endpoint URL and credential
environment variable. The extension and `scripts/capture-fixture.mjs` both read it, so a changed
endpoint can never leave the capture script pointing at a URL the extension does not call.
It is JSON rather than a `.ts` module because `scripts/capture-fixture.mjs` must read it without
importing anything from `src/`.

`src/presentation/dashboard/protocol.ts` validates every host↔webview message against an
exact-key schema. Extend that validator whenever a message shape changes.

## Invariants

These are product and security rules, not implementation details — do not trade them away.

- **Credentials live only in VS Code Secret Storage** (`context.secrets`). Never in settings, global
  state, logs, or webview HTML. `scripts/release-gate.mjs` fails `npm run package` if `package.json`
  declares any setting matching `/cookie|secret|password|token|apikey|session/i`.
- **Cookies are allow-listed per capability.** Only names in the adapter's allow-list are ever
  forwarded (e.g. `POINTS_COOKIE_NAMES` in `src/providers/minimax/provider.ts`).
- **A failed fetch is a state, not a number.** Capability states are `ok | stale | unconfigured |
  unsupported | failed`. Never substitute `0` or `0.00` for missing data — the UI must say why.
  A refresh that fails while a previous value survives becomes `stale`, which keeps the value
  visible and says it is out of date.
- **Currencies are never added together.** Token counts are currency-independent and may be
  summed; monetary amounts may not. Keep one row per currency and label the currency.
- **Provenance is explicit.** Every displayed value is labelled account / local / estimated, and the
  credential badge (API Key vs AccessKey) is a separate axis. Never present an estimate as account
  quota.
- **Qwen uses the Alibaba Cloud Billing OpenAPI, not a Model Studio API Key.** The adapter calls
  account-level `QueryAccountBalance` at `business.aliyuncs.com` with ACS3-HMAC-SHA256 signing.
  AccessKey ID and Secret live only in Secret Storage. Model-level quota is not integrated.
  Consumption detail requires the separate BSS bill APIs, extra permissions, and pagination, so it
  is not implemented and must be viewed in the Alibaba Cloud billing console.
- **DeepSeek only uses the public balance endpoint.** The extension never asks for or forwards a
  platform session token or Cookie. Detailed DeepSeek usage, cost, and account summaries belong on
  `platform.deepseek.com`.

## Gotchas

- **The `vscode` module is aliased in tests.** `vitest.config.ts` maps `vscode` →
  `src/test/__mocks__/vscode.ts`, a hand-written mock. If new code touches a VS Code API the mock
  does not implement, add it to the mock — do not import the real module.
- **Localization is a three-file edit.** Add the key to `src/localization/messages.ts`, then to both
  `en-us.ts` and `zh-cn.ts`. `MessageBundle = Record<MessageKey, string>` makes a missing bundle key
  a compile error. Manifest strings live separately in `package.nls.json` / `package.nls.zh-cn.json`
  and must stay key-identical to each other.
- **The DeepSeek pricing calendar expires.** `scripts/release-gate.mjs` fails the build when
  `coverageEnd` in `src/providers/deepseek/pricing-calendar.json` is under 30 days out. Extend
  `coverageEnd` and `holidays` before it lapses. Peak windows are UTC Monday–Friday
  `01:00–04:00` and `06:00–10:00`; weekends and Chinese public holidays are entirely off-peak.
- **The design spec's file tree is aspirational, not the layout.**
  `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md` §6 lists `providers/minimax/cn.ts`,
  `global.ts`, `cookies.ts`; the implementation uses one `provider.ts` + `shape.ts` per vendor with
  a shared `providers/cookies.ts`. Read the code, not the spec tree.
- **Provider endpoints mix public and web APIs.** Qwen account balance and DeepSeek balance use
  public APIs. MiniMax account endpoints are undocumented web APIs and remain unverified against
  every account type. Treat an unexpected response shape as contract drift to investigate, not
  something to paper over.
- **The marketplace icon is generated.** `media/icon.png` comes from `npm run icon`; never
  hand-edit the PNG. The generator is deterministic, so a regeneration that shows a diff means the
  geometry changed. The release gate rejects an icon that is not 128 × 128.
- **User-supplied time zones must be validated.** `Intl.DateTimeFormat` throws `RangeError` for
  an unknown IANA zone, and `quotaDeck.timeZone` is user-editable — route it through
  `validTimeZone()` in `src/core/time.ts` before it reaches `Intl`.
- **Use `hourCycle: 'h23'`, not `hour12: false`.** `hour12: false` can render midnight as hour
  `24`, which in `shanghaiMinutes()` (`src/providers/deepseek/pricing.ts`) would mean 1440 minutes.
- **Assemble dates with `formatToParts()`, not `format()`.** `.format()` output depends on the
  ICU data the runtime ships; `formatToParts()` gives named fields to compose from.
- **`scripts/` is outside `tsconfig.json`'s `include`.** `npm run typecheck` only checks `src/**`,
  so a type error in a script passes both typecheck and vitest.
- **The `vscode` mock does no schema validation.** `workspace.getConfiguration().get()` returns
  the raw configured value, so a wrong-typed setting (e.g. `refreshIntervalMinutes: "5"`) passes
  silently in tests — `readSettings()` must coerce and clamp every value itself.
- **An already-aborted `AbortSignal` never fires its `abort` listener.** In `src/core/http.ts` the
  `signal.aborted` check must come before `addEventListener('abort', …)`, or the request hangs.

## Fixtures

`src/test/fixtures/<provider>/<capability>/<case>.json`. The pipeline is capture → sanitize →
annotate → review → guard:

```bash
node scripts/capture-fixture.mjs --provider deepseek --capability deepseek.balance --case standard
npm run guard:fixtures
```

Credentials come from environment variables only (`DEEPSEEK_API_KEY`, `MINIMAX_CN_TOKEN_PLAN`,
`MINIMAX_CN_WEB_COOKIE`, `MINIMAX_GLOBAL_TOKEN_PLAN`, `MINIMAX_GLOBAL_WEB_COOKIE`) — never from a
file or a command-line argument.
`scripts/capture-fixture.mjs` is dev-only and must never be imported from `src/`.

Sanitization preserves structure but zeroes financial fields (`balance|cost|amount` → `0` / `0.00`)
and redacts secret-shaped values. Fixtures are therefore proof of *shape*, never proof of a real
balance.

## Testing

Vitest, over `src/**/*.test.ts` and `scripts/**/*.test.ts`. Tests never use real credentials and
never require a live provider account — mock `fetch` and drive providers through fixtures.

`tsconfig.json` is strict plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; index
access and optional-property assignment both need explicit handling.

## Commits

Every commit is authored by AlexMultiAgent only. Never add a `Co-Authored-By:` trailer naming
Claude or any other assistant — GitHub parses those trailers and lists the trailer's author as a
repository contributor.

Release tags are annotated, named `vX.Y.Z`, and placed on the commit that writes that version's
`CHANGELOG.md` section.

## Reference

- `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md` — source of truth for product intent
- `docs/contracts/` — what was actually verified against live provider endpoints
- `docs/superpowers/plans/` — the historical implementation plans (structure has since drifted)
