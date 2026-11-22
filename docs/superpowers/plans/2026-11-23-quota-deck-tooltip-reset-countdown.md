# QuotaDeck CN Tooltip Reset Countdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the absolute reset instant in the status-bar hover tooltip with a "time left until
reset" countdown, and turn the footer's update glyph into a circle arrow.

**Architecture:** The countdown is a duration, so it needs no time zone. The duration format already
exists as a private helper in the dashboard's view model; it moves to `src/presentation/display.ts`
so the tooltip and the dashboard share one implementation. A new message key `tooltip.resetsIn`
carries the wording with a `{duration}` placeholder, because Chinese and English order the duration
differently. The reset cell is explicitly left-aligned with the `align` attribute, which VS Code's
markdown sanitizer keeps — the sanitizer strips `text-align`, so the inline style cannot express it.

**Tech Stack:** TypeScript 7, Vitest 5, VS Code extension API, ESM/CJS esbuild bundles.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/presentation/display.ts` | Owns `formatDuration`, the shared duration formatter. |
| `src/presentation/dashboard/viewModel.ts` | Consumes `formatDuration`; loses its private copy. |
| `src/presentation/tooltip.ts` | Renders the countdown in the reset cell. |
| `src/localization/messages.ts`, `zh-cn.ts`, `en-us.ts` | Own the `tooltip.resetsIn` wording and the `tooltip.updated` glyph. |
| `src/presentation/overview/model.ts` | Unchanged in code; picks up the new glyph through the shared message. |

---

### Task 1: Share the duration formatter

**Files:**
- Modify: `src/presentation/display.ts`
- Test: `src/presentation/display.test.ts`

- [ ] **Step 1: Write the failing test**

Add the import and the new `describe` block to `src/presentation/display.test.ts`:

```ts
import {
  formatDateTime,
  formatDuration,
  formatExpiryRemaining,
  formatMoney,
  formatRemainingDays,
  pickTightestWindow,
  providerDisplayName,
  selectPrimaryCurrency,
} from './display';
```

```ts
describe('formatDuration', () => {
  it('renders hours and minutes in Chinese', () => {
    expect(formatDuration(210 * 60_000, zh)).toBe('3小时30分钟');
  });

  it('renders hours and minutes in English', () => {
    expect(formatDuration(210 * 60_000, en)).toBe('3h 30m');
  });

  it('renders days and hours in Chinese', () => {
    expect(formatDuration((6 * 24 + 23) * 3_600_000, zh)).toBe('6天23小时');
  });

  it('renders days and hours in English', () => {
    expect(formatDuration((6 * 24 + 23) * 3_600_000, en)).toBe('6d 23h');
  });

  it('clamps a span that has already passed to zero', () => {
    expect(formatDuration(-1, zh)).toBe('0分钟');
    expect(formatDuration(-1, en)).toBe('0m');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/presentation/display.test.ts`
Expected: FAIL — `formatDuration` is not exported from `./display`.

- [ ] **Step 3: Write the implementation**

Add to `src/presentation/display.ts`, after `formatRemainingDays`:

```ts
/** Format a span of time as `4小时26分钟` / `4h 26m`. */
export function formatDuration(milliseconds: number, t: Translator): string {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${t('dashboard.duration.day')}`);
  if (hours > 0) parts.push(`${hours}${t('dashboard.duration.hour')}`);
  if (minutes > 0) parts.push(`${minutes}${t('dashboard.duration.minute')}`);
  if (parts.length === 0) parts.push(`0${t('dashboard.duration.minute')}`);
  return parts.join('').trim();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/presentation/display.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/display.ts src/presentation/display.test.ts
git commit -m "refactor: share the duration formatter through display.ts"
```

---

### Task 2: Point the dashboard at the shared formatter

**Files:**
- Modify: `src/presentation/dashboard/viewModel.ts`

- [ ] **Step 1: Delete the private copy and import the shared one**

In `src/presentation/dashboard/viewModel.ts`, delete the private `durationLabel` function:

```ts
function durationLabel(milliseconds: number, t: Translator): string {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${t('dashboard.duration.day')}`);
  if (hours > 0) parts.push(`${hours}${t('dashboard.duration.hour')}`);
  if (minutes > 0) parts.push(`${minutes}${t('dashboard.duration.minute')}`);
  if (parts.length === 0) parts.push(`0${t('dashboard.duration.minute')}`);
  return parts.join('').trim();
}
```

Extend the existing import from `../display`:

```ts
import {
  formatDuration,
  formatExpiryRemaining,
  formatMoney,
  providerDisplayName,
  selectPrimaryCurrency,
} from '../display';
```

Replace both call sites of `durationLabel(` with `formatDuration(` inside `resetLabel`:

```ts
function resetLabel(
  resetAt: number,
  timeZone: string,
  now: number,
  t: Translator,
): string {
  return (
    `${t('tooltip.resetAt')} ${zonedDateTime(resetAt, timeZone)}` +
    ` · ${t('dashboard.resetRemaining')} ${formatDuration(resetAt - now, t)}`
  );
}
```

- [ ] **Step 2: Run the dashboard tests to verify the output is unchanged**

Run: `npm test -- src/presentation/dashboard/viewModel.test.ts`
Expected: PASS — no assertion changed, so the dashboard still renders
`Next reset 2026-11-20 00:00 · Reset in 1d` and `下次重置 2026-11-19 10:30 · 剩余 2小时30分钟`.

- [ ] **Step 3: Run the type checker**

Run: `npm run typecheck`
Expected: PASS with no output.

- [ ] **Step 4: Commit**

```bash
git add src/presentation/dashboard/viewModel.ts
git commit -m "refactor: reuse the shared duration formatter in the dashboard"
```

---

### Task 3: Add the countdown wording and turn the update glyph

**Files:**
- Modify: `src/localization/messages.ts`
- Modify: `src/localization/zh-cn.ts`
- Modify: `src/localization/en-us.ts`
- Test: `src/localization/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/localization/index.test.ts`, inside `describe('bundles')`:

```ts
  it('carries the countdown wording and the circle-arrow update glyph', () => {
    expect(zhCn['tooltip.resetsIn']).toBe('{duration}后重置');
    expect(enUs['tooltip.resetsIn']).toBe('Resets in {duration}');
    expect(zhCn['tooltip.updated']).toBe('⟳');
    expect(enUs['tooltip.updated']).toBe('⟳');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/localization/index.test.ts`
Expected: FAIL — `tooltip.resetsIn` is not in the bundles.

- [ ] **Step 3: Add the key and change the glyph**

In `src/localization/messages.ts`, directly after the `'tooltip.resetAt'` line:

```ts
  'tooltip.resetsIn': '{duration}后重置',
```

In `src/localization/zh-cn.ts`, directly after the `'tooltip.resetAt'` line:

```ts
  'tooltip.resetsIn': '{duration}后重置',
```

In `src/localization/en-us.ts`, directly after the `'tooltip.resetAt'` line:

```ts
  'tooltip.resetsIn': 'Resets in {duration}',
```

In all three files, change `'tooltip.updated'` from `'⇄'` to `'⟳'`:

```ts
  'tooltip.updated': '⟳',
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/localization/index.test.ts`
Expected: PASS — including the existing key-parity test, which fails if the three bundles disagree.

- [ ] **Step 5: Commit**

```bash
git add src/localization/messages.ts src/localization/zh-cn.ts src/localization/en-us.ts src/localization/index.test.ts
git commit -m "feat: add the countdown wording and the circle-arrow update glyph"
```

---

### Task 4: Render the countdown in the tooltip reset cell

**Files:**
- Modify: `src/presentation/tooltip.ts`
- Test: `src/presentation/tooltip.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/presentation/tooltip.test.ts`, replace the test `'shows the video reset time after its quota track'`
with:

```ts
  it('shows the countdown until the video quota resets', () => {
    const now = Date.parse('2026-11-18T20:30:00.000Z');
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [],
            models: [{
              model: 'video',
              remaining: 3,
              remainingPercent: 100,
              resetAt: Date.parse('2026-11-19T00:00:00.000Z'),
              total: 3,
            }],
          },
        },
      }),
    };

    const html = renderTooltip(
      snapshots,
      ['minimax-cn'],
      zh,
      undefined,
      'Asia/Shanghai',
      undefined,
      now,
    );

    expect(html).toContain('3小时30分钟后重置');
  });
```

Replace the test `'localizes MiniMax regions, windows, reset times, and the configured time zone'`
with:

```ts
  it('localizes MiniMax regions, windows, reset countdowns, and the configured time zone', () => {
    const now = Date.parse('2026-11-16T03:30:00.000Z');
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: '2026-11-16T04:00:00.000Z',
          data: {
            windows: [
              {
                window: 'fiveHour',
                remainingPercent: 35,
                resetAt: Date.parse('2026-11-16T04:00:00.000Z'),
                unlimited: false,
              },
              {
                window: 'weekly',
                remainingPercent: 24,
                resetAt: Date.parse('2026-11-16T08:00:00.000Z'),
                unlimited: false,
              },
            ],
          },
        },
      }),
    };

    const html = renderTooltip(
      snapshots,
      ['minimax-cn'],
      zh,
      '2026-11-16T02:00:00.000Z',
      'Asia/Shanghai',
      undefined,
      now,
    );

    expect(html).toContain('国内版');
    expect(html).toContain('5 小时');
    expect(html).toContain('每周');
    expect(html).toContain('>30分钟后重置</td>');
    expect(html).toContain('>4小时30分钟后重置</td>');
    expect(html).not.toContain('↻');
    expect(html).not.toContain('11-16 12:00');
    expect(html).not.toContain('11-16 16:00');
    expect(html).toContain('Asia/Shanghai');
    expect(html).not.toContain('Domestic');
    expect(html).not.toContain('5-hour');
    expect(html).not.toContain('Weekly');
  });
```

The `lastRefreshIso` is `2026-11-16T02:00:00.000Z` on purpose: the footer renders it as
`2026-11-16 10:00`, so the two reset instants (`11-16 12:00` and `11-16 16:00`) can be asserted
absent without the footer colliding with them.

Replace the test `'labels the reset time in English'` with:

```ts
  it('labels the reset countdown in English', () => {
    const now = Date.parse('2026-11-16T03:30:00.000Z');
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: '2026-11-16T04:00:00.000Z',
          data: {
            windows: [{
              window: 'fiveHour',
              remainingPercent: 35,
              resetAt: Date.parse('2026-11-16T04:00:00.000Z'),
              unlimited: false,
            }],
          },
        },
      }),
    };

    const html = renderTooltip(
      snapshots,
      ['minimax-cn'],
      t,
      undefined,
      'Asia/Shanghai',
      undefined,
      now,
    );

    expect(html).toContain('Resets in 30m');
    expect(html).not.toContain('↻');
  });
```

Add a new test after `'labels the reset countdown in English'`:

```ts
  it('left-aligns the reset cell so the countdowns line up', () => {
    const now = Date.parse('2026-11-16T03:30:00.000Z');
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [
              {
                window: 'fiveHour',
                remainingPercent: 35,
                resetAt: Date.parse('2026-11-16T04:00:00.000Z'),
                unlimited: false,
              },
            ],
          },
        },
      }),
    };

    const html = renderTooltip(
      snapshots,
      ['minimax-cn'],
      zh,
      undefined,
      'Asia/Shanghai',
      undefined,
      now,
    );

    expect(html).toContain('<td class="t-muted" colspan="2" align="left"');
    expect(html).not.toContain('text-align:right');
  });

  it('never leaks the duration placeholder into the tooltip', () => {
    const now = Date.parse('2026-11-16T03:30:00.000Z');
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [
              {
                window: 'fiveHour',
                remainingPercent: 35,
                resetAt: Date.parse('2026-11-16T04:00:00.000Z'),
                unlimited: false,
              },
            ],
          },
        },
      }),
    };

    const html = renderTooltip(
      snapshots,
      ['minimax-cn'],
      zh,
      undefined,
      'Asia/Shanghai',
      undefined,
      now,
    );

    expect(html).not.toContain('{duration}');
  });
```

Update the footer assertion in `'puts the dashboard hint on a second footer line'` — change `⇄` to `⟳`:

```ts
    expect(html).toContain(
      '<span class="t-muted">⟳ 2026-11-18 18:43 · Asia/Shanghai</span>' +
        '<br><span class="t-muted">点击在仪表盘中查看更多分析</span>',
    );
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/presentation/tooltip.test.ts`
Expected: FAIL — the tooltip still renders `↻ 11-16 12:00`.

- [ ] **Step 3: Write the implementation**

In `src/presentation/tooltip.ts`, extend the import from `./display`:

```ts
import {
  formatDuration,
  formatExpiryRemaining,
  formatMoney,
  formatRemainingDays,
  providerDisplayName,
} from './display';
```

Replace `resetCell` with:

```ts
function resetCell(
  resetAt: number | null | undefined,
  now: number,
  t: Translator,
): string {
  if (resetAt == null) return '<td colspan="2"></td>';
  const label = t('tooltip.resetsIn').replace(
    '{duration}',
    formatDuration(resetAt - now, t),
  );
  return (
    '<td class="t-muted" colspan="2" align="left" ' +
    'style="white-space:nowrap;">' +
    `${escapeHtml(label)}</td>`
  );
}
```

Update the three call sites — in `qwenTokenPlanRows` and twice in `providerRows`:

```ts
        `${resetCell(window.resetAt, now, t)}</tr>`;
```

```ts
          `${resetCell(window.resetAt, now, t)}</tr>`,
```

```ts
        `${resetCell(model.resetAt, now, t)}</tr>`,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/presentation/tooltip.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the type checker**

Run: `npm run typecheck`
Expected: PASS with no output. `resetCell` no longer takes `timeZone`, and `providerRows` and
`qwenTokenPlanRows` still use `timeZone` for their expiry rows, so neither function loses a
parameter it needs.

- [ ] **Step 6: Commit**

```bash
git add src/presentation/tooltip.ts src/presentation/tooltip.test.ts
git commit -m "feat: show the reset countdown in the tooltip"
```

---

### Task 5: Update the tree's update glyph assertion

**Files:**
- Modify: `src/presentation/overview/model.test.ts`

- [ ] **Step 1: Update the assertion**

In `src/presentation/overview/model.test.ts`, in the test
`'summarizes and expands MiniMax without losing used values'`, change:

```ts
    expect(items[0]?.tooltip).toContain('⇄ 2026-11-18 18:43');
```

to:

```ts
    expect(items[0]?.tooltip).toContain('⟳ 2026-11-18 18:43');
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test -- src/presentation/overview/model.test.ts`
Expected: PASS. The tree reads the glyph from the shared `tooltip.updated` message, so no production
change is needed here — only the assertion follows the new value.

- [ ] **Step 3: Commit**

```bash
git add src/presentation/overview/model.test.ts
git commit -m "test: follow the new update glyph in the Activity Bar tree"
```

---

### Task 6: Verify the whole change

**Files:**
- None — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every suite green.

- [ ] **Step 2: Run the type checker**

Run: `npm run typecheck`
Expected: PASS with no output.

- [ ] **Step 3: Run the localization guards**

Run: `npm run check:i18n && npm run check:locales`
Expected: `UI localization OK: <n> production sources scanned.` and the locale check passing. The
Chinese countdown wording lives in `src/localization/`, which the i18n guard skips.

- [ ] **Step 4: Run the fixture guard**

Run: `npm run guard:fixtures`
Expected: PASS.

---

### Task 7: Release 0.4.1

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump the version**

Run: `npm version 0.4.1 --no-git-tag-version --allow-same-version`
Expected: `package.json` and `package-lock.json` now read `0.4.1`.

- [ ] **Step 2: Write the CHANGELOG entry**

Add at the top of `CHANGELOG.md`, directly after the `# Changelog` heading:

```markdown
## 0.4.1 — 2026-11-23

- 状态栏悬浮提示的额度行不再显示绝对重置时刻（`11-23 05:00`），改为显示距离重置还有多久，例如“4小时26分钟后重置”（英文 `Resets in 4h 26m`）；确切的重置时刻仍可在仪表盘查看。
- 悬浮提示中倒计时的首字母按列对齐，`⇄` 图标从重置行移除（文案已包含“重置”），底部“上次刷新”前的图标改为 `⟳`。
```

- [ ] **Step 3: Build and package**

Run: `npm run package`
Expected: `quota-deck-0.4.1.vsix` written to the repository root, with the typecheck, test,
localization, fixture and release gates all passing inside it.

- [ ] **Step 4: Inspect the packaged file list**

Run: `npx vsce ls`
Expected: the extension manifest and `dist/` bundles; no `node_modules`, no test files.

- [ ] **Step 5: Commit the release**

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v0.4.1"
```

- [ ] **Step 6: Tag the release**

```bash
git tag -a v0.4.1 -m "v0.4.1"
```

- [ ] **Step 7: Report to the user and wait for approval**

Report the verification output and the packaged artifact, then wait for explicit approval before
pushing.

- [ ] **Step 8: Push the branch and the tag**

`github.com:443` is blocked on this machine, so push over SSH:

```bash
git push ssh://git@ssh.github.com:443/AlexMultiAgent/VSC-plugin-quota-deck.git main
git push ssh://git@ssh.github.com:443/AlexMultiAgent/VSC-plugin-quota-deck.git refs/tags/v0.4.1
```

Expected: both push to `main`. The tag push starts `.github/workflows/publish.yml`, which runs
typecheck, tests and `npm run package`, publishes the VSIX through Marketplace Trusted Publishing
and attaches it to a GitHub Release named `v0.4.1`.

- [ ] **Step 9: Confirm the publish**

Run: `gh run list --workflow publish.yml --limit 1`
Expected: the `v0.4.1` run completes with the "Publish to the Visual Studio Marketplace" step green.

Run: `npx --yes @vscode/vsce@4.1.1 show alexmultiagent.quota-deck`
Expected: version `0.4.1`. The public listing lags the publish step by several minutes while the
gallery validates the VSIX, so a not-yet-listed 0.4.1 is not a failure — check again later.
