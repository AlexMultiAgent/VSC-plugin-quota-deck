# QuotaDeck CN — Contract Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify every MiniMax and DeepSeek endpoint against a live account, capture and sanitize the responses into committed fixtures, guard those fixtures against credential leakage with a CI check, and record the confirmed field names and semantics in a contract document that the provider plan consumes.

**Architecture:** A dev-only capture script under `scripts/` calls the live endpoints with credentials supplied through environment variables, runs every response through a sanitizer that replaces secret-shaped values with placeholders, and writes the result to `src/test/fixtures/<provider>/<capability>/<case>.json`. A separate guard script scans the committed fixtures and fails the build when a secret-shaped value is found. Each spike ends by writing a contract note under `docs/contracts/` that states the confirmed field names, the semantics of each field, and the cookie names each capability requires.

**Tech Stack:** Node 20, plain ESM JavaScript for the dev and CI scripts, global `fetch`, Vitest 2.x for the guard tests.

**Prerequisite:** `2026-11-16-quota-deck-cn-foundation.md` must be complete. The capture script and the guard scripts both live under `scripts/`, which is excluded from the packaged extension.

**Spec:** `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md` §11

---

## Credentials the spikes need

The spikes run against real accounts. Credentials are supplied as environment variables and are never written to a file, never committed, and never passed on a command line.

| Capability | Environment variable | Where to get it |
| --- | --- | --- |
| MiniMax CN Token Plan | `MINIMAX_CN_TOKEN_PLAN` | MiniMax 国内 open platform → Token Plan key |
| MiniMax CN web session | `MINIMAX_CN_WEB_COOKIE` | Browser devtools → Network → any minimaxi.com request → Cookie header |
| MiniMax Global Token Plan | `MINIMAX_GLOBAL_TOKEN_PLAN` | MiniMax international open platform → Token Plan key |
| MiniMax Global web session | `MINIMAX_GLOBAL_WEB_COOKIE` | Browser devtools → minimax.io cookie header |
| DeepSeek API key | `DEEPSEEK_API_KEY` | platform.deepseek.com → API keys |
| DeepSeek session token | `DEEPSEEK_SESSION_TOKEN` | Browser devtools → Network → platform.deepseek.com request → `token` header |
| DeepSeek cookie | `DEEPSEEK_COOKIE` | Browser devtools → platform.deepseek.com request → Cookie header |

If a credential is unavailable, run the spike anyway and record the capability as `unsupported` in the contract note. A missing credential must never block the plan.

**Exit codes of the capture script**

| Code | Meaning | What to do |
| --- | --- | --- |
| 0 | The fixture was written | Continue |
| 1 | A required argument or environment variable was missing | Record the capability as `unavailable` in the contract note, note the missing variable by name, and move on |
| 2 | The endpoint answered with a non-2xx status or a non-JSON body | Record the status in the contract note and move on |

**Supplying the credentials**

Export the variables in the shell before running the capture script. Verify what is set without printing any value:

```bash
node -e "for (const k of ['MINIMAX_CN_TOKEN_PLAN','MINIMAX_CN_WEB_COOKIE','MINIMAX_GLOBAL_TOKEN_PLAN','MINIMAX_GLOBAL_WEB_COOKIE','DEEPSEEK_API_KEY','DEEPSEEK_SESSION_TOKEN','DEEPSEEK_COOKIE']) console.log(k, Boolean(process.env[k]))"
```

Every capture command below assumes the variables are already exported.

---

## File Structure

```text
scripts/
  capture-fixture.mjs       dev-only capture CLI, never bundled
  sanitize.mjs              redaction rules shared by the capture script and the guard
  guard-fixtures.mjs        CI check: no secret-shaped value in a committed fixture
  sanitize.test.ts          unit test for the redaction rules
  guard-fixtures.test.ts    unit test for the guard's matcher

src/test/helpers/fixture.ts loader that reads a committed fixture from disk
src/test/fixtures/          committed, sanitized provider responses
docs/contracts/
  minimax.md                confirmed MiniMax field names and semantics
  deepseek.md               confirmed DeepSeek field names and semantics
```

Fixture layout is `<provider-id>/<capability-id>/<case>.json`. A case is a short kebab-case name describing the shape, for example `with-totals.json`, `without-totals.json`, `multi-currency.json`.

---

### Task 1: Fixture loader

**Files:**

- Create: `src/test/helpers/fixture.ts`
- Create: `src/test/helpers/fixture.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/test/helpers/fixture.test.ts
import { describe, expect, it } from 'vitest';
import { loadFixture, fixturePath } from './fixture';

describe('fixture loader', () => {
  it('builds a fixture path from a provider, capability, and case', () => {
    expect(fixturePath('minimax-cn', 'minimax.plan', 'with-totals')).toMatch(
      /src[/\\]test[/\\]fixtures[/\\]minimax-cn[/\\]plan[/\\]with-totals\.json$/,
    );
  });

  it('throws a clear error when the fixture does not exist', () => {
    expect(() => loadFixture('minimax-cn', 'minimax.plan', 'does-not-exist')).toThrow(
      /fixture not found/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/helpers/fixture.test.ts`
Expected: FAIL with `Failed to resolve import "./fixture"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/test/helpers/fixture.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The project root. Vitest and the npm scripts both run from it. */
const FIXTURE_ROOT = join(process.cwd(), 'src', 'test', 'fixtures');

/** `minimax.plan` becomes the directory `plan`, so the fixture tree stays readable. */
function capabilityDirectory(capabilityId: string): string {
  return capabilityId.includes('.') ? capabilityId.slice(capabilityId.indexOf('.') + 1) : capabilityId;
}

export function fixturePath(providerId: string, capabilityId: string, caseName: string): string {
  return join(FIXTURE_ROOT, providerId, capabilityDirectory(capabilityId), `${caseName}.json`);
}

export function loadFixture(providerId: string, capabilityId: string, caseName: string): unknown {
  const path = fixturePath(providerId, capabilityId, caseName);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      throw new Error(`fixture not found: ${path}`);
    }
    throw error;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/helpers/fixture.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/test/helpers/fixture.ts src/test/helpers/fixture.test.ts
git commit -m "test: add the fixture loader used by parser tests"
```

---

### Task 2: Redaction rules

**Files:**

- Create: `scripts/sanitize.mjs`
- Create: `scripts/sanitize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/sanitize.test.ts
import { describe, expect, it } from 'vitest';
import { sanitizeValue } from './sanitize.mjs';

describe('sanitizeValue', () => {
  it('replaces the value of a declared sensitive key', () => {
    const result = sanitizeValue({ token: 'abc123', plan: 'ok' }, ['token']);
    expect(result).toEqual({ token: '<redacted>', plan: 'ok' });
  });

  it('replaces a sk- prefixed value even when the key is not declared', () => {
    const result = sanitizeValue({ header: 'sk-abcdef0123456789abcdef' }, []);
    expect(result).toEqual({ header: '<redacted>' });
  });

  it('replaces a long hex string', () => {
    const result = sanitizeValue({ id: 'a'.repeat(40) }, []);
    expect(result).toEqual({ id: '<redacted>' });
  });

  it('leaves ordinary identifiers alone', () => {
    const result = sanitizeValue({ model: 'MiniMax-M2', count: 42 }, []);
    expect(result).toEqual({ model: 'MiniMax-M2', count: 42 });
  });

  it('walks into nested objects and arrays', () => {
    const result = sanitizeValue({ list: [{ token: 'abc' }, { ok: 1 }] }, ['token']);
    expect(result).toEqual({ list: [{ token: '<redacted>' }, { ok: 1 }] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/sanitize.test.ts`
Expected: FAIL to collect, with `Failed to load url ./sanitize.mjs ... Does the file exist?`.

- [ ] **Step 3: Write the implementation**

```js
// scripts/sanitize.mjs
//
// The redaction rules live here and are imported by the guard script, so the
// capture step and the guard always agree on what a secret looks like.
export const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /[A-Fa-f0-9]{32,}/,
  /[A-Za-z0-9+/=_-]{40,}/,
  /sessionId=[A-Za-z0-9_-]{8,}/,
  /(?:token|secret|password|api_?key)["']?\s*[:=]\s*["']?[A-Za-z0-9+/_-]{16,}/i,
];

export const SECRET_KEY_PATTERN = /token|secret|password|cookie|authorization|api_?key/i;

export const REDACTED = '<redacted>';

function isSecretLike(key, value) {
  if (typeof value !== 'string') return false;
  if (SECRET_KEY_PATTERN.test(key)) return true;
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Every string leaf is checked, whether or not its key was declared
 * sensitive. A credential that arrives under an unexpected key is still
 * redacted.
 */
export function sanitizeValue(value, sensitiveKeys = []) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, sensitiveKeys));
  }
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string' && (sensitiveKeys.includes(key) || isSecretLike(key, entry))) {
        result[key] = REDACTED;
        continue;
      }
      result[key] = sanitizeValue(entry, sensitiveKeys);
    }
    return result;
  }
  if (typeof value === 'string' && isSecretLike('value', value)) return REDACTED;
  return value;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/sanitize.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/sanitize.mjs scripts/sanitize.test.ts
git commit -m "build: add the shared redaction rules used by capture and guard scripts"
```

---

### Task 3: Capture script

**Files:**

- Create: `scripts/capture-fixture.mjs`

- [ ] **Step 1: Write the capture script**

```js
// scripts/capture-fixture.mjs
//
// Usage:
//   MINIMAX_CN_TOKEN_PLAN=... node scripts/capture-fixture.mjs \
//     --provider minimax-cn --capability minimax.plan --case with-totals
//
// The script reads credentials from the environment, never from a file or an
// argument, and writes a sanitized response to
// src/test/fixtures/<provider>/<capability>/<case>.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { sanitizeValue } from './sanitize.mjs';

const MINIMAX_ORIGIN = process.env.MINIMAX_ORIGIN ?? 'https://www.minimaxi.com';
const MINIMAX_GLOBAL_ORIGIN = process.env.MINIMAX_GLOBAL_ORIGIN ?? 'https://www.minimax.io';

function minimaxEndpoints(provider, capability) {
  const origin = provider === 'minimax-cn' ? MINIMAX_ORIGIN : MINIMAX_GLOBAL_ORIGIN;
  const tokenEnv = provider === 'minimax-cn' ? 'MINIMAX_CN_TOKEN_PLAN' : 'MINIMAX_GLOBAL_TOKEN_PLAN';
  const cookieEnv = provider === 'minimax-cn' ? 'MINIMAX_CN_WEB_COOKIE' : 'MINIMAX_GLOBAL_WEB_COOKIE';
  switch (capability) {
    case 'minimax.plan':
      return [{ url: `${origin}/v1/api/openplatform/coding_plan/remains`, auth: { kind: 'bearer', env: tokenEnv } }];
    case 'minimax.subscription':
      return [{ url: `${origin}/v1/api/openplatform/charge/combo/cycle_audio_resource_package`, auth: { kind: 'bearer', env: tokenEnv } }];
    case 'minimax.tokenUsage':
      return [{ url: `${origin}/account/amount`, auth: { kind: 'bearer', env: tokenEnv } }];
    case 'minimax.points':
      return [{ url: `${origin}/backend/account/token_plan_credit`, auth: { kind: 'cookie', env: cookieEnv } }];
    default:
      throw new Error(`unknown MiniMax capability: ${capability}`);
  }
}

function deepseekEndpoints(capability) {
  switch (capability) {
    case 'deepseek.balance':
      return [{ url: 'https://api.deepseek.com/user/balance', auth: { kind: 'bearer', env: 'DEEPSEEK_API_KEY' } }];
    case 'deepseek.usageAmount':
      return [{ url: 'https://platform.deepseek.com/api/v0/usage/by_api_key/amount', auth: { kind: 'session', env: 'DEEPSEEK_SESSION_TOKEN', cookieEnv: 'DEEPSEEK_COOKIE' } }];
    case 'deepseek.usageCost':
      return [{ url: 'https://platform.deepseek.com/api/v0/usage/by_api_key/cost', auth: { kind: 'session', env: 'DEEPSEEK_SESSION_TOKEN', cookieEnv: 'DEEPSEEK_COOKIE' } }];
    case 'deepseek.accountSummary':
      return [{ url: 'https://platform.deepseek.com/api/v0/users/get_user_summary', auth: { kind: 'session', env: 'DEEPSEEK_SESSION_TOKEN', cookieEnv: 'DEEPSEEK_COOKIE' } }];
    default:
      throw new Error(`unknown DeepSeek capability: ${capability}`);
  }
}

function endpoints(provider, capability) {
  if (provider === 'minimax-cn' || provider === 'minimax-global') {
    return minimaxEndpoints(provider, capability);
  }
  if (provider === 'deepseek') return deepseekEndpoints(capability);
  throw new Error(`unknown provider: ${provider}`);
}

function headersFor(spec) {
  const headers = { Accept: 'application/json' };
  if (spec.auth.kind === 'bearer') {
    const token = process.env[spec.auth.env];
    if (!token) throw new Error(`missing environment variable ${spec.auth.env}`);
    headers.Authorization = `Bearer ${token}`;
  } else if (spec.auth.kind === 'cookie') {
    const cookie = process.env[spec.auth.env];
    if (!cookie) throw new Error(`missing environment variable ${spec.auth.env}`);
    headers.Cookie = cookie;
  } else {
    const token = process.env[spec.auth.env];
    const cookie = process.env[spec.auth.cookieEnv];
    if (!token) throw new Error(`missing environment variable ${spec.auth.env}`);
    if (!cookie) throw new Error(`missing environment variable ${spec.auth.cookieEnv}`);
    headers.token = token;
    headers.Cookie = cookie;
  }
  return headers;
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) throw new Error(`missing --${name}`);
  return process.argv[index + 1];
}

const provider = argument('provider');
const capability = argument('capability');
const caseName = argument('case');
const sensitiveKeys = (process.env.FIXTURE_SENSITIVE_KEYS ?? '').split(',').filter(Boolean);

const specs = endpoints(provider, capability);
const bodies = [];

for (const spec of specs) {
  const url = new URL(spec.url);
  for (const [key, value] of Object.entries(spec.query ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: headersFor(spec) });
  const text = await response.text();
  if (!response.ok) {
    // The body is never printed: it may contain credential material.
    console.error(`${spec.url} returned ${response.status} with a ${text.length} byte body`);
    process.exit(2);
  }
  try {
    bodies.push(JSON.parse(text));
  } catch {
    console.error(`${spec.url} returned a non-JSON body`);
    process.exit(2);
  }
}

const payload =
  bodies.length === 1 ? bodies[0] : { capturedAt: new Date().toISOString(), responses: bodies };

const fixture = {
  capturedAt: new Date().toISOString(),
  provider,
  capability,
  case: caseName,
  sourceHost: new URL(specs[0].url).host,
  sourceUrls: specs.map((spec) => spec.url),
  response: sanitizeValue(payload, sensitiveKeys),
};

const tail = capability.includes('.') ? capability.slice(capability.indexOf('.') + 1) : capability;
const target = join(process.cwd(), 'src', 'test', 'fixtures', provider, tail, `${caseName}.json`);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
console.log(`wrote ${relative(process.cwd(), target)}`);
```

- [ ] **Step 2: Check the script parses**

Run: `node --check scripts/capture-fixture.mjs`
Expected: no output. Node parses the file without running it.

- [ ] **Step 3: Commit**

```bash
git add scripts/capture-fixture.mjs
git commit -m "build: add the dev-only fixture capture script"
```

---

### Task 4: Fixture guard

**Files:**

- Create: `scripts/guard-fixtures.mjs`
- Create: `scripts/guard-fixtures.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/guard-fixtures.test.ts
import { describe, expect, it } from 'vitest';
import { findSecretLikeValues } from './guard-fixtures.mjs';

describe('findSecretLikeValues', () => {
  it('finds nothing in a clean payload', () => {
    expect(findSecretLikeValues({ model: 'MiniMax-M2', count: 12 })).toEqual([]);
  });

  it('finds an api key', () => {
    const found = findSecretLikeValues({ header: 'sk-abcdef0123456789abcdef' });
    expect(found).toHaveLength(1);
    expect(found[0]!.path).toBe('header');
  });

  it('finds a long hex token', () => {
    expect(findSecretLikeValues({ value: 'f'.repeat(48) })).toHaveLength(1);
  });

  it('finds a cookie header value', () => {
    expect(findSecretLikeValues({ Cookie: 'sessionId=abcdef0123456789' })).toHaveLength(1);
  });

  it('reports the path of a nested match', () => {
    const found = findSecretLikeValues({ list: [{ id: 'a'.repeat(40) }] });
    expect(found[0]!.path).toBe('list[0].id');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/guard-fixtures.test.ts`
Expected: FAIL to collect, with `Failed to load url ./guard-fixtures.mjs ... Does the file exist?`.

- [ ] **Step 3: Write the implementation**

```js
// scripts/guard-fixtures.mjs
//
// The patterns come from the sanitizer, so the guard and the capture step can
// never disagree about what a secret looks like.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { SECRET_PATTERNS } from './sanitize.mjs';

/**
 * Every offending value is reported once, even when more than one pattern
 * matches it. A 48 character hex string matches both the hex pattern and
 * the long-token pattern, and the guard must not print it twice.
 */
export function findSecretLikeValues(value, path = '') {
  if (typeof value === 'string') {
    return SECRET_PATTERNS.some((pattern) => pattern.test(value)) ? [{ path, value }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findSecretLikeValues(entry, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      findSecretLikeValues(entry, path === '' ? key : `${path}.${key}`),
    );
  }
  return [];
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function main() {
  const root = resolve(process.cwd(), 'src', 'test', 'fixtures');
  let files;
  try {
    files = walk(root);
  } catch {
    console.log('Fixture guard OK: 0 files scanned.');
    return;
  }

  const failures = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    for (const hit of findSecretLikeValues(parsed)) {
      failures.push(`${relative(process.cwd(), file)} → ${hit.path}`);
    }
  }

  if (failures.length > 0) {
    console.error('Fixture guard failed: a committed fixture contains a secret-shaped value.');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(`Fixture guard OK: ${files.length} files scanned.`);
}

if (process.argv[1]?.endsWith('guard-fixtures.mjs')) main();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/guard-fixtures.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Run the guard against the current tree**

Run: `node scripts/guard-fixtures.mjs`
Expected: `Fixture guard OK: 0 files scanned.` before any fixture exists, and `Fixture guard OK: N files scanned.` once the spikes have run.

- [ ] **Step 6: Wire the guard into the npm scripts**

Insert this entry into the `scripts` block of `package.json`, immediately before the `"package"` entry so the JSON stays valid:

```json
    "guard:fixtures": "node scripts/guard-fixtures.mjs",
```

The fixture guard is part of the release gate, so it also runs before packaging. In the foundation plan's `scripts` block, change the `package` entry to:

```json
    "package": "npm run build && npm run guard:fixtures && vsce package --no-dependencies && npm run guard:package"
```

- [ ] **Step 7: Commit**

```bash
git add scripts/guard-fixtures.mjs scripts/guard-fixtures.test.ts package.json
git commit -m "build: fail the build when a committed fixture contains a secret"
```

---

### Task 5: Spike S1 — MiniMax plan response

**Files:**

- Create: `src/test/fixtures/minimax-cn/plan/with-totals.json`
- Create: `src/test/fixtures/minimax-cn/plan/without-totals.json`
- Create: `docs/contracts/minimax.md`

- [ ] **Step 1: Capture the domestic plan response**

Run:

```bash
  node scripts/capture-fixture.mjs \
  --provider minimax-cn --capability minimax.plan --case with-totals
```

Expected: `wrote src/test/fixtures/minimax-cn/plan/with-totals.json`.

If the command exits with code 2, the endpoint or the credential is wrong. Record the failure in `docs/contracts/minimax.md` and continue to the international origin.

- [ ] **Step 2: Capture the international plan response**

Run:

```bash
  node scripts/capture-fixture.mjs \
  --provider minimax-global --capability minimax.plan --case with-totals
```

Expected: `wrote src/test/fixtures/minimax-global/plan/with-totals.json`.

- [ ] **Step 3: Derive the without-totals case**

Capture the same response once more under a scratch name, then derive the case from it:

```bash
node scripts/capture-fixture.mjs \
  --provider minimax-cn --capability minimax.plan --case scratch
```

Expected: `wrote src/test/fixtures/minimax-cn/plan/scratch.json`.

Then edit `src/test/fixtures/minimax-cn/plan/scratch.json`:

1. Remove the total-count field from the response so the remaining percentage can only come from the remaining-percent field.
2. Set `"case": "without-totals"`, add `"derived": true` and `"derivedFrom": "with-totals"`, and set `"remainingPercentSource": "field"`.
3. Rename the file to `without-totals.json` and delete `scratch.json`.

Run the guard afterwards; the derived case must pass it like any other fixture.

- [ ] **Step 4: Guard the new fixtures**

Run: `node scripts/guard-fixtures.mjs`
Expected: `Fixture guard OK: N files scanned.` If the guard fails, add the offending key to `FIXTURE_SENSITIVE_KEYS` for the capture command, re-capture, and confirm the guard passes.

- [ ] **Step 5: Annotate the plan fixtures**

Every `minimax.plan` fixture records which reading of the remaining percentage it carries. Open `src/test/fixtures/minimax-cn/plan/with-totals.json` and `src/test/fixtures/minimax-global/plan/with-totals.json` and add the field the S1 comparison established:

```json
  "remainingPercentSource": "computed"
```

Use `"computed"` when the response carried both a total and a used count, and `"field"` when it carried only the remaining-percent field. The `without-totals` fixture always records `"field"`.

- [ ] **Step 6: Record the confirmed contract**

Write `docs/contracts/minimax.md` with the following sections. Fill each field name from the captured fixture, not from memory.

```markdown
# MiniMax verified contract

Captured <the actual capture date> from a dedicated test account.

## minimax.plan

Origin: `https://www.minimaxi.com` (domestic) and `https://www.minimax.io` (international).
Authentication: `Authorization: Bearer <token plan key>`.

| Question | Confirmed answer |
| --- | --- |
| Envelope object field | `<the field that holds the plan object, or "none" when the plan fields are at the top level>` |
| Total count field | `<field name from the fixture>` |
| Used count field | `<field name from the fixture>` |
| Remaining percent field | `<field name from the fixture>` |
| Reset timestamp field | `<field name from the fixture>` |
| Reset timestamp unit | `<seconds \| milliseconds>` |
| Reset timestamp zone | `<UTC \| offset \| local>` |
| Unlimited representation | `<field and value that means unlimited, or "none">` |
| Weekly total field | `<field name, or "none">` |
| Weekly used field | `<field name, or "none">` |
| Weekly remaining percent field | `<field name, or "none">` |
| Weekly reset timestamp field | `<field name, or "none">` |
| Model row array field | `<field name>` |
| Model name field | `<field name>` |
| Model quota field | `<field name>` |

Remaining percentage precedence confirmed against the platform UI:
`<state whether the field means remaining or used, and the observed value for a known plan>`.
```

- [ ] **Step 7: Commit**

```bash
git add -A src/test/fixtures docs/contracts
git commit -m "test: capture and document the minimax plan contract"
```

---

### Task 6: Spike S2 — MiniMax subscription, token usage, and points

**Files:**

- Create: `src/test/fixtures/minimax-cn/subscription/combo.json`
- Create: `src/test/fixtures/minimax-cn/tokenUsage/amount.json`
- Create: `src/test/fixtures/minimax-cn/points/credit.json`
- Modify: `docs/contracts/minimax.md`

- [ ] **Step 1: Capture the subscription response**

Run:

```bash
node scripts/capture-fixture.mjs \
  --provider minimax-cn --capability minimax.subscription --case combo
```

Expected: `wrote src/test/fixtures/minimax-cn/subscription/combo.json`.

- [ ] **Step 2: Capture the token usage response**

Run:

```bash
node scripts/capture-fixture.mjs \
  --provider minimax-cn --capability minimax.tokenUsage --case amount
```

Expected: `wrote src/test/fixtures/minimax-cn/tokenUsage/amount.json`.

- [ ] **Step 3: Capture the points response**

Run:

```bash
node scripts/capture-fixture.mjs \
  --provider minimax-cn --capability minimax.points --case credit
```

Expected: `wrote src/test/fixtures/minimax-cn/points/credit.json`.

- [ ] **Step 4: Identify the cookie names the points endpoint requires**

Unset the cookie variable and confirm the capture reports it as missing:

```bash
env -u MINIMAX_CN_WEB_COOKIE node scripts/capture-fixture.mjs --provider minimax-cn --capability minimax.points --case credit
```

Expected: exit code 1 and `missing environment variable MINIMAX_CN_WEB_COOKIE`.

Then find the required names. Remove one cookie name at a time from the value and re-run the capture. A name is **required** when removing it alone makes the endpoint answer 401 or 403. A name is optional when the endpoint still answers 200 without it. Record only the required names.

- [ ] **Step 5: Guard the new fixtures**

Run: `node scripts/guard-fixtures.mjs`
Expected: `Fixture guard OK: N files scanned.`

- [ ] **Step 6: Record the confirmed contract**

Append to `docs/contracts/minimax.md`:

```markdown
## minimax.subscription

| Question | Confirmed answer |
| --- | --- |
| Expiry timestamp field | `<field name>` |
| Expiry timestamp unit | `<unit>` |
| Plan name field | `<field name>` |

## minimax.tokenUsage

| Question | Confirmed answer |
| --- | --- |
| Yesterday total field | `<field name>` |
| Last seven days total field | `<field name>` |
| Current month total field | `<field name>` |
| Currency field | `<field name>` |
| Date grouping field | `<field name>` |

## minimax.points

| Question | Confirmed answer |
| --- | --- |
| Required cookie names | `<name>, <name>` |
| Points balance field | `<field name>` |
| Expiry field | `<field name>` |
```

- [ ] **Step 7: Commit**

```bash
git add -A src/test/fixtures docs/contracts
git commit -m "test: capture the minimax subscription, usage and points contracts"
```

---

### Task 7: Spike S3 — DeepSeek balance

**Files:**

- Create: `src/test/fixtures/deepseek/balance/standard.json`
- Create: `docs/contracts/deepseek.md`

- [ ] **Step 1: Capture the balance response**

Run:

```bash
node scripts/capture-fixture.mjs \
  --provider deepseek --capability deepseek.balance --case standard
```

Expected: `wrote src/test/fixtures/deepseek/balance/standard.json`.

- [ ] **Step 2: Guard the new fixtures**

Run: `node scripts/guard-fixtures.mjs`
Expected: `Fixture guard OK: N files scanned.`

- [ ] **Step 3: Record the confirmed contract**

Write `docs/contracts/deepseek.md`:

```markdown
# DeepSeek verified contract

Captured <the actual capture date> from a dedicated test account.

## deepseek.balance

Endpoint: `GET https://api.deepseek.com/user/balance`.
Authentication: `Authorization: Bearer <api key>`.

| Question | Confirmed answer |
| --- | --- |
| Balance list field | `<field name>` |
| Currency field | `<field name>` |
| Total balance field | `<field name>` |
| Granted balance field | `<field name>` |
| Topped-up balance field | `<field name>` |
| Currencies observed | `<list>` |
```

- [ ] **Step 4: Commit**

```bash
git add -A src/test/fixtures docs/contracts
git commit -m "test: capture and document the deepseek balance contract"
```

---

### Task 8: Spike S4 — DeepSeek usage

**Files:**

- Create: `src/test/fixtures/deepseek/usageAmount/today.json`
- Create: `src/test/fixtures/deepseek/usageCost/today.json`
- Create: `src/test/fixtures/deepseek/accountSummary/summary.json`
- Modify: `docs/contracts/deepseek.md`

- [ ] **Step 1: Extend the capture script with the usage query parameters**

In `scripts/capture-fixture.mjs`, change the `deepseek.usageAmount` and `deepseek.usageCost` endpoints to carry the query parameters:

```ts
      case 'deepseek.usageAmount':
        return [
          {
            url: 'https://platform.deepseek.com/api/v0/usage/by_api_key/amount',
            auth: { kind: 'session', env: 'DEEPSEEK_SESSION_TOKEN', cookieEnv: 'DEEPSEEK_COOKIE' },
            query: {
              start: String(Math.floor((Date.now() - 24 * 3_600_000) / 1000)),
              end: String(Math.floor(Date.now() / 1000)),
              tz: 'Asia/Shanghai',
            },
          },
        ];
      case 'deepseek.usageCost':
        return [
          {
            url: 'https://platform.deepseek.com/api/v0/usage/by_api_key/cost',
            auth: { kind: 'session', env: 'DEEPSEEK_SESSION_TOKEN', cookieEnv: 'DEEPSEEK_COOKIE' },
            query: {
              start: String(Math.floor((Date.now() - 24 * 3_600_000) / 1000)),
              end: String(Math.floor(Date.now() / 1000)),
              tz: 'Asia/Shanghai',
            },
          },
        ];
```

- [ ] **Step 2: Capture the usage responses**

Run each of:

```bash
node scripts/capture-fixture.mjs --provider deepseek --capability deepseek.usageAmount --case today
node scripts/capture-fixture.mjs --provider deepseek --capability deepseek.usageCost --case today
node scripts/capture-fixture.mjs --provider deepseek --capability deepseek.accountSummary --case summary
```

Expected: three `wrote …` lines.

- [ ] **Step 3: Determine the parameter encoding**

Add a `--unit` flag to the capture script. The value is `s` by default and `ms` for the experiment:

```js
const unit = process.argv.includes('--unit')
  ? process.argv[process.argv.indexOf('--unit') + 1]
  : 's';

function toParam(milliseconds: number): string {
  return String(unit === 'ms' ? milliseconds : Math.floor(milliseconds / 1000));
}
```

Use `toParam` for both `start` and `end`.

Capture the same window twice:

```bash
node scripts/capture-fixture.mjs --provider deepseek --capability deepseek.usageAmount --case unit-seconds
node scripts/capture-fixture.mjs --provider deepseek --capability deepseek.usageAmount --case unit-milliseconds --unit ms
```

- If the two responses describe the same window, the endpoint ignores the unit and the seconds encoding is not confirmed.
- If they describe different windows, or one of them errors, the endpoint distinguishes the unit. The response that matches the intended 24-hour window is the correct encoding.

Then delete the two `unit-*` fixtures, keep the `--unit` flag in the script, and set the default to the confirmed encoding. Record the outcome in the contract note.

- [ ] **Step 4: Determine the aggregation scope**

Check whether the response contains a key identifier. If it does, determine whether the platform exposes a list of the account's API keys by calling the account summary endpoint and inspecting its key list field. Record both facts.

- [ ] **Step 5: Guard the new fixtures**

Run: `node scripts/guard-fixtures.mjs`
Expected: `Fixture guard OK: N files scanned.`

- [ ] **Step 6: Record the confirmed contract**

Append to `docs/contracts/deepseek.md`:

```markdown
## deepseek.usageAmount and deepseek.usageCost

Endpoint: `GET https://platform.deepseek.com/api/v0/usage/by_api_key/{amount|cost}`.
Authentication: `token` header plus `Cookie` header.

| Question | Confirmed answer |
| --- | --- |
| start/end encoding | `<seconds \| milliseconds>` |
| start inclusive | `<yes \| no>` |
| end inclusive | `<yes \| no>` |
| tz parameter effect | `<how the offset is applied>` |
| Series rows array field | `<field name>` |
| Row date field | `<field name>` |
| Request count field | `<field name>` |
| Total tokens field | `<field name>` |
| Cache hit input tokens field | `<field name>` |
| Cache miss input tokens field | `<field name>` |
| Output tokens field | `<field name>` |
| Cost field | `<field name>` |
| Currency field | `<field name>` |
| Model breakdown array field | `<field name>` |
| Model name field | `<field name>` |
| Model cost field | `<field name>` |
| Series returned by the endpoint | `<none \| own series with field names>` |
| API key scope | `<single key \| account-wide>` |

## deepseek.accountSummary

| Question | Confirmed answer |
| --- | --- |
| Summary total tokens field | `<field name>` |
| Summary request count field | `<field name>` |
| API key list field | `<field name or absent>` |

## Open questions resolved

- OQ1 key list enumerable: `<yes \| no>`.
- OQ2 endpoint returns its own series: `<yes \| no>`.
- OQ4 balance returns a non-CNY currency: `<yes \| no>`.
```

- [ ] **Step 7: Commit**

```bash
git add -A src/test/fixtures docs/contracts scripts
git commit -m "test: capture and document the deepseek usage contracts"
```

---

### Task 9: Spike S5 — DeepSeek session expiry

**Files:**

- Create: `docs/contracts/deepseek.md` (append)

- [ ] **Step 1: Capture an expired-session response**

Set `DEEPSEEK_SESSION_TOKEN` to an invalid value and run:

```bash
DEEPSEEK_SESSION_TOKEN=invalid node scripts/capture-fixture.mjs \
  --provider deepseek --capability deepseek.accountSummary --case expired
```

Expected: the script exits with code 2 and prints the status code and the first 500 characters of the body.

- [ ] **Step 2: Identify the error shape**

Record the HTTP status and whether the body is JSON with an error code or an HTML login page. The distinction decides whether the runtime reports `auth` or `malformed`.

- [ ] **Step 3: Identify the required cookie names**

Remove one cookie name at a time from `DEEPSEEK_COOKIE` until the request fails. The names that survive are the required names.

- [ ] **Step 4: Record the confirmed contract**

Append to `docs/contracts/deepseek.md`:

```markdown
## Session expiry

| Question | Confirmed answer |
| --- | --- |
| Expired session status code | `<status>` |
| Expired session body shape | `<json with code \| html login page \| other>` |
| Error code field | `<field name>` |
| Required cookie names | `<name>, <name>` |
| Required session token header name | `<header name>` |
```

- [ ] **Step 5: Delete the expired-session fixture if it was captured**

The expired-session capture exits before writing a file, so nothing to delete. If a fixture was written anyway, remove it and re-run the guard.

- [ ] **Step 6: Commit**

```bash
git add docs/contracts/deepseek.md
git commit -m "docs: record the deepseek session expiry behaviour"
```

---

### Task 10: Contract verification gate

**Files:**

- Create: `docs/contracts/README.md`

- [ ] **Step 1: Write the contract index**

```markdown
# Provider contracts

These notes record what the live provider endpoints actually return, captured on
<the actual capture date> with the procedure in
`docs/superpowers/plans/2026-11-16-quota-deck-cn-contracts.md`.

| Provider | Contract | Status |
| --- | --- | --- |
| MiniMax | [minimax.md](minimax.md) | `<verified \| partially verified \| unavailable>` |
| DeepSeek | [deepseek.md](deepseek.md) | `<verified \| partially verified \| unavailable>` |

A capability marked `unavailable` in a contract note is implemented as an
`unsupported` capability state. It never falls back to a fabricated value.

## Re-verification

Provider responses change without notice. Re-run the capture script for each
capability when a provider fixture test fails with a shape mismatch, and commit
the refreshed fixture together with the updated contract note.
```

- [ ] **Step 2: Run the full guard**

Run: `npm run guard:fixtures`
Expected: `Fixture guard OK: N files scanned.`

- [ ] **Step 3: Run the whole test suite**

Run: `npx vitest run`
Expected: every test passes.

- [ ] **Step 4: Confirm no credential is in the working tree**

Run:

```bash
git grep -nIE "sk-[A-Za-z0-9_-]{12,}|sessionId=[A-Za-z0-9_-]{8,}" -- src scripts docs
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add docs/contracts/README.md
git commit -m "docs: index the verified provider contracts"
```

---

## Verification

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck
npm test
npm run guard:fixtures
```

Expected: all three pass.

- [ ] **Step 2: List the captured fixtures**

Run: `find src/test/fixtures -name '*.json' 2>/dev/null | sort`
Expected: one file per verified capability, with no file that contains a credential. An empty output means every capture was skipped, which is recorded in the contract notes.

- [ ] **Step 3: Confirm the working tree is clean**

Run: `git status --short`
Expected: no output.

---

## Out of Scope for This Plan

- Writing the parsers → `2026-11-16-quota-deck-cn-providers.md`
- The status bar, tooltip, and dashboard → `2026-11-16-quota-deck-cn-presentation.md`
- Onboarding and the marketplace release → `2026-11-16-quota-deck-cn-release.md`
