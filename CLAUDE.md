# QuotaDeck CN

Read-only VS Code extension (`alexmultiagent.quota-deck`) that shows MiniMax / DeepSeek / Qwen
quota, balance, usage and reset windows in the status bar, a hover tooltip, and an optional
dashboard. It never proxies model requests and never provides chat completion.

## Commands

```bash
npm run typecheck        # tsc --noEmit
npm test                 # vitest run — 39 files, 263 tests
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
  core/          provider-agnostic: types, coordinator, http, cache, secrets, settings, time, errors
  providers/     one adapter per vendor; each owns its endpoints, cookie allow-list and parsers
  presentation/  statusBar, tooltip, onboarding, commands, credentials, switcher, labels, dashboard/
  localization/  messages.ts (key registry) + en-us.ts / zh-cn.ts bundles
  test/          __mocks__/vscode.ts, fixtures/, helpers/
```

Layering rules: `core` knows nothing about any vendor. Within an adapter, `shape.ts` is the only
place that knows a raw payload shape, `parse.ts` builds higher-level values, and `provider.ts`
assembles capabilities over the endpoints. `presentation` consumes normalized snapshots and never
touches endpoints, secrets, or raw payloads.

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
- **Provenance is explicit.** Every displayed value is labelled account / local / estimated, and the
  session badge (API Key vs Web Session) is a separate axis. Never present an estimate as account
  quota.
- **Qwen is a deliberate V1 placeholder.** It performs no network request and shows only a
  capability matrix. Do not implement a Qwen adapter.
- **Never combine DeepSeek account-summary totals with summed per-key totals.** They are
  alternative sources; `canAggregate()` in `src/providers/deepseek/aggregate.ts` gates which is used.

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
  `coverageEnd` and `holidays` before it lapses.
- **The design spec's file tree is aspirational, not the layout.**
  `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md` §6 lists `providers/minimax/cn.ts`,
  `global.ts`, `cookies.ts`; the implementation uses one `provider.ts` + `shape.ts` + `parse.ts` with
  a shared `providers/cookies.ts`. Read the code, not the spec tree.
- **Provider endpoints are undocumented web APIs.** Only the DeepSeek balance endpoint has been
  verified against a live account. MiniMax and DeepSeek detailed usage are unverified — spec §11
  spikes S1–S5 and open questions OQ1–OQ4 in §16 are still open. Treat an unexpected response shape
  as contract drift to investigate, not something to paper over.
- **The marketplace icon is generated.** `media/icon.png` comes from `npm run icon`; never
  hand-edit the PNG. The generator is deterministic, so a regeneration that shows a diff means the
  geometry changed. The release gate rejects an icon that is not 128 × 128.

## Fixtures

`src/test/fixtures/<provider>/<capability>/<case>.json`. The pipeline is capture → sanitize →
annotate → review → guard:

```bash
node scripts/capture-fixture.mjs --provider deepseek --capability deepseek.balance --case standard
npm run guard:fixtures
```

Credentials come from environment variables only (`DEEPSEEK_API_KEY`, `DEEPSEEK_SESSION_TOKEN`,
`DEEPSEEK_COOKIE`, `MINIMAX_CN_TOKEN_PLAN`, `MINIMAX_CN_WEB_COOKIE`, `MINIMAX_GLOBAL_TOKEN_PLAN`,
`MINIMAX_GLOBAL_WEB_COOKIE`) — never from a file or a command-line argument.
`scripts/capture-fixture.mjs` is dev-only and must never be imported from `src/`.

Sanitization preserves structure but zeroes financial fields (`balance|cost|amount` → `0` / `0.00`)
and redacts secret-shaped values. Fixtures are therefore proof of *shape*, never proof of a real
balance.

## Testing

Vitest, over `src/**/*.test.ts` and `scripts/**/*.test.ts`. Tests never use real credentials and
never require a live provider account — mock `fetch` and drive providers through fixtures.

`tsconfig.json` is strict plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; index
access and optional-property assignment both need explicit handling.

## Reference

- `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md` — source of truth for product intent
- `docs/contracts/` — what was actually verified against live provider endpoints
- `docs/superpowers/plans/` — the historical implementation plans (structure has since drifted)
