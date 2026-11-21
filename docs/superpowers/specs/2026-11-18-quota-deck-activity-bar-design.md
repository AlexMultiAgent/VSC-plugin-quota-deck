# QuotaDeck CN Activity Bar Overview

## 1. Context

QuotaDeck currently exposes its live state through three surfaces:

1. a compact status bar item;
2. a rich hover tooltip;
3. a full dashboard opened as an editor panel.

The extension has no persistent first-class location in the VS Code Activity Bar. Users who hide
the status bar, use focused mode, or want to inspect all providers without opening the full
dashboard have no direct entry point.

This specification adds a QuotaDeck Activity Bar container and a native tree view. The view is a
lightweight projection of data already held by the coordinator. It does not fetch data, persist
credentials, or duplicate dashboard charts.

## 2. Goals

1. Add a theme-aware QuotaDeck icon to the VS Code Activity Bar.
2. Open a compact quota overview when the icon is selected.
3. Make each configured provider expandable for detailed live values.
4. Open the existing full dashboard from the overview.
5. Expose refresh and extension settings from the view title.
6. Keep the view useful before any provider is configured.
7. Preserve keyboard navigation and native VS Code tree behavior.
8. Reuse existing provider snapshots, commands, localization, and security boundaries.

## 3. Non-goals

- Adding a second dashboard implemented with a WebviewView.
- Adding charts or historical-range controls to the Activity Bar overview.
- Adding network requests, credential access, or provider-specific parsing to the tree provider.
- Creating a custom settings form.
- Replacing the status bar item or editor-panel dashboard.
- Changing quota parsing, provider contracts, or tooltip presentation in this feature.

## 4. Activity Bar contribution

The extension contributes one Activity Bar container:

| Property | Value |
| --- | --- |
| Container id | `quotaDeck` |
| Localized title | `QuotaDeck CN` |
| Icon | `media/activity-bar.svg` |

The container hosts one tree view:

| Property | Value |
| --- | --- |
| View id | `quotaDeck.overview` |
| Localized name | `额度概览` / `Quota overview` |
| Type | native tree view |
| Multiple selection | disabled |
| Collapse all | enabled |

The Activity Bar icon is a monochrome 24 x 24 SVG gauge whose strokes use `currentColor`. Activity
Bar icons must follow the active VS Code theme and must not be the multi-colour marketplace PNG.
The SVG contains no scripts, external references, embedded raster images, or hard-coded theme
colours.

## 5. Interaction

### 5.1 Opening the view

Selecting the QuotaDeck Activity Bar icon reveals `quotaDeck.overview`. It does not automatically
open an editor panel or start another refresh. Existing scheduled and request-driven refreshes
remain responsible for updating data.

### 5.2 Provider nodes

Each configured provider is one top-level tree item in `quotaDeck.statusBar.providerOrder`.
Top-level items are collapsed initially and can be expanded to show their detail rows.

The provider item has:

- the provider display name as its label;
- a short summary as its description;
- an icon that combines a state glyph with a theme colour;
- a multi-line tooltip with status, key values, provenance, and last update time;
- `command = quotaDeck.openDashboard`;
- a collapsible state based on whether detail rows exist.

The summary is provider-specific:

| Provider | Collapsed summary |
| --- | --- |
| MiniMax CN / Global | Tightest finite window, for example `5 小时 100%` |
| DeepSeek | Primary currency balance, for example `CNY ¥13.69` |
| Qwen | Available balance, for example `¥0.00 CNY` |

If the provider is stale or failed, the state label takes precedence over the numeric summary.

Clicking the provider row opens the existing full dashboard. Clicking its disclosure control
expands or collapses detail rows. This keeps the row's primary action useful while retaining
native tree navigation.

### 5.3 Provider detail rows

MiniMax detail rows use the same semantic labels as the tooltip:

- `5 小时`: remaining percentage and used percentage;
- `每周`: remaining percentage and used percentage;
- `视频`: remaining count out of total, plus used count;
- points balance when available;
- subscription expiry when available.

DeepSeek detail rows use one row per returned currency and one pricing-period row:

- currency and formatted balance;
- `忙时` or `闲时`.

Qwen detail rows expose each returned account value separately:

- available balance;
- available cash;
- credit;
- Mybank credit;
- quota limit when available.

A row for a value that is absent is not invented. Missing, stale, unsupported, and failed
capabilities remain explicit states.

### 5.4 Empty and partial configuration

- When no provider is configured, the tree contains one actionable item labelled
  `配置服务商` / `Configure providers`.
- Selecting that item runs `quotaDeck.configureProviders`.
- When at least one provider is configured, unconfigured providers are omitted from the tree.
- Partially configured providers remain visible when their required capability is available.
- The view never displays an empty tree when configuration is known.

### 5.5 View title actions

The view title exposes three actions:

| Action | Command | Icon |
| --- | --- | --- |
| Refresh | `quotaDeck.refresh` | `$(refresh)` |
| Open dashboard | `quotaDeck.openDashboard` | `$(open-preview)` |
| Extension settings | `quotaDeck.openSettings` | `$(gear)` |

`quotaDeck.openSettings` executes:

```text
workbench.action.openSettings
@ext:alexmultiagent.quota-deck
```

The native VS Code Settings editor is the only settings UI. Existing settings continue to use
their declared types, defaults, enums, minimums, and maximums. No settings value is duplicated into
extension state.

## 6. Tree data model

A pure overview-model function accepts:

- provider snapshots from `Coordinator.getLast()`;
- the configured-provider map;
- the provider display order;
- the current translator;
- DeepSeek pricing state;
- configured time zone;
- last refresh time.

It returns themed rows and neutral value objects. It uses `capabilityValue`, `formatMoney`,
`pickTightestWindow`, and existing display helpers rather than re-parsing provider payloads.

The view provider implements `vscode.TreeDataProvider<OverviewItem>` and exposes
`onDidChangeTreeData`. The extension host calls its update method after:

- cached snapshots are loaded during activation;
- `refreshAll()` completes;
- language or time-zone settings change;
- credentials are configured or cleared.

Tree item ids are stable by provider and detail key, for example:

- `provider:minimax-cn`;
- `provider:minimax-cn:window:fiveHour`;
- `provider:deepseek:balance:CNY`.

Stable ids allow VS Code to preserve native selection and expansion state where supported.

## 7. Visual and status rules

Status meaning follows the existing product rule that colour is never the only signal:

| State | Icon | Colour | Label |
| --- | --- | --- | --- |
| Healthy | `circle-filled` | `charts.green` | `正常` |
| Warning | `warning` | `charts.orange` | `额度偏低` |
| Critical | `error` | `errorForeground` | `额度严重不足` |
| Failed | `error` | `errorForeground` | `获取失败` |
| Stale | `history` | `descriptionForeground` | `数据已过期` |
| Unconfigured | `circle-outline` | `descriptionForeground` | `未配置` |

Detail rows use neutral theme foregrounds except when a quota value crosses an existing warning or
critical threshold. The three threshold states are the existing `quotaTone` states: positive,
warning, and critical. Credentials, cookies, raw response bodies, and request headers are
never included in labels, descriptions, or tooltips.

## 8. Extension integration

`src/extension.ts` creates the tree data provider and registers one tree view with:

```text
vscode.window.createTreeView('quotaDeck.overview', ...)
```

The tree view and its subscriptions are added to the extension context. The provider is updated in
the same places as the status bar and dashboard so all three surfaces show the same snapshot.

The existing `quotaDeck.openDashboard` command remains the only route to the editor-panel dashboard.
The Activity Bar tree does not introduce a second dashboard lifecycle or message protocol.

## 9. Localization and packaging

New user-visible strings are added to:

- `src/localization/messages.ts`;
- `src/localization/zh-cn.ts`;
- `src/localization/en-us.ts`;
- `package.nls.json`;
- `package.nls.zh-cn.json`.

Manifest keys cover the Activity Bar container title, tree view name, settings title, and any
settings-command title. Runtime labels such as configuration, status states, provider names, quota
windows, and settings actions come from the existing translator.

`package.json` contributes the Activity Bar container, tree view, commands, title actions, and
activity SVG. `media/activity-bar.svg` is included in the packaged extension.

## 10. Error handling

- A tree item is still returned for a known provider whose capability fetch failed.
- The failed item uses the existing normalized error message; no raw error payload is shown.
- A stale capability remains visible with `数据已过期`.
- Missing optional values are omitted.
- Missing required configuration routes to `quotaDeck.configureProviders`.
- A disappearing provider or value updates the tree without throwing from `getChildren()`.
- No error path creates a fake zero balance or zero percentage.

## 11. Testing

Tests cover:

1. The pure overview model preserves provider order and configured-provider filtering.
2. Collapsed summaries match MiniMax, DeepSeek, and Qwen snapshot values.
3. MiniMax detail rows show remaining, used, Chinese video naming, points, and expiry.
4. DeepSeek and Qwen rows preserve currencies and account fields without summing currencies.
5. Empty, partial, stale, unsupported, and failed states return actionable items.
6. Provider items use `quotaDeck.openDashboard`; the empty item uses
   `quotaDeck.configureProviders`.
7. Tree updates fire after cached load, refresh completion, settings changes, and credential
   changes.
8. Extension activation registers `quotaDeck.overview` and disposes its view.
9. `quotaDeck.openSettings` opens the extension-scoped Settings editor.
10. The activity SVG exists, uses `currentColor`, and contains no scripts or external URLs.
11. Manifest and localization keys remain valid, and `@ext:alexmultiagent.quota-deck` is the
    settings query.

The VS Code test mock gains only the APIs required by the tree view and its items.

## 12. Verification

The completed feature is verified with:

```text
npm test
npm run typecheck
npm run build
npm run check:locales
npm run guard:fixtures
npm run package
```

Manual VS Code verification covers:

1. The Activity Bar icon is visible and legible in a dark and a light theme.
2. Selecting the icon reveals the overview without opening the dashboard.
3. Provider rows expand, collapse, and open the full dashboard by keyboard and mouse.
4. Refresh and settings title actions work.
5. An unconfigured installation shows the configuration action.
6. The packaged extension contains the SVG and the contributed view.

## 13. Acceptance criteria

1. QuotaDeck appears as a first-class Activity Bar container.
2. The icon follows the active VS Code theme.
3. Selecting the icon opens a provider overview driven by the same coordinator snapshots as the
   status bar and dashboard.
4. Configured providers expand to show current quota, balance, and reset details.
5. Clicking a provider opens the existing full dashboard.
6. Refresh, open-dashboard, and settings title actions are present.
7. No provider is configured: the view offers the configuration command.
8. No credential or raw provider payload appears in the view.
9. All automated verification commands pass.
10. The packaged `.vsix` contains the manifest contribution and `media/activity-bar.svg`.
