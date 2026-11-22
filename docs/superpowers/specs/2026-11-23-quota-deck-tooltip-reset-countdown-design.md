# QuotaDeck CN Tooltip Reset Countdown

> **Revision (2026-11-23, v0.4.2):** the wording in §4, §5 and §9, and acceptance criterion 1, are
> superseded. The reset cell now shows a `$(clock)` theme icon followed by a compact,
> locale-independent duration (`3h0m`, `6d22h`) and `tooltip.resetsIn` is removed; both languages
> read the same. The alignment (§6.1), countdown semantics (§7.5), freshness (§8) and scope (§3)
> decisions still hold.

## 1. Context

The status bar hover tooltip is the extension's most-read surface. Every MiniMax quota row and
every Qwen Token Plan row ends with a reset cell that currently shows the absolute reset instant
in a compact form:

```text
5 小时  ████████████████ 98%    ↻ 11-23 05:00
每周    ████████████████ 149%   ↻ 11-30 00:00
视频    ████████████████ 3/3     ↻ 11-24 00:00
```

The absolute instant answers "on which day does this boundary fall" but not the question the reader
actually has — "how long until I can use this again". Converting `11-23 05:00` into a duration is
the reader's job, and the conversion gets harder the further away the boundary is: `11-30 00:00` is
nearly a week out.

The dashboard already answers it. Its meter label reads
`下次重置 2026-11-23 05:00 · 剩余 4小时26分钟`. The tooltip and the Activity Bar tree do not.

## 2. Goals

1. The tooltip's reset cell states the time left until the next reset, in words, in the reader's
   language.
2. The countdown forms a clean column: every countdown starts at the same x, immediately after the
   quota percentage.
3. The reset glyph leaves the reset cell — the wording now carries "reset" by itself — and the
   footer keeps a single, consistent "last refreshed" glyph.

## 3. Non-goals

- **The Activity Bar tree and the dashboard keep their current wording.** The dashboard stays the
  place to read the exact instant; the tree keeps `下次重置 <absolute>`. Only the tooltip changes.
- **No new setting.** The countdown is not a preference.
- **The status bar does not change.** It never carried a reset time.
- **The expiry rows do not change.** A subscription expiry is a fixed calendar date, not a rolling
  window, so it keeps its absolute date and its `剩余 225天` count.

## 4. What the reset cell shows

Chinese:

| Row | Before | After |
| --- | --- | --- |
| 5 小时 | `↻ 11-23 05:00` | `4小时26分钟后重置` |
| 每周 | `↻ 11-30 00:00` | `6天23小时后重置` |
| 视频 | `↻ 11-24 00:00` | `1天3小时后重置` |

English:

| Row | Before | After |
| --- | --- | --- |
| 5-hour | `↻ 11-23 05:00` | `Resets in 4h 26m` |
| Weekly | `↻ 11-30 00:00` | `Resets in 6d 23h` |

The absolute instant leaves the tooltip entirely, including the `title` attribute that used to carry
it on hover. The dashboard remains the place to read the exact instant.

## 5. Wording and localization

One new message key:

| Key | zh-CN | en-US |
| --- | --- | --- |
| `tooltip.resetsIn` | `{duration}后重置` | `Resets in {duration}` |

Chinese puts the duration first and English puts it last, so the key needs a placeholder.
`Translator` is `(key: MessageKey) => string` and performs no interpolation, so the tooltip
substitutes the placeholder itself.

The duration text is not new: it is what the dashboard already produces through `durationLabel` in
`src/presentation/dashboard/viewModel.ts` (`4小时26分钟` / `4h 26m`). §7.1 moves that helper into
`src/presentation/display.ts` so both surfaces share one implementation, as CLAUDE.md requires of
the shared display helpers.

`{duration}` is the only placeholder in the message registry. A test asserts the literal never
reaches the rendered tooltip.

## 6. Layout

### 6.1 Why the countdown column lines up

The tooltip renders one HTML `<table>` per provider card. The reset cell is the last cell of a
quota row and spans the table's third and fourth columns. HTML tables share column boundaries
across rows, so the reset cell's left edge is at the same x on every row of a card. **The countdowns
therefore line up as long as the cell's content is left-aligned.**

Today the cell carries `style="text-align:right;white-space:nowrap;"`. VS Code's markdown
sanitizer strips that style: `allowedMarkdownHtmlAttributes` in
`src/vs/base/browser/markdownRenderer.ts` keeps only `color`, `background-color`,
`display:inline-block` and `border-radius`, and only on a `<span>`. The cell is therefore
left-aligned in practice today, but only by accident — the absolute instants happened to be the
same length (`MM-DD HH:mm`), so a right-aligned cell would have looked fine. The countdowns have
different lengths, so right-alignment would leave their first characters ragged.

**The fix is to drop `text-align:right` and state the alignment explicitly with `align="left"`**,
which the sanitizer keeps.

The quota percentage stays in the same cell as the bar and the countdown column follows the quota
column, so a countdown always reads after its own row's percentage.

### 6.2 The quota column

The quota value span carries
`style="display:inline-block;vertical-align:middle;min-width:42px;margin-left:10px;"`. The
sanitizer strips all of it except `display:inline-block;`, so the value is **not** right-aligned in
a fixed 42 px slot today; it sits directly against the end of the bar. The quota column's width is
still shared across rows, so the countdown column starts after the widest percentage in the card.

Right-aligning the percentage in a fixed slot would mean giving the percentage its own table
column. That column is shared with the balance rows, which put the money amount in it; splitting it
would push the MiniMax balance into a column as wide as the 16-block quota track. The requirement
is the countdown alignment, which §6.1 delivers without touching the table's column structure. The
quota column is left as it is.

### 6.3 Footer glyph

`tooltip.updated` is a bare glyph, `'⇄'`, and it is the value of a message rather than a decoration
inside a template. It becomes `'⟳'`.

`tooltip.updated` is read in two places: the tooltip footer (`src/presentation/tooltip.ts`) and the
Activity Bar tree's provider tooltip (`src/presentation/overview/model.ts`). Both render the same
"last refreshed at `<time>` · `<zone>`" line, so both take the new glyph. Splitting the key so the
tree keeps `⇄` would give one concept two glyphs for no reason.

## 7. Implementation

### 7.1 `src/presentation/display.ts`

Add `formatDuration(milliseconds: number, t: Translator): string`, moved verbatim from
`durationLabel` in `src/presentation/dashboard/viewModel.ts`. Same output, one copy.

### 7.2 `src/presentation/dashboard/viewModel.ts`

Import `formatDuration` from `../display` and delete the local `durationLabel`. The dashboard's
rendering is unchanged.

### 7.3 `src/localization/messages.ts`, `zh-cn.ts`, `en-us.ts`

- Add `tooltip.resetsIn`.
- Change `tooltip.updated` from `'⇄'` to `'⟳'`.

### 7.4 `src/presentation/tooltip.ts`

`resetCell` becomes:

```ts
function resetCell(resetAt: number | null | undefined, now: number, t: Translator): string {
  if (resetAt == null) return '<td colspan="2"></td>';
  const label = t('tooltip.resetsIn').replace('{duration}', formatDuration(resetAt - now, t));
  return (
    '<td class="t-muted" colspan="2" align="left" ' +
    'style="white-space:nowrap;">' +
    `${escapeHtml(label)}</td>`
  );
}
```

The `timeZone` parameter goes away: a duration is timezone-independent. `renderTooltip` already
takes `now` (defaulting to `Date.now()`), and `providerRows` and `qwenTokenPlanRows` already pass
it down.

`resetCell` is the only path for every quota row in the tooltip — the MiniMax `fiveHour` and
`weekly` windows, the MiniMax media allowances and the Qwen Token Plan windows — so the change
covers all of them at once.

### 7.5 Countdown semantics

`formatDuration` clamps a negative span to zero, so a reset time that has already passed renders
`0分钟后重置` / `Resets in 0m` until the next refresh replaces the snapshot. The dashboard's
`剩余 0分钟` already behaves this way. A separate "already reset" state is not added.

## 8. Freshness

The tooltip HTML is generated when the snapshot is painted, not when the mouse hovers, so the
countdown is as fresh as the last refresh — the default `quotaDeck.refreshIntervalMinutes` is 5 and
the setting allows 1–60. The dashboard's existing `剩余 3小时20分钟` has the same property. A status
bar item offers no re-render-on-hover hook, so the countdown cannot be refreshed between polls.

## 9. Testing

- `src/presentation/display.test.ts` — `formatDuration` renders `4小时26分钟` / `4h 26m` and
  `6天23小时` / `6d 23h`, and clamps a negative span to zero.
- `src/presentation/tooltip.test.ts` — a reset row shows the countdown and no longer contains `↻`
  or the absolute instant; the English row shows `Resets in …`; the literal `{duration}` never
  appears in the output; the footer's update glyph is `⟳`.
- `src/presentation/overview/model.test.ts` — the tree's update glyph follows the shared message
  value.
- The dashboard's existing tests pass unchanged.

## 10. Acceptance criteria

1. A MiniMax quota row in the tooltip reads `4小时26分钟后重置` (`Resets in 4h 26m`) instead of
   `↻ 11-23 05:00`.
2. The tooltip contains no absolute reset instant and no `↻`.
3. Every countdown in a card starts at the same x, directly after the quota column.
4. The footer's last-refreshed line begins with `⟳`.
5. The Activity Bar tree and the dashboard keep their current reset wording.
6. `npm run typecheck`, `npm test`, `npm run check:i18n` and `npm run check:locales` pass.
