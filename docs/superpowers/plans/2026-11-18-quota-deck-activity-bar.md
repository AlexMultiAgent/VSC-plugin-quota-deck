# QuotaDeck CN Activity Bar Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native QuotaDeck Activity Bar entry that opens an expandable quota overview and exposes refresh, dashboard, and extension-settings actions.

**Architecture:** A contributed tree view renders a pure provider-neutral overview model built from existing coordinator snapshots. A small `TreeDataProvider` maps that model to native `TreeItem` nodes, while the extension host updates it alongside the status bar and dashboard.

**Tech Stack:** TypeScript, VS Code Extension API, native TreeView, Vitest, esbuild, VS Code manifest contributions, static monochrome SVG.

**Spec:** `docs/superpowers/specs/2026-11-18-quota-deck-activity-bar-design.md`

## Global Constraints

- Preserve the existing uncommitted tooltip changes. Stage only files named by the current task.
- Never add credentials, cookies, request headers, or raw provider payloads to tree data.
- Use existing `ProviderSnapshot`, `capabilityValue`, `formatMoney`, `pickTightestWindow`, `quotaTone`, provider display helpers, and pricing labels.
- Never replace missing or failed data with a fabricated zero.
- Provider order follows `quotaDeck.statusBar.providerOrder`.
- The tree view id is exactly `quotaDeck.overview`; the Activity Bar container id is exactly `quotaDeck`.
- The settings command is exactly `quotaDeck.openSettings` and opens `@ext:alexmultiagent.quota-deck`.
- Activity Bar artwork is a 24 x 24 monochrome SVG using `currentColor`, with no scripts or external URLs.
- Every production change follows red-green-refactor: write the test, watch it fail, implement, then rerun.

---

### Task 1: Manifest Contributions and Activity Bar Icon

**Files:**
- Create: `media/activity-bar.svg`
- Create: `scripts/activity-bar.test.ts`
- Modify: `package.json`
- Modify: `package.nls.json`
- Modify: `package.nls.zh-cn.json`

**Interfaces:**
- Consumes: the existing extension id `alexmultiagent.quota-deck` and command ids.
- Produces: Activity Bar container `quotaDeck`, tree view `quotaDeck.overview`, command `quotaDeck.openSettings`, and `media/activity-bar.svg`.

- [ ] **Step 1: Write the failing manifest and SVG contract test**

Create `scripts/activity-bar.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  contributes: {
    commands: Array<{ command: string; icon?: string }>;
    viewsContainers: { activitybar: Array<{ id: string; title: string; icon: string }> };
    views: Record<string, Array<{ id: string; name: string }>>;
    menus: { 'view/title': Array<{ command: string; when: string }> };
  };
};

describe('Activity Bar contribution', () => {
  it('registers the QuotaDeck overview container and view', () => {
    expect(manifest.contributes.viewsContainers.activitybar).toContainEqual({
      id: 'quotaDeck',
      title: '%viewsContainer.quotaDeck.title%',
      icon: 'media/activity-bar.svg',
    });
    expect(manifest.contributes.views.quotaDeck).toContainEqual({
      id: 'quotaDeck.overview',
      name: '%view.quotaDeck.overview.name%',
    });
  });

  it('registers refresh, dashboard, and settings title actions', () => {
    const actions = manifest.contributes.menus['view/title']
      .filter((entry) => entry.when === 'view == quotaDeck.overview')
      .map((entry) => entry.command);
    expect(actions).toEqual([
      'quotaDeck.refresh',
      'quotaDeck.openDashboard',
      'quotaDeck.openSettings',
    ]);
    expect(
      manifest.contributes.commands.find(
        (entry) => entry.command === 'quotaDeck.openSettings',
      )?.icon,
    ).toBe('$(gear)');
  });

  it('ships a theme-aware SVG without executable or external content', () => {
    const svg = readFileSync(resolve(root, 'media/activity-bar.svg'), 'utf8');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('currentColor');
    expect(svg).not.toMatch(/<script\b|https?:|\bfile:/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/activity-bar.test.ts`

Expected: FAIL because `viewsContainers.activitybar` and `media/activity-bar.svg` do not exist.

- [ ] **Step 3: Add manifest contributions and localization**

In `package.json`, add `$(gear)` as the `icon` for a new command:

```json
{
  "command": "quotaDeck.openSettings",
  "title": "%command.openSettings.title%",
  "category": "QuotaDeck CN",
  "icon": "$(gear)"
}
```

Add `$(refresh)` to `quotaDeck.refresh` and `$(open-preview)` to
`quotaDeck.openDashboard`.

Add these contribution blocks:

```json
"viewsContainers": {
  "activitybar": [
    {
      "id": "quotaDeck",
      "title": "%viewsContainer.quotaDeck.title%",
      "icon": "media/activity-bar.svg"
    }
  ]
},
"views": {
  "quotaDeck": [
    {
      "id": "quotaDeck.overview",
      "name": "%view.quotaDeck.overview.name%"
    }
  ]
}
```

In `contributes.menus`, append:

```json
"view/title": [
  {
    "command": "quotaDeck.refresh",
    "when": "view == quotaDeck.overview",
    "group": "navigation@1"
  },
  {
    "command": "quotaDeck.openDashboard",
    "when": "view == quotaDeck.overview",
    "group": "navigation@2"
  },
  {
    "command": "quotaDeck.openSettings",
    "when": "view == quotaDeck.overview",
    "group": "navigation@3"
  }
]
```

Add `quotaDeck.openSettings` to the command palette menu.

Add identical keys to both package locale files:

```json
"viewsContainer.quotaDeck.title": "QuotaDeck CN",
"view.quotaDeck.overview.name": "Quota overview",
"command.openSettings.title": "Extension Settings"
```

Use `额度概览` and `插件设置` for the Chinese view and command titles.

- [ ] **Step 4: Add the monochrome gauge SVG**

Create `media/activity-bar.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M4.25 17.5a8.5 8.5 0 1 1 15.5 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M12 4.25v2.1M5.95 8.6l1.5 1.5M18.05 8.6l-1.5 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M12 16.1 16.05 11.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="12" cy="16.1" r="1.55" fill="currentColor"/>
</svg>
```

- [ ] **Step 5: Run focused and package-manifest checks**

Run:

```powershell
npx vitest run scripts/activity-bar.test.ts
npm run check:locales
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit only Task 1 files**

```powershell
git add media/activity-bar.svg scripts/activity-bar.test.ts package.json package.nls.json package.nls.zh-cn.json
git commit -m "feat: contribute the quota overview activity entry"
```

---

### Task 2: Pure Overview Model

**Files:**
- Create: `src/presentation/overview/model.ts`
- Create: `src/presentation/overview/model.test.ts`
- Modify: `src/localization/messages.ts`
- Modify: `src/localization/zh-cn.ts`
- Modify: `src/localization/en-us.ts`

**Interfaces:**
- Consumes:

```ts
buildOverviewItems({
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>;
  configured: Partial<Record<ProviderId, boolean>>;
  order: ProviderId[];
  t: Translator;
  pricing: PricingState;
  timeZone: string;
  warningThresholdPercent: number;
  lastRefreshIso?: string;
}): OverviewItem[]
```

- Produces:

```ts
export type OverviewState =
  | 'positive' | 'caution' | 'warning' | 'critical'
  | 'failed' | 'stale' | 'muted';

export type OverviewAction =
  | { readonly kind: 'openDashboard'; readonly title: string }
  | { readonly kind: 'configureProviders'; readonly title: string };

export interface OverviewItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly tooltip: string;
  readonly state: OverviewState;
  readonly stateLabel: string;
  readonly action: OverviewAction | null;
  readonly children: readonly OverviewItem[];
}
```

- [ ] **Step 1: Write failing provider-model tests**

Create `src/presentation/overview/model.test.ts` with these cases:

```ts
import { describe, expect, it } from 'vitest';
import { translatorFor } from '../../localization';
import { makeSnapshot } from '../../test/helpers/snapshot';
import { buildOverviewItems } from './model';

const zh = translatorFor('zh-CN');
const t = translatorFor('en-US');

describe('buildOverviewItems', () => {
  it('summarizes and expands MiniMax without losing used values', () => {
    const items = buildOverviewItems({
      snapshots: {
        'minimax-cn': makeSnapshot('minimax-cn', {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              windows: [
                { window: 'fiveHour', remainingPercent: 100, resetAt: null, unlimited: false },
                { window: 'weekly', remainingPercent: 22, resetAt: null, unlimited: false },
              ],
              models: [{ model: 'video', remaining: 3, total: 3 }],
            },
          },
          'minimax.points': { kind: 'ok', fetchedAt: 'x', data: { balance: 6850, expiresAt: null } },
          'minimax.subscription': {
            kind: 'ok',
            fetchedAt: 'x',
            data: { expiresAt: Date.parse('2027-07-05T00:00:00Z'), planName: null },
          },
        }),
      },
      configured: { 'minimax-cn': true },
      order: ['minimax-cn'],
      t: zh,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });

    expect(items[0]?.label).toBe('MiniMax CN');
    expect(items[0]?.description).toBe('每周 22%');
    expect(items[0]?.action?.kind).toBe('openDashboard');
    expect(items[0]?.children.map((item) => item.label)).toEqual([
      '5 小时', '每周', '视频', '积分余额', '到期',
    ]);
    expect(items[0]?.children[0]?.description).toBe('剩余 100% · 已使用 0%');
    expect(items[0]?.children[1]?.description).toBe('剩余 22% · 已使用 78%');
    expect(items[0]?.children[2]?.description).toBe('剩余 3/3 次 · 已使用 0 次');
  });

  it('preserves provider order and separate DeepSeek currency balances', () => {
    const items = buildOverviewItems({
      snapshots: {
        deepseek: makeSnapshot('deepseek', {
          'deepseek.balance': {
            kind: 'ok',
            fetchedAt: 'x',
            data: { entries: [
              { currency: 'USD', total: 2, granted: 0, toppedUp: 2 },
              { currency: 'CNY', total: 13.69, granted: 0, toppedUp: 13.69 },
            ] },
          },
        }),
        qwen: makeSnapshot('qwen', {
          'qwen.accountBalance': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              availableAmount: 1.25, availableCashAmount: 0.5, creditAmount: 0.75,
              mybankCreditAmount: 0, quotaLimit: 100, currency: 'CNY',
            },
          },
        }),
      },
      configured: { deepseek: true, qwen: true },
      order: ['qwen', 'deepseek'],
      t,
      pricing: 'peak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });

    expect(items.map((item) => item.label)).toEqual(['Qwen', 'DeepSeek']);
    expect(items[0]?.description).toBe('¥1.25 CNY');
    expect(items[1]?.description).toBe('CNY ¥13.69');
    expect(items[1]?.children.filter((item) => item.id.includes(':balance:')))
      .toHaveLength(2);
    expect(items[1]?.children.find((item) => item.label === 'Peak')?.description).toBe('Peak');
  });

  it('offers configuration when no provider is configured', () => {
    const items = buildOverviewItems({
      snapshots: {},
      configured: {},
      order: ['minimax-cn', 'deepseek', 'qwen'],
      t: zh,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe('配置服务商');
    expect(items[0]?.action?.kind).toBe('configureProviders');
  });

  it('keeps stale and failed states explicit', () => {
    const items = buildOverviewItems({
      snapshots: {
        deepseek: makeSnapshot('deepseek', {
          'deepseek.balance': {
            kind: 'stale',
            fetchedAt: 'x',
            data: { entries: [{ currency: 'CNY', total: 8, granted: 0, toppedUp: 8 }] },
            reason: 'old',
          },
        }),
        qwen: makeSnapshot('qwen', {
          'qwen.accountBalance': {
            kind: 'failed',
            error: { kind: 'network', message: 'error.network' },
          },
        }),
      },
      configured: { deepseek: true, qwen: true },
      order: ['deepseek', 'qwen'],
      t: zh,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });
    expect(items[0]?.state).toBe('stale');
    expect(items[0]?.stateLabel).toBe('数据已过期');
    expect(items[1]?.state).toBe('failed');
    expect(items[1]?.stateLabel).toBe('获取失败');
  });

  it('does not invent unsupported optional values', () => {
    const items = buildOverviewItems({
      snapshots: {
        qwen: makeSnapshot('qwen', {
          'qwen.accountBalance': {
            kind: 'unsupported',
            reason: 'not integrated',
          },
        }),
      },
      configured: { qwen: true },
      order: ['qwen'],
      t: zh,
      pricing: 'offPeak',
      timeZone: 'Asia/Shanghai',
      warningThresholdPercent: 20,
    });
    expect(items[0]?.state).toBe('muted');
    expect(items[0]?.stateLabel).toBe('不支持');
    expect(items[0]?.description).toBe('');
    expect(items[0]?.children).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the model test to verify it fails**

Run: `npx vitest run src/presentation/overview/model.test.ts`

Expected: FAIL because `./model` does not exist.

- [ ] **Step 3: Add the runtime status strings**

Add these keys to all three runtime localization files:

```ts
'overview.state.caution': 'Caution',
'overview.state.warning': 'Low quota',
'overview.state.critical': 'Critically low',
'overview.state.loading': 'Loading',
```

Use `注意`, `额度偏低`, `额度严重不足`, and `正在读取` in `messages.ts` and
`zh-cn.ts`.

- [ ] **Step 4: Implement the pure model**

In `src/presentation/overview/model.ts`, define the exported types from the Interfaces block and
use this state mapping:

```ts
const TONE_STATE: Record<QuotaTone, OverviewState> = {
  positive: 'positive',
  caution: 'caution',
  warning: 'warning',
  critical: 'critical',
};

const TONE_LABEL: Record<QuotaTone, MessageKey> = {
  positive: 'state.ok',
  caution: 'overview.state.caution',
  warning: 'overview.state.warning',
  critical: 'overview.state.critical',
};
```

Implement provider dispatch with these exact responsibilities:

```ts
export function buildOverviewItems(options: OverviewOptions): OverviewItem[] {
  const selected = options.order.filter((id) => options.configured[id] === true);
  if (selected.length === 0) {
    return [{
      id: 'configure',
      label: options.t('dashboard.configureProviders'),
      description: '',
      tooltip: options.t('dashboard.configureProviders'),
      state: 'muted',
      stateLabel: options.t('state.unconfigured'),
      action: {
        kind: 'configureProviders',
        title: options.t('dashboard.configureProviders'),
      },
      children: [],
    }];
  }
  return selected.map((id) => providerItem(id, options));
}
```

`providerItem` calls one of `miniMaxItem`, `deepSeekItem`, or `qwenItem`. Each builder:

1. Reads only through `capabilityValue`.
2. Detects the primary capability's `failed`, `stale`, or `unsupported` state.
3. Uses a numeric summary only when a usable value exists.
4. Gives every provider `action.kind = 'openDashboard'`.
5. Appends `tooltip.updated` plus a minute-formatted `lastRefreshIso` when supplied.

Use existing labels for remaining, used, time units, video, points, expiry, balance, peak, and
off-peak. Format reset and update instants with `zonedParts()` from `src/core/time.ts` as
`YYYY-MM-DD HH:mm`. Use `quotaTone(percent, warningThresholdPercent)` for MiniMax window severity.

For DeepSeek, create one child for every balance entry and one pricing-period child:

```ts
id: `provider:deepseek:balance:${entry.currency}`,
label: entry.currency,
description: formatMoney(entry.total, entry.currency),
```

For Qwen, create only rows whose source value exists:

```ts
availableAmount, availableCashAmount, creditAmount, mybankCreditAmount, quotaLimit
```

Their labels are the existing `dashboard.qwen.*` strings and all use the reported currency.

- [ ] **Step 5: Run model, localization, and type checks**

Run:

```powershell
npx vitest run src/presentation/overview/model.test.ts
npm run check:locales
npm run typecheck
```

Expected: all exit 0.

- [ ] **Step 6: Commit only Task 2 files**

```powershell
git add src/presentation/overview/model.ts src/presentation/overview/model.test.ts src/localization/messages.ts src/localization/zh-cn.ts src/localization/en-us.ts
git commit -m "feat: build the quota overview model"
```

---

### Task 3: Native Tree Data Provider

**Files:**
- Create: `src/presentation/overview/provider.ts`
- Create: `src/presentation/overview/provider.test.ts`
- Modify: `src/test/__mocks__/vscode.ts`

**Interfaces:**
- Consumes: `OverviewItem` and `OverviewState` from Task 2.
- Produces:

```ts
export class QuotaOverviewProvider implements vscode.TreeDataProvider<OverviewItem> {
  readonly onDidChangeTreeData: vscode.Event<void | OverviewItem | null | undefined>;
  update(items: readonly OverviewItem[]): void;
  getTreeItem(element: OverviewItem): vscode.TreeItem;
  getChildren(element?: OverviewItem): OverviewItem[];
  dispose(): void;
}
```

- [ ] **Step 1: Extend the VS Code mock for tree primitives**

Add `TreeItem`, `TreeItemCollapsibleState`, `ThemeIcon`, `TreeDataProvider`, `TreeView`, and
`window.createTreeView`. Record created views and retain the provider:

```ts
export class TreeItem {
  id: string | undefined;
  description: string | vscode.MarkdownString | undefined;
  tooltip: string | vscode.MarkdownString | undefined;
  iconPath: ThemeIcon | undefined;
  command: { command: string; title: string } | undefined;
  contextValue: string | undefined;
  constructor(
    public label: string,
    public collapsibleState: number,
  ) {}
}
```

`createTreeView` returns a disposable object and stores `{ viewId, treeDataProvider, options }` in
`state.treeViews`. Reset that array in `__reset()`.

- [ ] **Step 2: Write failing provider tests**

Create `src/presentation/overview/provider.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeColor, __reset } from '../../test/__mocks__/vscode';
import { QuotaOverviewProvider } from './provider';
import type { OverviewItem } from './model';

const leaf: OverviewItem = {
  id: 'provider:minimax-cn:window:fiveHour',
  label: '5 小时',
  description: '剩余 100% · 已使用 0%',
  tooltip: '5 小时\n剩余 100%',
  state: 'positive',
  stateLabel: '正常',
  action: null,
  children: [],
};

const provider: OverviewItem = {
  id: 'provider:minimax-cn',
  label: 'MiniMax CN',
  description: '每周 22%',
  tooltip: 'MiniMax CN',
  state: 'warning',
  stateLabel: '额度偏低',
  action: { kind: 'openDashboard', title: 'Open Dashboard' },
  children: [leaf],
};

describe('QuotaOverviewProvider', () => {
  beforeEach(() => __reset());

  it('maps item state, hierarchy, and provider click action', () => {
    const tree = new QuotaOverviewProvider();
    tree.update([provider]);
    const node = tree.getTreeItem(tree.getChildren()[0]!);
    expect(node.collapsibleState).toBe(1);
    expect(node.command).toEqual({
      command: 'quotaDeck.openDashboard',
      title: 'Open Dashboard',
    });
    expect(node.iconPath).toEqual(
      expect.objectContaining({ id: 'warning' }),
    );
    expect(node.iconPath?.color).toEqual(expect.objectContaining({ id: 'charts.orange' }));
    expect(tree.getChildren(provider)[0]).toBe(leaf);
  });

  it('maps the empty configuration action to its command', () => {
    const tree = new QuotaOverviewProvider();
    const configure: OverviewItem = {
      ...provider,
      id: 'configure',
      label: '配置服务商',
      state: 'muted',
      action: { kind: 'configureProviders', title: '配置服务商' },
      children: [],
    };
    tree.update([configure]);
    expect(tree.getTreeItem(configure).command).toEqual({
      command: 'quotaDeck.configureProviders',
      title: '配置服务商',
    });
  });

  it('fires a change event on update', () => {
    const tree = new QuotaOverviewProvider();
    const listener = vi.fn();
    tree.onDidChangeTreeData(listener);
    tree.update([provider]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the provider test to verify it fails**

Run: `npx vitest run src/presentation/overview/provider.test.ts`

Expected: FAIL because `QuotaOverviewProvider` does not exist.

- [ ] **Step 4: Implement the provider**

Map states exactly:

```ts
const STATE_ICON: Record<OverviewState, { icon: string; color: string }> = {
  positive: { icon: 'circle-filled', color: 'charts.green' },
  caution: { icon: 'info', color: 'charts.yellow' },
  warning: { icon: 'warning', color: 'charts.orange' },
  critical: { icon: 'error', color: 'errorForeground' },
  failed: { icon: 'error', color: 'errorForeground' },
  stale: { icon: 'history', color: 'descriptionForeground' },
  muted: { icon: 'circle-outline', color: 'descriptionForeground' },
};
```

Create a `TreeItem` for each model item, set `id`, `description`, `tooltip`, `iconPath`, and
`collapsibleState`. Use `vscode.TreeItemCollapsibleState.None` for empty children and
`.Collapsed` otherwise. Map actions to:

```ts
openDashboard -> quotaDeck.openDashboard
configureProviders -> quotaDeck.configureProviders
```

`getChildren()` returns the root items when called without an element and the element's children
otherwise. `update()` replaces the item list and fires the `EventEmitter`.

- [ ] **Step 5: Run provider and mock-adjacent tests**

Run:

```powershell
npx vitest run src/presentation/overview/provider.test.ts
npm run typecheck
```

Expected: all exit 0.

- [ ] **Step 6: Commit only Task 3 files**

```powershell
git add src/presentation/overview/provider.ts src/presentation/overview/provider.test.ts src/test/__mocks__/vscode.ts
git commit -m "feat: add the quota overview tree provider"
```

---

### Task 4: Settings Command and Extension Wiring

**Files:**
- Modify: `src/presentation/commands.ts`
- Modify: `src/presentation/commands.test.ts`
- Modify: `src/extension.ts`
- Modify: `src/extension.test.ts`

**Interfaces:**
- Consumes: `buildOverviewItems()`, `QuotaOverviewProvider`, and existing command handlers.
- Produces: registered tree view `quotaDeck.overview`, live updates after every refresh, and command `quotaDeck.openSettings`.

- [ ] **Step 1: Write failing command tests**

Extend every `CommandHandlers` object in `src/presentation/commands.test.ts` with:

```ts
openSettings: async () => undefined,
```

Expect `quotaDeck.openSettings` in the registered command list. Add a focused test that invokes
the registered command and observes the supplied handler:

```ts
it('registers the settings handler', async () => {
  let calls = 0;
  registerCommands({
    refresh: async () => undefined,
    openDashboard: async () => undefined,
    switchProvider: async () => undefined,
    configureMiniMax: async () => undefined,
    configureDeepSeek: async () => undefined,
    configureQwen: async () => undefined,
    configureProviders: async () => undefined,
    showHelp: async () => undefined,
    openSettings: async () => {
      calls += 1;
    },
  });
  await state.registeredCommands.get('quotaDeck.openSettings')!();
  expect(calls).toBe(1);
});
```

- [ ] **Step 2: Run the command test to verify it fails**

Run: `npx vitest run src/presentation/commands.test.ts`

Expected: FAIL because `openSettings` is not a registered command.

- [ ] **Step 3: Implement the settings command**

Add `openSettings(): Promise<void>` to `CommandHandlers`, register
`quotaDeck.openSettings`, and include it in the returned disposables.

In `src/extension.ts`, provide:

```ts
openSettings: async () => {
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    '@ext:alexmultiagent.quota-deck',
  );
},
```

- [ ] **Step 4: Write a failing extension integration test**

Add to `src/extension.test.ts`:

```ts
it('creates the overview tree and updates it with the cached snapshot state', async () => {
  const ctx = context();
  await activate(ctx as never);
  const view = state.treeViews.find((entry) => entry.viewId === 'quotaDeck.overview');
  expect(view).toBeDefined();
  expect(view?.options.showCollapseAll).toBe(true);
  expect(view?.options.canSelectMany).toBe(false);
  const provider = view?.treeDataProvider as {
    getChildren(): unknown[];
  };
  expect(provider.getChildren()).toHaveLength(1);
});

it('opens the extension-scoped Settings editor', async () => {
  const vscodeModule = await import('vscode');
  const execute = vi.spyOn(vscodeModule.commands, 'executeCommand');
  const ctx = context();
  await activate(ctx as never);

  await state.registeredCommands.get('quotaDeck.openSettings')!();

  expect(execute).toHaveBeenCalledWith(
    'workbench.action.openSettings',
    '@ext:alexmultiagent.quota-deck',
  );
});
```

- [ ] **Step 5: Run the extension test to verify it fails**

Run: `npx vitest run src/extension.test.ts -t "creates the overview tree"`

Expected: the tree assertion fails because activation does not create `quotaDeck.overview`;
the settings assertion fails because the command is not registered.

- [ ] **Step 6: Wire the overview into activation**

Create the provider and view near the status bar:

```ts
const overview = new QuotaOverviewProvider();
const overviewView = vscode.window.createTreeView('quotaDeck.overview', {
  treeDataProvider: overview,
  canSelectMany: false,
  showCollapseAll: true,
});
```

Add both to `context.subscriptions`.

Add a helper:

```ts
function updateOverview(
  snapshots = coordinator.getLast(),
  pricing: PricingState = pricingState(Date.now()),
): void {
  overview.update(buildOverviewItems({
    snapshots,
    configured: configuredProviders(),
    order: settings.providerOrder,
    t,
    pricing,
    timeZone: settings.timeZone,
    warningThresholdPercent: settings.warningThresholdPercent,
    lastRefreshIso,
  }));
}
```

Call it:

- after cached snapshots are loaded and before `refreshAll()`;
- after `lastRefreshIso` is set in `refreshAll()`;
- configuration changes already call `refreshAll()`, so they inherit the update.

Do not create a second refresh path.

- [ ] **Step 7: Run integration, command, model, and provider suites**

Run:

```powershell
npx vitest run src/presentation/commands.test.ts src/presentation/overview/model.test.ts src/presentation/overview/provider.test.ts src/extension.test.ts
npm run typecheck
```

Expected: all exit 0.

- [ ] **Step 8: Commit only Task 4 files**

```powershell
git add src/presentation/commands.ts src/presentation/commands.test.ts src/extension.ts src/extension.test.ts
git commit -m "feat: wire the quota overview into the extension"
```

---

### Task 5: Documentation and Packaged Artifact Verification

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `scripts/guard-package.mjs`
- Create: `scripts/package-contents.mjs`
- Modify: `scripts/guard-package.test.ts` if present; otherwise create `scripts/guard-package.test.ts`

**Interfaces:**
- Consumes: the completed manifest, icon, model, provider, and extension wiring.
- Produces: user-facing documentation and a package guard that proves the Activity Bar SVG ships.

- [ ] **Step 1: Write a failing package-guard test**

Create or extend `scripts/guard-package.test.ts` so it loads an `activityIconFailure(entries)`
helper from the side-effect-free `scripts/package-contents.mjs` module:

```ts
import { describe, expect, it } from 'vitest';
import { activityIconFailure } from './package-contents.mjs';

describe('activity icon packaging', () => {
  it('accepts a packaged Activity Bar SVG', () => {
    expect(activityIconFailure([
      'dist/extension.js',
      'media/activity-bar.svg',
      'package.json',
    ])).toBeUndefined();
  });

  it('rejects a package that omits the Activity Bar SVG', () => {
    expect(activityIconFailure(['dist/extension.js', 'package.json']))
      .toBe('media/activity-bar.svg is not shipped');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/guard-package.test.ts`

Expected: FAIL because `activityIconFailure` is not exported.

- [ ] **Step 3: Implement the package guard**

Create `scripts/package-contents.mjs` and export:

```js
export function activityIconFailure(entries) {
  return entries.includes('media/activity-bar.svg')
    ? undefined
    : 'media/activity-bar.svg is not shipped';
}
```

Import it in `scripts/guard-package.mjs`. Keeping the pure helper in a separate module prevents
the test from executing the guard's CLI and `vsce ls` side effects. After `vsce ls` returns
`shipped`, add:

```js
const activityFailure = activityIconFailure(shipped);
if (activityFailure !== undefined) offenders.push(activityFailure);
```

Keep the existing forbidden-entry and secret scans unchanged.

- [ ] **Step 4: Update documentation**

In `README.md` Features, add:

```markdown
- 左侧 Activity Bar 提供额度概览：展开查看各服务商明细，点击服务商打开完整仪表盘；标题栏可刷新、打开仪表盘或进入插件设置。
```

In `CHANGELOG.md`, add an `## Unreleased` section above `## 0.2.2` with:

```markdown
- 新增 VS Code 左侧 Activity Bar 额度概览树视图，支持服务商展开明细、刷新、打开仪表盘和进入原生插件设置。
```

- [ ] **Step 5: Run complete verification**

Run:

```powershell
npm test
npm run typecheck
npm run build
npm run check:locales
npm run guard:fixtures
npm run package
```

Expected: all commands exit 0. The package guard reports the Activity Bar SVG among shipped files.

- [ ] **Step 6: Commit only Task 5 files**

```powershell
git add README.md CHANGELOG.md scripts/guard-package.mjs scripts/package-contents.mjs scripts/guard-package.test.ts
git commit -m "docs: document the quota overview entry"
```

