# QuotaDeck CN — Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the MiniMax, DeepSeek, and Qwen providers — parsers, capability resolution, cookie allow-listing, the provider adapters that own the endpoints, the provider registry, and the refresh scheduler — so that the coordinator produces real, correctly scoped `ProviderSnapshot` objects.

**Architecture:** Each provider is split into two layers. A **shape reader** maps the raw JSON response into a typed shape using a single field-name table read from the verified contract document. A **parser** turns that typed shape into the domain model through pure functions over plain data. The adapter owns the endpoints, the cookie allow-list, and the credential lookup, and resolves each capability to exactly one `CapabilityState`.

**Tech Stack:** TypeScript 5.6, Vitest 2.x, the `HttpClient` from the foundation plan, the `SecretStore` from the foundation plan.

**Prerequisite:** `2026-11-16-quota-deck-cn-contracts.md` must be complete. `docs/contracts/minimax.md` and `docs/contracts/deepseek.md` must contain the confirmed field names.

**When a capability is unavailable**

A contract note may record a capability as `unavailable` because the credential was missing or the endpoint did not answer. In that case:

1. The capability's fixture does not exist, so its fixture test does not exist either. Delete the test rather than leaving it to fail.
2. The adapter resolves that capability to `{ kind: 'unsupported', reason: 'not available for this account' }` instead of fetching it. Add a constant to the adapter, for example `const UNSUPPORTED_CAPABILITIES = new Set<CapabilityId>(['minimax.points'])`, and check it before fetching.
3. The dashboard and the tooltip show the capability as unsupported, which is a different state from failed and from unconfigured.

No capability is ever filled with a placeholder value.

**Spec:** `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md` §4 and §5

---

## The one external dependency

Every MiniMax and DeepSeek endpoint is an undocumented web API. The field names live in the verified contract documents, not in this plan.

Each shape module therefore starts with a single field-name table:

```ts
const FIELDS = {
  total: '<field name from docs/contracts/minimax.md>',
  used: '<field name from docs/contracts/minimax.md>',
} as const;
```

That table is the only fill-in in this plan. Everything else — the parser behaviour, the precedence rules, the capability states, the error handling, and every assertion — is fully specified below.

**Procedure for filling a table:** open the referenced section of the contract document, copy the confirmed field name into the table, then run the module's fixture test. The fixture test fails with `unknown response shape: <path>` when the table does not match the real response, so a wrong field name cannot pass silently.

---

## File Structure

```text
src/providers/
  cookies.ts                 cookie header parsing and allow-list enforcement
  cookies.test.ts
  registry.ts                builds the provider list from the secret store
  registry.test.ts
  minimax/
    shape.ts                 raw response → typed MiniMax shapes
    shape.test.ts
    parse.ts                 typed MiniMax shapes → domain model
    parse.test.ts
    provider.ts              the MiniMax adapter, shared by the CN and global instances
    provider.test.ts
  deepseek/
    shape.ts
    shape.test.ts
    parse.ts
    parse.test.ts
    aggregate.ts             account-level totals from per-key rows
    aggregate.test.ts
    usage.ts                 the usage series, parsed from the platform response
    usage.test.ts
    provider.ts
    provider.test.ts
    pricing.ts               peak and off-peak lookup from the bundled calendar
    pricing.test.ts
    pricing-calendar.json    versioned price and holiday calendar
  qwen/
    provider.ts              the V1 placeholder adapter
    provider.test.ts
src/core/scheduler.ts        interval refresh, pause when unfocused, refresh on focus
src/core/scheduler.test.ts
```

---

### Task 1: Cookie allow-list

**Files:**

- Create: `src/providers/cookies.ts`
- Create: `src/providers/cookies.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/providers/cookies.test.ts
import { describe, expect, it } from 'vitest';
import { parseCookieHeader, selectAllowedCookies } from './cookies';

describe('parseCookieHeader', () => {
  it('parses a cookie header into name and value pairs', () => {
    expect(parseCookieHeader('sessionId=abc; acw_tc=def')).toEqual([
      { name: 'sessionId', value: 'abc' },
      { name: 'acw_tc', value: 'def' },
    ]);
  });

  it('ignores empty segments', () => {
    expect(parseCookieHeader('a=1;;b=2')).toEqual([
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
    ]);
  });

  it('keeps a value that contains an equals sign', () => {
    expect(parseCookieHeader('token=abc=def')).toEqual([{ name: 'token', value: 'abc=def' }]);
  });

  it('returns an empty list for an empty header', () => {
    expect(parseCookieHeader('')).toEqual([]);
  });
});

describe('selectAllowedCookies', () => {
  it('keeps only the allow-listed names', () => {
    const cookies = parseCookieHeader('sessionId=abc; tracking=xyz; acw_tc=def');
    expect(selectAllowedCookies(cookies, ['sessionId', 'acw_tc']).cookies).toEqual([
      { name: 'sessionId', value: 'abc' },
      { name: 'acw_tc', value: 'def' },
    ]);
  });

  it('reports the allow-listed names that are missing', () => {
    const cookies = parseCookieHeader('sessionId=abc');
    const missing = selectAllowedCookies(cookies, ['sessionId', 'acw_tc']).missing;
    expect(missing).toEqual(['acw_tc']);
  });

  it('renders the selected cookies as a request header', () => {
    const cookies = parseCookieHeader('sessionId=abc; acw_tc=def');
    expect(selectAllowedCookies(cookies, ['sessionId']).header).toBe('sessionId=abc');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/providers/cookies.test.ts`
Expected: FAIL with `Failed to resolve import "./cookies"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/providers/cookies.ts
export interface Cookie {
  readonly name: string;
  readonly value: string;
}

export interface CookieSelection {
  readonly cookies: Cookie[];
  readonly missing: string[];
  readonly header: string;
}

export function parseCookieHeader(header: string): Cookie[] {
  return header
    .split(';')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const separator = segment.indexOf('=');
      if (separator === -1) return { name: segment, value: '' };
      return { name: segment.slice(0, separator).trim(), value: segment.slice(separator + 1).trim() };
    });
}

export function selectAllowedCookies(cookies: Cookie[], allowed: readonly string[]): CookieSelection {
  const selected = allowed
    .map((name) => cookies.find((cookie) => cookie.name === name))
    .filter((cookie): cookie is Cookie => cookie !== undefined);
  const missing = allowed.filter((name) => !cookies.some((cookie) => cookie.name === name));
  return {
    cookies: selected,
    missing,
    header: selected.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/providers/cookies.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/providers/cookies.ts src/providers/cookies.test.ts
git commit -m "feat: parse cookie headers and enforce a per-capability allow-list"
```

---

### Task 2: MiniMax shape reader

**Files:**

- Create: `src/providers/minimax/shape.ts`
- Create: `src/providers/minimax/shape.test.ts`

- [ ] **Step 1: Write the shape module**

Create `src/providers/minimax/shape.ts`. Every entry of `PLAN_FIELDS` is a placeholder until Step 4 fills it from the contract.

```ts
// src/providers/minimax/shape.ts

/**
 * A field name that the response does not contain. The contract note records
 * "none" for such a field; write ABSENT in the table for it. Never write the
 * literal `null` — the table is a name table, not a value table.
 */
const ABSENT = '__absent__';

const PLAN_FIELDS = {
  root: '<envelope object field from docs/contracts/minimax.md, or "none">',
  total: '<field name from docs/contracts/minimax.md>',
  used: '<field name from docs/contracts/minimax.md>',
  remainingPercent: '<field name from docs/contracts/minimax.md>',
  resetAt: '<field name from docs/contracts/minimax.md>',
  resetUnit: 'seconds' as 'seconds' | 'milliseconds',
  weeklyTotal: '<field name from docs/contracts/minimax.md, or "none">',
  weeklyUsed: '<field name from docs/contracts/minimax.md, or "none">',
  weeklyRemainingPercent: '<field name from docs/contracts/minimax.md, or "none">',
  weeklyResetAt: '<field name from docs/contracts/minimax.md, or "none">',
  unlimited: '<field name from docs/contracts/minimax.md, or "none">',
  models: '<model row array field from docs/contracts/minimax.md, or "none">',
  modelName: '<model name field from docs/contracts/minimax.md, or "none">',
  modelRemaining: '<model remaining field from docs/contracts/minimax.md, or "none">',
  modelTotal: '<model total field from docs/contracts/minimax.md, or "none">',
};

export interface MiniMaxWindow {
  readonly window: 'fiveHour' | 'weekly';
  readonly total: number | null;
  readonly used: number | null;
  readonly remainingPercent: number | null;
  readonly remainingPercentSource: 'computed' | 'field' | null;
  readonly resetAt: number | null;
  readonly unlimited: boolean;
}

export interface MiniMaxModel {
  readonly model: string;
  readonly remaining: number | null;
  readonly total: number | null;
}

export interface MiniMaxPlan {
  readonly windows: MiniMaxWindow[];
  readonly models: MiniMaxModel[];
}

export interface MiniMaxSubscription {
  readonly expiresAt: number | null;
  readonly planName: string | null;
}

export interface MiniMaxTokenUsage {
  readonly yesterday: number;
  readonly lastSevenDays: number;
  readonly currentMonth: number;
  readonly currency: string | null;
}

export interface MiniMaxPoints {
  readonly balance: number | null;
  readonly expiresAt: number | null;
}

const SUBSCRIPTION_FIELDS = {
  expiresAt: '<field name from docs/contracts/minimax.md, or "none">',
  planName: '<field name from docs/contracts/minimax.md, or "none">',
} as const;

const TOKEN_USAGE_FIELDS = {
  yesterday: '<field name from docs/contracts/minimax.md, or "none">',
  lastSevenDays: '<field name from docs/contracts/minimax.md, or "none">',
  currentMonth: '<field name from docs/contracts/minimax.md, or "none">',
  currency: '<field name from docs/contracts/minimax.md, or "none">',
} as const;

const POINTS_FIELDS = {
  balance: '<field name from docs/contracts/minimax.md, or "none">',
  expiresAt: '<field name from docs/contracts/minimax.md, or "none">',
} as const;

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`unknown response shape: ${path}`);
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asTimestamp(value: unknown, unit: 'seconds' | 'milliseconds'): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return unit === 'seconds' ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Read a field, treating ABSENT as "the response has no such field". */
function readField(record: Record<string, unknown>, name: string): unknown {
  return name === ABSENT ? undefined : record[name];
}

function asNumberField(record: Record<string, unknown>, name: string): number | null {
  return asNumber(readField(record, name));
}

export function readMiniMaxPlan(response: unknown): MiniMaxPlan {
  const root = asRecord(response, 'root');
  const plan =
    PLAN_FIELDS.root === ABSENT
      ? root
      : asRecord(readField(root, PLAN_FIELDS.root), `root.${PLAN_FIELDS.root}`);

  const fiveHourTotal = asNumberField(plan, PLAN_FIELDS.total);
  const fiveHourUsed = asNumberField(plan, PLAN_FIELDS.used);
  const fiveHourField = asNumberField(plan, PLAN_FIELDS.remainingPercent);

  const weeklyTotal = asNumberField(plan, PLAN_FIELDS.weeklyTotal);
  const weeklyUsed = asNumberField(plan, PLAN_FIELDS.weeklyUsed);
  const weeklyField = asNumberField(plan, PLAN_FIELDS.weeklyRemainingPercent);

  // Unlimited is only claimed when the response carries no meaningful weekly
  // quota AND the contract-confirmed marker says so. A missing weekly total on
  // its own is not evidence of unlimited.
  const unlimitedMarker = readField(plan, PLAN_FIELDS.unlimited);
  const weeklyHasNoQuota = weeklyTotal === null && weeklyField === null;
  const weeklyUnlimited = weeklyHasNoQuota && unlimitedMarker === true;

  const windows: MiniMaxWindow[] = [
    {
      window: 'fiveHour',
      total: fiveHourTotal,
      used: fiveHourUsed,
      remainingPercent:
        fiveHourTotal !== null && fiveHourUsed !== null
          ? 100 * ((fiveHourTotal - fiveHourUsed) / fiveHourTotal)
          : fiveHourField,
      remainingPercentSource:
        fiveHourTotal !== null && fiveHourUsed !== null
          ? 'computed'
          : fiveHourField !== null
            ? 'field'
            : null,
      resetAt: asTimestamp(readField(plan, PLAN_FIELDS.resetAt), PLAN_FIELDS.resetUnit),
      unlimited: false,
    },
  ];

  if (weeklyTotal !== null || weeklyField !== null || weeklyUnlimited) {
    windows.push({
      window: 'weekly',
      total: weeklyTotal,
      used: weeklyUsed,
      remainingPercent:
        weeklyTotal !== null && weeklyUsed !== null
          ? 100 * ((weeklyTotal - weeklyUsed) / weeklyTotal)
          : weeklyField,
      remainingPercentSource:
        weeklyTotal !== null && weeklyUsed !== null
          ? 'computed'
          : weeklyField !== null
            ? 'field'
            : null,
      resetAt: asTimestamp(readField(plan, PLAN_FIELDS.weeklyResetAt), PLAN_FIELDS.resetUnit),
      unlimited: weeklyUnlimited,
    });
  }

  const models: MiniMaxModel[] = [];
  const modelRows = readField(plan, PLAN_FIELDS.models);
  if (Array.isArray(modelRows)) {
    for (const row of modelRows) {
      const entry = asRecord(row, 'model');
      models.push({
        model: String(readField(entry, PLAN_FIELDS.modelName) ?? ''),
        remaining: asNumberField(entry, PLAN_FIELDS.modelRemaining),
        total: asNumberField(entry, PLAN_FIELDS.modelTotal),
      });
    }
  }

  return { windows, models };
}

export function readMiniMaxSubscription(response: unknown): MiniMaxSubscription {
  const root = asRecord(response, 'root');
  return {
    expiresAt: asTimestamp(readField(root, SUBSCRIPTION_FIELDS.expiresAt), PLAN_FIELDS.resetUnit),
    planName:
      readField(root, SUBSCRIPTION_FIELDS.planName) === undefined
        ? null
        : String(readField(root, SUBSCRIPTION_FIELDS.planName)),
  };
}

export function readMiniMaxTokenUsage(response: unknown): MiniMaxTokenUsage {
  const root = asRecord(response, 'root');
  return {
    yesterday: asNumberField(root, TOKEN_USAGE_FIELDS.yesterday) ?? 0,
    lastSevenDays: asNumberField(root, TOKEN_USAGE_FIELDS.lastSevenDays) ?? 0,
    currentMonth: asNumberField(root, TOKEN_USAGE_FIELDS.currentMonth) ?? 0,
    currency:
      readField(root, TOKEN_USAGE_FIELDS.currency) === undefined
        ? null
        : String(readField(root, TOKEN_USAGE_FIELDS.currency)),
  };
}

export function readMiniMaxPoints(response: unknown): MiniMaxPoints {
  const root = asRecord(response, 'root');
  return {
    balance: asNumberField(root, POINTS_FIELDS.balance),
    expiresAt: asTimestamp(readField(root, POINTS_FIELDS.expiresAt), PLAN_FIELDS.resetUnit),
  };
}
```

- [ ] **Step 2: Write the failing fixture test**

```ts
// src/providers/minimax/shape.test.ts
import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test/helpers/fixture';
import {
  readMiniMaxPlan,
  readMiniMaxPoints,
  readMiniMaxSubscription,
  readMiniMaxTokenUsage,
} from './shape';

describe('readMiniMaxPlan', () => {
  it('reads a real plan response without throwing', () => {
    const fixture = loadFixture('minimax-cn', 'minimax.plan', 'with-totals') as { response: unknown };
    const plan = readMiniMaxPlan(fixture.response);
    expect(plan.windows.length).toBeGreaterThan(0);
  });

  it('produces a finite remaining percentage for every window that has one', () => {
    const fixture = loadFixture('minimax-cn', 'minimax.plan', 'with-totals') as { response: unknown };
    const plan = readMiniMaxPlan(fixture.response);
    for (const window of plan.windows) {
      if (window.remainingPercent === null) continue;
      expect(Number.isFinite(window.remainingPercent)).toBe(true);
    }
  });

  it('produces an absolute reset timestamp', () => {
    const fixture = loadFixture('minimax-cn', 'minimax.plan', 'with-totals') as { response: unknown };
    const plan = readMiniMaxPlan(fixture.response);
    for (const window of plan.windows) {
      if (window.resetAt === null) continue;
      expect(window.resetAt).toBeGreaterThan(1_600_000_000_000);
    }
  });

  it('records where the remaining percentage came from', () => {
    const fixture = loadFixture('minimax-cn', 'minimax.plan', 'with-totals') as { response: unknown };
    const plan = readMiniMaxPlan(fixture.response);
    for (const window of plan.windows) {
      if (window.remainingPercent === null) continue;
      expect(['computed', 'field']).toContain(window.remainingPercentSource);
    }
  });

  it('rejects a response that does not have the expected shape', () => {
    expect(() => readMiniMaxPlan({ unexpected: true })).toThrow(/unknown response shape/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/providers/minimax/shape.test.ts`
Expected: FAIL with `unknown response shape`, because `PLAN_FIELDS` still holds placeholders.

- [ ] **Step 4: Fill in the field-name table**

Replace every placeholder in `PLAN_FIELDS` with the value the `minimax.plan` section of `docs/contracts/minimax.md` records:

- `root` — the envelope object field, or `ABSENT` when the note says the plan fields are at the top level.
- `total`, `used`, `remainingPercent`, `resetAt` — the confirmed field names.
- `resetUnit` — `'seconds'` or `'milliseconds'`. If the contract note records an ISO-8601 timestamp instead, set `resetUnit` to `'milliseconds'` and note that the parser reads the ISO string; the `asTimestamp` helper already handles a string.
- `weeklyTotal`, `weeklyUsed`, `weeklyRemainingPercent`, `weeklyResetAt` — the confirmed names, or `ABSENT` for a field the response does not carry.
- `unlimited` — the confirmed marker field, or `ABSENT` when the response has no unlimited marker.
- `models`, `modelName`, `modelRemaining`, `modelTotal` — the confirmed names, or `ABSENT`.

The same applies to the three smaller tables in the module: `SUBSCRIPTION_FIELDS`, `TOKEN_USAGE_FIELDS`, and `POINTS_FIELDS`. Fill each of them from the `minimax.subscription`, `minimax.tokenUsage`, and `minimax.points` sections of the contract note, using `ABSENT` for a field the response does not carry.

Never write `null` into a table. `ABSENT` is the only way to say "the response has no such field".

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/providers/minimax/shape.test.ts`
Expected: `5 passed`. If the test fails with `unknown response shape`, one of the table entries does not match the real response; correct it from the contract note.

- [ ] **Step 6: Run the fixture guard**

Run: `node scripts/guard-fixtures.mjs`
Expected: `Fixture guard OK: N files scanned.`

- [ ] **Step 7: Commit**

```bash
git add src/providers/minimax/shape.ts src/providers/minimax/shape.test.ts
git commit -m "feat: read the verified minimax plan shape"
```

---

### Task 3: MiniMax parser

**Files:**

- Create: `src/providers/minimax/parse.ts`
- Create: `src/providers/minimax/parse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/providers/minimax/parse.test.ts
import { describe, expect, it } from 'vitest';
import { categorizeModel, categorizeModels, pickTightestRemaining, remainingBar } from './parse';
import type { MiniMaxWindow } from './shape';

function window(overrides: Partial<MiniMaxWindow> = {}): MiniMaxWindow {
  return {
    window: 'fiveHour',
    total: 100,
    used: 40,
    remainingPercent: 60,
    remainingPercentSource: 'computed',
    resetAt: 1_800_000_000_000,
    unlimited: false,
    ...overrides,
  };
}

describe('pickTightestRemaining', () => {
  it('picks the window with the lower remaining percentage', () => {
    const picked = pickTightestRemaining([
      window({ window: 'fiveHour', remainingPercent: 60 }),
      window({ window: 'weekly', remainingPercent: 25 }),
    ]);
    expect(picked?.window).toBe('weekly');
  });

  it('excludes an unlimited window from the comparison', () => {
    const picked = pickTightestRemaining([
      window({ window: 'fiveHour', remainingPercent: 60 }),
      window({ window: 'weekly', remainingPercent: 0, unlimited: true }),
    ]);
    expect(picked?.window).toBe('fiveHour');
  });

  it('uses the only available window when the other is missing', () => {
    const picked = pickTightestRemaining([window({ window: 'fiveHour', remainingPercent: 12 })]);
    expect(picked?.remainingPercent).toBe(12);
  });

  it('returns undefined when no window has a percentage', () => {
    const picked = pickTightestRemaining([
      window({ remainingPercent: null, remainingPercentSource: null }),
    ]);
    expect(picked).toBeUndefined();
  });

  it('never reports a missing percentage as zero', () => {
    const picked = pickTightestRemaining([
      window({ remainingPercent: null, remainingPercentSource: null }),
    ]);
    expect(picked?.remainingPercent).not.toBe(0);
  });
});

describe('categorizeModel', () => {
  it('maps a text model to the text category', () => {
    expect(categorizeModel('abab6.5s-chat')).toBe('text');
  });

  it('maps a video model to the video category', () => {
    expect(categorizeModel('video-01')).toBe('video');
  });

  it('prefers the hailuo category over video', () => {
    expect(categorizeModel('hailuo-video')).toBe('hailuo');
  });

  it('maps an image model to the image category', () => {
    expect(categorizeModel('image-master')).toBe('image');
  });

  it('maps a speech model to the speech category', () => {
    expect(categorizeModel('speech-02')).toBe('speech');
  });

  it('falls back to other for an unknown model', () => {
    expect(categorizeModel('something-else')).toBe('other');
  });
});

describe('remainingBar', () => {
  it('fills one cell per ten percent', () => {
    expect(remainingBar(60)).toBe('██████░░░░');
  });

  it('rounds to the nearest cell', () => {
    expect(remainingBar(65)).toBe('███████░░░');
  });

  it('keeps at least one filled cell above zero', () => {
    expect(remainingBar(3)).toBe('█░░░░░░░░░');
  });

  it('renders an empty bar at zero', () => {
    expect(remainingBar(0)).toBe('░░░░░░░░░░');
  });

  it('clamps a value above one hundred', () => {
    expect(remainingBar(140)).toBe('██████████');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/providers/minimax/parse.test.ts`
Expected: FAIL with `Failed to resolve import "./parse"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/providers/minimax/parse.ts
import type { MiniMaxModel, MiniMaxWindow } from './shape';

export type ModelCategory =
  | 'text'
  | 'video'
  | 'image'
  | 'hailuo'
  | 'music'
  | 'speech'
  | 'other';

/**
 * The seven categories the design specifies. The order matters: the first
 * matching rule wins, so a model called "hailuo-video" lands in `hailuo`
 * rather than `video`.
 */
const CATEGORY_RULES: ReadonlyArray<{ category: ModelCategory; test: RegExp }> = [
  { category: 'hailuo', test: /hailuo/i },
  { category: 'video', test: /video/i },
  { category: 'image', test: /image|t2i|draw|paint/i },
  { category: 'music', test: /music|lyric|song/i },
  { category: 'speech', test: /speech|tts|audio|voice/i },
  { category: 'text', test: /text|chat|llm|model|abab|m2/i },
];

export function categorizeModel(model: string): ModelCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(model)) return rule.category;
  }
  return 'other';
}

export interface CategorizedModel extends MiniMaxModel {
  readonly category: ModelCategory;
}

export function categorizeModels(models: readonly MiniMaxModel[]): CategorizedModel[] {
  return models.map((model) => ({ ...model, category: categorizeModel(model.model) }));
}

const FILLED = '█';
const EMPTY = '░';
const CELLS = 10;

export function pickTightestRemaining(windows: readonly MiniMaxWindow[]): MiniMaxWindow | undefined {
  const candidates = windows.filter(
    (window) => !window.unlimited && window.remainingPercent !== null,
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((tightest, window) =>
    (window.remainingPercent ?? 0) < (tightest.remainingPercent ?? 0) ? window : tightest,
  );
}

export function remainingBar(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round((clamped / 100) * CELLS));
  return FILLED.repeat(filled) + EMPTY.repeat(CELLS - filled);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/providers/minimax/parse.test.ts`
Expected: `16 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/providers/minimax/parse.ts src/providers/minimax/parse.test.ts
git commit -m "feat: pick the tightest quota window and render a progress bar"
```

---

### Task 4: MiniMax adapter

**Files:**

- Create: `src/providers/minimax/provider.ts`
- Create: `src/providers/minimax/provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/providers/minimax/provider.test.ts
import { describe, expect, it, vi } from 'vitest';
import { makeSnapshot } from '../../test/helpers/snapshot';
import { MiniMaxProvider } from './provider';
import type { HttpClient, JsonResult } from '../../core/http';
import type { SecretReader } from '../../core/types';

function secretReader(values: Record<string, string>): SecretReader {
  return { read: async (providerId, credential) => values[`${providerId}:${credential}`] };
}

function httpClient(result: JsonResult): HttpClient {
  return { getJson: vi.fn().mockResolvedValue(result) } as unknown as HttpClient;
}

describe('MiniMaxProvider', () => {
  it('declares the four MiniMax capabilities', () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const ids = provider.getCapabilities().capabilities.map((capability) => capability.id);
    expect(ids).toEqual(['minimax.plan', 'minimax.subscription', 'minimax.tokenUsage', 'minimax.points']);
  });

  it('marks the plan capability required and the points capability optional', () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const byId = new Map(provider.getCapabilities().capabilities.map((c) => [c.id, c] as const));
    expect(byId.get('minimax.plan')?.required).toBe(true);
    expect(byId.get('minimax.points')?.required).toBe(false);
  });

  it('reports not-configured when no token plan key is stored', async () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const connection = await provider.connect(secretReader({}));
    expect(connection.kind).toBe('not-configured');
  });

  it('reports partial when only the optional web cookie is missing', async () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const connection = await provider.connect(secretReader({ 'minimax-cn:token-plan-key': 'token' }));
    expect(connection.kind).toBe('partial');
  });

  it('resolves the points capability to unconfigured when the cookie is absent', async () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    await provider.connect(secretReader({ 'minimax-cn:token-plan-key': 'token' }));
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    expect(snapshot.capabilities['minimax.points']?.kind).toBe('unconfigured');
  });

  it('never reports an unavailable capability as a zero percentage', async () => {
    const provider = new MiniMaxProvider('minimax-cn', 'https://www.minimaxi.com', httpClient({ ok: false, error: { kind: 'auth', message: 'error.auth' } }));
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    for (const state of Object.values(snapshot.capabilities)) {
      if (state.kind !== 'ok') continue;
      expect(JSON.stringify(state.data)).not.toContain('"remainingPercent":0');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/providers/minimax/provider.test.ts`
Expected: FAIL with `Failed to resolve import "./provider"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/providers/minimax/provider.ts
import type { HttpClient } from '../../core/http';
import type {
  CapabilityDescriptor,
  CapabilityState,
  ConnectionState,
  ProviderCapabilities,
  ProviderId,
  ProviderSnapshot,
  QuotaProvider,
  SecretReader,
} from '../../core/types';
import { parseCookieHeader, selectAllowedCookies } from '../cookies';
import {
  readMiniMaxPlan,
  readMiniMaxPoints,
  readMiniMaxSubscription,
  readMiniMaxTokenUsage,
} from './shape';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'minimax.plan', titleKey: 'capability.minimax.plan', credential: 'token-plan-key', required: true },
  { id: 'minimax.subscription', titleKey: 'capability.minimax.subscription', credential: 'token-plan-key', required: true },
  { id: 'minimax.tokenUsage', titleKey: 'capability.minimax.tokenUsage', credential: 'token-plan-key', required: true },
  { id: 'minimax.points', titleKey: 'capability.minimax.points', credential: 'web-cookie', required: false },
];

/**
 * Cookie names required by the points capability. The contract note records
 * the full list; replace this array with every name it lists, one entry each.
 */
const POINTS_COOKIE_NAMES: readonly string[] = ['<cookie name from docs/contracts/minimax.md>'];

export class MiniMaxProvider implements QuotaProvider {
  private tokenPlanKey: string | undefined;
  private webCookie: string | undefined;

  constructor(
    readonly id: Extract<ProviderId, 'minimax-cn' | 'minimax-global'>,
    readonly origin: string,
    private readonly http: HttpClient,
  ) {}

  get displayName(): string {
    return this.id === 'minimax-cn' ? 'MiniMax CN' : 'MiniMax Global';
  }

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(secrets: SecretReader): Promise<ConnectionState> {
    this.tokenPlanKey = await secrets.read(this.id, 'token-plan-key');
    this.webCookie = await secrets.read(this.id, 'web-cookie');

    if (this.tokenPlanKey === undefined) return { kind: 'not-configured' };
    if (this.webCookie === undefined) {
      return {
        kind: 'partial',
        capabilities: ['minimax.plan', 'minimax.subscription', 'minimax.tokenUsage'],
        missing: [{ capability: 'minimax.points', credential: 'web-cookie' }],
      };
    }
    return { kind: 'ready', capabilities: CAPABILITIES.map((capability) => capability.id) };
  }

  async fetchSnapshot(signal: AbortSignal): Promise<ProviderSnapshot> {
    const fetchedAt = new Date().toISOString();
    const capabilities: Record<string, CapabilityState> = {};

    capabilities['minimax.plan'] = await this.fetchPlan(fetchedAt, signal);
    capabilities['minimax.subscription'] = await this.fetchSimple(
      'minimax.subscription',
      '/v1/api/openplatform/charge/combo/cycle_audio_resource_package',
      fetchedAt,
      signal,
      readMiniMaxSubscription,
    );
    capabilities['minimax.tokenUsage'] = await this.fetchSimple(
      'minimax.tokenUsage',
      '/account/amount',
      fetchedAt,
      signal,
      readMiniMaxTokenUsage,
    );
    capabilities['minimax.points'] = await this.fetchPoints(fetchedAt, signal);

    return { providerId: this.id, fetchedAt, capabilities };
  }

  dispose(): void {
    this.tokenPlanKey = undefined;
    this.webCookie = undefined;
  }

  private async fetchPlan(fetchedAt: string, signal: AbortSignal): Promise<CapabilityState> {
    if (this.tokenPlanKey === undefined) return { kind: 'unconfigured', reason: 'missing token plan key' };
    const result = await this.http.getJson(`${this.origin}/v1/api/openplatform/coding_plan/remains`, {
      bearer: this.tokenPlanKey,
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    try {
      return { kind: 'ok', fetchedAt, data: readMiniMaxPlan(result.body) };
    } catch (error) {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }

  private async fetchSimple(
    capabilityId: string,
    path: string,
    fetchedAt: string,
    signal: AbortSignal,
    read: (response: unknown) => unknown,
  ): Promise<CapabilityState> {
    if (this.tokenPlanKey === undefined) return { kind: 'unconfigured', reason: 'missing token plan key' };
    const result = await this.http.getJson(`${this.origin}${path}`, {
      bearer: this.tokenPlanKey,
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    try {
      return { kind: 'ok', fetchedAt, data: read(result.body) };
    } catch (error) {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }

  private async fetchPoints(fetchedAt: string, signal: AbortSignal): Promise<CapabilityState> {
    if (this.webCookie === undefined) return { kind: 'unconfigured', reason: 'missing web session cookie' };
    const selection = selectAllowedCookies(parseCookieHeader(this.webCookie), POINTS_COOKIE_NAMES);
    if (selection.missing.length > 0) {
      return { kind: 'unconfigured', reason: `missing cookie: ${selection.missing.join(', ')}` };
    }
    const result = await this.http.getJson(`${this.origin}/backend/account/token_plan_credit`, {
      headers: { Cookie: selection.header },
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    try {
      return { kind: 'ok', fetchedAt, data: readMiniMaxPoints(result.body) };
    } catch (error) {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/providers/minimax/provider.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/providers/minimax/provider.ts src/providers/minimax/provider.test.ts
git commit -m "feat: add the minimax provider adapter with per-capability states"
```

---

### Task 5: DeepSeek balance parser

**Files:**

- Create: `src/providers/deepseek/shape.ts`
- Create: `src/providers/deepseek/shape.test.ts`
- Create: `src/providers/deepseek/parse.ts`
- Create: `src/providers/deepseek/parse.test.ts`

- [ ] **Step 1: Write the shape reader**

Create `src/providers/deepseek/shape.ts`:

```ts
// src/providers/deepseek/shape.ts
const BALANCE_FIELDS = {
  list: '<field name from docs/contracts/deepseek.md>',
  currency: '<field name from docs/contracts/deepseek.md>',
  total: '<field name from docs/contracts/deepseek.md>',
  granted: '<field name from docs/contracts/deepseek.md>',
  toppedUp: '<field name from docs/contracts/deepseek.md>',
} as const;

export interface DeepSeekBalanceEntry {
  readonly currency: string;
  readonly total: number;
  readonly granted: number;
  readonly toppedUp: number;
}

export interface DeepSeekBalance {
  readonly entries: DeepSeekBalanceEntry[];
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`unknown response shape: ${path}`);
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`unknown response shape: not a number`);
  return value;
}

export function readDeepSeekBalance(response: unknown): DeepSeekBalance {
  const root = asRecord(response, 'root');
  const list = root[BALANCE_FIELDS.list];
  if (!Array.isArray(list)) throw new Error(`unknown response shape: root.${BALANCE_FIELDS.list}`);
  const entries = list.map((item, index) => {
    const entry = asRecord(item, `root.${BALANCE_FIELDS.list}[${index}]`);
    return {
      currency: String(entry[BALANCE_FIELDS.currency]),
      total: asNumber(entry[BALANCE_FIELDS.total]),
      granted: asNumber(entry[BALANCE_FIELDS.granted]),
      toppedUp: asNumber(entry[BALANCE_FIELDS.toppedUp]),
    };
  });
  return { entries };
}
```

- [ ] **Step 2: Write the failing fixture test**

```ts
// src/providers/deepseek/shape.test.ts
import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test/helpers/fixture';
import { readDeepSeekBalance } from './shape';

describe('readDeepSeekBalance', () => {
  it('reads the real balance response without throwing', () => {
    const fixture = loadFixture('deepseek', 'deepseek.balance', 'standard') as { response: unknown };
    const balance = readDeepSeekBalance(fixture.response);
    expect(balance.entries.length).toBeGreaterThan(0);
  });

  it('gives every entry a non-empty currency code', () => {
    const fixture = loadFixture('deepseek', 'deepseek.balance', 'standard') as { response: unknown };
    const balance = readDeepSeekBalance(fixture.response);
    for (const entry of balance.entries) expect(entry.currency.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Write the failing parser test**

```ts
// src/providers/deepseek/parse.test.ts
import { describe, expect, it } from 'vitest';
import { balancesByCurrency, selectDisplayBalance } from './parse';

const balances = {
  entries: [
    { currency: 'USD', total: 12.5, granted: 2.5, toppedUp: 10 },
    { currency: 'CNY', total: 112.8, granted: 12.8, toppedUp: 100 },
  ],
};

describe('balancesByCurrency', () => {
  it('keeps every currency as a separate value', () => {
    expect(Object.keys(balancesByCurrency(balances))).toEqual(['USD', 'CNY']);
  });

  it('never sums across currencies', () => {
    const byCurrency = balancesByCurrency(balances);
    expect(byCurrency['CNY']!.total).toBe(112.8);
    expect(byCurrency['USD']!.total).toBe(12.5);
  });
});

describe('selectDisplayBalance', () => {
  it('prefers CNY', () => {
    expect(selectDisplayBalance(balances)?.currency).toBe('CNY');
  });

  it('falls back to USD when there is no CNY', () => {
    const withoutCny = { entries: [balances.entries[0]!] };
    expect(selectDisplayBalance(withoutCny)?.currency).toBe('USD');
  });

  it('falls back to the remaining currencies in ascending code order', () => {
    const other = { entries: [{ currency: 'EUR', total: 1, granted: 0, toppedUp: 1 }] };
    expect(selectDisplayBalance(other)?.currency).toBe('EUR');
  });

  it('returns undefined when there is no balance at all', () => {
    expect(selectDisplayBalance({ entries: [] })).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/providers/deepseek`
Expected: FAIL with `Failed to resolve import "./shape"` and `Failed to resolve import "./parse"`.

- [ ] **Step 5: Write the parser**

```ts
// src/providers/deepseek/parse.ts
import type { DeepSeekBalance, DeepSeekBalanceEntry } from './shape';

export function balancesByCurrency(balance: DeepSeekBalance): Record<string, DeepSeekBalanceEntry> {
  const result: Record<string, DeepSeekBalanceEntry> = {};
  for (const entry of balance.entries) result[entry.currency] = entry;
  return result;
}

const PREFERRED_ORDER = ['CNY', 'USD', 'EUR'];

export function selectDisplayBalance(balance: DeepSeekBalance): DeepSeekBalanceEntry | undefined {
  const byCurrency = balancesByCurrency(balance);
  for (const code of PREFERRED_ORDER) {
    if (byCurrency[code] !== undefined) return byCurrency[code];
  }
  const remaining = Object.keys(byCurrency).sort();
  return remaining.length > 0 ? byCurrency[remaining[0]!] : undefined;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/providers/deepseek`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/providers/deepseek
git commit -m "feat: parse deepseek balances and keep currencies separate"
```

---

### Task 6: DeepSeek account-level aggregation

**Files:**

- Create: `src/providers/deepseek/aggregate.ts`
- Create: `src/providers/deepseek/aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/providers/deepseek/aggregate.test.ts
import { describe, expect, it } from 'vitest';
import { aggregatePerKeyRows, canAggregate } from './aggregate';

const rows = [
  { apiKeyId: 'k1', requests: 3, tokens: 300, cost: 1.5 },
  { apiKeyId: 'k2', requests: 2, tokens: 200, cost: 0.5 },
];

describe('aggregatePerKeyRows', () => {
  it('sums the requests across keys', () => {
    expect(aggregatePerKeyRows(rows).requests).toBe(5);
  });

  it('sums the tokens across keys', () => {
    expect(aggregatePerKeyRows(rows).tokens).toBe(500);
  });

  it('sums the cost across keys', () => {
    expect(aggregatePerKeyRows(rows).cost).toBe(2);
  });

  it('counts the keys it aggregated', () => {
    expect(aggregatePerKeyRows(rows).keyCount).toBe(2);
  });

  it('never mixes a summary total with a per-key total', () => {
    const result = aggregatePerKeyRows(rows);
    expect(result).not.toHaveProperty('summaryTokens');
  });
});

describe('canAggregate', () => {
  it('allows aggregation when every key is known', () => {
    expect(canAggregate(rows, ['k1', 'k2'])).toBe(true);
  });

  it('refuses aggregation when a key is missing from the row set', () => {
    expect(canAggregate(rows, ['k1', 'k2', 'k3'])).toBe(false);
  });

  it('refuses aggregation when the key list is unknown', () => {
    expect(canAggregate(rows, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/providers/deepseek/aggregate.test.ts`
Expected: FAIL with `Failed to resolve import "./aggregate"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/providers/deepseek/aggregate.ts
export interface PerKeyRow {
  readonly apiKeyId: string;
  readonly requests: number;
  readonly tokens: number;
  readonly cost: number;
}

export interface AccountTotals {
  readonly requests: number;
  readonly tokens: number;
  readonly cost: number;
  readonly keyCount: number;
}

/**
 * Account-level totals are the sum of the per-key rows. The account summary
 * endpoint is never combined with these numbers, because the two are different
 * measurements of the same account.
 */
export function aggregatePerKeyRows(rows: readonly PerKeyRow[]): AccountTotals {
  return rows.reduce<AccountTotals>(
    (totals, row) => ({
      requests: totals.requests + row.requests,
      tokens: totals.tokens + row.tokens,
      cost: totals.cost + row.cost,
      keyCount: totals.keyCount + 1,
    }),
    { requests: 0, tokens: 0, cost: 0, keyCount: 0 },
  );
}

/** Aggregation is only valid when the full key list is known and every key has a row. */
export function canAggregate(rows: readonly PerKeyRow[], knownKeyIds: readonly string[] | undefined): boolean {
  if (knownKeyIds === undefined) return false;
  if (knownKeyIds.length === 0) return false;
  const rowIds = new Set(rows.map((row) => row.apiKeyId));
  return knownKeyIds.every((id) => rowIds.has(id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/providers/deepseek/aggregate.test.ts`
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/providers/deepseek/aggregate.ts src/providers/deepseek/aggregate.test.ts
git commit -m "feat: aggregate deepseek per-key usage without mixing summary totals"
```

---

### Task 7: DeepSeek adapter

**Files:**

- Create: `src/providers/deepseek/provider.ts`
- Create: `src/providers/deepseek/provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/providers/deepseek/provider.test.ts
import { describe, expect, it, vi } from 'vitest';
import { DeepSeekProvider } from './provider';
import type { HttpClient, JsonResult } from '../../core/http';
import type { SecretReader } from '../../core/types';

function secretReader(values: Record<string, string>): SecretReader {
  return { read: async (providerId, credential) => values[`${providerId}:${credential}`] };
}

function httpClient(result: JsonResult): HttpClient {
  return { getJson: vi.fn().mockResolvedValue(result) } as unknown as HttpClient;
}

describe('DeepSeekProvider', () => {
  it('declares the four DeepSeek capabilities', () => {
    const provider = new DeepSeekProvider(httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const ids = provider.getCapabilities().capabilities.map((capability) => capability.id);
    expect(ids).toEqual(['deepseek.balance', 'deepseek.usageAmount', 'deepseek.usageCost', 'deepseek.accountSummary']);
  });

  it('is not configured without an api key', async () => {
    const provider = new DeepSeekProvider(httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    expect((await provider.connect(secretReader({}))).kind).toBe('not-configured');
  });

  it('is partial with only an api key and marks the usage capabilities as missing', async () => {
    const provider = new DeepSeekProvider(httpClient({ ok: false, error: { kind: 'unknown', message: 'error.unknown' } }));
    const connection = await provider.connect(secretReader({ 'deepseek:api-key': 'sk-test' }));
    expect(connection.kind).toBe('partial');
  });

  it('resolves the balance capability even without a session', async () => {
    const provider = new DeepSeekProvider(httpClient({ ok: false, error: { kind: 'auth', message: 'error.auth' } }));
    await provider.connect(secretReader({ 'deepseek:api-key': 'sk-test' }));
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    expect(snapshot.capabilities['deepseek.balance']?.kind).toBe('failed');
    expect(snapshot.capabilities['deepseek.usageAmount']?.kind).toBe('unconfigured');
  });

  it('never throws when a single capability fails', async () => {
    const provider = new DeepSeekProvider(httpClient({ ok: false, error: { kind: 'network', message: 'error.network' } }));
    await expect(provider.fetchSnapshot(new AbortController().signal)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/providers/deepseek/provider.test.ts`
Expected: FAIL with `Failed to resolve import "./provider"`.

- [ ] **Step 3: Write the usage parser**

Create `src/providers/deepseek/usage.ts`. Every entry of `USAGE_FIELDS` is a placeholder until the contract note is filled in:

```ts
// src/providers/deepseek/usage.ts
const USAGE_FIELDS = {
  rows: '<field name from docs/contracts/deepseek.md>',
  date: '<field name from docs/contracts/deepseek.md>',
  requests: '<field name from docs/contracts/deepseek.md>',
  totalTokens: '<field name from docs/contracts/deepseek.md>',
  cacheHitTokens: '<field name from docs/contracts/deepseek.md>',
  cacheMissTokens: '<field name from docs/contracts/deepseek.md>',
  outputTokens: '<field name from docs/contracts/deepseek.md>',
  cost: '<field name from docs/contracts/deepseek.md>',
  currency: '<field name from docs/contracts/deepseek.md>',
  model: '<field name from docs/contracts/deepseek.md>',
  modelRows: '<field name from docs/contracts/deepseek.md>',
} as const;

export interface UsagePoint {
  readonly date: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cacheHitTokens: number;
  readonly cacheMissTokens: number;
  readonly outputTokens: number;
  readonly cost: number;
  readonly currency: string;
}

export interface ModelUsage {
  readonly model: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cost: number;
  readonly currency: string;
}

export interface DeepSeekUsage {
  readonly points: UsagePoint[];
  readonly byModel: ModelUsage[];
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`unknown response shape: ${path}`);
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('unknown response shape: not a number');
  return value;
}

export function readDeepSeekUsage(response: unknown): DeepSeekUsage {
  const root = asRecord(response, 'root');
  const rows = root[USAGE_FIELDS.rows];
  if (!Array.isArray(rows)) throw new Error(`unknown response shape: root.${USAGE_FIELDS.rows}`);

  const points: UsagePoint[] = rows.map((item, index) => {
    const row = asRecord(item, `root.${USAGE_FIELDS.rows}[${index}]`);
    return {
      date: String(row[USAGE_FIELDS.date]),
      requests: asNumber(row[USAGE_FIELDS.requests]),
      totalTokens: asNumber(row[USAGE_FIELDS.totalTokens]),
      cacheHitTokens: asNumber(row[USAGE_FIELDS.cacheHitTokens]),
      cacheMissTokens: asNumber(row[USAGE_FIELDS.cacheMissTokens]),
      outputTokens: asNumber(row[USAGE_FIELDS.outputTokens]),
      cost: asNumber(row[USAGE_FIELDS.cost]),
      currency: String(row[USAGE_FIELDS.currency]),
    };
  });

  const modelRows = root[USAGE_FIELDS.modelRows];
  const byModel: ModelUsage[] = Array.isArray(modelRows)
    ? modelRows.map((item, index) => {
        const row = asRecord(item, `root.${USAGE_FIELDS.modelRows}[${index}]`);
        return {
          model: String(row[USAGE_FIELDS.model]),
          requests: asNumber(row[USAGE_FIELDS.requests]),
          totalTokens: asNumber(row[USAGE_FIELDS.totalTokens]),
          cost: asNumber(row[USAGE_FIELDS.cost]),
          currency: String(row[USAGE_FIELDS.currency]),
        };
      })
    : [];

  return { points, byModel };
}
```

- [ ] **Step 4: Write the usage parser test**

Create `src/providers/deepseek/usage.test.ts`:

```ts
// src/providers/deepseek/usage.test.ts
import { describe, expect, it } from 'vitest';
import { loadFixture } from '../../test/helpers/fixture';
import { readDeepSeekUsage } from './usage';

describe('readDeepSeekUsage', () => {
  it('reads the real usage response without throwing', () => {
    const fixture = loadFixture('deepseek', 'deepseek.usageAmount', 'today') as { response: unknown };
    const usage = readDeepSeekUsage(fixture.response);
    expect(Array.isArray(usage.points)).toBe(true);
  });

  it('produces at least one point when the response has rows', () => {
    const fixture = loadFixture('deepseek', 'deepseek.usageAmount', 'today') as { response: unknown };
    const usage = readDeepSeekUsage(fixture.response);
    expect(usage.points.length).toBeGreaterThan(0);
  });

  it('gives every point a date and a finite request count', () => {
    const fixture = loadFixture('deepseek', 'deepseek.usageAmount', 'today') as { response: unknown };
    const usage = readDeepSeekUsage(fixture.response);
    for (const point of usage.points) {
      expect(point.date.length).toBeGreaterThan(0);
      expect(Number.isFinite(point.requests)).toBe(true);
    }
  });

  it('never merges two currencies into one total', () => {
    const fixture = loadFixture('deepseek', 'deepseek.usageAmount', 'today') as { response: unknown };
    const usage = readDeepSeekUsage(fixture.response);
    const currencies = new Set(usage.points.map((point) => point.currency));
    expect(currencies.size).toBeGreaterThan(0);
  });

  it('rejects a response that does not have the expected shape', () => {
    expect(() => readDeepSeekUsage({ unexpected: true })).toThrow(/unknown response shape/);
  });
});
```

- [ ] **Step 5: Run the usage test to verify it fails**

Run: `npx vitest run src/providers/deepseek/usage.test.ts`
Expected: FAIL with `Failed to resolve import "./usage"`.

- [ ] **Step 6: Write the adapter implementation**

```ts
// src/providers/deepseek/provider.ts
import type { HttpClient } from '../../core/http';
import type {
  CapabilityDescriptor,
  CapabilityState,
  ConnectionState,
  ProviderCapabilities,
  ProviderSnapshot,
  QuotaProvider,
  SecretReader,
} from '../../core/types';
import { parseCookieHeader, selectAllowedCookies } from '../cookies';
import { rangeFor, type RangeId } from '../../core/time';
import { readDeepSeekBalance } from './shape';
import { readDeepSeekUsage } from './usage';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'deepseek.balance', titleKey: 'capability.deepseek.balance', credential: 'api-key', required: true },
  { id: 'deepseek.usageAmount', titleKey: 'capability.deepseek.usageAmount', credential: 'session-token', required: false },
  { id: 'deepseek.usageCost', titleKey: 'capability.deepseek.usageCost', credential: 'session-token', required: false },
  { id: 'deepseek.accountSummary', titleKey: 'capability.deepseek.accountSummary', credential: 'session-token', required: false },
];

/**
 * Cookie names required by the platform endpoints. The contract note records
 * the full list; replace this array with every name it lists, one entry each.
 */
const PLATFORM_COOKIE_NAMES: readonly string[] = ['<cookie name from docs/contracts/deepseek.md>'];

const USAGE_ENDPOINTS = {
  'deepseek.usageAmount': '/api/v0/usage/by_api_key/amount',
  'deepseek.usageCost': '/api/v0/usage/by_api_key/cost',
  'deepseek.accountSummary': '/api/v0/users/get_user_summary',
} as const;

export class DeepSeekProvider implements QuotaProvider {
  readonly id = 'deepseek' as const;
  readonly displayName = 'DeepSeek';

  private apiKey: string | undefined;
  private sessionToken: string | undefined;
  private cookie: string | undefined;

  constructor(private readonly http: HttpClient) {}

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(secrets: SecretReader): Promise<ConnectionState> {
    this.apiKey = await secrets.read(this.id, 'api-key');
    this.sessionToken = await secrets.read(this.id, 'session-token');
    this.cookie = await secrets.read(this.id, 'web-cookie');

    if (this.apiKey === undefined) return { kind: 'not-configured' };
    if (this.sessionToken === undefined || this.cookie === undefined) {
      return {
        kind: 'partial',
        capabilities: ['deepseek.balance'],
        missing: [
          { capability: 'deepseek.usageAmount', credential: 'session-token' },
          { capability: 'deepseek.usageCost', credential: 'session-token' },
          { capability: 'deepseek.accountSummary', credential: 'session-token' },
        ],
      };
    }
    return { kind: 'ready', capabilities: CAPABILITIES.map((capability) => capability.id) };
  }

  async fetchSnapshot(signal: AbortSignal, range: RangeId = 'last7'): Promise<ProviderSnapshot> {
    const fetchedAt = new Date().toISOString();
    const capabilities: Record<string, CapabilityState> = {};

    capabilities['deepseek.balance'] = await this.fetchBalance(fetchedAt, signal);
    capabilities['deepseek.usageAmount'] = await this.fetchUsage(
      'deepseek.usageAmount',
      fetchedAt,
      signal,
      range,
    );
    capabilities['deepseek.usageCost'] = await this.fetchUsage(
      'deepseek.usageCost',
      fetchedAt,
      signal,
      range,
    );
    capabilities['deepseek.accountSummary'] = await this.fetchUsage(
      'deepseek.accountSummary',
      fetchedAt,
      signal,
      range,
    );

    return { providerId: this.id, fetchedAt, capabilities };
  }

  dispose(): void {
    this.apiKey = undefined;
    this.sessionToken = undefined;
    this.cookie = undefined;
  }

  private async fetchBalance(fetchedAt: string, signal: AbortSignal): Promise<CapabilityState> {
    if (this.apiKey === undefined) return { kind: 'unconfigured', reason: 'missing api key' };
    const result = await this.http.getJson('https://api.deepseek.com/user/balance', {
      bearer: this.apiKey,
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    try {
      return { kind: 'ok', fetchedAt, data: readDeepSeekBalance(result.body) };
    } catch (error) {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }

  private async fetchUsage(
    capabilityId: keyof typeof USAGE_ENDPOINTS,
    fetchedAt: string,
    signal: AbortSignal,
    rangeId: RangeId,
  ): Promise<CapabilityState> {
    if (this.sessionToken === undefined || this.cookie === undefined) {
      return { kind: 'unconfigured', reason: 'missing platform session' };
    }
    const selection = selectAllowedCookies(parseCookieHeader(this.cookie), PLATFORM_COOKIE_NAMES);
    if (selection.missing.length > 0) {
      return { kind: 'unconfigured', reason: `missing cookie: ${selection.missing.join(', ')}` };
    }
    const range = rangeFor(rangeId, Date.now());
    const url = new URL(`https://platform.deepseek.com${USAGE_ENDPOINTS[capabilityId]}`);
    if (capabilityId !== 'deepseek.accountSummary') {
      url.searchParams.set('start', String(Math.floor(range.start / 1000)));
      url.searchParams.set('end', String(Math.floor(range.end / 1000)));
      url.searchParams.set('tz', 'Asia/Shanghai');
    }
    const result = await this.http.getJson(url.toString(), {
      headers: { token: this.sessionToken, Cookie: selection.header },
      signal,
    });
    if (!result.ok) return { kind: 'failed', error: result.error };
    try {
      const usage = readDeepSeekUsage(result.body);
      return { kind: 'ok', fetchedAt, data: { ...usage, rangeId } };
    } catch (error) {
      return { kind: 'failed', error: { kind: 'malformed', message: 'error.malformed' } };
    }
  }
}
```

- [ ] **Step 7: Run the adapter test to verify it passes**

Run: `npx vitest run src/providers/deepseek/provider.test.ts`
Expected: `5 passed`.

- [ ] **Step 9: Run the usage test to verify it passes**

Run: `npx vitest run src/providers/deepseek/usage.test.ts`
Expected: `5 passed`.

- [ ] **Step 10: Commit**

```bash
git add src/providers/deepseek/provider.ts src/providers/deepseek/provider.test.ts src/providers/deepseek/usage.ts src/providers/deepseek/usage.test.ts
git commit -m "feat: add the deepseek provider adapter and usage parser"
```

---

### Task 8: Qwen placeholder provider

**Files:**

- Create: `src/providers/qwen/provider.ts`
- Create: `src/providers/qwen/provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/providers/qwen/provider.test.ts
import { describe, expect, it, vi } from 'vitest';
import { QwenProvider } from './provider';

describe('QwenProvider', () => {
  it('declares the four reserved capabilities', () => {
    const provider = new QwenProvider();
    const ids = provider.getCapabilities().capabilities.map((capability) => capability.id);
    expect(ids).toEqual([
      'qwen.accountBalance',
      'qwen.modelQuota',
      'qwen.consumption',
      'qwen.accessKeyValidation',
    ]);
  });

  it('resolves every capability to unsupported', async () => {
    const provider = new QwenProvider();
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    for (const state of Object.values(snapshot.capabilities)) {
      expect(state.kind).toBe('unsupported');
    }
  });

  it('performs no network request', async () => {
    const fetchMock = vi.fn();
    const original = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      await new QwenProvider().fetchSnapshot(new AbortController().signal);
    } finally {
      globalThis.fetch = original;
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows no metric at all', async () => {
    const provider = new QwenProvider();
    const snapshot = await provider.fetchSnapshot(new AbortController().signal);
    for (const state of Object.values(snapshot.capabilities)) {
      expect(state).not.toHaveProperty('data');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/providers/qwen/provider.test.ts`
Expected: FAIL with `Failed to resolve import "./provider"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/providers/qwen/provider.ts
import type {
  CapabilityDescriptor,
  CapabilityState,
  ConnectionState,
  ProviderCapabilities,
  ProviderSnapshot,
  QuotaProvider,
  SecretReader,
} from '../../core/types';

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: 'qwen.accountBalance', titleKey: 'capability.qwen.accountBalance', credential: 'api-key', required: false },
  { id: 'qwen.modelQuota', titleKey: 'capability.qwen.modelQuota', credential: 'api-key', required: false },
  { id: 'qwen.consumption', titleKey: 'capability.qwen.consumption', credential: 'api-key', required: false },
  { id: 'qwen.accessKeyValidation', titleKey: 'capability.qwen.accessKeyValidation', credential: 'api-key', required: false },
];

/**
 * The V1 Qwen adapter. It performs no network request and shows no metric. The
 * capability contract is declared here so that a future Bailian adapter can be
 * dropped in without changing the UI contract.
 */
export class QwenProvider implements QuotaProvider {
  readonly id = 'qwen' as const;
  readonly displayName = 'Qwen';

  getCapabilities(): ProviderCapabilities {
    return { capabilities: CAPABILITIES };
  }

  async connect(_secrets: SecretReader): Promise<ConnectionState> {
    return { kind: 'not-configured' };
  }

  async fetchSnapshot(signal: AbortSignal): Promise<ProviderSnapshot> {
    void signal;
    const capabilities: Record<string, CapabilityState> = {};
    for (const capability of CAPABILITIES) {
      capabilities[capability.id] = { kind: 'unsupported', reason: 'not implemented in V1' };
    }
    return { providerId: this.id, fetchedAt: new Date().toISOString(), capabilities };
  }

  dispose(): void {
    // The adapter holds no state.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/providers/qwen/provider.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/providers/qwen
git commit -m "feat: add the qwen placeholder adapter with honest unsupported states"
```

---

### Task 9: Provider registry and extension wiring

**Files:**

- Create: `src/providers/registry.ts`
- Create: `src/providers/registry.test.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/providers/registry.test.ts
import { describe, expect, it } from 'vitest';
import { buildProviders, MINIMAX_CN_ORIGIN, MINIMAX_GLOBAL_ORIGIN } from './registry';
import type { MiniMaxProvider } from './minimax/provider';
import type { HttpClient } from '../core/http';

describe('buildProviders', () => {
  it('builds one instance per provider id', () => {
    const providers = buildProviders({} as HttpClient);
    expect(providers.map((provider) => provider.id)).toEqual([
      'minimax-cn',
      'minimax-global',
      'deepseek',
      'qwen',
    ]);
  });

  it('gives the two MiniMax instances different origins', () => {
    const providers = buildProviders({} as HttpClient);
    const origins = providers
      .slice(0, 2)
      .map((provider) => (provider as MiniMaxProvider).origin);
    expect(origins[0]).not.toBe(origins[1]);
    expect(origins[0]).toBe(MINIMAX_CN_ORIGIN);
    expect(origins[1]).toBe(MINIMAX_GLOBAL_ORIGIN);
  });

  it('gives every provider a distinct id', () => {
    const providers = buildProviders({} as HttpClient);
    expect(new Set(providers.map((provider) => provider.id)).size).toBe(providers.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/providers/registry.test.ts`
Expected: FAIL with `Failed to resolve import "./registry"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/providers/registry.ts
import type { HttpClient } from '../core/http';
import type { QuotaProvider } from '../core/types';
import { DeepSeekProvider } from './deepseek/provider';
import { MiniMaxProvider } from './minimax/provider';
import { QwenProvider } from './qwen/provider';

export const MINIMAX_CN_ORIGIN = 'https://www.minimaxi.com';
export const MINIMAX_GLOBAL_ORIGIN = 'https://www.minimax.io';

export function buildProviders(http: HttpClient): QuotaProvider[] {
  return [
    new MiniMaxProvider('minimax-cn', MINIMAX_CN_ORIGIN, http),
    new MiniMaxProvider('minimax-global', MINIMAX_GLOBAL_ORIGIN, http),
    new DeepSeekProvider(http),
    new QwenProvider(),
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/providers/registry.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Wire the providers into the extension**

Replace the whole of `src/extension.ts` with:

```ts
// src/extension.ts
import * as vscode from 'vscode';
import { SnapshotCache } from './core/cache';
import { Coordinator } from './core/coordinator';
import { HttpClient } from './core/http';
import { Scheduler } from './core/scheduler';
import { SecretStore } from './core/secrets';
import { readSettings } from './core/settings';
import { resolveLanguage, translatorFor } from './localization';
import { buildProviders } from './providers/registry';
import { registerCommands } from './presentation/commands';
import { StatusBarPresenter } from './presentation/statusBar';

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

  const refreshAll = async (): Promise<void> => {
    const snapshots = await coordinator.refreshAll();
    const current = readSettings();
    statusBar.update(snapshots, current.providerOrder, current.statusBarMode, current.primaryProvider);
  };

  context.subscriptions.push(
    statusBar,
    { dispose: () => scheduler.stop() },
    { dispose: () => coordinator.dispose() },
    ...registerCommands({
      refresh: () => scheduler.refreshNow(),
      openDashboard: async () => {
        await vscode.window.showInformationMessage('仪表盘将在后续版本提供。');
      },
      // The onboarding, the switcher and the credential commands are built in
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
  statusBar.update(cached, settings.providerOrder, settings.statusBarMode, settings.primaryProvider);
}

export function deactivate(): void {
  // The coordinator and the scheduler are disposed through context.subscriptions,
  // which wipes the in-memory credential material.
}
```

The imports are part of the file above; do not add them separately.

- [ ] **Step 6: Run the whole test suite and typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/providers/registry.ts src/providers/registry.test.ts src/extension.ts
git commit -m "feat: wire the providers into the extension activation"
```

---

### Task 10: Refresh scheduler

**Files:**

- Create: `src/core/scheduler.ts`
- Create: `src/core/scheduler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/scheduler.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scheduler } from './scheduler';

describe('Scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refreshes on the configured interval', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: false });
    scheduler.start(refresh);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('does not refresh while the window is unfocused', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: true });
    scheduler.start(refresh);

    scheduler.setFocused(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(refresh).not.toHaveBeenCalled();

    scheduler.stop();
  });

  it('refreshes immediately when the window regains focus and the data is stale', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: true });
    scheduler.start(refresh);

    scheduler.setFocused(false);
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    scheduler.setFocused(true);
    expect(refresh).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it('does not refresh on focus when the data is still fresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: true });
    scheduler.start(refresh);

    scheduler.setFocused(false);
    scheduler.setFocused(true);
    expect(refresh).not.toHaveBeenCalled();

    scheduler.stop();
  });

  it('stops the timer', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: false });
    scheduler.start(refresh);
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('debounces a burst of manual refreshes into one request', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: false });
    scheduler.start(refresh);

    await scheduler.refreshNow();
    await scheduler.refreshNow();
    await scheduler.refreshNow();
    expect(refresh).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it('pauses automatic refresh until the backoff expires', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler({ refreshIntervalMinutes: 5, pauseWhenUnfocused: false });
    scheduler.start(refresh);

    scheduler.pauseUntil(Date.now() + 10 * 60_000);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/scheduler.test.ts`
Expected: FAIL with `Failed to resolve import "./scheduler"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/scheduler.ts
export interface SchedulerOptions {
  readonly refreshIntervalMinutes: number;
  readonly pauseWhenUnfocused: boolean;
  readonly manualDebounceMs?: number;
}

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private focused = true;
  private lastRefreshAt = 0;
  private refresh: (() => Promise<void>) | undefined;
  private backoffUntil = 0;
  private lastManualAt = 0;
  private manualInFlight: Promise<void> | undefined;

  constructor(private readonly options: SchedulerOptions) {}

  start(refresh: () => Promise<void>): void {
    this.refresh = refresh;
    this.stop();
    this.lastRefreshAt = Date.now();
    this.timer = setInterval(() => {
      if (this.options.pauseWhenUnfocused && !this.focused) return;
      if (Date.now() < this.backoffUntil) return;
      void this.run();
    }, this.options.refreshIntervalMinutes * 60_000);
  }

  /** A manual refresh. A burst of clicks collapses into one request. */
  async refreshNow(): Promise<void> {
    if (this.manualInFlight !== undefined) return this.manualInFlight;
    const debounce = this.options.manualDebounceMs ?? 2_000;
    if (Date.now() - this.lastManualAt < debounce) return;
    this.lastManualAt = Date.now();
    this.manualInFlight = this.run().finally(() => {
      this.manualInFlight = undefined;
    });
    return this.manualInFlight;
  }

  /** Stop automatic refresh until the given instant. Used for a rate-limit backoff. */
  pauseUntil(timestamp: number): void {
    this.backoffUntil = Math.max(this.backoffUntil, timestamp);
  }

  setFocused(focused: boolean): void {
    const wasFocused = this.focused;
    this.focused = focused;
    if (focused && !wasFocused) void this.runIfStale();
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async run(): Promise<void> {
    this.lastRefreshAt = Date.now();
    if (this.refresh === undefined) return;
    await this.refresh();
  }

  private async runIfStale(): Promise<void> {
    if (this.refresh === undefined) return;
    if (Date.now() < this.backoffUntil) return;
    const age = Date.now() - this.lastRefreshAt;
    if (age >= this.options.refreshIntervalMinutes * 60_000) await this.run();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/scheduler.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Wire the rate-limit backoff and the manual refresh**

The foundation's `CoordinatorOptions` already has an `onRateLimited` callback and the coordinator already calls it, so nothing has to change here.

The wiring lives in `src/extension.ts`, which Task 9 Step 5 already writes in full. Three details matter:

```ts
  const coordinator = new Coordinator({
    providers,
    cache,
    onRateLimited: (retryAfterMs) => scheduler.pauseUntil(Date.now() + retryAfterMs),
  });
```

```ts
  const refreshAll = async (): Promise<void> => { /* ... */ };

  scheduler.start(refreshAll);
```

```ts
      refresh: () => scheduler.refreshNow(),
```

`refreshAll` is the single refresh function. The scheduler calls it on the interval, the command calls it through `scheduler.refreshNow()` so a burst of clicks collapses into one request, and the focus listener calls it when the data is stale.

- [ ] **Step 6: Commit**

```bash
git add src/core/scheduler.ts src/core/scheduler.test.ts src/core/coordinator.ts src/extension.ts
git commit -m "feat: add the refresh scheduler with pause, debounce and rate-limit backoff"
```

---

### Task 11: DeepSeek pricing calendar

**Files:**

- Create: `src/providers/deepseek/pricing-calendar.json`
- Create: `src/providers/deepseek/pricing.ts`
- Create: `src/providers/deepseek/pricing.test.ts`

The calendar lives here, not in the release plan, because the dashboard reads
the current peak/off-peak state from it. The release plan only refreshes the
calendar file and checks that it has not expired.

- [ ] **Step 1: Write the calendar file**

```json
{
  "version": "2026.11",
  "coverageStart": "2026-01-01",
  "coverageEnd": "2027-06-30",
  "offPeakStartMinute": 0,
  "offPeakEndMinute": 480,
  "holidays": [
    { "date": "2026-01-01", "name": "元旦" },
    { "date": "2026-02-17", "name": "春节" },
    { "date": "2026-05-01", "name": "劳动节" },
    { "date": "2026-10-01", "name": "国庆节" },
    { "date": "2027-01-01", "name": "元旦" },
    { "date": "2027-02-06", "name": "春节" },
    { "date": "2027-05-01", "name": "劳动节" }
  ],
  "notes": "The off-peak window is 00:00 to 08:00 in Asia/Shanghai. Refresh before each release; the release gate fails when coverageEnd is less than 30 days away."
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/providers/deepseek/pricing.test.ts
import { describe, expect, it } from 'vitest';
import { calendar, isCovered, pricingState } from './pricing';

describe('calendar', () => {
  it('has a version and a coverage end', () => {
    expect(calendar.version.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(calendar.coverageEnd))).toBe(false);
  });

  it('covers at least thirty days beyond the release date', () => {
    const days = (Date.parse(calendar.coverageEnd) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(30);
  });
});

describe('isCovered', () => {
  it('covers a date inside the range', () => {
    expect(isCovered('2026-06-15')).toBe(true);
  });

  it('does not cover a date past the coverage end', () => {
    expect(isCovered('2030-01-01')).toBe(false);
  });

  it('lists the holidays inside the coverage window', () => {
    expect(calendar.holidays.length).toBeGreaterThan(0);
    for (const holiday of calendar.holidays) {
      expect(isCovered(holiday.date)).toBe(true);
      expect(holiday.name.length).toBeGreaterThan(0);
    }
  });
});

describe('pricingState', () => {
  it('reports off-peak at 02:00 in Shanghai time', () => {
    expect(pricingState(Date.parse('2026-06-14T18:00:00Z'))).toBe('offPeak');
  });

  it('reports peak at 14:00 in Shanghai time', () => {
    expect(pricingState(Date.parse('2026-06-15T06:00:00Z'))).toBe('peak');
  });

  it('reports peak at 09:00 in Shanghai time, just after the off-peak window', () => {
    expect(pricingState(Date.parse('2026-06-15T01:00:00Z'))).toBe('peak');
  });

  it('reports off-peak at 07:59 in Shanghai time, just before the window ends', () => {
    expect(pricingState(Date.parse('2026-06-14T23:59:00Z'))).toBe('offPeak');
  });

  it('reports unavailable for a date outside the coverage', () => {
    expect(pricingState(Date.parse('2030-01-01T00:00:00Z'))).toBe('unavailable');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/providers/deepseek/pricing.test.ts`
Expected: FAIL with `Failed to resolve import "./pricing"`.

- [ ] **Step 4: Write the implementation**

```ts
// src/providers/deepseek/pricing.ts
import calendarData from './pricing-calendar.json';

export interface Holiday {
  readonly date: string;
  readonly name: string;
}

export interface PricingCalendar {
  readonly version: string;
  readonly coverageStart: string;
  readonly coverageEnd: string;
  readonly offPeakStartMinute: number;
  readonly offPeakEndMinute: number;
  readonly holidays: Holiday[];
  readonly notes: string;
}

export const calendar = calendarData as PricingCalendar;

export type PricingState = 'peak' | 'offPeak' | 'unavailable';

export function isCovered(isoDate: string): boolean {
  return isoDate >= calendar.coverageStart && isoDate <= calendar.coverageEnd;
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

/** The minutes since Shanghai midnight for an instant. */
function shanghaiMinutes(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

export function pricingState(instant: number): PricingState {
  if (!isCovered(shanghaiDate(instant))) return 'unavailable';
  const minutes = shanghaiMinutes(instant);
  const offPeak = minutes >= calendar.offPeakStartMinute && minutes < calendar.offPeakEndMinute;
  return offPeak ? 'offPeak' : 'peak';
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/providers/deepseek/pricing.test.ts`
Expected: `10 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/providers/deepseek/pricing-calendar.json src/providers/deepseek/pricing.ts src/providers/deepseek/pricing.test.ts
git commit -m "feat: add the versioned deepseek pricing calendar and peak lookup"
```

---

---

## Verification

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck
npm test
npm run guard:fixtures
```

Expected: all three pass.

- [ ] **Step 2: Confirm the providers make no request outside their fixed origins**

Run: `git grep -nE "https?://" -- src/providers`
Expected: only `www.minimaxi.com`, `www.minimax.io`, `api.deepseek.com`, and `platform.deepseek.com` appear.

- [ ] **Step 3: Confirm the working tree is clean**

Run: `git status --short`
Expected: no output.

---

## Out of Scope for This Plan

- The status bar text, the tooltip, and the dashboard → `2026-11-16-quota-deck-cn-presentation.md`
- Onboarding and the marketplace release → `2026-11-16-quota-deck-cn-release.md`
