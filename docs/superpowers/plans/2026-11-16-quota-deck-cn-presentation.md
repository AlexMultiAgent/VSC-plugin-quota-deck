# QuotaDeck CN — Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the quota in the status bar, in the hover tooltip, and in the optional dashboard — with a validated chart palette, theme-aware rendering, a validated webview message protocol, and a QuickPick fallback for when the webview cannot open.

**Architecture:** The presentation layer consumes only `ProviderSnapshot` objects and never sees a provider endpoint, a secret, or a raw payload. The status bar and tooltip are pure functions over a snapshot map, so they are unit-tested without VS Code. The dashboard is a singleton webview panel: the extension host builds a plain view model, sends it over a validated message protocol, and the webview renders it with hand-written SVG charts. All chart colours come from the validated palette recorded in the design spec.

**Tech Stack:** TypeScript 5.6, Vitest 2.x, the VS Code `MarkdownString` hover API, a `WebviewPanel` with a nonce CSP, and inline SVG charts written by hand with no chart dependency.

**Prerequisite:** `2026-11-16-quota-deck-cn-providers.md` must be complete.

**Spec:** `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md` §7 and §8

---

## Design rules this plan implements

| Rule | Source |
| --- | --- |
| Provider accents: MiniMax teal `#1baf7a`/`#199e70`, DeepSeek blue `#2a78d6`/`#3987e5`, Qwen orange `#eb6834`/`#d95926` | spec §8, validated all-pairs in both modes |
| Chart series: blue, orange, aqua — the validated three-slot categorical set | spec §8 |
| Status colours are reserved and always ship with an icon and a label | spec §8 |
| A quota card is a meter; a headline number is a stat tile; a model breakdown is a table | spec §8 |
| One filter row above the charts; every chart has a table-view twin | spec §8 |
| Marks: 2px lines, 4px rounded data-ends, 8px markers, 2px surface gaps and rings, solid hairline grid | spec §8 |
| Text never wears a series colour | spec §8 |
| A provider accent is never the only carrier of identity | spec §8 |

---

## File Structure

```text
src/presentation/
  statusBar.ts              status bar item and text rendering
  statusBar.test.ts
  labels.ts                 shared localized labels for the ranges and capabilities
  tooltip.ts                hover tooltip rendering
  tooltip.test.ts
  quickPickFallback.ts      provider summaries without the webview
  quickPickFallback.test.ts
  dashboard/
    protocol.ts             message types and validation, shared by host and webview
    protocol.test.ts
    viewModel.ts            snapshot map → dashboard view model
    viewModel.test.ts
    charts.ts               pure SVG generation
    charts.test.ts
    panel.ts                extension side: panel lifecycle and message handling
    panel.test.ts
    webview/
      env.d.ts              the acquireVsCodeApi declaration
      main.ts               webview entry point
      render.ts             DOM rendering
```

`protocol.ts`, `viewModel.ts`, and `charts.ts` never import `vscode`. They are plain modules shared by the extension host and the webview bundle, which is what makes them testable without a browser. The six range ids come from `src/core/time.ts`; this plan does not declare a second copy.

The view model is the only place that reads a snapshot. Every string it carries is already localized, so the webview never holds a string table.

The dashboard stylesheet lives inline in `panel.ts` as `DASHBOARD_STYLES`. There is no separate `styles.ts` file.

---

### Task 1: Status bar text

**Files:**

- Modify: `src/presentation/statusBar.ts`
- Modify: `src/presentation/statusBar.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/presentation/statusBar.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { __reset, state } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { makeSnapshot } from '../test/helpers/snapshot';
import { formatBalance, renderStatusBarText, StatusBarPresenter } from './statusBar';

const t = translatorFor('en-US');

describe('formatBalance', () => {
  it('renders CNY with the yuan symbol', () => {
    expect(formatBalance({ currency: 'CNY', amount: 112.8 })).toBe('¥112.80');
  });

  it('renders every other currency with its ISO code', () => {
    expect(formatBalance({ currency: 'USD', amount: 12.3 })).toBe('USD 12.30');
  });

  it('renders a dash for an absent balance', () => {
    expect(formatBalance(undefined)).toBe('—');
  });
});

describe('renderStatusBarText', () => {
  beforeEach(() => __reset());

  it('shows the title and the provider segments', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'deepseek'], t);
    expect(text).toContain('QuotaDeck CN');
    expect(text).toContain('MM');
    expect(text).toContain('DS');
  });

  it('shows only the primary provider in focused mode', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'deepseek'], t, 'focused', 'deepseek');
    expect(text).toContain('DS');
    expect(text).not.toContain('MM');
  });

  it('marks an unconfigured provider as not configured', () => {
    const text = renderStatusBarText({}, ['qwen'], t);
    expect(text).toContain('Not configured');
  });

  it('renders the remaining percentage and the reset countdown', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 42, resetAt: null, unlimited: false }] },
        },
      }),
    };
    const text = renderStatusBarText(snapshots, ['minimax-cn'], t);
    expect(text).toContain('42%');
  });

  it('drops the trailing segments and appends a count', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'], t);
    expect(text).toMatch(/\+\d/);
    expect(text).not.toContain('QW');
  });

  it('keeps at most three segments', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'], t);
    expect(text.split('  ').length).toBeLessThanOrEqual(4);
  });

  it('carries a status icon on every segment', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'deepseek', 'qwen'], t);
    expect(text).toContain('$(circle-slash)');
  });

  it('starts with the pulse codicon', () => {
    expect(renderStatusBarText({}, ['qwen'], t).startsWith('$(pulse)')).toBe(true);
  });
});

describe('StatusBarPresenter', () => {
  beforeEach(() => __reset());

  it('creates exactly one status bar item', () => {
    new StatusBarPresenter(t);
    expect(state.statusBarItems).toHaveLength(1);
  });

  it('opens the dashboard when the item is clicked', () => {
    const presenter = new StatusBarPresenter(t);
    expect(state.statusBarItems[0]!.command).toBe('quotaDeck.openDashboard');
    presenter.dispose();
  });

  it('carries the rich tooltip on the item', () => {
    const presenter = new StatusBarPresenter(t);
    presenter.update({}, ['minimax-cn'], 'all', 'minimax-cn');
    const markdown = new vscode.MarkdownString('<div>hello</div>');
    presenter.setTooltip(markdown);
    const tooltip = state.statusBarItems[0]!.tooltip as { value: string };
    expect(tooltip.value).toContain('hello');
    presenter.dispose();
  });

  it('switches the click command', () => {
    const presenter = new StatusBarPresenter(t);
    presenter.setCommand('quotaDeck.configureMiniMax');
    expect(state.statusBarItems[0]!.command).toBe('quotaDeck.configureMiniMax');
    presenter.dispose();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/statusBar.test.ts`
Expected: FAIL — the presenter has no `formatBalance` export and no `setTooltip` or `setCommand` method.

- [ ] **Step 3: Write the implementation**

```ts
// src/presentation/statusBar.ts
import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { ProviderId, ProviderSnapshot } from '../core/types';
import type { MessageKey } from '../localization/messages';
import { formatCountdown } from '../core/time';

export interface BalanceView {
  readonly currency: string;
  readonly amount: number;
}

const SEGMENT_LABEL: Record<ProviderId, MessageKey> = {
  'minimax-cn': 'statusBar.segment.minimaxCn',
  'minimax-global': 'statusBar.segment.minimaxGlobal',
  deepseek: 'statusBar.segment.deepseek',
  qwen: 'statusBar.segment.qwen',
};

/** CNY first, then USD and EUR, then the remaining currencies by ISO code. */
const BALANCE_PRIORITY = ['CNY', 'USD', 'EUR'];

export function formatBalance(balance: BalanceView | undefined): string {
  if (balance === undefined) return '—';
  if (balance.currency === 'CNY') return `¥${balance.amount.toFixed(2)}`;
  return `${balance.currency} ${balance.amount.toFixed(2)}`;
}

/**
 * The provider emits `number | null`, never `undefined`. A null percentage
 * means "not available", which is never rendered as zero.
 */
interface MiniMaxWindowView {
  readonly window: string;
  readonly remainingPercent: number | null;
  readonly resetAt: number | null;
  readonly unlimited: boolean;
}

function miniMaxWindows(snapshot: ProviderSnapshot | undefined): MiniMaxWindowView[] {
  const state = snapshot?.capabilities['minimax.plan'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { windows?: MiniMaxWindowView[] } | undefined;
  return data?.windows ?? [];
}

function tightestWindow(snapshot: ProviderSnapshot | undefined): MiniMaxWindowView | undefined {
  return miniMaxWindows(snapshot)
    .filter((window) => window.unlimited !== true && window.remainingPercent !== null)
    .sort((a, b) => (a.remainingPercent ?? 0) - (b.remainingPercent ?? 0))[0];
}

function deepSeekBalance(snapshot: ProviderSnapshot | undefined): BalanceView | undefined {
  const state = snapshot?.capabilities['deepseek.balance'];
  if (state === undefined || state.kind !== 'ok') return undefined;
  const data = state.data as { entries?: { currency: string; total: number }[] } | undefined;
  const entries = data?.entries ?? [];
  if (entries.length === 0) return undefined;
  for (const code of BALANCE_PRIORITY) {
    const entry = entries.find((candidate) => candidate.currency === code);
    if (entry !== undefined) return { currency: entry.currency, amount: entry.total };
  }
  const sorted = [...entries].sort((a, b) => a.currency.localeCompare(b.currency));
  return { currency: sorted[0]!.currency, amount: sorted[0]!.total };
}

/**
 * VS Code does not expose the status bar width to an extension, so the number
 * of segments is capped instead. The trailing providers are summarized as
 * `+N` and the dashboard lists them all.
 */
const MAX_STATUS_BAR_SEGMENTS = 3;

/**
 * Every segment carries a status icon, so the state never depends on colour
 * alone.
 */
const STATUS_ICON = {
  positive: '$(check)',
  warning: '$(warning)',
  critical: '$(error)',
  neutral: '$(dashboard)',
  muted: '$(circle-slash)',
} as const;

type StatusTone = keyof typeof STATUS_ICON;

function toneFor(percent: number): StatusTone {
  if (percent <= 10) return 'critical';
  if (percent <= 30) return 'warning';
  return 'positive';
}

export function renderStatusBarText(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  order: ProviderId[],
  t: Translator,
  mode: 'all' | 'focused' = 'all',
  primary: ProviderId = 'minimax-cn',
): string {
  const visible = mode === 'focused' ? [primary] : order;
  if (visible.length === 0) return t('statusBar.noData');

  const segments = visible.map((id) => {
    const label = t(SEGMENT_LABEL[id]);
    const snapshot = snapshots[id];
    if (snapshot === undefined) {
      return `${label} ${STATUS_ICON.muted} ${t('state.unconfigured')}`;
    }

    if (id === 'deepseek') {
      const balance = deepSeekBalance(snapshot);
      return `${label} ${STATUS_ICON.neutral} ${formatBalance(balance)}`;
    }

    const window = tightestWindow(snapshot);
    if (window === undefined) {
      return `${label} ${STATUS_ICON.muted} ${t('state.unconfigured')}`;
    }
    const percent = window.remainingPercent ?? 0;
    const countdown = window.resetAt === null ? '' : ` · ${formatCountdown(window.resetAt - Date.now())}`;
    return `${label} ${STATUS_ICON[toneFor(percent)]} ${Math.round(percent)}%${countdown}`;
  });

  const title = `$(pulse) ${t('statusBar.title')}  `;
  const kept = segments.slice(0, MAX_STATUS_BAR_SEGMENTS);
  const dropped = segments.length - kept.length;

  if (dropped === 0) return `${title}${kept.join('  ')}`;
  return `${title}${kept.join('  ')} +${dropped}`;
}

export class StatusBarPresenter {
  private readonly item: vscode.StatusBarItem;
  private readonly t: Translator;

  constructor(t: Translator) {
    this.t = t;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'quotaDeck.openDashboard';
  }

  update(
    snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
    order: ProviderId[],
    mode: 'all' | 'focused' = 'all',
    primary: ProviderId = 'minimax-cn',
  ): void {
    this.item.text = renderStatusBarText(snapshots, order, this.t, mode, primary);
    this.item.tooltip = this.t('statusBar.tooltip.header');
    this.item.show();
  }

  /**
   * The rich tooltip is a MarkdownString on the status bar item itself, so the
   * hover appears on the item and nowhere else.
   */
  setTooltip(markdown: vscode.MarkdownString): void {
    this.item.tooltip = markdown;
  }

  setCommand(command: string): void {
    this.item.command = command;
  }

  dispose(): void {
    this.item.dispose();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/statusBar.test.ts`
Expected: `15 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/statusBar.ts src/presentation/statusBar.test.ts
git commit -m "feat: render the status bar with per-provider segments and countdowns"
```

---

### Task 2: Hover tooltip

**Files:**

- Create: `src/presentation/labels.ts`
- Create: `src/presentation/tooltip.ts`
- Create: `src/presentation/tooltip.test.ts`

- [ ] **Step 1: Write the shared label helper**

```ts
// src/presentation/labels.ts
import type { Translator } from '../localization';
import type { RangeId } from '../core/time';

/** The localized name of a usage range. */
export function rangeLabel(range: RangeId, t: Translator): string {
  switch (range) {
    case 'today':
      return t('dashboard.range.today');
    case 'yesterday':
      return t('dashboard.range.yesterday');
    case 'last7':
      return t('dashboard.range.last7');
    case 'last30':
      return t('dashboard.range.last30');
    case 'thisMonth':
      return t('dashboard.range.thisMonth');
    case 'lastMonth':
      return t('dashboard.range.lastMonth');
  }
}

/** The localized name of a capability, used by the Qwen matrix. */
export function capabilityLabel(capability: string, t: Translator): string {
  switch (capability) {
    case 'qwen.accountBalance':
      return t('capability.qwen.accountBalance');
    case 'qwen.modelQuota':
      return t('capability.qwen.modelQuota');
    case 'qwen.consumption':
      return t('capability.qwen.consumption');
    case 'qwen.accessKeyValidation':
      return t('capability.qwen.accessKeyValidation');
    default:
      return capability;
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/presentation/tooltip.test.ts
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, renderTooltip } from './tooltip';
import { translatorFor } from '../localization';
import { makeSnapshot } from '../test/helpers/snapshot';

const t = translatorFor('en-US');

describe('escapeHtml', () => {
  it('escapes the characters that could break out of markup', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('escapes an ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
});

describe('renderTooltip', () => {
  it('shows the brand header and the badge', () => {
    const html = renderTooltip({}, [], t);
    expect(html).toContain('QuotaDeck CN');
    expect(html).toContain('CN MODELS');
  });

  it('lists every provider in the given order', () => {
    const html = renderTooltip({}, ['minimax-cn', 'deepseek', 'qwen'], t);
    expect(html.indexOf('MiniMax CN')).toBeLessThan(html.indexOf('DeepSeek'));
    expect(html.indexOf('DeepSeek')).toBeLessThan(html.indexOf('Qwen'));
  });

  it('shows the source badge and the session badge separately', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { entries: [{ currency: 'CNY', total: 112.8, granted: 12.8, toppedUp: 100 }] },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['deepseek'], t);
    expect(html).toContain('Account');
    expect(html).toContain('Web Session');
  });

  it('marks the MiniMax plan as an API-key session, not a web session', () => {
    const html = renderTooltip({}, ['minimax-cn'], t);
    expect(html).toContain('API Key');
  });

  it('shows a progress bar made of block characters', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 60, resetAt: null, unlimited: false }] },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['minimax-cn'], t);
    expect(html).toContain('██████░░░░');
  });

  it('escapes a provider-controlled string', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { entries: [{ currency: '<img src=x onerror=alert(1)>', total: 1 }] },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['deepseek'], t);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('shows the balance rows for a provider that has a balance', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { entries: [{ currency: 'CNY', total: 112.8, granted: 12.8, toppedUp: 100 }] },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['deepseek'], t);
    expect(html).toContain('CNY');
    expect(html).toContain('112.80');
  });

  it('shows the today and the seven day usage totals', () => {
    // The clock is fixed so that the fixture's date is today in Shanghai.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T04:00:00.000Z'));
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.usageAmount': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: {
            rangeId: 'last7',
            points: [
              {
                date: '2026-11-16',
                requests: 3,
                totalTokens: 300,
                cacheHitTokens: 100,
                cacheMissTokens: 50,
                outputTokens: 150,
                cost: 1.5,
                currency: 'CNY',
              },
            ],
            byModel: [],
          },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['deepseek'], t);
    vi.useRealTimers();
    expect(html).toContain('Last 7 days');
    expect(html).toContain('Today');
    expect(html).toContain('cache');
  });

  it('warns when the DeepSeek session expired', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.usageAmount': { kind: 'failed', error: { kind: 'auth', message: 'error.auth' } },
      }),
    };
    const html = renderTooltip(snapshots, ['deepseek'], t);
    expect(html).toContain('session expired');
  });

  it('shows the last refresh time and the dashboard hint in the footer', () => {
    const html = renderTooltip({}, ['qwen'], t, '2026-11-16T04:00:00.000Z');
    expect(html).toContain('2026-11-16 12:00');
    expect(html).toContain('Open the dashboard');
  });

  it('never renders a raw credential', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { entries: [{ currency: 'CNY', total: 1, granted: 0, toppedUp: 0 }] },
        },
      }),
    };
    expect(renderTooltip(snapshots, ['deepseek'], t)).not.toContain('cookie');
  });
});

```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/presentation/tooltip.test.ts`
Expected: FAIL with `Failed to resolve import "./tooltip"`.

- [ ] **Step 4: Write the implementation**

```ts
// src/presentation/tooltip.ts
import type { Translator } from '../localization';
import type { ProviderId, ProviderSnapshot } from '../core/types';
import type { MessageKey } from '../localization/messages';
import { rangeLabel } from './labels';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/**
 * VS Code strips CSS from a hover and the public MarkdownString has no way
 * to attach a stylesheet, so the tooltip leans on tables and on the block
 * characters U+2588 and U+2591 for the progress bars. The class names below
 * document the structure and are what the tests assert against.
 */

const PROVIDER_NAME: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

const REGION: Record<ProviderId, string> = {
  'minimax-cn': 'Domestic',
  'minimax-global': 'International',
  deepseek: '—',
  qwen: '—',
};

/**
 * The session badge describes how the value was reached. MiniMax plan and
 * usage come from the Token Plan Key, which is an API credential; only the
 * points capability uses the browser session.
 */
const SESSION_BADGE: Record<ProviderId, MessageKey> = {
  'minimax-cn': 'session.apiKey',
  'minimax-global': 'session.apiKey',
  deepseek: 'session.webSession',
  qwen: 'session.apiKey',
};

interface WindowView {
  readonly window: string;
  readonly remainingPercent: number | null;
  readonly resetAt: number | null;
  readonly unlimited: boolean;
}

interface BalanceEntry {
  readonly currency: string;
  readonly total: number;
}

interface UsagePoint {
  readonly date: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cacheHitTokens: number;
  readonly cacheMissTokens: number;
  readonly outputTokens: number;
  readonly cost: number;
  readonly currency: string;
}

interface UsageSummary {
  readonly cost: number;
  readonly requests: number;
  readonly tokens: number;
  readonly cacheHitRate: number | null;
}

function windows(snapshot: ProviderSnapshot | undefined): WindowView[] {
  const state = snapshot?.capabilities['minimax.plan'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { windows?: WindowView[] } | undefined;
  return data?.windows ?? [];
}

function balances(snapshot: ProviderSnapshot | undefined): BalanceEntry[] {
  const state = snapshot?.capabilities['deepseek.balance'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { entries?: BalanceEntry[] } | undefined;
  return data?.entries ?? [];
}

function bar(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round((clamped / 100) * 10));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function formatMoney(amount: number, currency: string): string {
  if (currency === 'CNY') return `¥${amount.toFixed(2)}`;
  return `${currency} ${amount.toFixed(2)}`;
}

function shanghaiTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** The Shanghai calendar date of an instant, as `YYYY-MM-DD`. */
function shanghaiDate(instant: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function summarize(points: readonly UsagePoint[]): UsageSummary {
  const cacheHit = points.reduce((sum, point) => sum + point.cacheHitTokens, 0);
  const cacheMiss = points.reduce((sum, point) => sum + point.cacheMissTokens, 0);
  const denominator = cacheHit + cacheMiss;
  return {
    cost: points.reduce((sum, point) => sum + point.cost, 0),
    requests: points.reduce((sum, point) => sum + point.requests, 0),
    tokens: points.reduce((sum, point) => sum + point.totalTokens, 0),
    cacheHitRate: denominator === 0 ? null : cacheHit / denominator,
  };
}

function usageRow(label: string, summary: UsageSummary, currency: string): string {
  const cache =
    summary.cacheHitRate === null ? '' : `cache ${Math.round(summary.cacheHitRate * 100)}%`;
  return (
    `<tr><td>${escapeHtml(label)}</td>` +
    `<td>${escapeHtml(formatMoney(summary.cost, currency))}</td>` +
    `<td>${summary.requests} req · ${summary.tokens} tok</td>` +
    `<td class="t-muted">${escapeHtml(cache)}</td></tr>`
  );
}

/**
 * The usage rows. When the loaded series covers the last seven days it also
 * carries today, so the tooltip can show both without a second request.
 */
function usageRows(snapshot: ProviderSnapshot | undefined, t: Translator): string {
  const state = snapshot?.capabilities['deepseek.usageAmount'];
  if (state === undefined) return '';

  if (state.kind === 'failed') {
    if (state.error.kind === 'auth') {
      return `<tr><td colspan="4" class="t-failed">${escapeHtml(t('dashboard.sessionExpired'))}</td></tr>`;
    }
    return '';
  }
  if (state.kind !== 'ok') return '';

  const data = state.data as { points?: UsagePoint[]; rangeId?: string } | undefined;
  const points = data?.points ?? [];
  if (points.length === 0) return '';

  const currency = points[0]!.currency;
  const rangeId = data?.rangeId ?? 'last7';
  const rows: string[] = [];

  if (rangeId === 'last7') {
    const today = shanghaiDate(Date.now());
    const todayPoints = points.filter((point) => point.date === today);
    if (todayPoints.length > 0) {
      rows.push(usageRow(t('dashboard.range.today'), summarize(todayPoints), currency));
    }
    rows.push(usageRow(t('dashboard.range.last7'), summarize(points), currency));
  } else {
    rows.push(usageRow(rangeLabel(rangeId as Parameters<typeof rangeLabel>[0], t), summarize(points), currency));
  }

  return rows.join('');
}

function providerRows(snapshot: ProviderSnapshot | undefined, t: Translator): string {
  if (snapshot === undefined) {
    return `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.unconfigured'))}</td></tr>`;
  }

  const plan = snapshot.capabilities['minimax.plan'];
  if (plan !== undefined && plan.kind === 'ok') {
    const data = plan.data as { windows?: WindowView[] } | undefined;
    const rows = (data?.windows ?? [])
      .filter((window) => window.remainingPercent !== null)
      .map(
        (window) =>
          `<tr><td>${escapeHtml(window.window === 'weekly' ? 'Weekly' : '5-hour')}</td>` +
          `<td>${bar(window.remainingPercent ?? 0)} ${Math.round(window.remainingPercent ?? 0)}%</td>` +
          `<td class="t-muted">${window.resetAt === null ? '' : new Date(window.resetAt).toISOString().slice(11, 16)}</td>` +
          '<td></td></tr>',
      );
    if (rows.length > 0) return rows.join('');
  }

  const balance = balances(snapshot);
  if (balance.length > 0) {
    const rows = balance
      .map(
        (entry) =>
          `<tr><td>${escapeHtml(entry.currency)}</td>` +
          `<td>${escapeHtml(formatMoney(entry.total, entry.currency))}</td>` +
          '<td class="t-muted">balance</td>' +
          '<td></td></tr>',
      )
      .join('');
    const usage = usageRows(snapshot, t);
    return rows + usage;
  }

  const usage = usageRows(snapshot, t);
  if (usage.length > 0) return usage;

  const failed = Object.values(snapshot.capabilities).find((state) => state.kind === 'failed');
  if (failed !== undefined && failed.kind === 'failed') {
    return `<tr><td colspan="4" class="t-failed">${escapeHtml(t(failed.error.message))}</td></tr>`;
  }

  const unsupported = Object.values(snapshot.capabilities).find((state) => state.kind === 'unsupported');
  if (unsupported !== undefined && unsupported.kind === 'unsupported') {
    return `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.unsupported'))}</td></tr>`;
  }

  return `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.unconfigured'))}</td></tr>`;
}

export function renderTooltip(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  order: ProviderId[],
  t: Translator,
  lastRefreshIso?: string,
): string {
  const cards = order
    .map((id) => {
      const snapshot = snapshots[id];
      const sourceBadge = snapshot === undefined ? '—' : t('source.account');
      const sessionBadge = t(SESSION_BADGE[id]);
      return (
        '<table class="t-card">' +
        `<tr><td class="t-title">${escapeHtml(PROVIDER_NAME[id])}</td>` +
        `<td class="t-muted">${escapeHtml(REGION[id])}</td>` +
        `<td class="t-badge">${escapeHtml(sourceBadge)}</td>` +
        `<td class="t-badge">${escapeHtml(sessionBadge)}</td></tr>` +
        `<tr><td colspan="4">${providerRows(snapshot, t)}</td></tr>` +
        '</table>'
      );
    })
    .join('');

  const footer =
    lastRefreshIso === undefined
      ? ''
      : `${escapeHtml(t('tooltip.updated'))} ${escapeHtml(shanghaiTime(lastRefreshIso))}`;

  return (
    `<div class="t-root">` +
    `<div class="t-header"><span class="t-brand">QuotaDeck CN</span>` +
    `<span class="t-badge">${escapeHtml(t('statusBar.tooltip.badge'))}</span>` +
    `<span class="t-muted">${escapeHtml(t('statusBar.tooltip.header'))}</span></div>` +
    cards +
    `<div class="t-footer"><span class="t-muted">${footer}</span>` +
    `<span class="t-muted">${escapeHtml(t('statusBar.tooltip.footer'))}</span></div>` +
    '</div>'
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/presentation/tooltip.test.ts`
Expected: `13 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/labels.ts src/presentation/tooltip.ts src/presentation/tooltip.test.ts
git commit -m "feat: render the hover tooltip with escaped provider strings"
```

---

### Task 3: Dashboard view model

**Files:**

- Create: `src/presentation/dashboard/viewModel.ts`
- Create: `src/presentation/dashboard/viewModel.test.ts`

The view model is the only place that turns provider snapshots into something
a view can draw. Every label it carries is already localized, so the webview
never needs a translator and never ships a string table.

- [ ] **Step 1: Write the failing test**

```ts
// src/presentation/dashboard/viewModel.test.ts
import { describe, expect, it } from 'vitest';
import { makeSnapshot } from '../../test/helpers/snapshot';
import { translatorFor } from '../../localization';
import { buildDashboardModel, type DashboardOptions } from './viewModel';

const t = translatorFor('en-US');

function options(overrides: Partial<DashboardOptions> = {}): DashboardOptions {
  return {
    snapshots: {},
    order: [],
    t,
    range: 'last7',
    pricing: 'peak',
    ...overrides,
  };
}

describe('buildDashboardModel', () => {
  it('returns one entry per provider in the given order', () => {
    const model = buildDashboardModel(options({ order: ['minimax-cn', 'deepseek'] }));
    expect(model.providers.map((provider) => provider.id)).toEqual(['minimax-cn', 'deepseek']);
  });

  it('marks a provider with no snapshot as not configured', () => {
    const model = buildDashboardModel(options({ order: ['qwen'] }));
    expect(model.providers[0]!.state).toBe('not-configured');
  });

  it('marks a provider whose capabilities all failed as failed', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': { kind: 'failed', error: { kind: 'auth', message: 'error.auth' } },
          }),
        },
      }),
    );
    expect(model.providers[0]!.state).toBe('failed');
  });

  it('marks a provider whose capabilities are all unconfigured as not configured', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': { kind: 'unconfigured', reason: 'missing token plan key' },
          }),
        },
      }),
    );
    expect(model.providers[0]!.state).toBe('not-configured');
  });

  it('exposes the lowest remaining percentage as the hero value', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { windows: [{ window: 'fiveHour', remainingPercent: 42, resetAt: null, unlimited: false }] },
            },
          }),
        },
      }),
    );
    expect(model.hero.value).toBe('42%');
    expect(model.hero.label).toBe('Lowest remaining quota');
  });

  it('shows no hero value when nothing has a percentage', () => {
    const model = buildDashboardModel(options({ order: ['qwen'] }));
    expect(model.hero.value).toBe('—');
  });

  it('never renders a failed capability as a zero percentage', () => {
    const model = buildDashboardModel(
      options({
        order: ['minimax-cn'],
        snapshots: {
          'minimax-cn': makeSnapshot('minimax-cn', {
            'minimax.plan': { kind: 'failed', error: { kind: 'network', message: 'error.network' } },
          }),
        },
      }),
    );
    expect(model.hero.value).not.toBe('0%');
  });

  it('carries both the light and the dark accent for a provider', () => {
    const model = buildDashboardModel(options({ order: ['deepseek'] }));
    expect(model.providers[0]!.accent.light).toBe('#2a78d6');
    expect(model.providers[0]!.accent.dark).toBe('#3987e5');
  });

  it('carries the usage series when the provider returned one', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.usageAmount': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                rangeId: 'last7',
                points: [
                  { date: '2026-11-15', requests: 3, totalTokens: 300, cacheHitTokens: 100, cacheMissTokens: 50, outputTokens: 150, cost: 1.5, currency: 'CNY' },
                  { date: '2026-11-16', requests: 2, totalTokens: 200, cacheHitTokens: 80, cacheMissTokens: 40, outputTokens: 80, cost: 0.5, currency: 'CNY' },
                ],
                byModel: [{ model: 'deepseek-chat', requests: 5, totalTokens: 500, cost: 2, currency: 'CNY' }],
              },
            },
          }),
        },
      }),
    );
    expect(model.usage.available).toBe(true);
    expect(model.usage.categories).toEqual(['2026-11-15', '2026-11-16']);
    expect(model.usage.cost).toEqual([
      { x: '2026-11-15', y: 1.5 },
      { x: '2026-11-16', y: 0.5 },
    ]);
    expect(model.usage.tokenSeries).toHaveLength(3);
    expect(model.usage.byModel).toHaveLength(1);
  });

  it('reports the usage as unavailable when there is none', () => {
    const model = buildDashboardModel(options({ order: ['deepseek'] }));
    expect(model.usage.available).toBe(false);
    expect(model.usage.cost).toEqual([]);
  });

  it('sums the token and cost tiles over the loaded range', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.usageAmount': {
              kind: 'ok',
              fetchedAt: 'x',
              data: {
                rangeId: 'last7',
                points: [
                  { date: '2026-11-15', requests: 3, totalTokens: 300, cacheHitTokens: 100, cacheMissTokens: 50, outputTokens: 150, cost: 1.5, currency: 'CNY' },
                  { date: '2026-11-16', requests: 2, totalTokens: 200, cacheHitTokens: 80, cacheMissTokens: 40, outputTokens: 80, cost: 0.5, currency: 'CNY' },
                ],
                byModel: [],
              },
            },
          }),
        },
      }),
    );
    const tokens = model.tiles.find((tile) => tile.key === 'tokens');
    const cost = model.tiles.find((tile) => tile.key === 'cost');
    expect(tokens!.value).toBe('500');
    expect(cost!.value).toBe('¥2.00');
  });

  it('never adds two currencies together in the balance tile', () => {
    const model = buildDashboardModel(
      options({
        order: ['deepseek'],
        snapshots: {
          deepseek: makeSnapshot('deepseek', {
            'deepseek.balance': {
              kind: 'ok',
              fetchedAt: 'x',
              data: { entries: [{ currency: 'CNY', total: 10 }, { currency: 'USD', total: 20 }] },
            },
          }),
        },
      }),
    );
    const balance = model.tiles.find((tile) => tile.key === 'balance');
    expect(balance!.value).toBe('¥10.00');
    expect(model.balances).toHaveLength(2);
  });

  it('lists the Qwen capability matrix with every row unsupported', () => {
    const model = buildDashboardModel(options({ order: ['qwen'] }));
    expect(model.qwen.length).toBeGreaterThan(0);
    expect(model.qwen.every((row) => row.state === 'unsupported')).toBe(true);
  });

  it('carries the selected range and every range option', () => {
    const model = buildDashboardModel(options({ range: 'last30' }));
    expect(model.range).toBe('last30');
    expect(model.rangeLabel).toBe('Last 30 days');
    expect(model.ranges).toHaveLength(6);
  });

  it('carries the pricing state as a localized label', () => {
    expect(buildDashboardModel(options({ pricing: 'offPeak' })).pricingLabel).toBe('Off-peak pricing right now');
    expect(buildDashboardModel(options({ pricing: 'unavailable' })).pricingLabel).toBe('Pricing calendar unavailable');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/dashboard/viewModel.test.ts`
Expected: FAIL with `Failed to resolve import "./viewModel"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/presentation/dashboard/viewModel.ts
import type { Translator } from '../../localization';
import type { ProviderId, ProviderSnapshot } from '../../core/types';
import type { RangeId } from '../../core/time';
import type { PricingState } from '../../providers/deepseek/pricing';
import type { Point, Series } from './charts';
import { capabilityLabel, rangeLabel } from '../labels';

export type ProviderHealth = 'ok' | 'partial' | 'failed' | 'not-configured' | 'unsupported';

export interface StatTile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone: 'neutral' | 'positive' | 'warning' | 'critical';
}

export interface HeroFigure {
  readonly label: string;
  readonly value: string;
}

export interface QuotaMeter {
  readonly key: string;
  readonly label: string;
  readonly percent: number | null;
  readonly resetLabel: string | null;
  readonly tone: 'positive' | 'warning' | 'critical' | 'muted';
}

export interface ProviderAccent {
  readonly light: string;
  readonly dark: string;
}

export interface DashboardProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly state: ProviderHealth;
  readonly accent: ProviderAccent;
  readonly meters: QuotaMeter[];
  readonly message: string | null;
  readonly fetchedAt: string | null;
}

export interface ModelUsageRow {
  readonly model: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cost: number;
  readonly currency: string;
}

export interface BalanceRow {
  readonly currency: string;
  readonly total: number;
}

export interface UsageModel {
  readonly available: boolean;
  readonly currency: string | null;
  readonly categories: string[];
  readonly cost: Point[];
  readonly requests: Point[];
  readonly tokens: Point[];
  readonly tokenSeries: Series[];
  readonly byModel: ModelUsageRow[];
}

export interface QwenMatrixRow {
  readonly capability: string;
  readonly label: string;
  readonly state: 'unsupported';
}

export interface RangeOption {
  readonly id: RangeId;
  readonly label: string;
}

export interface DashboardLabels {
  readonly cost: string;
  readonly requests: string;
  readonly tokens: string;
  readonly cache: string;
  readonly usageTable: string;
  readonly modelTable: string;
  readonly balanceTable: string;
  readonly qwenTitle: string;
  readonly qwenUnsupported: string;
  readonly columnDate: string;
  readonly columnModel: string;
  readonly columnRequests: string;
  readonly columnTokens: string;
  readonly columnCost: string;
  readonly columnCurrency: string;
  readonly columnTotal: string;
}

export interface DashboardModel {
  readonly hero: HeroFigure;
  readonly tiles: StatTile[];
  readonly providers: DashboardProvider[];
  readonly usage: UsageModel;
  readonly qwen: QwenMatrixRow[];
  readonly balances: BalanceRow[];
  readonly range: RangeId;
  readonly rangeLabel: string;
  readonly ranges: RangeOption[];
  readonly pricingLabel: string;
  readonly labels: DashboardLabels;
}

export interface DashboardOptions {
  readonly snapshots: Partial<Record<ProviderId, ProviderSnapshot>>;
  readonly order: ProviderId[];
  readonly t: Translator;
  readonly range: RangeId;
  readonly pricing: PricingState;
}

const ACCENT: Record<ProviderId, ProviderAccent> = {
  'minimax-cn': { light: '#1baf7a', dark: '#199e70' },
  'minimax-global': { light: '#1baf7a', dark: '#199e70' },
  deepseek: { light: '#2a78d6', dark: '#3987e5' },
  qwen: { light: '#eb6834', dark: '#d95926' },
};

const NAME: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

/**
 * The validated categorical palette, in fixed order. The light and the dark
 * step of every hue are separate values; the renderer picks the one that
 * matches the active theme.
 */
const TOKEN_SERIES_COLORS = {
  cacheHit: { light: '#2a78d6', dark: '#3987e5' },
  cacheMiss: { light: '#eb6834', dark: '#d95926' },
  output: { light: '#1baf7a', dark: '#199e70' },
} as const;

const QWEN_CAPABILITIES = [
  'qwen.accountBalance',
  'qwen.modelQuota',
  'qwen.consumption',
  'qwen.accessKeyValidation',
] as const;

const BALANCE_PRIORITY = ['CNY', 'USD', 'EUR'];

interface WindowView {
  readonly window: string;
  readonly remainingPercent: number | null;
  readonly resetAt: number | null;
  readonly unlimited: boolean;
}

interface UsagePoint {
  readonly date: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cacheHitTokens: number;
  readonly cacheMissTokens: number;
  readonly outputTokens: number;
  readonly cost: number;
  readonly currency: string;
}

function tone(percent: number): 'positive' | 'warning' | 'critical' {
  if (percent <= 10) return 'critical';
  if (percent <= 30) return 'warning';
  return 'positive';
}

function formatMoney(amount: number, currency: string): string {
  if (currency === 'CNY') return `¥${amount.toFixed(2)}`;
  return `${currency} ${amount.toFixed(2)}`;
}

function windows(snapshot: ProviderSnapshot | undefined): WindowView[] {
  const state = snapshot?.capabilities['minimax.plan'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { windows?: WindowView[] } | undefined;
  return data?.windows ?? [];
}

function usageData(snapshot: ProviderSnapshot | undefined): {
  points: UsagePoint[];
  byModel: ModelUsageRow[];
} {
  const state = snapshot?.capabilities['deepseek.usageAmount'];
  if (state === undefined || state.kind !== 'ok') return { points: [], byModel: [] };
  const data = state.data as { points?: UsagePoint[]; byModel?: ModelUsageRow[] } | undefined;
  return { points: data?.points ?? [], byModel: data?.byModel ?? [] };
}

function balanceRows(snapshot: ProviderSnapshot | undefined): BalanceRow[] {
  const state = snapshot?.capabilities['deepseek.balance'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { entries?: BalanceRow[] } | undefined;
  return data?.entries ?? [];
}

function health(snapshot: ProviderSnapshot | undefined): ProviderHealth {
  if (snapshot === undefined) return 'not-configured';
  const states = Object.values(snapshot.capabilities);
  if (states.length === 0) return 'not-configured';
  if (states.every((state) => state.kind === 'unsupported')) return 'unsupported';
  if (states.every((state) => state.kind === 'unconfigured')) return 'not-configured';
  if (states.some((state) => state.kind === 'ok')) return 'ok';
  if (states.some((state) => state.kind === 'failed')) return 'failed';
  return 'partial';
}

export function buildDashboardModel(options: DashboardOptions): DashboardModel {
  const { snapshots, order, t, range, pricing } = options;

  const providers: DashboardProvider[] = order.map((id) => {
    const snapshot = snapshots[id];
    const state = health(snapshot);
    const meters: QuotaMeter[] = windows(snapshot).map((window) => {
      const percent = window.remainingPercent;
      return {
        key: window.window,
        label: window.window === 'weekly' ? 'Weekly' : '5-hour',
        percent,
        resetLabel: window.resetAt === null ? null : new Date(window.resetAt).toISOString(),
        tone: percent === null ? 'muted' : tone(percent),
      };
    });
    const failed =
      snapshot === undefined
        ? undefined
        : Object.values(snapshot.capabilities).find((entry) => entry.kind === 'failed');
    return {
      id,
      name: NAME[id],
      state,
      accent: ACCENT[id],
      meters,
      message: failed !== undefined && failed.kind === 'failed' ? t(failed.error.message) : null,
      fetchedAt: snapshot?.fetchedAt ?? null,
    };
  });

  const percents = providers
    .flatMap((provider) => provider.meters)
    .map((meter) => meter.percent)
    .filter((percent): percent is number => percent !== null);

  const lowest = percents.length > 0 ? Math.min(...percents) : null;

  const { points, byModel } = usageData(snapshots['deepseek']);
  const currency = points[0]?.currency ?? null;

  const usage: UsageModel = {
    available: points.length > 0,
    currency,
    categories: points.map((point) => point.date),
    cost: points.map((point) => ({ x: point.date, y: point.cost })),
    requests: points.map((point) => ({ x: point.date, y: point.requests })),
    tokens: points.map((point) => ({ x: point.date, y: point.totalTokens })),
    tokenSeries: [
      {
        label: t('dashboard.cacheHit'),
        color: TOKEN_SERIES_COLORS.cacheHit.light,
        darkColor: TOKEN_SERIES_COLORS.cacheHit.dark,
        values: points.map((p) => p.cacheHitTokens),
      },
      {
        label: t('dashboard.cacheMiss'),
        color: TOKEN_SERIES_COLORS.cacheMiss.light,
        darkColor: TOKEN_SERIES_COLORS.cacheMiss.dark,
        values: points.map((p) => p.cacheMissTokens),
      },
      {
        label: t('dashboard.output'),
        color: TOKEN_SERIES_COLORS.output.light,
        darkColor: TOKEN_SERIES_COLORS.output.dark,
        values: points.map((p) => p.outputTokens),
      },
    ],
    byModel,
  };

  const balances = balanceRows(snapshots['deepseek']);
  const primaryBalance =
    BALANCE_PRIORITY.map((code) => balances.find((entry) => entry.currency === code)).find(
      (entry) => entry !== undefined,
    ) ?? balances[0];

  const totalTokens = points.reduce((sum, point) => sum + point.totalTokens, 0);
  const totalCost = points.reduce((sum, point) => sum + point.cost, 0);

  const tiles: StatTile[] = [
    {
      key: 'balance',
      label: t('dashboard.accountBalance'),
      value: primaryBalance === undefined ? '—' : formatMoney(primaryBalance.total, primaryBalance.currency),
      tone: 'neutral',
    },
    { key: 'tokens', label: t('dashboard.tokens'), value: String(totalTokens), tone: 'neutral' },
    {
      key: 'cost',
      label: t('dashboard.cost'),
      value: currency === null ? '—' : formatMoney(totalCost, currency),
      tone: 'neutral',
    },
  ];

  const labels: DashboardLabels = {
    cost: t('dashboard.chart.cost'),
    requests: t('dashboard.chart.requests'),
    tokens: t('dashboard.chart.tokens'),
    cache: t('dashboard.chart.cache'),
    usageTable: t('dashboard.table.usage'),
    modelTable: t('dashboard.table.models'),
    balanceTable: t('dashboard.table.balances'),
    qwenTitle: t('dashboard.qwenTitle'),
    qwenUnsupported: t('dashboard.qwenUnsupported'),
    columnDate: t('dashboard.column.date'),
    columnModel: t('dashboard.column.model'),
    columnRequests: t('dashboard.column.requests'),
    columnTokens: t('dashboard.column.tokens'),
    columnCost: t('dashboard.column.cost'),
    columnCurrency: t('dashboard.column.currency'),
    columnTotal: t('dashboard.column.total'),
  };

  const pricingLabel =
    pricing === 'peak'
      ? t('dashboard.pricingPeak')
      : pricing === 'offPeak'
        ? t('dashboard.pricingOffPeak')
        : t('dashboard.pricingUnavailable');

  return {
    hero: {
      label: t('dashboard.lowestRemaining'),
      value: lowest === null ? '—' : `${Math.round(lowest)}%`,
    },
    tiles,
    providers,
    usage,
    qwen: QWEN_CAPABILITIES.map((capability) => ({
      capability,
      label: capabilityLabel(capability, t),
      state: 'unsupported' as const,
    })),
    balances,
    range,
    rangeLabel: rangeLabel(range, t),
    ranges: (['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth'] as RangeId[]).map(
      (id) => ({ id, label: rangeLabel(id, t) }),
    ),
    pricingLabel,
    labels,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/dashboard/viewModel.test.ts`
Expected: `15 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/dashboard/viewModel.ts src/presentation/dashboard/viewModel.test.ts
git commit -m "feat: build the dashboard view model from provider snapshots"
```

---

### Task 4: Dashboard message protocol

**Files:**

- Create: `src/presentation/dashboard/protocol.ts`
- Create: `src/presentation/dashboard/protocol.test.ts`

The six range ids live in `src/core/time.ts` as `RANGE_IDS` and `RangeId`. This
plan imports them from there; it does not declare a second copy.

- [ ] **Step 1: Write the failing test**

```ts
// src/presentation/dashboard/protocol.test.ts
import { describe, expect, it } from 'vitest';
import { isWebviewMessage, isHostMessage, hostMessage } from './protocol';
import type { DashboardModel } from './viewModel';

function emptyModel(): DashboardModel {
  return {
    hero: { label: 'x', value: '1' },
    tiles: [],
    providers: [],
    usage: {
      available: false,
      currency: null,
      categories: [],
      cost: [],
      requests: [],
      tokens: [],
      tokenSeries: [],
      byModel: [],
    },
    qwen: [],
    balances: [],
    range: 'last7',
    rangeLabel: 'Last 7 days',
    ranges: [{ id: 'last7', label: 'Last 7 days' }],
    pricingLabel: 'Peak pricing right now',
    labels: {
      cost: 'Cost',
      requests: 'Requests',
      tokens: 'Tokens',
      cache: 'Cache',
      usageTable: 'Usage',
      modelTable: 'Models',
      balanceTable: 'Balances',
      qwenTitle: 'Qwen',
      qwenUnsupported: 'Not supported',
      columnDate: 'Date',
      columnModel: 'Model',
      columnRequests: 'Requests',
      columnTokens: 'Tokens',
      columnCost: 'Cost',
      columnCurrency: 'Currency',
      columnTotal: 'Total',
    },
  };
}

describe('host messages', () => {
  it('accepts a state message', () => {
    expect(
      isHostMessage({
        kind: 'state',
        model: emptyModel(),
        range: 'last7',
      }),
    ).toBe(true);
  });

  it('accepts a state message with a provider accent and meters', () => {
    expect(
      isHostMessage({
        kind: 'state',
        model: {
          hero: { label: 'x', value: '1' },
          tiles: [{ key: 'balance', label: 'Balance', value: '—', tone: 'neutral' }],
          providers: [
            {
              id: 'deepseek',
              name: 'DeepSeek',
              state: 'ok',
              accent: { light: '#2a78d6', dark: '#3987e5' },
              meters: [{ key: 'fiveHour', label: '5-hour', percent: 42, resetLabel: null, tone: 'positive' }],
              message: null,
              fetchedAt: '2026-11-16T00:00:00.000Z',
            },
          ],
          usage: {
            available: false,
            currency: null,
            categories: [],
            cost: [],
            requests: [],
            tokens: [],
            tokenSeries: [],
            byModel: [],
          },
          qwen: [{ capability: 'qwen.accountBalance', label: 'Account balance', state: 'unsupported' }],
          balances: [],
          range: 'last7',
          rangeLabel: 'Last 7 days',
          ranges: [{ id: 'last7', label: 'Last 7 days' }],
          pricingLabel: 'Peak pricing right now',
          labels: {},
        },
        range: 'last7',
      }),
    ).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(isHostMessage({ kind: 'evil' })).toBe(false);
  });

  it('rejects a state message with a malformed model', () => {
    expect(isHostMessage({ kind: 'state', model: { hero: { label: 1, value: '1' } } })).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isHostMessage('state')).toBe(false);
  });
});

describe('webview messages', () => {
  it('accepts a ready message', () => {
    expect(isWebviewMessage({ kind: 'ready' })).toBe(true);
  });

  it('accepts a range change', () => {
    expect(isWebviewMessage({ kind: 'setRange', range: 'last7' })).toBe(true);
  });

  it('rejects an unknown range', () => {
    expect(isWebviewMessage({ kind: 'setRange', range: 'forever' })).toBe(false);
  });

  it('rejects a message with extra properties', () => {
    expect(isWebviewMessage({ kind: 'ready', extra: true })).toBe(false);
  });
});

describe('hostMessage', () => {
  it('builds the state message the panel posts', () => {
    const message = hostMessage({ kind: 'state', model: emptyModel(), range: 'last7' });
    expect(message.kind).toBe('state');
    expect(message.kind === 'state' ? message.range : undefined).toBe('last7');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/presentation/dashboard/protocol.test.ts`
Expected: FAIL with `Failed to resolve import "./protocol"`.

- [ ] **Step 4: Write the implementation**

```ts
// src/presentation/dashboard/protocol.ts
import type { DashboardModel } from './viewModel';
import { RANGE_IDS, type RangeId } from '../../core/time';

export type HostMessage =
  | { readonly kind: 'state'; readonly model: DashboardModel; readonly range: RangeId }
  | { readonly kind: 'locale'; readonly strings: Record<string, string> };

export type WebviewMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'setRange'; readonly range: RangeId };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isRangeId(value: unknown): value is RangeId {
  return typeof value === 'string' && (RANGE_IDS as readonly string[]).includes(value);
}

export function isHostMessage(value: unknown): value is HostMessage {
  if (!isRecord(value)) return false;
  if (value.kind === 'state') {
    if (!hasExactKeys(value, ['kind', 'model', 'range'])) return false;
    return isRangeId(value.range) && isDashboardModel(value.model);
  }
  if (value.kind === 'locale') {
    if (!hasExactKeys(value, ['kind', 'strings'])) return false;
    return isRecord(value.strings);
  }
  return false;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** A field that carries a string or is explicitly absent. */
function isStringOrNull(value: unknown): boolean {
  return typeof value === 'string' || value === null;
}

/** A field that carries a number or is explicitly absent. */
function isNumberOrNull(value: unknown): boolean {
  return typeof value === 'number' || value === null;
}

function isPoints(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (point) =>
        isRecord(point) && typeof point.x === 'string' && typeof point.y === 'number',
    )
  );
}

function isTokenSeries(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (series) =>
        isRecord(series) &&
        typeof series.label === 'string' &&
        typeof series.color === 'string' &&
        typeof series.darkColor === 'string' &&
        Array.isArray(series.values) &&
        series.values.every((entry) => typeof entry === 'number'),
    )
  );
}

function isMeters(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (meter) =>
        isRecord(meter) &&
        typeof meter.key === 'string' &&
        typeof meter.label === 'string' &&
        isNumberOrNull(meter.percent) &&
        isStringOrNull(meter.resetLabel) &&
        typeof meter.tone === 'string',
    )
  );
}

function isModelRows(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        isRecord(row) &&
        typeof row.model === 'string' &&
        typeof row.requests === 'number' &&
        typeof row.totalTokens === 'number' &&
        typeof row.cost === 'number' &&
        typeof row.currency === 'string',
    )
  );
}

function isBalanceRows(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        isRecord(row) && typeof row.currency === 'string' && typeof row.total === 'number',
    )
  );
}

function isRangeOptions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && isRangeId(entry.id) && typeof entry.label === 'string')
  );
}

function isLabels(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'string');
}

function isDashboardModel(value: unknown): value is DashboardModel {
  if (!isRecord(value)) return false;

  if (
    !isRecord(value.hero) ||
    typeof value.hero.label !== 'string' ||
    typeof value.hero.value !== 'string'
  ) {
    return false;
  }

  if (
    !Array.isArray(value.tiles) ||
    !value.tiles.every(
      (tile) =>
        isRecord(tile) &&
        typeof tile.key === 'string' &&
        typeof tile.label === 'string' &&
        typeof tile.value === 'string' &&
        typeof tile.tone === 'string',
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(value.providers) ||
    !value.providers.every(
      (provider) =>
        isRecord(provider) &&
        typeof provider.id === 'string' &&
        typeof provider.name === 'string' &&
        typeof provider.state === 'string' &&
        isRecord(provider.accent) &&
        typeof provider.accent.light === 'string' &&
        typeof provider.accent.dark === 'string' &&
        isMeters(provider.meters) &&
        isStringOrNull(provider.message) &&
        isStringOrNull(provider.fetchedAt),
    )
  ) {
    return false;
  }

  if (!isRecord(value.usage)) return false;
  const usage = value.usage;
  if (
    typeof usage.available !== 'boolean' ||
    !isStringOrNull(usage.currency) ||
    !isStringArray(usage.categories) ||
    !isPoints(usage.cost) ||
    !isPoints(usage.requests) ||
    !isPoints(usage.tokens) ||
    !isTokenSeries(usage.tokenSeries) ||
    !isModelRows(usage.byModel)
  ) {
    return false;
  }

  if (
    !Array.isArray(value.qwen) ||
    !value.qwen.every(
      (row) =>
        isRecord(row) &&
        typeof row.capability === 'string' &&
        typeof row.label === 'string' &&
        typeof row.state === 'string',
    )
  ) {
    return false;
  }

  if (!isBalanceRows(value.balances)) return false;
  if (typeof value.rangeLabel !== 'string') return false;
  if (!isRangeOptions(value.ranges)) return false;
  if (typeof value.pricingLabel !== 'string') return false;
  if (!isLabels(value.labels)) return false;

  return isRangeId(value.range);
}

export function isWebviewMessage(value: unknown): value is WebviewMessage {
  if (!isRecord(value)) return false;
  if (value.kind === 'ready') return hasExactKeys(value, ['kind']);
  if (value.kind === 'setRange') {
    return hasExactKeys(value, ['kind', 'range']) && isRangeId(value.range);
  }
  return false;
}

export function hostMessage(message: HostMessage): HostMessage {
  return message;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/presentation/dashboard/protocol.test.ts`
Expected: `10 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/dashboard/protocol.ts src/presentation/dashboard/protocol.test.ts
git commit -m "feat: define the dashboard message protocol with strict validation"
```

---

### Task 5: Chart primitives

**Files:**

- Create: `src/presentation/dashboard/charts.ts`
- Create: `src/presentation/dashboard/charts.test.ts`

The charts are pure SVG strings. They never touch the DOM, so they are unit
testable without a browser. Every series carries a light and a dark colour so
the renderer can pick the right one for the active theme.

- [ ] **Step 1: Write the failing test**

```ts
// src/presentation/dashboard/charts.test.ts
import { describe, expect, it } from 'vitest';
import { lineChartSvg, stackedBarSvg, CHART_HEIGHT, CHART_WIDTH } from './charts';

const series = [
  { x: '2026-11-14', y: 10 },
  { x: '2026-11-15', y: 25 },
  { x: '2026-11-16', y: 5 },
];

const tokenSeries = [
  { label: 'Cache hit', color: '#2a78d6', darkColor: '#3987e5', values: [10] },
  { label: 'Cache miss', color: '#eb6834', darkColor: '#d95926', values: [4] },
  { label: 'Output', color: '#1baf7a', darkColor: '#199e70', values: [2] },
];

describe('lineChartSvg', () => {
  it('draws one polyline for a single series', () => {
    const svg = lineChartSvg({ series, label: 'Cost', accent: '#2a78d6' });
    expect(svg).toContain('<polyline');
    expect(svg).toContain('stroke-width="2"');
  });

  it('does not draw a legend for a single series', () => {
    const svg = lineChartSvg({ series, label: 'Cost', accent: '#2a78d6' });
    expect(svg).not.toContain('class="legend"');
  });

  it('draws solid hairline gridlines', () => {
    const svg = lineChartSvg({ series, label: 'Cost', accent: '#2a78d6' });
    expect(svg).not.toContain('stroke-dasharray');
    expect(svg).toContain('stroke-width="1"');
  });

  it('draws an area wash under the line at ten percent opacity', () => {
    const svg = lineChartSvg({ series, label: 'Cost', accent: '#2a78d6' });
    expect(svg).toContain('opacity="0.1"');
  });

  it('renders nothing for an empty series', () => {
    const svg = lineChartSvg({ series: [], label: 'Cost', accent: '#2a78d6' });
    expect(svg).not.toContain('<polyline');
  });

  it('escapes a label that contains markup', () => {
    const svg = lineChartSvg({ series, label: '<script>x</script>', accent: '#2a78d6' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('emits one hit target per point for the crosshair', () => {
    const svg = lineChartSvg({ series, label: 'Cost', accent: '#2a78d6' });
    const hits = svg.match(/class="hit"/g) ?? [];
    expect(hits).toHaveLength(3);
    expect(svg).toContain('class="crosshair"');
  });

  it('carries the value on every hit target', () => {
    const svg = lineChartSvg({ series, label: 'Cost', accent: '#2a78d6' });
    expect(svg).toContain('data-value="25"');
  });
});

describe('stackedBarSvg', () => {
  it('draws one group per series', () => {
    const svg = stackedBarSvg({ categories: ['2026-11-15'], series: tokenSeries });
    expect(svg).toContain('Cache hit');
    expect(svg).toContain('Cache miss');
    expect(svg).toContain('Output');
  });

  it('always draws a legend for two or more series', () => {
    const svg = stackedBarSvg({ categories: ['2026-11-15'], series: tokenSeries });
    expect(svg).toContain('class="legend"');
  });

  it('uses the dark series colour in dark mode', () => {
    const svg = stackedBarSvg({ categories: ['2026-11-15'], series: tokenSeries, dark: true });
    expect(svg).toContain('#3987e5');
    expect(svg).not.toContain('#2a78d6');
  });

  it('separates touching segments with a two pixel surface gap', () => {
    const svg = stackedBarSvg({ categories: ['2026-11-15'], series: tokenSeries });
    const rects = [...svg.matchAll(/<rect [^>]*height="([\d.]+)"/g)].map((match) => Number(match[1]));
    expect(rects.length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('data-gap="2"');
  });

  it('carries the category and the value on every segment', () => {
    const svg = stackedBarSvg({ categories: ['2026-11-15'], series: tokenSeries });
    expect(svg).toContain('data-category="2026-11-15"');
    expect(svg).toContain('data-value="10"');
  });
});

describe('the chart box', () => {
  it('is the size the renderer maps mouse positions against', () => {
    expect(CHART_WIDTH).toBeGreaterThan(0);
    expect(CHART_HEIGHT).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/dashboard/charts.test.ts`
Expected: FAIL with `Failed to resolve import "./charts"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/presentation/dashboard/charts.ts
export interface Point {
  readonly x: string;
  readonly y: number;
}

export interface Series {
  readonly label: string;
  readonly color: string;
  readonly darkColor: string;
  readonly values: number[];
}

export function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 220;

const PAD_LEFT = 44;
const PAD_RIGHT = 16;
/**
 * A band at the top of every chart holds the legend, so a legend never sits
 * on top of a mark.
 */
const LEGEND_BAND = 20;
const PAD_TOP = 12 + LEGEND_BAND;
const PAD_BOTTOM = 28;

function plotWidth(): number {
  return CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
}

function plotHeight(): number {
  return CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
}

function baseline(): number {
  return PAD_TOP + plotHeight();
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function scaleY(value: number, max: number): number {
  return PAD_TOP + plotHeight() - (value / max) * plotHeight();
}

export function lineChartSvg(options: {
  readonly series: readonly Point[];
  readonly label: string;
  readonly accent: string;
}): string {
  const points = options.series;
  if (points.length === 0) {
    return `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}"></svg>`;
  }

  const max = niceMax(Math.max(...points.map((point) => point.y), 1));
  const step = points.length > 1 ? plotWidth() / (points.length - 1) : 0;
  const coordinates = points.map((point, index) => ({
    x: PAD_LEFT + index * step,
    y: scaleY(point.y, max),
  }));

  const line = coordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const floor = baseline();
  const area = `${PAD_LEFT},${floor} ${line} ${coordinates[coordinates.length - 1]!.x.toFixed(1)},${floor}`;

  const gridlines = [0, 0.5, 1]
    .map((fraction) => {
      const y = PAD_TOP + plotHeight() * fraction;
      return `<line class="grid" x1="${PAD_LEFT}" y1="${y.toFixed(1)}" x2="${CHART_WIDTH - PAD_RIGHT}" y2="${y.toFixed(1)}" stroke-width="1" />`;
    })
    .join('');

  // The crosshair starts hidden. The renderer moves it to the nearest point.
  const crosshair =
    `<line class="crosshair" x1="0" y1="${PAD_TOP.toFixed(1)}" x2="0" y2="${floor.toFixed(1)}" ` +
    'stroke="var(--vscode-descriptionForeground)" stroke-width="1" opacity="0" />';

  // One transparent hit target per point. The renderer snaps the crosshair to
  // the closest one.
  const hits = coordinates
    .map((point, index) => {
      const source = points[index]!;
      return (
        `<circle class="hit" data-cx="${point.x.toFixed(1)}" data-label="${escapeSvgText(source.x)}" ` +
        `data-value="${source.y}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="10" fill="transparent" />`
      );
    })
    .join('');

  const end = coordinates[coordinates.length - 1]!;

  return (
    `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escapeSvgText(options.label)}">` +
    gridlines +
    `<polygon class="area" points="${area}" fill="${options.accent}" opacity="0.1" />` +
    `<polyline class="line" points="${line}" fill="none" stroke="${options.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />` +
    crosshair +
    hits +
    `<circle class="marker" cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="4" fill="${options.accent}" stroke="var(--vscode-editor-background)" stroke-width="2" />` +
    `<text class="axis-label" x="${PAD_LEFT}" y="${CHART_HEIGHT - 8}" text-anchor="start">${escapeSvgText(points[0]!.x)}</text>` +
    `<text class="axis-label" x="${CHART_WIDTH - PAD_RIGHT}" y="${CHART_HEIGHT - 8}" text-anchor="end">${escapeSvgText(points[points.length - 1]!.x)}</text>` +
    `<text class="axis-label" x="4" y="${PAD_TOP + 4}" text-anchor="start">${max}</text>` +
    `<text class="axis-label" x="4" y="${floor}" text-anchor="start">0</text>` +
    '</svg>'
  );
}

export function stackedBarSvg(options: {
  readonly categories: readonly string[];
  readonly series: readonly Series[];
  readonly dark?: boolean;
}): string {
  const dark = options.dark === true;
  if (options.series.length === 0) {
    return `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}"></svg>`;
  }

  const totals = options.categories.map((_, index) =>
    options.series.reduce((sum, entry) => sum + (entry.values[index] ?? 0), 0),
  );
  const max = niceMax(Math.max(...totals, 1));

  const barWidth = Math.min(24, (plotWidth() / Math.max(options.categories.length, 1)) * 0.6);
  // The surface gap between two touching fills is exactly two pixels: the
  // cursor advances by the full height and the rect is drawn two pixels
  // shorter.
  const gap = 2;

  const bars = options.categories
    .map((category, index) => {
      const x = PAD_LEFT + (index + 0.5) * (plotWidth() / Math.max(options.categories.length, 1));
      let cursor = baseline();
      const segments = options.series
        .map((entry) => {
          const value = entry.values[index] ?? 0;
          if (value === 0) return '';
          const height = (value / max) * plotHeight();
          const y = cursor - height;
          const drawn = Math.max(0, height - gap);
          cursor = y - gap;
          const color = dark ? entry.darkColor : entry.color;
          return (
            `<rect x="${(x - barWidth / 2).toFixed(1)}" y="${(y + gap).toFixed(1)}" ` +
            `width="${barWidth.toFixed(1)}" height="${drawn.toFixed(1)}" ` +
            `rx="4" fill="${color}" data-gap="2" data-label="${escapeSvgText(entry.label)}" ` +
            `data-value="${value}" data-category="${escapeSvgText(category)}" />`
          );
        })
        .join('');
      return segments;
    })
    .join('');

  const legend =
    options.series.length >= 2
      ? `<g class="legend">${options.series
          .map((entry, index) => {
            const x = PAD_LEFT + index * 120;
            const color = dark ? entry.darkColor : entry.color;
            return (
              `<rect x="${x.toFixed(1)}" y="4" width="10" height="10" rx="2" fill="${color}" />` +
              `<text x="${(x + 16).toFixed(1)}" y="13" class="legend-label">${escapeSvgText(entry.label)}</text>`
            );
          })
          .join('')}</g>`
      : '';

  return (
    `<svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="Usage by day">` +
    bars +
    legend +
    '</svg>'
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/dashboard/charts.test.ts`
Expected: `14 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/dashboard/charts.ts src/presentation/dashboard/charts.test.ts
git commit -m "feat: generate validated svg charts for the dashboard"
```

---

### Task 6: Dashboard panel

**Files:**

- Create: `src/presentation/dashboard/panel.ts`
- Create: `src/presentation/dashboard/panel.test.ts`

The panel owns the webview lifecycle. It never fetches anything: the extension
host owns the data and pushes a fresh model into the panel. A range change
travels back out through the `onRangeChange` callback, so the host decides how
to reload.

- [ ] **Step 1: Write the failing test**

```ts
// src/presentation/dashboard/panel.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, state, Uri } from '../../test/__mocks__/vscode';
import { translatorFor } from '../../localization';
import { buildDashboardModel } from './viewModel';
import { DashboardPanel } from './panel';

const t = translatorFor('en-US');

describe('DashboardPanel', () => {
  beforeEach(() => __reset());

  it('creates a webview panel with a nonce content security policy', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', () => undefined);
    panel.show();
    const html = state.webviewPanels[0]!.webview.html;
    expect(html).toContain("default-src 'none'");
    expect(html).toMatch(/nonce-[A-Za-z0-9+/=]+/);
  });

  it('uses the localized title', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN — 用量与洞察', () => undefined);
    panel.show();
    expect(state.webviewPanels[0]!.title).toBe('QuotaDeck CN — 用量与洞察');
  });

  it('never injects a provider string into the html', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', () => undefined);
    panel.show();
    const model = buildDashboardModel({ snapshots: {}, order: ['deepseek'], t, range: 'last7', pricing: 'peak' });
    panel.update(model);
    expect(state.webviewPanels[0]!.webview.html).not.toContain('onerror=');
  });

  it('is a singleton', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', () => undefined);
    panel.show();
    panel.show();
    expect(state.webviewPanels).toHaveLength(1);
  });

  it('posts the model to the webview', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', () => undefined);
    panel.show();
    const model = buildDashboardModel({ snapshots: {}, order: ['deepseek'], t, range: 'last7', pricing: 'peak' });
    panel.update(model);
    const posted = state.webviewPanels[0]!.webview.postedMessages;
    expect(posted.length).toBeGreaterThan(0);
  });

  it('hands a range change to the host', () => {
    const seen: string[] = [];
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', (range) => {
      seen.push(range);
    });
    panel.show();
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'setRange', range: 'last30' });
    expect(seen).toEqual(['last30']);
  });

  it('ignores a malformed message from the webview', () => {
    const seen: string[] = [];
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', (range) => {
      seen.push(range);
    });
    panel.show();
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'setRange', range: 'forever' });
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'evil' });
    expect(seen).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/dashboard/panel.test.ts`
Expected: FAIL with `Failed to resolve import "./panel"`.

The foundation plan's mock already provides `Uri`, `Webview`, `WebviewPanel`, `ViewColumn`, and `window.createWebviewPanel`. This plan does not change the mock.

- [ ] **Step 3: Write the implementation**

```ts
// src/presentation/dashboard/panel.ts
import * as vscode from 'vscode';
import { isWebviewMessage } from './protocol';
import type { RangeId } from '../../core/time';
import type { DashboardModel } from './viewModel';

const VIEW_TYPE = 'quotaDeck.dashboard';

function nonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return value;
}

export class DashboardPanel {
  private panel: vscode.WebviewPanel | undefined;
  private model: DashboardModel | undefined;
  private range: RangeId = 'last7';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly title: string,
    private readonly onRangeChange: (range: RangeId) => void,
  ) {}

  show(): void {
    if (this.panel !== undefined) {
      this.panel.reveal();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      this.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
      },
    );

    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!isWebviewMessage(message)) return;
      if (message.kind === 'ready') {
        void this.push();
        return;
      }
      if (message.kind === 'setRange') {
        this.range = message.range;
        this.onRangeChange(message.range);
      }
    });

    this.panel.webview.html = this.html();
  }

  update(model: DashboardModel): void {
    this.model = model;
    this.range = model.range;
    void this.push();
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private async push(): Promise<void> {
    if (this.panel === undefined || this.model === undefined) return;
    await this.panel.webview.postMessage({ kind: 'state', model: this.model, range: this.range });
  }

  private html(): string {
    const scriptNonce = nonce();
    const styleNonce = nonce();
    return (
      '<!DOCTYPE html>' +
      '<html lang="en">' +
      '<head>' +
      '<meta charset="UTF-8" />' +
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${scriptNonce}'; img-src data:; font-src 'none';">` +
      '<title>QuotaDeck CN</title>' +
      `<style nonce="${styleNonce}">${DASHBOARD_STYLES}</style>` +
      '</head>' +
      '<body>' +
      '<div id="app"></div>' +
      `<script nonce="${scriptNonce}" src="${vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js').toString()}"></script>` +
      '</body>' +
      '</html>'
    );
  }
}

const DASHBOARD_STYLES = `
:root { color-scheme: light dark; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  margin: 0;
  padding: 16px;
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
}
body[data-loading="true"] #app { opacity: 0.55; transition: opacity 120ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  body[data-loading="true"] #app { transition: none; }
}

.hero { font-size: 48px; font-weight: 600; line-height: 1.1; }
.hero-label { color: var(--vscode-descriptionForeground); font-size: 13px; }
.hero-section { margin-bottom: 16px; }

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
.tile { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; }
.tile-label { color: var(--vscode-descriptionForeground); font-size: 12px; }
.tile-value { font-size: 24px; font-weight: 600; }

.filter-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.filter-button {
  background: transparent;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  color: var(--vscode-foreground);
  cursor: pointer;
  font: inherit;
  padding: 4px 10px;
}
.filter-button.is-selected { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.filter-button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }

.providers { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 20px; }
.provider-card { border: 1px solid var(--vscode-panel-border); border-top-width: 3px; border-radius: 6px; padding: 12px; }
.provider-name { align-items: center; display: flex; font-size: 15px; gap: 8px; margin: 0 0 4px; }
.provider-dot { border-radius: 50%; display: inline-block; height: 10px; width: 10px; }
.provider-state { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 8px; }
.provider-error { color: var(--vscode-errorForeground); font-size: 12px; margin: 8px 0 0; }

.meter { display: grid; grid-template-columns: 72px 1fr 48px; align-items: center; gap: 8px; margin-top: 6px; }
.meter-label { color: var(--vscode-descriptionForeground); font-size: 12px; }
.meter-track { background: var(--vscode-editorWidget-background); border-radius: 4px; height: 8px; overflow: hidden; }
.meter-fill { height: 100%; border-radius: 4px; }
.meter-value { font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }

.chart-card, .table-card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-bottom: 12px; padding: 12px; }
.chart-title { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
.chart-body { position: relative; }
.chart-tooltip {
  background: var(--vscode-editorHoverWidget-background);
  border: 1px solid var(--vscode-editorHoverWidget-border);
  border-radius: 4px;
  color: var(--vscode-editorHoverWidget-foreground);
  font-size: 12px;
  padding: 4px 8px;
  pointer-events: none;
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}
.chart { width: 100%; height: auto; }
.grid { stroke: var(--vscode-panel-border); }
.axis-label { fill: var(--vscode-descriptionForeground); font-size: 11px; }
.legend-label { fill: var(--vscode-foreground); font-size: 12px; }

.data-table { border-collapse: collapse; width: 100%; }
.data-table th, .data-table td { border-bottom: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; }
.data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }

.qwen-matrix { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; }
.qwen-title { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
.qwen-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
.qwen-state { color: var(--vscode-descriptionForeground); }
`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/dashboard/panel.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/dashboard/panel.ts src/presentation/dashboard/panel.test.ts
git commit -m "feat: add the singleton dashboard webview panel with a nonce csp"
```

---

### Task 7: Webview renderer

**Files:**

- Create: `src/presentation/dashboard/webview/env.d.ts`
- Create: `src/presentation/dashboard/webview/render.ts`
- Create: `src/presentation/dashboard/webview/main.ts`

The renderer builds the DOM from the view model. Every string it writes comes
from the model, so the webview never holds a string table and never translates
anything itself.

- [ ] **Step 1: Declare the webview API**

```ts
// src/presentation/dashboard/webview/env.d.ts
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
```

- [ ] **Step 2: Write the renderer**

```ts
// src/presentation/dashboard/webview/render.ts
import { CHART_WIDTH, lineChartSvg, stackedBarSvg, type Point } from '../charts';
import type { DashboardModel, QuotaMeter } from '../viewModel';
import type { RangeId } from '../../../core/time';

export interface DashboardActions {
  readonly onRangeChange: (range: RangeId) => void;
}

/** The DeepSeek accent, in the light and the dark step of the same hue. */
const LINE_ACCENT = { light: '#2a78d6', dark: '#3987e5' };

function element(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isDark(): boolean {
  return document.body.classList.contains('vscode-dark');
}

/**
 * The provider accent rides a coloured dot beside the name. Text never wears
 * a series colour, and the dot is never the only carrier of identity because
 * the name is always next to it.
 */
function providerCard(provider: DashboardModel['providers'][number], dark: boolean): HTMLElement {
  const card = element('section', 'provider-card');
  card.style.borderTopColor = dark ? provider.accent.dark : provider.accent.light;
  const heading = element('h2', 'provider-name');
  const dot = element('span', 'provider-dot');
  dot.style.background = dark ? provider.accent.dark : provider.accent.light;
  heading.appendChild(dot);
  heading.appendChild(document.createTextNode(provider.name));
  card.appendChild(heading);
  card.appendChild(element('div', 'provider-state', provider.state));
  for (const meter of provider.meters) card.appendChild(meterRow(meter));
  if (provider.message !== null) card.appendChild(element('p', 'provider-error', provider.message));
  return card;
}

function meterRow(meter: QuotaMeter): HTMLElement {
  const row = element('div', 'meter');
  row.appendChild(element('div', 'meter-label', meter.label));
  const track = element('div', 'meter-track');
  const fill = element('div', 'meter-fill');
  const toneColor =
    meter.tone === 'positive'
      ? 'var(--vscode-charts-green)'
      : meter.tone === 'warning'
        ? 'var(--vscode-charts-yellow)'
        : meter.tone === 'critical'
          ? 'var(--vscode-charts-red)'
          : 'var(--vscode-descriptionForeground)';
  fill.style.background = toneColor;
  fill.style.width = `${meter.percent ?? 0}%`;
  track.appendChild(fill);
  row.appendChild(track);
  const value = meter.percent === null ? '—' : `${Math.round(meter.percent)}%`;
  row.appendChild(element('div', 'meter-value', value));
  return row;
}

/** One filter row above every chart it scopes. */
function rangeFilter(model: DashboardModel, actions: DashboardActions): HTMLElement {
  const row = element('div', 'filter-row');
  row.setAttribute('role', 'group');
  for (const option of model.ranges) {
    const button = document.createElement('button');
    button.className = 'filter-button';
    button.textContent = option.label;
    button.type = 'button';
    const selected = option.id === model.range;
    button.classList.add(selected ? 'is-selected' : 'is-unselected');
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.addEventListener('click', () => actions.onRangeChange(option.id));
    row.appendChild(button);
  }
  return row;
}

/** The mouse position in the chart's own coordinate system. */
function localPoint(svg: SVGSVGElement, event: MouseEvent): { x: number; y: number } | undefined {
  const matrix = svg.getScreenCTM();
  if (matrix === null) return undefined;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  return { x: local.x, y: local.y };
}

/** A crosshair that snaps to the nearest data position. */
function attachLineHover(svg: SVGSVGElement, tooltip: HTMLElement): void {
  const hits = Array.from(svg.querySelectorAll('circle.hit'));
  if (hits.length === 0) return;
  const crosshair = svg.querySelector('line.crosshair');

  const hide = (): void => {
    tooltip.hidden = true;
    crosshair?.setAttribute('opacity', '0');
  };

  const move = (event: MouseEvent): void => {
    const local = localPoint(svg, event);
    if (local === undefined) return;

    let nearest: Element | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const hit of hits) {
      const cx = Number(hit.getAttribute('data-cx') ?? '0');
      const distance = Math.abs(cx - local.x);
      if (distance < best) {
        best = distance;
        nearest = hit;
      }
    }
    if (nearest === undefined) return;

    const cx = Number(nearest.getAttribute('data-cx') ?? '0');
    crosshair?.setAttribute('x1', cx.toFixed(1));
    crosshair?.setAttribute('x2', cx.toFixed(1));
    crosshair?.setAttribute('opacity', '1');

    const label = nearest.getAttribute('data-label') ?? '';
    const value = nearest.getAttribute('data-value') ?? '';
    tooltip.textContent = `${label} · ${value}`;
    tooltip.hidden = false;
    const box = svg.getBoundingClientRect();
    tooltip.style.left = `${((cx / CHART_WIDTH) * box.width).toFixed(0)}px`;
  };

  svg.addEventListener('mousemove', move);
  svg.addEventListener('mouseleave', hide);
}

/** A tooltip on every segment. The value is also in the table below. */
function attachBarHover(svg: SVGSVGElement, tooltip: HTMLElement): void {
  for (const rect of Array.from(svg.querySelectorAll('rect[data-label]'))) {
    rect.addEventListener('mouseenter', () => {
      const category = rect.getAttribute('data-category') ?? '';
      const label = rect.getAttribute('data-label') ?? '';
      const value = rect.getAttribute('data-value') ?? '';
      tooltip.textContent = `${category} · ${label} · ${value}`;
      tooltip.hidden = false;
      const box = svg.getBoundingClientRect();
      tooltip.style.left = `${(box.width / 2).toFixed(0)}px`;
    });
    rect.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
  }
}

function lineChartCard(title: string, points: Point[], dark: boolean): HTMLElement {
  const card = element('section', 'chart-card');
  card.appendChild(element('h3', 'chart-title', title));
  const body = element('div', 'chart-body');
  const accent = dark ? LINE_ACCENT.dark : LINE_ACCENT.light;
  body.innerHTML = lineChartSvg({ series: points, label: title, accent });
  const tooltip = element('div', 'chart-tooltip');
  tooltip.hidden = true;
  body.appendChild(tooltip);
  card.appendChild(body);
  const svg = body.querySelector('svg');
  if (svg instanceof SVGSVGElement) attachLineHover(svg, tooltip);
  return card;
}

function stackedBarCard(model: DashboardModel, dark: boolean): HTMLElement {
  const card = element('section', 'chart-card');
  card.appendChild(element('h3', 'chart-title', model.labels.cache));
  const body = element('div', 'chart-body');
  body.innerHTML = stackedBarSvg({
    categories: model.usage.categories,
    series: model.usage.tokenSeries,
    dark,
  });
  const tooltip = element('div', 'chart-tooltip');
  tooltip.hidden = true;
  body.appendChild(tooltip);
  card.appendChild(body);
  const svg = body.querySelector('svg');
  if (svg instanceof SVGSVGElement) attachBarHover(svg, tooltip);
  return card;
}

function tableCard(title: string, headers: string[], rows: string[][]): HTMLElement {
  const card = element('section', 'table-card');
  card.appendChild(element('h3', 'chart-title', title));
  const table = element('table', 'data-table');
  const head = element('thead');
  const headRow = element('tr');
  for (const header of headers) headRow.appendChild(element('th', undefined, header));
  head.appendChild(headRow);
  table.appendChild(head);
  const body = element('tbody');
  for (const row of rows) {
    const line = element('tr');
    for (const cell of row) line.appendChild(element('td', undefined, cell));
    body.appendChild(line);
  }
  table.appendChild(body);
  card.appendChild(table);
  return card;
}

function usageTable(model: DashboardModel): HTMLElement {
  const labels = model.labels;
  const rows = model.usage.categories.map((category, index) => [
    category,
    String(model.usage.requests[index]?.y ?? 0),
    String(model.usage.tokens[index]?.y ?? 0),
    String(model.usage.cost[index]?.y ?? 0),
  ]);
  return tableCard(
    labels.usageTable,
    [labels.columnDate, labels.columnRequests, labels.columnTokens, labels.columnCost],
    rows,
  );
}

function modelTable(model: DashboardModel): HTMLElement {
  const labels = model.labels;
  const rows = model.usage.byModel.map((entry) => [
    entry.model,
    String(entry.requests),
    String(entry.totalTokens),
    entry.cost.toFixed(2),
    entry.currency,
  ]);
  return tableCard(
    labels.modelTable,
    [
      labels.columnModel,
      labels.columnRequests,
      labels.columnTokens,
      labels.columnCost,
      labels.columnCurrency,
    ],
    rows,
  );
}

function balanceTable(model: DashboardModel): HTMLElement {
  const labels = model.labels;
  const rows = model.balances.map((entry) => [entry.currency, entry.total.toFixed(2)]);
  return tableCard(labels.balanceTable, [labels.columnCurrency, labels.columnTotal], rows);
}

function qwenMatrix(model: DashboardModel): HTMLElement {
  const section = element('section', 'qwen-matrix');
  section.appendChild(element('h3', 'qwen-title', model.labels.qwenTitle));
  for (const row of model.qwen) {
    const line = element('div', 'qwen-row');
    line.appendChild(element('span', 'qwen-capability', row.label));
    line.appendChild(element('span', 'qwen-state', model.labels.qwenUnsupported));
    section.appendChild(line);
  }
  return section;
}

export function renderDashboard(
  container: HTMLElement,
  model: DashboardModel,
  actions: DashboardActions,
): void {
  container.textContent = '';
  const dark = isDark();

  const heroSection = element('section', 'hero-section');
  heroSection.appendChild(element('div', 'hero-label', model.hero.label));
  heroSection.appendChild(element('div', 'hero', model.hero.value));
  container.appendChild(heroSection);

  const tiles = element('div', 'tiles');
  for (const tile of model.tiles) {
    const node = element('div', 'tile');
    node.appendChild(element('div', 'tile-label', tile.label));
    node.appendChild(element('div', 'tile-value', tile.value));
    tiles.appendChild(node);
  }
  container.appendChild(tiles);

  container.appendChild(rangeFilter(model, actions));

  const providers = element('div', 'providers');
  for (const provider of model.providers) providers.appendChild(providerCard(provider, dark));
  container.appendChild(providers);

  if (model.usage.available) {
    container.appendChild(lineChartCard(model.labels.cost, model.usage.cost, dark));
    container.appendChild(lineChartCard(model.labels.requests, model.usage.requests, dark));
    container.appendChild(lineChartCard(model.labels.tokens, model.usage.tokens, dark));
    container.appendChild(stackedBarCard(model, dark));
    container.appendChild(usageTable(model));
  }

  if (model.balances.length > 0) container.appendChild(balanceTable(model));
  if (model.usage.byModel.length > 0) container.appendChild(modelTable(model));

  if (model.providers.some((provider) => provider.id === 'qwen')) {
    container.appendChild(qwenMatrix(model));
  }
}
```

- [ ] **Step 3: Write the webview entry point**

```ts
// src/presentation/dashboard/webview/main.ts
import { isHostMessage, type HostMessage } from '../protocol';
import { renderDashboard, type DashboardActions } from './render';
import type { RangeId } from '../../../core/time';

const vscode = acquireVsCodeApi();
const container = document.getElementById('app');

const actions: DashboardActions = {
  onRangeChange: (range: RangeId) => {
    // The previous render stays on screen at reduced opacity while the host
    // reloads. There is no skeleton and no layout jump.
    document.body.setAttribute('data-loading', 'true');
    vscode.postMessage({ kind: 'setRange', range });
  },
};

function applyTheme(): void {
  const dark = document.body.classList.contains('vscode-dark');
  document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
}

const themeObserver = new MutationObserver(applyTheme);
themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
applyTheme();

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isHostMessage(event.data)) return;
  const message = event.data as HostMessage;
  if (message.kind !== 'state') return;
  document.body.removeAttribute('data-loading');
  if (container !== null) renderDashboard(container, message.model, actions);
});

vscode.postMessage({ kind: 'ready' });
```

- [ ] **Step 4: Build the webview bundle**

Run: `npm run build`
Expected: esbuild prints a build summary for `dist/webview.js` and the bundle contains no `import` statement, because the format is `iife`.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/dashboard/webview
git commit -m "feat: render the dashboard with charts, a filter row and a table view"
```

---

### Task 8: QuickPick fallback

**Files:**

- Create: `src/presentation/quickPickFallback.ts`
- Create: `src/presentation/quickPickFallback.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/presentation/quickPickFallback.test.ts
import { describe, expect, it } from 'vitest';
import { makeSnapshot } from '../test/helpers/snapshot';
import { buildFallbackItems } from './quickPickFallback';

describe('buildFallbackItems', () => {
  it('builds one item per provider', () => {
    const items = buildFallbackItems({}, ['minimax-cn', 'deepseek']);
    expect(items.map((item) => item.label)).toEqual(['MiniMax CN', 'DeepSeek']);
  });

  it('shows an em dash for a provider with no snapshot', () => {
    const items = buildFallbackItems({}, ['qwen']);
    expect(items[0]!.description).toContain('—');
  });

  it('shows the remaining percentage for MiniMax', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 42, resetAt: null, unlimited: false }] },
        },
      }),
    };
    expect(buildFallbackItems(snapshots, ['minimax-cn'])[0]!.description).toContain('42%');
  });

  it('never shows a failed capability as a zero percentage', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': { kind: 'failed', error: { kind: 'network', message: 'error.network' } },
      }),
    };
    expect(buildFallbackItems(snapshots, ['minimax-cn'])[0]!.description).not.toContain('0%');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/quickPickFallback.test.ts`
Expected: FAIL with `Failed to resolve import "./quickPickFallback"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/presentation/quickPickFallback.ts
import type { ProviderId, ProviderSnapshot } from '../core/types';
import type { MessageKey } from '../localization/messages';

export interface FallbackItem {
  readonly label: string;
  readonly description: string;
  readonly detail?: string;
}

const NAME: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

interface WindowView {
  readonly window: string;
  readonly remainingPercent?: number;
  readonly unlimited?: boolean;
}

function windows(snapshot: ProviderSnapshot | undefined): WindowView[] {
  const state = snapshot?.capabilities['minimax.plan'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { windows?: WindowView[] } | undefined;
  return data?.windows ?? [];
}

export function buildFallbackItems(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  order: ProviderId[],
): FallbackItem[] {
  return order.map((id) => {
    const snapshot = snapshots[id];
    if (snapshot === undefined) {
      return { label: NAME[id], description: '—' };
    }
    const window = windows(snapshot)
      .filter((entry) => entry.unlimited !== true && entry.remainingPercent !== undefined)
      .sort((a, b) => (a.remainingPercent ?? 0) - (b.remainingPercent ?? 0))[0];
    if (window !== undefined) {
      return { label: NAME[id], description: `${Math.round(window.remainingPercent ?? 0)}%` };
    }
    const failed = Object.values(snapshot.capabilities).find((state) => state.kind === 'failed');
    if (failed !== undefined && failed.kind === 'failed') {
      return { label: NAME[id], description: failed.error.message };
    }
    return { label: NAME[id], description: '—' };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/quickPickFallback.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/quickPickFallback.ts src/presentation/quickPickFallback.test.ts
git commit -m "feat: add the quickpick fallback for provider summaries"
```

---

### Task 9: Wire the presentation layer into the extension

**Files:**

- Modify: `src/extension.ts`

This task replaces the whole of `src/extension.ts`. The file below is the
complete file; there is nothing else to add to it.

- [ ] **Step 1: Replace `src/extension.ts`**

```ts
// src/extension.ts
import * as vscode from 'vscode';
import { SnapshotCache } from './core/cache';
import { Coordinator } from './core/coordinator';
import { HttpClient } from './core/http';
import { Scheduler } from './core/scheduler';
import { SecretStore } from './core/secrets';
import { readSettings } from './core/settings';
import type { RangeId } from './core/time';
import { resolveLanguage, translatorFor } from './localization';
import { pricingState } from './providers/deepseek/pricing';
import { buildProviders } from './providers/registry';
import { DashboardPanel } from './presentation/dashboard/panel';
import { buildDashboardModel, type DashboardModel } from './presentation/dashboard/viewModel';
import { registerCommands } from './presentation/commands';
import { buildFallbackItems } from './presentation/quickPickFallback';
import { StatusBarPresenter } from './presentation/statusBar';
import { renderTooltip } from './presentation/tooltip';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const settings = readSettings();
  const t = translatorFor(resolveLanguage(settings.language, vscode.env.language));

  const cache = new SnapshotCache({
    get: (key) => context.globalState.get(key),
    set: (key, value) => void context.globalState.update(key, value),
  });

  const http = new HttpClient({ timeoutMs: 15_000, maxAttempts: 3 });
  const providers = buildProviders(http);
  const statusBar = new StatusBarPresenter(t);

  const scheduler = new Scheduler({
    refreshIntervalMinutes: settings.refreshIntervalMinutes,
    pauseWhenUnfocused: settings.pauseWhenUnfocused,
  });

  const coordinator = new Coordinator({
    providers,
    cache,
    onRateLimited: (retryAfterMs) => scheduler.pauseUntil(Date.now() + retryAfterMs),
  });

  const secrets = new SecretStore(context.secrets);
  for (const provider of providers) {
    await provider.connect(secrets);
  }

  // The range the dashboard is scoped to. It only changes when the user picks
  // a different one in the filter row.
  let range: RangeId = 'last7';
  let lastRefreshIso: string | undefined;

  const dashboard = new DashboardPanel(context.extensionUri, t('dashboard.title'), (next) => {
    void selectRange(next);
  });

  function currentModel(snapshots = coordinator.getLast()): DashboardModel {
    const current = readSettings();
    return buildDashboardModel({
      snapshots,
      order: current.providerOrder,
      t,
      range,
      pricing: pricingState(Date.now()),
    });
  }

  function refreshTooltip(): void {
    const current = readSettings();
    const markdown = new vscode.MarkdownString(
      renderTooltip(coordinator.getLast(), current.providerOrder, t, lastRefreshIso),
    );
    markdown.supportHtml = true;
    markdown.isTrusted = false;
    statusBar.setTooltip(markdown);
  }

  async function refreshAll(): Promise<void> {
    const snapshots = await coordinator.refreshAll(range);
    lastRefreshIso = new Date().toISOString();
    const current = readSettings();
    statusBar.update(snapshots, current.providerOrder, current.statusBarMode, current.primaryProvider);
    dashboard.update(currentModel(snapshots));
    refreshTooltip();
  }

  async function selectRange(next: RangeId): Promise<void> {
    range = next;
    await refreshAll();
  }

  context.subscriptions.push(
    statusBar,
    dashboard,
    { dispose: () => scheduler.stop() },
    { dispose: () => coordinator.dispose() },
    ...registerCommands({
      refresh: () => scheduler.refreshNow(),
      openDashboard: async () => {
        try {
          dashboard.show();
          dashboard.update(currentModel());
          refreshTooltip();
        } catch {
          // The webview failed to open. The QuickPick shows the same
          // information without a panel.
          const current = readSettings();
          const items = buildFallbackItems(coordinator.getLast(), current.providerOrder);
          await vscode.window.showQuickPick(items, { title: 'QuotaDeck CN' });
        }
      },
      // The onboarding, the switcher and the credential commands arrive in
      // the release plan, which replaces these four handler bodies.
      switchProvider: async () => {
        await vscode.window.showInformationMessage('切换服务商将在后续版本提供。');
      },
      configureMiniMax: async () => {
        await vscode.window.showInformationMessage('凭据配置将在后续版本提供。');
      },
      configureDeepSeek: async () => {
        await vscode.window.showInformationMessage('凭据配置将在后续版本提供。');
      },
      showHelp: async () => {
        await vscode.window.showInformationMessage('QuotaDeck CN — 国产大模型额度监控');
      },
    }),
  );

  // The window focus drives the pause-when-unfocused behaviour.
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => scheduler.setFocused(state.focused)),
  );

  scheduler.start(refreshAll);

  const cached = await coordinator.loadCached();
  const current = readSettings();
  statusBar.update(cached, current.providerOrder, current.statusBarMode, current.primaryProvider);
  dashboard.update(currentModel(cached));
  refreshTooltip();
}

export function deactivate(): void {
  // The coordinator and the scheduler are disposed through context.subscriptions,
  // which wipes the in-memory credential material.
}
```

- [ ] **Step 2: Run the whole suite and the build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors, all tests pass, both bundles build.

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts src/presentation
git commit -m "feat: connect the tooltip, dashboard and fallback to the coordinator"
```

---

## Verification

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck
npm test
npm run guard:fixtures
npm run package
```

Expected: all four pass. `npm run package` builds the bundles, runs the
fixture guard, packages the extension and runs the package guard.

- [ ] **Step 2: Confirm no chart uses a colour outside the validated palette**

Run: `git grep -nE "#[0-9a-fA-F]{6}" -- src/presentation`
Expected: only `#1baf7a`, `#199e70`, `#2a78d6`, `#3987e5`, `#eb6834`, `#d95926` appear. Every other colour in the presentation layer is a `var(--vscode-*)` token.

- [ ] **Step 3: Open the dashboard by hand**

Run: `npm run package && code --install-extension quota-deck-0.1.0.vsix` then open the dashboard from the command palette.
Expected: the hero figure, the tile row, and the provider cards render; the light, dark, and high-contrast themes each stay legible.

- [ ] **Step 4: Confirm the working tree is clean**

Run: `git status --short`
Expected: no output.

---

## Out of Scope for This Plan

- The onboarding flow, the final localization pass, and the marketplace release → `2026-11-16-quota-deck-cn-release.md`
