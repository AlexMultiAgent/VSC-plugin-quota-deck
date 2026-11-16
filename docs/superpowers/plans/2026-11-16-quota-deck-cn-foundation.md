# QuotaDeck CN — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the QuotaDeck CN VS Code extension skeleton — build pipeline, test harness, core framework (types, errors, time, settings, secrets, HTTP, cache, coordinator, localization), a status bar shell, command registration, and a reproducible `.vsix` packaging gate.

**Architecture:** A Node-based VS Code extension written in TypeScript, bundled with esbuild into `dist/extension.js` (CommonJS, `vscode` external) and `dist/webview.js` (browser IIFE). The extension host owns all network access and all credentials; the webview receives normalized snapshots over a validated message protocol. The core framework is provider-agnostic: providers implement a `QuotaProvider` interface and the coordinator aggregates them into one `ProviderSnapshot` per provider, each of which resolves per capability to exactly one `CapabilityState`.

**Tech Stack:** TypeScript 5.6 (strict), VS Code API `^1.95.0`, esbuild 0.24, Vitest 2.x with a hand-written `vscode` module mock, Node 20.11 or newer for global `fetch`, `@vscode/vsce` for packaging. The guard scripts resolve the project root with `fileURLToPath(new URL('..', import.meta.url))`, so they run on any Node that has `fetch`.

**Spec:** `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md`

---

## File Structure

Everything in this plan lands under these paths. Later plans reuse them; no file below is created twice.

```text
package.json                     manifest: commands, settings, menus, engines
package.nls.json                 English command titles
package.nls.zh-cn.json           Chinese command titles
tsconfig.json                    strict typecheck config
vitest.config.ts                 test runner config + `vscode` alias
esbuild.mjs                      dual-bundle build script
.vscodeignore                    package exclusions
.gitignore                       build output, node_modules

src/extension.ts                 activation, wiring, deactivation
src/core/types.ts                ProviderId, CapabilityState, QuotaProvider, NormalizedError
src/core/errors.ts               HTTP/error → NormalizedError
src/core/settings.ts             typed access to the `quotaDeck.*` configuration
src/core/secrets.ts              Secret Storage access by credential kind
src/core/http.ts                 fetch wrapper: timeout, backoff, Retry-After
src/core/cache.ts                last-good snapshot persistence in globalState
src/core/time.ts                 Asia/Shanghai range math, countdown formatting
src/core/coordinator.ts          serial refresh, per-capability isolation, aggregation

src/localization/messages.ts     message key catalogue + MessageKey type
src/localization/en-us.ts        English strings
src/localization/zh-cn.ts        Chinese strings
src/localization/index.ts        locale selection

src/presentation/statusBar.ts    status bar item and text rendering
src/presentation/commands.ts     command registration

src/test/__mocks__/vscode.ts     the complete `vscode` module mock used by all tests
src/test/helpers/settings.ts     test helper: seed configuration values
src/test/helpers/snapshot.ts     test helper: build synthetic ProviderSnapshots
src/presentation/dashboard/webview/main.ts   the dashboard webview entry point
scripts/check-locales.mjs        CI check: the two locale bundles have the same keys
scripts/guard-package.mjs        CI check: the package ships no source and no secret
media/icon.png                   128x128 marketplace icon
README.md                        marketplace readme, required by `vsce package`
LICENSE                          MIT license text, required by `vsce package`
```

The webview entry point lives at its final path from the start. The dashboard plan overwrites this file; it never moves, so `esbuild.mjs` is never edited after Task 1.

### Locked conventions

- Every source file imports the VS Code API as `import * as vscode from 'vscode'`.
- Every module that can fail exports a pure function that takes its inputs as arguments and returns a result. The `vscode` API is touched only at the edges (extension.ts, presentation, settings, secrets).
- Parsers and formatters never import `vscode`. They are plain functions over plain data, which is what makes the provider and rendering tasks unit-testable without the mock.
- Tests live next to the code they test as `<name>.test.ts` under `src/`.
- Commits are made after every task, with the message from that task's final step.

---

### Task 1: Repository scaffold and build pipeline

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.mjs`
- Create: `.gitignore`
- Create: `.vscodeignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "quota-deck",
  "displayName": "QuotaDeck CN — MiniMax DeepSeek Qwen",
  "description": "国产大模型额度监控 · MiniMax、DeepSeek、Qwen 余额、用量与重置倒计时",
  "version": "0.1.0",
  "publisher": "alexmultiagent",
  "license": "MIT",
  "engines": { "vscode": "^1.95.0" },
  "categories": ["Other", "Visualization"],
  "keywords": ["minimax", "deepseek", "qwen", "quota", "usage", "balance", "token usage", "额度监控", "国产大模型"],
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "vscode:prepublish": "npm run build",
    "package": "vsce package --no-dependencies"
  },
  "devDependencies": {
    "@types/node": "^20.16.0",
    "@types/vscode": "^1.95.0",
    "@vscode/vsce": "^3.2.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022", "DOM"],
    "outDir": "out",
    "rootDir": ".",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "out"]
}
```

`include` covers `src/` only. The root config files (`vitest.config.ts`, `esbuild.mjs`) and everything under `scripts/` are not type-checked by `npm run typecheck`. Keep the scripts under `scripts/` in plain JavaScript so they run on any Node without a loader flag.

- [ ] **Step 3: Write `esbuild.mjs`**

```js
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  sourcemap: false,
  minify: !watch,
  logLevel: 'info',
};

const extension = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
};

const webview = {
  ...shared,
  entryPoints: ['src/presentation/dashboard/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
};

if (watch) {
  const ctx = await esbuild.context(extension);
  const webCtx = await esbuild.context(webview);
  await ctx.watch();
  await webCtx.watch();
} else {
  await Promise.all([esbuild.build(extension), esbuild.build(webview)]);
}
```

- [ ] **Step 4: Write `.gitignore`**

```text
node_modules/
dist/
out/
*.vsix
```

- [ ] **Step 5: Write `.vscodeignore`**

```text
.vscode/**
.gitignore
node_modules/**
src/**
out/**
**/*.ts
**/*.map
scripts/**
docs/**
.vscode-test/**
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: `added N packages` and a `package-lock.json` appears. No errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json esbuild.mjs .gitignore .vscodeignore
git commit -m "chore: scaffold extension project and build pipeline"
```

---

### Task 2: Test harness with a mocked VS Code API

**Files:**

- Create: `src/test/__mocks__/vscode.ts`
- Create: `vitest.config.ts`
- Create: `src/test/smoke.test.ts`

- [ ] **Step 1: Write the VS Code mock**

```ts
// src/test/__mocks__/vscode.ts
//
// This file is the complete VS Code mock for the whole project. Every later
// plan only ADDS to it; no plan rewrites it. Anything a later plan needs must
// already exist here.
export type Disposable = { dispose(): void };

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void): Disposable => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
  };
  fire(value: T): void { for (const l of [...this.listeners]) l(value); }
  dispose(): void { this.listeners = []; }
}

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const ViewColumn = { Active: -1, Beside: -2, One: 1 } as const;

/**
 * The public MarkdownString has no way to attach a stylesheet, so the mock
 * has none either. The hover tooltip therefore carries no CSS and relies on
 * tables and block characters, which VS Code renders.
 */
export class MarkdownString {
  value: string;
  isTrusted = false;
  supportHtml = false;
  supportThemeIcons = false;

  constructor(value = '') {
    this.value = value;
  }

  appendMarkdown(value: string): MarkdownString {
    this.value += value;
    return this;
  }

  appendText(value: string): MarkdownString {
    this.value += value;
    return this;
  }
}

export interface StatusBarItem {
  text: string;
  tooltip: string | MarkdownString | { value: string };
  command: string | { command: string; title: string };
  backgroundColor: unknown;
  show(): void;
  hide(): void;
  dispose(): void;
  visible: boolean;
}

export interface Uri {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;
  readonly fsPath: string;
  with(change: { path?: string; query?: string; fragment?: string }): Uri;
  toString(skipEncoding?: boolean): string;
  toJSON(): unknown;
}

export const Uri = {
  file(path: string): Uri {
    return {
      scheme: 'file',
      authority: '',
      path,
      query: '',
      fragment: '',
      fsPath: path,
      with(change: { path?: string; query?: string; fragment?: string }): Uri {
        return Uri.file(change.path ?? path);
      },
      toString: () => `file://${path}`,
      toJSON: () => ({ scheme: 'file', path }),
    };
  },
  joinPath(base: Uri, ...segments: string[]): Uri {
    return Uri.file([base.path, ...segments].join('/'));
  },
};

export interface Webview {
  html: string;
  options: { enableScripts?: boolean; localResourceRoots?: unknown[] };
  onDidReceiveMessage: (listener: (message: unknown) => void) => Disposable;
  postMessage(message: unknown): Promise<boolean>;
  /** Every message the extension host posted to the webview, in order. */
  postedMessages: unknown[];
  /** Deliver a message from the webview to the extension host. */
  receiveMessage(message: unknown): void;
}

export interface WebviewPanel {
  webview: Webview;
  title: string;
  visible: boolean;
  reveal(): void;
  dispose(): void;
}

/** Mutable state the tests drive. Reset it in `beforeEach`. */
export const state = {
  configuration: new Map<string, unknown>(),
  secrets: new Map<string, string>(),
  inputBoxResults: [] as Array<string | undefined>,
  quickPickResults: [] as unknown[],
  /** Every item list a picker was offered, in order. */
  quickPickOffered: [] as unknown[][],
  registeredCommands: new Map<string, (...args: never[]) => unknown>(),
  statusBarItems: [] as StatusBarItem[],
  webviewPanels: [] as WebviewPanel[],
  hoverProviders: [] as Array<{ provideHover(): unknown }>,
  /** Everything the extension showed to the user. Never contains a credential. */
  output: [] as string[],
};

export function __reset(): void {
  state.configuration.clear();
  state.secrets.clear();
  state.inputBoxResults = [];
  state.quickPickResults = [];
  state.quickPickOffered = [];
  state.registeredCommands.clear();
  state.statusBarItems = [];
  state.webviewPanels = [];
  state.hoverProviders = [];
  state.output = [];
}

function configKey(section: string, key: string): string {
  return `${section}.${key}`;
}

export const workspace = {
  getConfiguration(section: string) {
    return {
      get<T>(key: string, fallback: T): T {
        const found = state.configuration.get(configKey(section, key));
        return found === undefined ? fallback : (found as T);
      },
      update(key: string, value: unknown) {
        state.configuration.set(configKey(section, key), value);
        return Promise.resolve();
      },
    };
  },
  onDidChangeConfiguration: new EventEmitter<unknown>().event,
};

export const commands = {
  registerCommand(id: string, handler: (...args: never[]) => unknown): Disposable {
    state.registeredCommands.set(id, handler);
    return { dispose: () => { state.registeredCommands.delete(id); } };
  },
  executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
    const handler = state.registeredCommands.get(id);
    if (!handler) return Promise.reject(new Error(`command not found: ${id}`));
    return Promise.resolve(handler(...(args as never[])));
  },
};

export const window = {
  createStatusBarItem(_alignment: number, _priority?: number): StatusBarItem {
    const item: StatusBarItem = {
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      visible: false,
      show() { item.visible = true; },
      hide() { item.visible = false; },
      dispose() { item.visible = false; },
    };
    state.statusBarItems.push(item);
    return item;
  },
  showInputBox(options?: { password?: boolean; title?: string; placeHolder?: string }): Promise<string | undefined> {
    // Only the prompt is recorded. The entered value is never recorded, so a
    // test can assert that the extension never echoes a credential.
    state.output.push(`input:${options?.title ?? ''}:${options?.placeHolder ?? ''}`);
    return Promise.resolve(state.inputBoxResults.shift());
  },
  showQuickPick(items: unknown): Promise<unknown> {
    state.quickPickOffered.push(items as unknown[]);
    const queued = state.quickPickResults.shift();
    if (typeof queued === 'string') {
      const match = (items as unknown[]).find((item) =>
        typeof item === 'string' ? item === queued : (item as { label?: string })?.label === queued,
      );
      return Promise.resolve(match ?? undefined);
    }
    return Promise.resolve(queued);
  },
  showInformationMessage(message: string): Promise<void> {
    state.output.push(`info:${message}`);
    return Promise.resolve();
  },
  showErrorMessage(message: string): Promise<void> {
    state.output.push(`error:${message}`);
    return Promise.resolve();
  },
  showWarningMessage(message: string): Promise<void> {
    state.output.push(`warn:${message}`);
    return Promise.resolve();
  },
  withProgress<T>(_options: unknown, task: (progress: unknown) => Promise<T>): Promise<T> {
    return task({ report: () => undefined });
  },
  createWebviewPanel(
    _viewType: string,
    _title: string,
    _column: number,
    _options: unknown,
  ): WebviewPanel {
    const listeners: Array<(message: unknown) => void> = [];
    const webview: Webview = {
      html: '',
      options: {},
      postedMessages: [],
      onDidReceiveMessage: (listener: (message: unknown) => void) => {
        listeners.push(listener);
        return {
          dispose: () => {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
          },
        };
      },
      postMessage: async (message: unknown) => {
        webview.postedMessages.push(message);
        return true;
      },
      receiveMessage: (message: unknown) => {
        for (const listener of [...listeners]) listener(message);
      },
    };
    const panel: WebviewPanel = {
      webview,
      title: _title,
      visible: false,
      reveal() { panel.visible = true; },
      dispose() { panel.visible = false; },
    };
    state.webviewPanels.push(panel);
    return panel;
  },
  onDidChangeWindowState: new EventEmitter<{ focused: boolean }>().event,
};

export const languages = {
  registerHoverProvider(
    _selector: unknown,
    provider: { provideHover(): unknown },
  ): Disposable {
    state.hoverProviders.push(provider);
    return { dispose: () => undefined };
  },
};

export const env = { language: 'zh-cn' };

export const extensions = { getExtension: () => undefined };

export const SecretStorage = {
  async get(key: string): Promise<string | undefined> {
    return state.secrets.get(key);
  },
  async store(key: string, value: string): Promise<void> {
    state.secrets.set(key, value);
  },
  async delete(key: string): Promise<void> {
    state.secrets.delete(key);
  },
};
```

The mock is complete for the whole project. A later plan that needs a new VS Code API adds it to this file with an explicit "add to `src/test/__mocks__/vscode.ts`" step that names the exact insertion point.

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL('./src/test/__mocks__/vscode.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    restoreMocks: true,
  },
});
```

- [ ] **Step 3: Write the smoke test**

```ts
// src/test/smoke.test.ts
import { describe, expect, it } from 'vitest';
import { state } from './__mocks__/vscode';

describe('test harness', () => {
  it('exposes the mocked vscode module', () => {
    expect(state.registeredCommands.size).toBe(0);
    expect(typeof state.configuration.set).toBe('function');
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run`
Expected: `1 passed`. The test passes by design — it asserts that the mock module resolves. If it fails, the alias path in `vitest.config.ts` is wrong.

- [ ] **Step 5: Confirm the alias resolves**

Run: `npx vitest run src/test/smoke.test.ts`
Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/test
git commit -m "test: add vitest harness with a mocked vscode module"
```

---

### Task 3: Core type definitions

**Files:**

- Create: `src/core/types.ts`
- Create: `src/core/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/types.test.ts
import { describe, expect, it } from 'vitest';
import { PROVIDER_IDS, isProviderId } from './types';

describe('provider ids', () => {
  it('enumerates exactly the four providers', () => {
    expect(PROVIDER_IDS).toEqual(['minimax-cn', 'minimax-global', 'deepseek', 'qwen']);
  });

  it('narrows unknown ids', () => {
    expect(isProviderId('deepseek')).toBe(true);
    expect(isProviderId('kimi')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/types.test.ts`
Expected: FAIL with `Failed to resolve import "./types"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/types.ts
import type { MessageKey } from '../localization/messages';
import type { RangeId } from './time';

export const PROVIDER_IDS = ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export const CREDENTIAL_KINDS = ['token-plan-key', 'api-key', 'session-token', 'web-cookie'] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export type CapabilityId = string;

export type NormalizedErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'timeout'
  | 'network'
  | 'malformed'
  | 'unknown';

export interface NormalizedError {
  readonly kind: NormalizedErrorKind;
  /** A localization key such as 'error.auth', never a sentence. */
  readonly message: MessageKey;
  readonly status?: number;
  readonly retryAfterMs?: number;
}

export type CapabilityState =
  | { readonly kind: 'ok'; readonly fetchedAt: string; readonly data: unknown }
  | { readonly kind: 'stale'; readonly fetchedAt: string; readonly data: unknown; readonly reason: string }
  | { readonly kind: 'unconfigured'; readonly reason: string }
  | { readonly kind: 'unsupported'; readonly reason: string }
  | {
      readonly kind: 'failed';
      readonly error: NormalizedError;
      readonly lastGood?: { readonly fetchedAt: string; readonly data: unknown };
    };

export interface ProviderSnapshot {
  readonly providerId: ProviderId;
  readonly fetchedAt: string;
  readonly capabilities: Readonly<Record<CapabilityId, CapabilityState>>;
}

export interface CapabilityDescriptor {
  readonly id: CapabilityId;
  readonly titleKey: MessageKey;
  readonly credential: CredentialKind;
  readonly required: boolean;
}

export interface ProviderCapabilities {
  readonly capabilities: readonly CapabilityDescriptor[];
}

export type ConnectionState =
  | { readonly kind: 'ready'; readonly capabilities: CapabilityId[] }
  | {
      readonly kind: 'partial';
      readonly capabilities: CapabilityId[];
      readonly missing: { readonly capability: CapabilityId; readonly credential: CredentialKind }[];
    }
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'error'; readonly error: NormalizedError };

export interface SecretReader {
  read(providerId: ProviderId, credential: CredentialKind): Promise<string | undefined>;
}

export interface QuotaProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  getCapabilities(): ProviderCapabilities;
  connect(secrets: SecretReader): Promise<ConnectionState>;
  /**
   * `range` scopes the usage capabilities. A provider that has no usage
   * capability ignores it; the DeepSeek adapter uses it to build the request
   * window.
   */
  fetchSnapshot(signal: AbortSignal, range?: RangeId): Promise<ProviderSnapshot>;
  dispose(): void;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/types.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/types.test.ts
git commit -m "feat: define core provider and capability types"
```

---

### Task 4: Error normalization

**Files:**

- Create: `src/core/errors.ts`
- Create: `src/core/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/errors.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeError } from './errors';

describe('normalizeError', () => {
  it('maps 401 to an auth error', () => {
    const error = normalizeError({ status: 401 });
    expect(error.kind).toBe('auth');
    expect(error.status).toBe(401);
  });

  it('maps 403 to an auth error', () => {
    expect(normalizeError({ status: 403 }).kind).toBe('auth');
  });

  it('maps 429 to a rate limit error with the retry delay', () => {
    const error = normalizeError({ status: 429, retryAfterMs: 30_000 });
    expect(error.kind).toBe('rate-limit');
    expect(error.retryAfterMs).toBe(30_000);
  });

  it('maps an abort to a timeout error', () => {
    expect(normalizeError({ name: 'AbortError' }).kind).toBe('timeout');
  });

  it('maps a fetch failure to a network error', () => {
    expect(normalizeError({ message: 'fetch failed' }).kind).toBe('network');
  });

  it('never carries the original message into the error', () => {
    const error = normalizeError({ message: 'cookie=secret-value rejected' });
    expect(JSON.stringify(error)).not.toContain('secret-value');
  });

  it('maps a 404 to an unknown error rather than a malformed one', () => {
    expect(normalizeError({ status: 404 }).kind).toBe('unknown');
  });

  it('maps a 500 to a network error', () => {
    expect(normalizeError({ status: 500 }).kind).toBe('network');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/errors.test.ts`
Expected: FAIL with `Failed to resolve import "./errors"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/errors.ts
import type { MessageKey } from '../localization/messages';
import type { NormalizedError, NormalizedErrorKind } from './types';

export interface RawError {
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly name?: string;
  readonly message?: string;
  /** Set when the response was received but could not be parsed. */
  readonly malformed?: boolean;
}

/**
 * The error carries a kind, never a sentence. The presentation layer turns the
 * kind into a localized message with the `error.<kind>` message key, so the
 * same failure reads correctly in both languages and no raw provider text —
 * which may contain credential material — ever reaches the user.
 */
function kindOf(raw: RawError): NormalizedErrorKind {
  if (raw.malformed === true) return 'malformed';
  if (raw.status === 401 || raw.status === 403) return 'auth';
  if (raw.status === 429) return 'rate-limit';
  if (raw.name === 'AbortError') return 'timeout';
  if (raw.status !== undefined && raw.status >= 500) return 'network';
  if (raw.status !== undefined) return 'unknown';
  return 'network';
}

const MESSAGE_BY_KIND: Record<NormalizedErrorKind, MessageKey> = {
  auth: 'error.auth',
  'rate-limit': 'error.rateLimit',
  timeout: 'error.timeout',
  network: 'error.network',
  malformed: 'error.malformed',
  unknown: 'error.unknown',
};

export function normalizeError(raw: RawError): NormalizedError {
  const kind = kindOf(raw);
  return {
    kind,
    message: MESSAGE_BY_KIND[kind],
    ...(raw.status !== undefined ? { status: raw.status } : {}),
    ...(raw.retryAfterMs !== undefined ? { retryAfterMs: raw.retryAfterMs } : {}),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/errors.test.ts`
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/core/errors.ts src/core/errors.test.ts
git commit -m "feat: normalize provider errors without leaking credential text"
```

---

### Task 5: Time utilities

**Files:**

- Create: `src/core/time.ts`
- Create: `src/core/time.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/time.test.ts
import { describe, expect, it } from 'vitest';
import { formatCountdown, rangeFor, toShanghaiDayStart } from './time';

describe('toShanghaiDayStart', () => {
  it('returns midnight Asia/Shanghai for a given instant', () => {
    const instant = Date.parse('2026-03-15T07:30:00Z');
    expect(toShanghaiDayStart(instant)).toBe(Date.parse('2026-03-14T16:00:00Z'));
  });

  it('does not shift the day for an instant already inside the day', () => {
    const instant = Date.parse('2026-03-15T01:00:00Z');
    expect(toShanghaiDayStart(instant)).toBe(Date.parse('2026-03-14T16:00:00Z'));
  });
});

describe('rangeFor', () => {
  it('builds a last-7-day range as seven calendar days including today', () => {
    const now = Date.parse('2026-03-15T07:30:00Z');
    const range = rangeFor('last7', now);
    expect(range.bucket).toBe('day');
    expect(range.start).toBe(Date.parse('2026-03-08T16:00:00Z'));
    expect(range.end).toBe(now);
  });

  it('builds a last-month range from the first of the previous month', () => {
    const now = Date.parse('2026-03-15T07:30:00Z');
    const range = rangeFor('lastMonth', now);
    expect(range.start).toBe(Date.parse('2026-01-31T16:00:00Z'));
    expect(range.end).toBe(Date.parse('2026-02-28T16:00:00Z'));
  });

  it('builds a today range from midnight with hourly buckets', () => {
    const now = Date.parse('2026-03-15T07:30:00Z');
    const range = rangeFor('today', now);
    expect(range.bucket).toBe('hour');
    expect(range.start).toBe(Date.parse('2026-03-14T16:00:00Z'));
    expect(range.end).toBe(now);
  });
});

describe('formatCountdown', () => {
  it('formats under an hour in minutes', () => {
    expect(formatCountdown(25 * 60_000)).toBe('25m');
  });

  it('formats under a day in hours and minutes', () => {
    expect(formatCountdown(2 * 3_600_000 + 15 * 60_000)).toBe('2h15m');
  });

  it('formats a day or more in days and hours', () => {
    expect(formatCountdown(1 * 86_400_000 + 3 * 3_600_000)).toBe('1d3h');
  });

  it('formats an elapsed reset as zero minutes', () => {
    expect(formatCountdown(-5_000)).toBe('0m');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/time.test.ts`
Expected: FAIL with `Failed to resolve import "./time"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/time.ts
export const SHANGHAI = 'Asia/Shanghai';

export const RANGE_IDS = ['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth'] as const;
export type RangeId = (typeof RANGE_IDS)[number];
export type Bucket = 'hour' | 'day';

export interface DateRange {
  readonly id: RangeId;
  readonly start: number;
  readonly end: number;
  readonly bucket: Bucket;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Start of the Asia/Shanghai day containing `instant`, as an epoch millisecond value. */
export function toShanghaiDayStart(instant: number): number {
  const shanghai = new Date(instant + 8 * HOUR);
  const midnightUtc = Date.UTC(
    shanghai.getUTCFullYear(),
    shanghai.getUTCMonth(),
    shanghai.getUTCDate(),
  );
  return midnightUtc - 8 * HOUR;
}

function startOfShanghaiMonth(instant: number, monthOffset: number): number {
  const shanghai = new Date(instant + 8 * HOUR);
  const year = shanghai.getUTCFullYear();
  const month = shanghai.getUTCMonth() + monthOffset;
  return Date.UTC(year, month, 1) - 8 * HOUR;
}

export function rangeFor(id: RangeId, now: number): DateRange {
  const dayStart = toShanghaiDayStart(now);
  switch (id) {
    case 'today':
      return { id, start: dayStart, end: now, bucket: 'hour' };
    case 'yesterday':
      return { id, start: dayStart - DAY, end: dayStart, bucket: 'day' };
    case 'last7':
      return { id, start: dayStart - 6 * DAY, end: now, bucket: 'day' };
    case 'last30':
      return { id, start: dayStart - 29 * DAY, end: now, bucket: 'day' };
    case 'thisMonth':
      return { id, start: startOfShanghaiMonth(now, 0), end: now, bucket: 'day' };
    case 'lastMonth':
      return {
        id,
        start: startOfShanghaiMonth(now, -1),
        end: startOfShanghaiMonth(now, 0),
        bucket: 'day',
      };
  }
}

export function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 60_000));
  const minutes = total % 60;
  const hours = Math.floor(total / 60);
  if (hours < 1) return `${minutes}m`;
  if (hours < 24) {
    const remainingHours = hours % 24;
    const days = Math.floor(hours / 24);
    return days === 0 ? `${remainingHours}h${minutes}m` : `${days}d${remainingHours}h`;
  }
  return `${Math.floor(hours / 24)}d${hours % 24}h`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/time.test.ts`
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/core/time.ts src/core/time.test.ts
git commit -m "feat: add Asia/Shanghai range math and countdown formatting"
```

---

### Task 6: Settings layer

**Files:**

- Create: `src/core/settings.ts`
- Create: `src/core/settings.test.ts`
- Create: `src/test/helpers/settings.ts`

- [ ] **Step 1: Write the test helper**

```ts
// src/test/helpers/settings.ts
import { state } from '../__mocks__/vscode';

export function seedConfiguration(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    state.configuration.set(`quotaDeck.${key}`, value);
  }
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/core/settings.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { __reset } from '../test/__mocks__/vscode';
import { seedConfiguration } from '../test/helpers/settings';
import { readSettings } from './settings';

describe('readSettings', () => {
  beforeEach(() => __reset());

  it('returns defaults when nothing is configured', () => {
    const settings = readSettings();
    expect(settings.language).toBe('auto');
    expect(settings.refreshIntervalMinutes).toBe(5);
    expect(settings.pauseWhenUnfocused).toBe(true);
    expect(settings.statusBarMode).toBe('all');
    expect(settings.primaryProvider).toBe('minimax-cn');
    expect(settings.providerOrder).toEqual(['minimax-cn', 'minimax-global', 'deepseek', 'qwen']);
    expect(settings.timeZone).toBe('Asia/Shanghai');
  });

  it('reads configured values', () => {
    seedConfiguration({ refreshIntervalMinutes: 15, 'statusBar.primaryProvider': 'minimax-global' });
    const settings = readSettings();
    expect(settings.refreshIntervalMinutes).toBe(15);
    expect(settings.primaryProvider).toBe('minimax-global');
  });

  it('clamps the refresh interval into 1..60', () => {
    seedConfiguration({ refreshIntervalMinutes: 999 });
    expect(readSettings().refreshIntervalMinutes).toBe(60);
  });

  it('drops unknown ids and duplicates from the provider order', () => {
    seedConfiguration({ 'statusBar.providerOrder': ['deepseek', 'kimi', 'deepseek', 'qwen'] });
    expect(readSettings().providerOrder).toEqual(['deepseek', 'qwen']);
  });

  it('falls back to the default order when every id is invalid', () => {
    seedConfiguration({ providerOrder: ['kimi', 'moonshot'] });
    expect(readSettings().providerOrder).toEqual(['minimax-cn', 'minimax-global', 'deepseek', 'qwen']);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/core/settings.test.ts`
Expected: FAIL with `Failed to resolve import "./settings"`.

- [ ] **Step 4: Write the implementation**

```ts
// src/core/settings.ts
import * as vscode from 'vscode';
import { isProviderId, type ProviderId } from './types';

export type Language = 'auto' | 'zh-CN' | 'en-US';
export type StatusBarMode = 'all' | 'focused';

export interface Settings {
  readonly language: Language;
  readonly refreshIntervalMinutes: number;
  readonly pauseWhenUnfocused: boolean;
  readonly statusBarMode: StatusBarMode;
  readonly primaryProvider: ProviderId;
  readonly providerOrder: ProviderId[];
  readonly timeZone: string;
}

const DEFAULT_ORDER: ProviderId[] = ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('quotaDeck');
  const language = config.get<Language>('language', 'auto');
  const refresh = config.get<number>('refreshIntervalMinutes', 5);
  const mode = config.get<StatusBarMode>('statusBar.mode', 'all');
  const primary = config.get<string>('statusBar.primaryProvider', 'minimax-cn');
  const order = config.get<unknown[]>('statusBar.providerOrder', DEFAULT_ORDER);
  const timeZone = config.get<string>('timeZone', 'Asia/Shanghai');

  const validOrder = Array.isArray(order)
    ? order.filter((id): id is ProviderId => typeof id === 'string' && isProviderId(id))
    : [];

  return {
    language,
    refreshIntervalMinutes: clamp(refresh, 1, 60),
    pauseWhenUnfocused: config.get<boolean>('pauseWhenUnfocused', true),
    statusBarMode: mode,
    primaryProvider: isProviderId(primary) ? primary : 'minimax-cn',
    providerOrder: validOrder.length > 0 ? [...new Set(validOrder)] : [...DEFAULT_ORDER],
    timeZone,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/core/settings.test.ts`
Expected: `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/core/settings.ts src/core/settings.test.ts src/test/helpers/settings.ts
git commit -m "feat: read and sanitize quotaDeck configuration"
```

---

### Task 7: Secrets layer

**Files:**

- Create: `src/core/secrets.ts`
- Create: `src/core/secrets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/secrets.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, SecretStorage, state } from '../test/__mocks__/vscode';
import { SecretStore } from './secrets';

describe('SecretStore', () => {
  beforeEach(() => __reset());

  it('stores and reads a credential by provider and kind', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('deepseek', 'api-key', 'sk-test');
    expect(await store.read('deepseek', 'api-key')).toBe('sk-test');
  });

  it('returns undefined for a credential that was never written', async () => {
    const store = new SecretStore(SecretStorage);
    expect(await store.read('deepseek', 'api-key')).toBeUndefined();
  });

  it('keeps provider instances isolated', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('minimax-cn', 'token-plan-key', 'cn-key');
    await store.write('minimax-global', 'token-plan-key', 'global-key');
    expect(await store.read('minimax-cn', 'token-plan-key')).toBe('cn-key');
    expect(await store.read('minimax-global', 'token-plan-key')).toBe('global-key');
  });

  it('deletes a credential', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('deepseek', 'api-key', 'sk-test');
    await store.delete('deepseek', 'api-key');
    expect(await store.read('deepseek', 'api-key')).toBeUndefined();
  });

  it('uses the documented secret key names', async () => {
    const store = new SecretStore(SecretStorage);
    await store.write('minimax-cn', 'web-cookie', 'c=1');
    await store.write('minimax-global', 'web-cookie', 'c=2');
    expect([...state.secrets.keys()]).toEqual([
      'quotaDeck.minimax.cn.webCookie',
      'quotaDeck.minimax.global.webCookie',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/secrets.test.ts`
Expected: FAIL with `Failed to resolve import "./secrets"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/secrets.ts
import type { CredentialKind, ProviderId, SecretReader } from './types';

const KEY_PREFIX = 'quotaDeck';

const CREDENTIAL_PART: Record<CredentialKind, string> = {
  'token-plan-key': 'tokenPlan',
  'api-key': 'apiKey',
  'session-token': 'sessionToken',
  'web-cookie': 'webCookie',
};

function secretKey(providerId: ProviderId, credential: CredentialKind): string {
  const providerPart =
    providerId === 'minimax-cn' || providerId === 'minimax-global'
      ? `minimax.${providerId === 'minimax-cn' ? 'cn' : 'global'}`
      : providerId;
  return `${KEY_PREFIX}.${providerPart}.${CREDENTIAL_PART[credential]}`;
}

/** The subset of `vscode.SecretStorage` that QuotaDeck uses. */
export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export class SecretStore implements SecretReader {
  constructor(private readonly storage: SecretStorageLike) {}

  read(providerId: ProviderId, credential: CredentialKind): Promise<string | undefined> {
    return Promise.resolve(this.storage.get(secretKey(providerId, credential))).then((value) =>
      value === '' ? undefined : value,
    );
  }

  write(providerId: ProviderId, credential: CredentialKind, value: string): Promise<void> {
    return Promise.resolve(this.storage.store(secretKey(providerId, credential), value));
  }

  delete(providerId: ProviderId, credential: CredentialKind): Promise<void> {
    return Promise.resolve(this.storage.delete(secretKey(providerId, credential)));
  }
}
```

> The real VS Code API exposes `context.secrets`, which is not a module-level singleton, so `SecretStore` receives its storage backend through the constructor.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/secrets.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/core/secrets.ts src/core/secrets.test.ts src/test/__mocks__/vscode.ts
git commit -m "feat: store credentials in Secret Storage under documented keys"
```

---

### Task 8: HTTP client with timeout, backoff, and Retry-After

**Files:**

- Create: `src/core/http.ts`
- Create: `src/core/http.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/http.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from './http';
import type { JsonResult } from './http';
import type { NormalizedError } from './types';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: new Map(Object.entries(init.headers ?? {})),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

/** Narrow a failed result so the error can be asserted on. */
function failure(result: JsonResult): NormalizedError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected the request to fail');
  return result.error;
}

describe('HttpClient', () => {
  it('returns the parsed body on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ hello: 'world' }));
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(result).toEqual({ ok: true, body: { hello: 'world' } });
  });

  it('sends the bearer token when one is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    globalThis.fetch = fetchMock;
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });
    await client.getJson('https://api.example.com/v1/thing', { bearer: 'sk-test' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('reports a non-2xx status as an error result', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({}, { status: 401 }));
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(failure(result).kind).toBe('auth');
  });

  it('reads Retry-After into the error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({}, { status: 429, headers: { 'Retry-After': '30' } }),
    );
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(failure(result).kind).toBe('rate-limit');
    expect(failure(result).retryAfterMs).toBe(30_000);
  });

  it('times out a request that exceeds the timeout', async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const client = new HttpClient({ timeoutMs: 20, maxAttempts: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(failure(result).kind).toBe('timeout');
  });

  it('retries a transient network failure with a backoff', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock;
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 2, backoffBaseMs: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry an authentication failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, { status: 401 }));
    globalThis.fetch = fetchMock;
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 3, backoffBaseMs: 1 });
    await client.getJson('https://api.example.com/v1/thing');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports invalid JSON as a malformed error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map(),
      text: () => Promise.resolve('<html>not json</html>'),
    } as unknown as Response);
    const client = new HttpClient({ timeoutMs: 1_000, maxAttempts: 1 });
    const result = await client.getJson('https://api.example.com/v1/thing');
    expect(failure(result).kind).toBe('malformed');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/http.test.ts`
Expected: FAIL with `Failed to resolve import "./http"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/http.ts
import { normalizeError } from './errors';
import type { NormalizedError } from './types';

export interface HttpOptions {
  readonly timeoutMs: number;
  /** How many times a transient failure is retried. The first attempt is not a retry. */
  readonly maxAttempts: number;
  /** The first backoff delay. Every further delay doubles it. */
  readonly backoffBaseMs?: number;
}

export interface RequestOptions {
  readonly bearer?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

export type JsonResult =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly error: NormalizedError };

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMs(headers: Headers): number | undefined {
  const raw = headers.get('Retry-After');
  if (raw === null) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export class HttpClient {
  constructor(private readonly options: HttpOptions) {}

  /** Transient failures are retried with an exponential backoff. Auth and rate limits are not retried. */
  async getJson(url: string, options: RequestOptions = {}): Promise<JsonResult> {
    let attempt = 0;
    for (;;) {
      const result = await this.attempt(url, options);
      if (result.ok) return result;
      const retryable = result.error.kind === 'network' || result.error.kind === 'timeout';
      attempt += 1;
      if (!retryable || attempt >= this.options.maxAttempts) return result;
      const base = this.options.backoffBaseMs ?? 1_000;
      await delay(base * 2 ** (attempt - 1));
    }
  }

  private async attempt(url: string, options: RequestOptions): Promise<JsonResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    try {
      const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
      if (options.bearer !== undefined) headers.Authorization = `Bearer ${options.bearer}`;

      const response = await fetch(url, { headers, signal: controller.signal });

      if (!response.ok) {
        const retry = retryAfterMs(response.headers);
        return {
          ok: false,
          error: normalizeError({
            status: response.status,
            ...(retry !== undefined ? { retryAfterMs: retry } : {}),
          }),
        };
      }

      const text = await response.text();
      try {
        return { ok: true, body: JSON.parse(text) as unknown };
      } catch {
        return { ok: false, error: normalizeError({ status: response.status, malformed: true }) };
      }
    } catch (error) {
      const raw = error as { name?: string; message?: string };
      return {
        ok: false,
        error: normalizeError({
          ...(raw.name !== undefined ? { name: raw.name } : {}),
          ...(raw.message !== undefined ? { message: raw.message } : {}),
        }),
      };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/http.test.ts`
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/core/http.ts src/core/http.test.ts
git commit -m "feat: add http client with timeout, retry-after and error normalization"
```

---

### Task 9: Snapshot cache

**Files:**

- Create: `src/core/cache.ts`
- Create: `src/core/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/cache.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { __reset } from '../test/__mocks__/vscode';
import { SnapshotCache } from './cache';
import type { ProviderSnapshot } from './types';

const snapshot: ProviderSnapshot = {
  providerId: 'deepseek',
  fetchedAt: '2026-11-16T00:00:00.000Z',
  capabilities: {
    'deepseek.balance': { kind: 'ok', fetchedAt: '2026-11-16T00:00:00.000Z', data: { cny: 12 } },
  },
};

describe('SnapshotCache', () => {
  beforeEach(() => __reset());

  it('returns undefined for a provider that was never cached', async () => {
    const cache = new SnapshotCache(new Map());
    expect(await cache.load('deepseek')).toBeUndefined();
  });

  it('round-trips a snapshot through the storage backend', async () => {
    const storage = new Map<string, unknown>();
    const cache = new SnapshotCache(storage);
    await cache.save(snapshot);
    expect(await cache.load('deepseek')).toEqual(snapshot);
  });

  it('never persists credential material', async () => {
    const storage = new Map<string, unknown>();
    const cache = new SnapshotCache(storage);
    await cache.save({
      ...snapshot,
      capabilities: {
        'deepseek.balance': { kind: 'ok', fetchedAt: '2026-11-16T00:00:00.000Z', data: { cny: 12 } },
      },
    });
    expect(JSON.stringify([...storage.entries()])).not.toMatch(/sk-|cookie|authorization/i);
  });

  it('returns undefined when the stored payload is not a snapshot', async () => {
    const storage = new Map<string, unknown>([['quotaDeck.snapshot.deepseek', { garbage: true }]]);
    const cache = new SnapshotCache(storage);
    expect(await cache.load('deepseek')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/core/cache.test.ts`
Expected: FAIL with `Failed to resolve import "./cache"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/cache.ts
import type { ProviderId, ProviderSnapshot } from './types';

export interface StorageBackend {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

const KEY_PREFIX = 'quotaDeck.snapshot';

function isSnapshot(value: unknown): value is ProviderSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ProviderSnapshot>;
  return (
    typeof candidate.providerId === 'string' &&
    typeof candidate.fetchedAt === 'string' &&
    typeof candidate.capabilities === 'object' &&
    candidate.capabilities !== null
  );
}

export class SnapshotCache {
  constructor(private readonly storage: StorageBackend) {}

  async load(providerId: ProviderId): Promise<ProviderSnapshot | undefined> {
    const raw = this.storage.get(`${KEY_PREFIX}.${providerId}`);
    return isSnapshot(raw) ? raw : undefined;
  }

  async save(snapshot: ProviderSnapshot): Promise<void> {
    this.storage.set(`${KEY_PREFIX}.${snapshot.providerId}`, snapshot);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/cache.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/core/cache.ts src/core/cache.test.ts
git commit -m "feat: persist the last good snapshot per provider"
```

---

### Task 10: Localization runtime

**Files:**

- Create: `src/localization/messages.ts`
- Create: `src/localization/en-us.ts`
- Create: `src/localization/zh-cn.ts`
- Create: `src/localization/index.ts`
- Create: `src/localization/index.test.ts`

- [ ] **Step 1: Write the message catalogue**

```ts
// src/localization/messages.ts
export const MESSAGES = {
  'statusBar.title': 'QuotaDeck CN',
  'statusBar.noData': 'QuotaDeck CN — 未配置',
  'statusBar.segment.minimaxCn': 'MM',
  'statusBar.segment.minimaxGlobal': 'MG',
  'statusBar.segment.deepseek': 'DS',
  'statusBar.segment.qwen': 'QW',
  'statusBar.segment.unavailable': '—',
  'statusBar.tooltip.header': '国产大模型额度',
  'statusBar.tooltip.badge': '国产模型',
  'statusBar.tooltip.footer': '在仪表盘中查看更多分析',

  'error.auth': '认证失败，请重新配置凭据。',
  'error.rateLimit': '请求过于频繁，已暂停自动刷新。',
  'error.timeout': '请求超时。',
  'error.network': '网络请求失败。',
  'error.malformed': '响应结构与预期不符。',
  'error.unknown': '发生未知错误。',

  'state.unconfigured': '未配置',
  'state.unsupported': '不支持',
  'state.stale': '数据已过期',
  'state.failed': '获取失败',
  'state.ok': '正常',

  'capability.minimax.plan': 'Token Plan 额度',
  'capability.minimax.subscription': '订阅详情',
  'capability.minimax.tokenUsage': 'Token 用量',
  'capability.minimax.points': '积分余额',
  'capability.deepseek.balance': '账户余额',
  'capability.deepseek.usageAmount': '用量明细',
  'capability.deepseek.usageCost': '费用明细',
  'capability.deepseek.accountSummary': '账户汇总',
  'capability.qwen.accountBalance': '账户余额',
  'capability.qwen.modelQuota': '模型额度',
  'capability.qwen.consumption': '消费明细',
  'capability.qwen.accessKeyValidation': '密钥校验',

  'source.account': '账户',
  'source.local': '本地',
  'source.estimated': '估算',
  'session.apiKey': 'API Key',
  'session.webSession': 'Web Session',

  'dashboard.title': 'QuotaDeck CN — 用量与洞察',
  'dashboard.lowestRemaining': '最低剩余额度',
  'dashboard.accountBalance': '账户余额',
  'dashboard.requests': '请求数',
  'dashboard.tokens': 'Token 数',
  'dashboard.cost': '费用',
  'dashboard.range.today': '今日',
  'dashboard.range.yesterday': '昨日',
  'dashboard.range.last7': '近 7 天',
  'dashboard.range.last30': '近 30 天',
  'dashboard.range.thisMonth': '本月',
  'dashboard.range.lastMonth': '上月',
  'dashboard.chart.cost': '费用趋势',
  'dashboard.chart.requests': '请求趋势',
  'dashboard.chart.tokens': 'Token 趋势',
  'dashboard.chart.cache': 'Token 构成',
  'dashboard.cacheHit': '缓存命中',
  'dashboard.cacheMiss': '缓存未命中',
  'dashboard.output': '输出',
  'dashboard.column.date': '日期',
  'dashboard.column.model': '模型',
  'dashboard.column.requests': '请求数',
  'dashboard.column.tokens': 'Token 数',
  'dashboard.column.cost': '费用',
  'dashboard.column.currency': '币种',
  'dashboard.column.total': '合计',
  'dashboard.table.usage': '每日用量',
  'dashboard.table.models': '按模型的用量',
  'dashboard.table.balances': '按币种的余额',
  'dashboard.pricingUnavailable': '定价日历不可用',
  'dashboard.pricingPeak': '当前为高峰期价格',
  'dashboard.pricingOffPeak': '当前为低峰期价格',
  'dashboard.sessionExpired': '登录会话已过期，请重新配置。',
  'dashboard.qwenTitle': 'Qwen 能力矩阵',
  'dashboard.qwenUnsupported': '不支持',

  'tooltip.updated': '更新于',
  'tooltip.sourceBadge': '来源',
  'tooltip.sessionBadge': '会话',

  'onboarding.chooseProvider': '选择要配置的服务商',
  'onboarding.nextStep': '下一步',
  'onboarding.configureAnother': '再配置一个',
  'onboarding.refreshNow': '立即刷新',
  'onboarding.openDashboard': '打开仪表盘',
  'onboarding.finish': '完成',

  'credentials.minimax.cn.tokenPlan': 'MiniMax 国内 — Token Plan 密钥',
  'credentials.minimax.global.tokenPlan': 'MiniMax 国际 — Token Plan 密钥',
  'credentials.minimax.cn.cookie': 'MiniMax 国内 — 网页会话 Cookie（可选）',
  'credentials.minimax.global.cookie': 'MiniMax 国际 — 网页会话 Cookie（可选）',
  'credentials.deepseek.apiKey': 'DeepSeek — API 密钥',
  'credentials.deepseek.sessionToken': 'DeepSeek — 平台会话令牌（可选）',
  'credentials.deepseek.cookie': 'DeepSeek — 平台 Cookie（可选）',
  'credentials.clear.title': '清除该凭据？',
  'credentials.clear.confirm': '清除',
  'credentials.clear.cancel': '取消',

  'switcher.title': 'QuotaDeck CN — 切换服务商',
  'switcher.configured': '已配置',
  'switcher.notConfigured': '未配置',

  'command.showHelp.message': 'QuotaDeck CN — 国产大模型额度监控。点击状态栏图标打开仪表盘。',
} as const;

export type MessageKey = keyof typeof MESSAGES;
export type MessageBundle = Record<MessageKey, string>;
```

- [ ] **Step 2: Write the English bundle**

```ts
// src/localization/en-us.ts
import type { MessageBundle } from './messages';

export const enUs: MessageBundle = {
  'statusBar.title': 'QuotaDeck CN',
  'statusBar.noData': 'QuotaDeck CN — not configured',
  'statusBar.segment.minimaxCn': 'MM',
  'statusBar.segment.minimaxGlobal': 'MG',
  'statusBar.segment.deepseek': 'DS',
  'statusBar.segment.qwen': 'QW',
  'statusBar.segment.unavailable': '—',
  'statusBar.tooltip.header': 'Chinese LLM quota',
  'statusBar.tooltip.badge': 'CN MODELS',
  'statusBar.tooltip.footer': 'Open the dashboard for deeper analysis',

  'error.auth': 'Authentication failed. Reconfigure your credentials.',
  'error.rateLimit': 'Rate limited. Automatic refresh is paused.',
  'error.timeout': 'The request timed out.',
  'error.network': 'The network request failed.',
  'error.malformed': 'The response did not match the expected shape.',
  'error.unknown': 'An unknown error occurred.',

  'state.unconfigured': 'Not configured',
  'state.unsupported': 'Not supported',
  'state.stale': 'Stale',
  'state.failed': 'Failed',
  'state.ok': 'Healthy',

  'capability.minimax.plan': 'Token Plan quota',
  'capability.minimax.subscription': 'Subscription',
  'capability.minimax.tokenUsage': 'Token usage',
  'capability.minimax.points': 'Points balance',
  'capability.deepseek.balance': 'Account balance',
  'capability.deepseek.usageAmount': 'Usage detail',
  'capability.deepseek.usageCost': 'Cost detail',
  'capability.deepseek.accountSummary': 'Account summary',
  'capability.qwen.accountBalance': 'Account balance',
  'capability.qwen.modelQuota': 'Model quota',
  'capability.qwen.consumption': 'Consumption',
  'capability.qwen.accessKeyValidation': 'Key validation',

  'source.account': 'Account',
  'source.local': 'Local',
  'source.estimated': 'Estimated',
  'session.apiKey': 'API Key',
  'session.webSession': 'Web Session',

  'dashboard.title': 'QuotaDeck CN — Usage & Insights',
  'dashboard.lowestRemaining': 'Lowest remaining quota',
  'dashboard.accountBalance': 'Account balance',
  'dashboard.requests': 'Requests',
  'dashboard.tokens': 'Tokens',
  'dashboard.cost': 'Cost',
  'dashboard.range.today': 'Today',
  'dashboard.range.yesterday': 'Yesterday',
  'dashboard.range.last7': 'Last 7 days',
  'dashboard.range.last30': 'Last 30 days',
  'dashboard.range.thisMonth': 'This month',
  'dashboard.range.lastMonth': 'Last month',
  'dashboard.chart.cost': 'Cost over time',
  'dashboard.chart.requests': 'Requests over time',
  'dashboard.chart.tokens': 'Tokens over time',
  'dashboard.chart.cache': 'Token breakdown',
  'dashboard.cacheHit': 'Cache hit',
  'dashboard.cacheMiss': 'Cache miss',
  'dashboard.output': 'Output',
  'dashboard.column.date': 'Date',
  'dashboard.column.model': 'Model',
  'dashboard.column.requests': 'Requests',
  'dashboard.column.tokens': 'Tokens',
  'dashboard.column.cost': 'Cost',
  'dashboard.column.currency': 'Currency',
  'dashboard.column.total': 'Total',
  'dashboard.table.usage': 'Usage by day',
  'dashboard.table.models': 'Usage by model',
  'dashboard.table.balances': 'Balance by currency',
  'dashboard.pricingUnavailable': 'Pricing calendar unavailable',
  'dashboard.pricingPeak': 'Peak pricing right now',
  'dashboard.pricingOffPeak': 'Off-peak pricing right now',
  'dashboard.sessionExpired': 'Your session expired. Reconfigure it to continue.',
  'dashboard.qwenTitle': 'Qwen capability matrix',
  'dashboard.qwenUnsupported': 'Not supported',

  'tooltip.updated': 'Updated',
  'tooltip.sourceBadge': 'Source',
  'tooltip.sessionBadge': 'Session',

  'onboarding.chooseProvider': 'Choose a provider to configure',
  'onboarding.nextStep': 'Next step',
  'onboarding.configureAnother': 'Configure another',
  'onboarding.refreshNow': 'Refresh now',
  'onboarding.openDashboard': 'Open dashboard',
  'onboarding.finish': 'Finish',

  'credentials.minimax.cn.tokenPlan': 'MiniMax CN — Token Plan Key',
  'credentials.minimax.global.tokenPlan': 'MiniMax Global — Token Plan Key',
  'credentials.minimax.cn.cookie': 'MiniMax CN — Web Session Cookie (optional)',
  'credentials.minimax.global.cookie': 'MiniMax Global — Web Session Cookie (optional)',
  'credentials.deepseek.apiKey': 'DeepSeek — API Key',
  'credentials.deepseek.sessionToken': 'DeepSeek — Platform Session Token (optional)',
  'credentials.deepseek.cookie': 'DeepSeek — Platform Cookie (optional)',
  'credentials.clear.title': 'Clear this credential?',
  'credentials.clear.confirm': 'Clear',
  'credentials.clear.cancel': 'Cancel',

  'switcher.title': 'QuotaDeck CN — Switch provider',
  'switcher.configured': 'Configured',
  'switcher.notConfigured': 'Not configured',

  'command.showHelp.message': 'QuotaDeck CN — Chinese LLM quota monitoring. Click the status bar icon to open the dashboard.',
};
```

- [ ] **Step 3: Write the Chinese bundle**

```ts
// src/localization/zh-cn.ts
import type { MessageBundle } from './messages';

export const zhCn: MessageBundle = {
  'statusBar.title': 'QuotaDeck CN',
  'statusBar.noData': 'QuotaDeck CN — 未配置',
  'statusBar.segment.minimaxCn': 'MM',
  'statusBar.segment.minimaxGlobal': 'MG',
  'statusBar.segment.deepseek': 'DS',
  'statusBar.segment.qwen': 'QW',
  'statusBar.segment.unavailable': '—',
  'statusBar.tooltip.header': '国产大模型额度',
  'statusBar.tooltip.badge': '国产模型',
  'statusBar.tooltip.footer': '在仪表盘中查看更多分析',

  'error.auth': '认证失败，请重新配置凭据。',
  'error.rateLimit': '请求过于频繁，已暂停自动刷新。',
  'error.timeout': '请求超时。',
  'error.network': '网络请求失败。',
  'error.malformed': '响应结构与预期不符。',
  'error.unknown': '发生未知错误。',

  'state.unconfigured': '未配置',
  'state.unsupported': '不支持',
  'state.stale': '数据已过期',
  'state.failed': '获取失败',
  'state.ok': '正常',

  'capability.minimax.plan': 'Token Plan 额度',
  'capability.minimax.subscription': '订阅详情',
  'capability.minimax.tokenUsage': 'Token 用量',
  'capability.minimax.points': '积分余额',
  'capability.deepseek.balance': '账户余额',
  'capability.deepseek.usageAmount': '用量明细',
  'capability.deepseek.usageCost': '费用明细',
  'capability.deepseek.accountSummary': '账户汇总',
  'capability.qwen.accountBalance': '账户余额',
  'capability.qwen.modelQuota': '模型额度',
  'capability.qwen.consumption': '消费明细',
  'capability.qwen.accessKeyValidation': '密钥校验',

  'source.account': '账户',
  'source.local': '本地',
  'source.estimated': '估算',
  'session.apiKey': 'API Key',
  'session.webSession': 'Web Session',

  'dashboard.title': 'QuotaDeck CN — 用量与洞察',
  'dashboard.lowestRemaining': '最低剩余额度',
  'dashboard.accountBalance': '账户余额',
  'dashboard.requests': '请求数',
  'dashboard.tokens': 'Token 数',
  'dashboard.cost': '费用',
  'dashboard.range.today': '今日',
  'dashboard.range.yesterday': '昨日',
  'dashboard.range.last7': '近 7 天',
  'dashboard.range.last30': '近 30 天',
  'dashboard.range.thisMonth': '本月',
  'dashboard.range.lastMonth': '上月',
  'dashboard.chart.cost': '费用趋势',
  'dashboard.chart.requests': '请求趋势',
  'dashboard.chart.tokens': 'Token 趋势',
  'dashboard.chart.cache': 'Token 构成',
  'dashboard.cacheHit': '缓存命中',
  'dashboard.cacheMiss': '缓存未命中',
  'dashboard.output': '输出',
  'dashboard.column.date': '日期',
  'dashboard.column.model': '模型',
  'dashboard.column.requests': '请求数',
  'dashboard.column.tokens': 'Token 数',
  'dashboard.column.cost': '费用',
  'dashboard.column.currency': '币种',
  'dashboard.column.total': '合计',
  'dashboard.table.usage': '每日用量',
  'dashboard.table.models': '按模型的用量',
  'dashboard.table.balances': '按币种的余额',
  'dashboard.pricingUnavailable': '定价日历不可用',
  'dashboard.pricingPeak': '当前为高峰期价格',
  'dashboard.pricingOffPeak': '当前为低峰期价格',
  'dashboard.sessionExpired': '登录会话已过期，请重新配置。',
  'dashboard.qwenTitle': 'Qwen 能力矩阵',
  'dashboard.qwenUnsupported': '不支持',

  'tooltip.updated': '更新于',
  'tooltip.sourceBadge': '来源',
  'tooltip.sessionBadge': '会话',

  'onboarding.chooseProvider': '选择要配置的服务商',
  'onboarding.nextStep': '下一步',
  'onboarding.configureAnother': '再配置一个',
  'onboarding.refreshNow': '立即刷新',
  'onboarding.openDashboard': '打开仪表盘',
  'onboarding.finish': '完成',

  'credentials.minimax.cn.tokenPlan': 'MiniMax 国内 — Token Plan 密钥',
  'credentials.minimax.global.tokenPlan': 'MiniMax 国际 — Token Plan 密钥',
  'credentials.minimax.cn.cookie': 'MiniMax 国内 — 网页会话 Cookie（可选）',
  'credentials.minimax.global.cookie': 'MiniMax 国际 — 网页会话 Cookie（可选）',
  'credentials.deepseek.apiKey': 'DeepSeek — API 密钥',
  'credentials.deepseek.sessionToken': 'DeepSeek — 平台会话令牌（可选）',
  'credentials.deepseek.cookie': 'DeepSeek — 平台 Cookie（可选）',
  'credentials.clear.title': '清除该凭据？',
  'credentials.clear.confirm': '清除',
  'credentials.clear.cancel': '取消',

  'switcher.title': 'QuotaDeck CN — 切换服务商',
  'switcher.configured': '已配置',
  'switcher.notConfigured': '未配置',

  'command.showHelp.message': 'QuotaDeck CN — 国产大模型额度监控。点击状态栏图标打开仪表盘。',
};
```

- [ ] **Step 4: Write the failing test**

```ts
// src/localization/index.test.ts
import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages';
import { enUs } from './en-us';
import { zhCn } from './zh-cn';
import { resolveLanguage, translatorFor } from './index';

describe('bundles', () => {
  it('covers every message key in both languages', () => {
    expect(Object.keys(enUs).sort()).toEqual(Object.keys(MESSAGES).sort());
    expect(Object.keys(zhCn).sort()).toEqual(Object.keys(MESSAGES).sort());
  });

  it('has no empty strings', () => {
    for (const bundle of [enUs, zhCn]) {
      for (const value of Object.values(bundle)) expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveLanguage', () => {
  it('resolves a Chinese display language to zh-CN', () => {
    expect(resolveLanguage('auto', 'zh-cn')).toBe('zh-CN');
  });

  it('resolves a Chinese display language with a region to zh-CN', () => {
    expect(resolveLanguage('auto', 'zh')).toBe('zh-CN');
  });

  it('resolves an explicit language over the display language', () => {
    expect(resolveLanguage('en-US', 'zh-cn')).toBe('en-US');
  });

  it('falls back to en-US for any other display language', () => {
    expect(resolveLanguage('auto', 'fr')).toBe('en-US');
  });
});

describe('translatorFor', () => {
  it('returns Chinese strings for the zh-CN bundle', () => {
    const t = translatorFor('zh-CN');
    expect(t('statusBar.noData')).toBe('QuotaDeck CN — 未配置');
  });

  it('returns English strings for the en-US bundle', () => {
    const t = translatorFor('en-US');
    expect(t('statusBar.noData')).toBe('QuotaDeck CN — not configured');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run src/localization/index.test.ts`
Expected: FAIL with `Failed to resolve import "./index"`.

- [ ] **Step 6: Write the localization runtime**

```ts
// src/localization/index.ts
import type { Language } from '../core/settings';
import { enUs } from './en-us';
import { zhCn } from './zh-cn';
import type { MessageBundle, MessageKey } from './messages';

export type ResolvedLanguage = 'zh-CN' | 'en-US';
export type Translator = (key: MessageKey) => string;

export function resolveLanguage(preference: Language, displayLanguage: string): ResolvedLanguage {
  if (preference === 'zh-CN' || preference === 'en-US') return preference;
  const normalized = displayLanguage.toLowerCase();
  return normalized === 'zh' || normalized.startsWith('zh-') ? 'zh-CN' : 'en-US';
}

export function translatorFor(language: ResolvedLanguage): Translator {
  const bundle: MessageBundle = language === 'zh-CN' ? zhCn : enUs;
  return (key) => bundle[key];
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/localization/index.test.ts`
Expected: `8 passed`.

- [ ] **Step 8: Commit**

```bash
git add src/localization
git commit -m "feat: add bilingual message catalogue and locale resolution"
```

---

### Task 11: Coordinator

**Files:**

- Create: `src/core/coordinator.ts`
- Create: `src/core/coordinator.test.ts`
- Create: `src/test/helpers/snapshot.ts`

- [ ] **Step 1: Write the snapshot test helper**

```ts
// src/test/helpers/snapshot.ts
import type { CapabilityState, ProviderId, ProviderSnapshot } from '../../core/types';

export function makeSnapshot(
  providerId: ProviderId,
  capabilities: Record<string, CapabilityState>,
  fetchedAt = '2026-11-16T00:00:00.000Z',
): ProviderSnapshot {
  return { providerId, fetchedAt, capabilities };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/core/coordinator.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __reset } from '../test/__mocks__/vscode';
import { makeSnapshot } from '../test/helpers/snapshot';
import { SnapshotCache } from './cache';
import { Coordinator } from './coordinator';
import type { ProviderSnapshot, QuotaProvider } from './types';

function provider(id: QuotaProvider['id'], snapshot: ProviderSnapshot): QuotaProvider {
  return {
    id,
    displayName: id,
    getCapabilities: () => ({ capabilities: [] }),
    connect: async () => ({ kind: 'ready', capabilities: [] }),
    fetchSnapshot: async () => snapshot,
    dispose: vi.fn(),
  };
}

describe('Coordinator', () => {
  beforeEach(() => __reset());

  it('collects one snapshot per provider', async () => {
    const coordinator = new Coordinator({ providers: [provider('deepseek', makeSnapshot('deepseek', {}))] });
    const snapshots = await coordinator.refreshAll();
    expect(Object.keys(snapshots)).toEqual(['deepseek']);
  });

  it('isolates a provider failure from the other providers', async () => {
    const failing: QuotaProvider = {
      ...provider('qwen', makeSnapshot('qwen', {})),
      fetchSnapshot: async () => { throw new Error('boom'); },
    };
    const coordinator = new Coordinator({
      providers: [provider('deepseek', makeSnapshot('deepseek', {})), failing],
    });
    const snapshots = await coordinator.refreshAll();
    expect(snapshots['deepseek']).toBeDefined();
    expect(snapshots['qwen']).toBeUndefined();
  });

  it('keeps the last good snapshot when a refresh fails', async () => {
    let attempt = 0;
    const flaky: QuotaProvider = {
      ...provider('deepseek', makeSnapshot('deepseek', {})),
      fetchSnapshot: async () => {
        attempt += 1;
        if (attempt === 1) return makeSnapshot('deepseek', { 'deepseek.balance': { kind: 'ok', fetchedAt: 'x', data: { cny: 1 } } });
        throw new Error('boom');
      },
    };
    const storage = new Map<string, unknown>();
    const coordinator = new Coordinator({ providers: [flaky], cache: new SnapshotCache(storage) });
    await coordinator.refreshAll();
    await coordinator.refreshAll();
    const snapshots = await coordinator.refreshAll();
    expect(snapshots['deepseek']?.capabilities['deepseek.balance']?.kind).toBe('failed');
  });

  it('coalesces concurrent refreshes into one request', async () => {
    const order: string[] = [];
    const slow: QuotaProvider = {
      ...provider('deepseek', makeSnapshot('deepseek', {})),
      fetchSnapshot: async () => {
        order.push('start');
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('end');
        return makeSnapshot('deepseek', {});
      },
    };
    const coordinator = new Coordinator({ providers: [slow] });
    const first = coordinator.refreshAll();
    const second = coordinator.refreshAll();
    await Promise.all([first, second]);
    expect(order).toEqual(['start', 'end']);
  });

  it('disposes every provider on shutdown', async () => {
    const p = provider('qwen', makeSnapshot('qwen', {}));
    const coordinator = new Coordinator({ providers: [p] });
    coordinator.dispose();
    expect(p.dispose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/core/coordinator.test.ts`
Expected: FAIL with `Failed to resolve import "./coordinator"`.

- [ ] **Step 4: Write the implementation**

```ts
// src/core/coordinator.ts
import { SnapshotCache } from './cache';
import { normalizeError } from './errors';
import type { NormalizedError, ProviderId, ProviderSnapshot, QuotaProvider } from './types';
import type { RangeId } from './time';

export interface CoordinatorOptions {
  readonly providers: QuotaProvider[];
  readonly cache?: SnapshotCache;
  readonly timeoutMs?: number;
  /** Called when a capability reports a rate-limit error. */
  readonly onRateLimited?: (retryAfterMs: number) => void;
}

/** Turn every fetched capability of a snapshot into a failed capability that still carries its last known value. */
function markAllFailed(snapshot: ProviderSnapshot, error: NormalizedError): ProviderSnapshot {
  const capabilities = Object.fromEntries(
    Object.entries(snapshot.capabilities).map(([id, state]) => {
      if (state.kind === 'unconfigured' || state.kind === 'unsupported') return [id, state];
      const lastGood =
        'fetchedAt' in state
          ? { fetchedAt: state.fetchedAt, data: state.data }
          : { fetchedAt: state.lastGood?.fetchedAt ?? snapshot.fetchedAt, data: state.lastGood?.data };
      return [id, { kind: 'failed' as const, error, lastGood }];
    }),
  );
  return { ...snapshot, capabilities };
}

export class Coordinator {
  private readonly options: CoordinatorOptions;
  private readonly providers: QuotaProvider[];
  private readonly cache: SnapshotCache | undefined;
  private readonly timeoutMs: number;
  private inFlight: Promise<Partial<Record<ProviderId, ProviderSnapshot>>> | undefined;
  private last: Partial<Record<ProviderId, ProviderSnapshot>> = {};

  constructor(options: CoordinatorOptions) {
    this.options = options;
    this.providers = options.providers;
    this.cache = options.cache;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  getLast(): Partial<Record<ProviderId, ProviderSnapshot>> {
    return this.last;
  }

  async refreshAll(range?: RangeId): Promise<Partial<Record<ProviderId, ProviderSnapshot>>> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run(range).finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async run(range?: RangeId): Promise<Partial<Record<ProviderId, ProviderSnapshot>>> {
    const result: Partial<Record<ProviderId, ProviderSnapshot>> = {};
    for (const provider of this.providers) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const snapshot = await provider.fetchSnapshot(controller.signal, range);
        result[provider.id] = snapshot;
        for (const state of Object.values(snapshot.capabilities)) {
          if (state.kind === 'failed' && state.error.kind === 'rate-limit') {
            this.options.onRateLimited?.(state.error.retryAfterMs ?? 60_000);
          }
        }
        await this.cache?.save(snapshot);
      } catch {
        const previous = await this.cache?.load(provider.id);
        if (previous) {
          const failed = markAllFailed(previous, normalizeError({ name: 'RefreshError' }));
          result[provider.id] = failed;
          await this.cache?.save(failed);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    this.last = result;
    return result;
  }

  async loadCached(): Promise<Partial<Record<ProviderId, ProviderSnapshot>>> {
    const result: Partial<Record<ProviderId, ProviderSnapshot>> = {};
    for (const provider of this.providers) {
      const cached = await this.cache?.load(provider.id);
      if (cached) result[provider.id] = cached;
    }
    return result;
  }

  dispose(): void {
    for (const provider of this.providers) provider.dispose();
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/core/coordinator.test.ts`
Expected: `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/core/coordinator.ts src/core/coordinator.test.ts src/test/helpers/snapshot.ts
git commit -m "feat: add coordinator with serialized refresh and per-provider isolation"
```

---

### Task 12: Status bar placeholder

**Files:**

- Create: `src/presentation/statusBar.ts`
- Create: `src/presentation/statusBar.test.ts`

This task installs a status bar item that shows the product title and nothing else. The presentation plan replaces this file wholesale with the real renderer, so nothing here may grow beyond the placeholder shape.

- [ ] **Step 1: Write the failing test**

```ts
// src/presentation/statusBar.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, state } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { StatusBarPresenter } from './statusBar';

describe('StatusBarPresenter', () => {
  beforeEach(() => __reset());

  it('creates one status bar item and shows it', () => {
    const presenter = new StatusBarPresenter(translatorFor('zh-CN'));
    presenter.update({}, []);
    expect(state.statusBarItems).toHaveLength(1);
    expect(state.statusBarItems[0]!.visible).toBe(true);
  });

  it('shows the product title before any provider is configured', () => {
    const presenter = new StatusBarPresenter(translatorFor('zh-CN'));
    presenter.update({}, []);
    expect(state.statusBarItems[0]!.text).toContain('QuotaDeck CN');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/statusBar.test.ts`
Expected: FAIL with `Failed to resolve import "./statusBar"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/presentation/statusBar.ts
import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { ProviderId, ProviderSnapshot } from '../core/types';

/**
 * The presenter keeps the final signature from the start, so the extension
 * wiring never changes. The presentation plan replaces only the rendering.
 */
export class StatusBarPresenter {
  private readonly item: vscode.StatusBarItem;
  private readonly t: Translator;

  constructor(t: Translator) {
    this.t = t;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'quotaDeck.openDashboard';
  }

  update(
    _snapshots?: Partial<Record<ProviderId, ProviderSnapshot>>,
    _order?: ProviderId[],
    _mode?: 'all' | 'focused',
    _primary?: ProviderId,
  ): void {
    this.item.text = `${this.t('statusBar.title')}  ${this.t('statusBar.segment.unavailable')}`;
    this.item.tooltip = this.t('statusBar.tooltip.header');
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/statusBar.test.ts`
Expected: `2 passed`.

The two tests only prove that the placeholder renders and that the item is
created. The presentation plan replaces this file with the real presenter and
its own test suite.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/statusBar.ts src/presentation/statusBar.test.ts
git commit -m "feat: add the status bar placeholder"
```

---

### Task 13: Extension activation and command registration

**Files:**

- Create: `src/presentation/commands.ts`
- Create: `src/presentation/commands.test.ts`
- Create: `src/extension.ts`
- Create: `src/presentation/dashboard/webview/main.ts`

- [ ] **Step 1: Write the failing command test**

```ts
// src/presentation/commands.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, state } from '../test/__mocks__/vscode';
import { registerCommands } from './commands';

describe('registerCommands', () => {
  beforeEach(() => __reset());

  it('registers every documented command', () => {
    registerCommands({
      refresh: async () => undefined,
      openDashboard: async () => undefined,
      switchProvider: async () => undefined,
      configureMiniMax: async () => undefined,
      configureDeepSeek: async () => undefined,
      showHelp: async () => undefined,
    });
    expect([...state.registeredCommands.keys()].sort()).toEqual([
      'quotaDeck.configureDeepSeek',
      'quotaDeck.configureMiniMax',
      'quotaDeck.openDashboard',
      'quotaDeck.refresh',
      'quotaDeck.showHelp',
      'quotaDeck.switchProvider',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/commands.test.ts`
Expected: FAIL with `Failed to resolve import "./commands"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/presentation/commands.ts
import * as vscode from 'vscode';

export interface CommandHandlers {
  refresh(): Promise<void>;
  openDashboard(): Promise<void>;
  switchProvider(): Promise<void>;
  configureMiniMax(): Promise<void>;
  configureDeepSeek(): Promise<void>;
  showHelp(): Promise<void>;
}

/**
 * Every command is registered here so the command ids never drift between the
 * manifest and the code. Each one calls its handler; the handler owns the
 * behaviour, which the later plans replace one command at a time.
 */
export function registerCommands(handlers: CommandHandlers): vscode.Disposable[] {
  const refresh = vscode.commands.registerCommand('quotaDeck.refresh', () => handlers.refresh());
  const openDashboard = vscode.commands.registerCommand('quotaDeck.openDashboard', () =>
    handlers.openDashboard(),
  );
  const switchProvider = vscode.commands.registerCommand('quotaDeck.switchProvider', () =>
    handlers.switchProvider(),
  );
  const configureMiniMax = vscode.commands.registerCommand('quotaDeck.configureMiniMax', () =>
    handlers.configureMiniMax(),
  );
  const configureDeepSeek = vscode.commands.registerCommand('quotaDeck.configureDeepSeek', () =>
    handlers.configureDeepSeek(),
  );
  const showHelp = vscode.commands.registerCommand('quotaDeck.showHelp', () => handlers.showHelp());

  return [refresh, openDashboard, switchProvider, configureMiniMax, configureDeepSeek, showHelp];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/commands.test.ts`
Expected: `1 passed`.

- [ ] **Step 5: Write the activation entry point**

```ts
// src/extension.ts
import * as vscode from 'vscode';
import { SnapshotCache } from './core/cache';
import { Coordinator } from './core/coordinator';
import { readSettings } from './core/settings';
import { resolveLanguage, translatorFor } from './localization';
import { registerCommands } from './presentation/commands';
import { StatusBarPresenter } from './presentation/statusBar';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const settings = readSettings();
  const t = translatorFor(resolveLanguage(settings.language, vscode.env.language));

  const cache = new SnapshotCache({
    get: (key) => context.globalState.get(key),
    set: (key, value) => void context.globalState.update(key, value),
  });

  const coordinator = new Coordinator({ providers: [], cache });
  const statusBar = new StatusBarPresenter(t);

  context.subscriptions.push(
    statusBar,
    { dispose: () => coordinator.dispose() },
    ...registerCommands({
      refresh: async () => {
        await coordinator.refreshAll();
        statusBar.update();
      },
      openDashboard: async () => {
        await vscode.window.showInformationMessage('仪表盘将在后续版本提供。');
      },
      // The onboarding, the switcher and the credential commands are built in
      // the later plans. They answer honestly instead of doing nothing.
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

  statusBar.update();
}

export function deactivate(): void {
  // The coordinator disposes every provider, which wipes the in-memory
  // credential material. The status bar item is released through
  // context.subscriptions.
}
```

- [ ] **Step 6: Write the webview entry stub**

```ts
// src/presentation/dashboard/webview/main.ts
export function render(container: HTMLElement): void {
  container.textContent = 'QuotaDeck CN';
}
```

- [ ] **Step 7: Build and typecheck**

Run: `npm run typecheck && npm run build`
Expected: `tsc --noEmit` reports no errors, and esbuild prints two build summaries for `dist/extension.js` and `dist/webview.js`.

- [ ] **Step 8: Run the whole test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/extension.ts src/presentation
git commit -m "feat: activate the extension and register commands"
```

---

### Task 14: Manifest, localized titles, and the packaging gate

**Files:**

- Modify: `package.json`
- Create: `package.nls.json`
- Create: `package.nls.zh-cn.json`
- Create: `scripts/check-locales.mjs`
- Create: `scripts/guard-package.mjs`
- Create: `media/icon.png`

- [ ] **Step 1: Add the command and configuration contributions to `package.json`**

Add the following `contributes` block after the `activationEvents` key:

```json
  "icon": "media/icon.png",
  "contributes": {
    "commands": [
      { "command": "quotaDeck.openDashboard", "title": "%command.openDashboard.title%", "category": "QuotaDeck CN" },
      { "command": "quotaDeck.refresh", "title": "%command.refresh.title%", "category": "QuotaDeck CN" },
      { "command": "quotaDeck.switchProvider", "title": "%command.switchProvider.title%", "category": "QuotaDeck CN" },
      { "command": "quotaDeck.configureMiniMax", "title": "%command.configureMiniMax.title%", "category": "QuotaDeck CN" },
      { "command": "quotaDeck.configureDeepSeek", "title": "%command.configureDeepSeek.title%", "category": "QuotaDeck CN" },
      { "command": "quotaDeck.showHelp", "title": "%command.showHelp.title%", "category": "QuotaDeck CN" }
    ],
    "configuration": {
      "title": "QuotaDeck CN",
      "properties": {
        "quotaDeck.language": {
          "type": "string",
          "enum": ["auto", "zh-CN", "en-US"],
          "default": "auto",
          "description": "%config.language.description%"
        },
        "quotaDeck.refreshIntervalMinutes": {
          "type": "number",
          "minimum": 1,
          "maximum": 60,
          "default": 5,
          "description": "%config.refreshIntervalMinutes.description%"
        },
        "quotaDeck.pauseWhenUnfocused": {
          "type": "boolean",
          "default": true,
          "description": "%config.pauseWhenUnfocused.description%"
        },
        "quotaDeck.statusBar.mode": {
          "type": "string",
          "enum": ["all", "focused"],
          "default": "all",
          "description": "%config.statusBarMode.description%"
        },
        "quotaDeck.statusBar.primaryProvider": {
          "type": "string",
          "enum": ["minimax-cn", "minimax-global", "deepseek", "qwen"],
          "default": "minimax-cn",
          "description": "%config.primaryProvider.description%"
        },
        "quotaDeck.statusBar.providerOrder": {
          "type": "array",
          "items": { "type": "string", "enum": ["minimax-cn", "minimax-global", "deepseek", "qwen"] },
          "default": ["minimax-cn", "minimax-global", "deepseek", "qwen"],
          "description": "%config.providerOrder.description%"
        },
        "quotaDeck.timeZone": {
          "type": "string",
          "default": "Asia/Shanghai",
          "description": "%config.timeZone.description%"
        }
      }
    },
    "menus": {
      "commandPalette": [
        { "command": "quotaDeck.openDashboard", "when": "true" }
      ]
    }
  },
```

- [ ] **Step 2: Write `package.nls.json`**

```json
{
  "command.openDashboard.title": "Open Dashboard",
  "command.refresh.title": "Refresh",
  "command.switchProvider.title": "Switch Provider",
  "command.configureMiniMax.title": "Configure MiniMax",
  "command.configureDeepSeek.title": "Configure DeepSeek",
  "command.showHelp.title": "Show Help",
  "config.language.description": "Interface language. `auto` follows the VS Code display language.",
  "config.refreshIntervalMinutes.description": "Minutes between automatic quota refreshes.",
  "config.pauseWhenUnfocused.description": "Pause background refresh while the window is unfocused.",
  "config.statusBarMode.description": "Show every provider in the status bar, or only the primary provider.",
  "config.primaryProvider.description": "Provider shown in focused status bar mode.",
  "config.providerOrder.description": "Order of provider segments in the status bar.",
  "config.timeZone.description": "IANA time zone used for reset countdowns and absolute dates."
}
```

- [ ] **Step 3: Write `package.nls.zh-cn.json`**

```json
{
  "command.openDashboard.title": "打开仪表盘",
  "command.refresh.title": "刷新",
  "command.switchProvider.title": "切换服务商",
  "command.configureMiniMax.title": "配置 MiniMax",
  "command.configureDeepSeek.title": "配置 DeepSeek",
  "command.showHelp.title": "查看帮助",
  "config.language.description": "界面语言。`auto` 跟随 VS Code 显示语言。",
  "config.refreshIntervalMinutes.description": "自动刷新额度的间隔分钟数。",
  "config.pauseWhenUnfocused.description": "窗口失去焦点时暂停后台刷新。",
  "config.statusBarMode.description": "在状态栏显示全部服务商，或仅显示主服务商。",
  "config.primaryProvider.description": "聚焦模式下显示的服务商。",
  "config.providerOrder.description": "状态栏中各服务商片段的排列顺序。",
  "config.timeZone.description": "用于重置倒计时与绝对时间的 IANA 时区。"
}
```

- [ ] **Step 4: Write the locale parity check**

```js
// scripts/check-locales.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const english = JSON.parse(readFileSync(resolve(root, 'package.nls.json'), 'utf8'));
const chinese = JSON.parse(readFileSync(resolve(root, 'package.nls.zh-cn.json'), 'utf8'));

const englishKeys = Object.keys(english).sort();
const chineseKeys = Object.keys(chinese).sort();

const missingInChinese = englishKeys.filter((key) => !(key in chinese));
const missingInEnglish = chineseKeys.filter((key) => !(key in english));

if (missingInChinese.length > 0 || missingInEnglish.length > 0) {
  console.error('Locale key mismatch.');
  if (missingInChinese.length > 0) console.error(`Missing in zh-cn: ${missingInChinese.join(', ')}`);
  if (missingInEnglish.length > 0) console.error(`Missing in en-us: ${missingInEnglish.join(', ')}`);
  process.exit(1);
}

const manifest = readFileSync(resolve(root, 'package.json'), 'utf8');
const placeholders = [...manifest.matchAll(/"%([^%]+)%"/g)].map((match) => match[1]);
const unresolved = placeholders.filter((key) => !(key in english));
if (unresolved.length > 0) {
  console.error(`Unresolved manifest placeholders: ${unresolved.join(', ')}`);
  process.exit(1);
}

console.log(`Locale keys OK: ${englishKeys.length} keys in both bundles.`);
```

- [ ] **Step 5: Write the package guard**

```js
// scripts/guard-package.mjs
//
// The .vsix is a zip file, so it is not walked directly. The guard scans the
// files that go into it and asks `vsce ls` which files actually ship.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{16,}/,
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/,
  /"Cookie"\s*:\s*"[^"]{8,}"/i,
];

const LOCAL_PATH_PATTERN = /[A-Za-z]:\\Users\\|\/home\/[a-z0-9_-]+\//i;

const SCANNED = [
  'dist/extension.js',
  'dist/webview.js',
  'package.json',
  'package.nls.json',
  'package.nls.zh-cn.json',
  'README.md',
  'LICENSE',
];

const offenders = [];

for (const relative of SCANNED) {
  const full = resolve(root, relative);
  if (!existsSync(full)) {
    offenders.push(`${relative}: missing from the package`);
    continue;
  }
  const content = readFileSync(full).toString('utf8');
  if (LOCAL_PATH_PATTERN.test(content)) {
    offenders.push(`${relative}: contains an absolute local path`);
  }
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) offenders.push(`${relative}: matches ${pattern}`);
  }
}

let shipped;
try {
  // execSync with a shell, because on Windows `npx` is a .cmd shim that
  // execFile refuses to run.
  shipped = execSync('npx vsce ls', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
} catch (error) {
  console.error(`Package guard could not run "vsce ls": ${error.message}`);
  process.exit(1);
}

const FORBIDDEN = [/^src\//, /^docs\//, /^scripts\//, /\.map$/, /^node_modules\//, /^out\//];
for (const entry of shipped) {
  if (FORBIDDEN.some((pattern) => pattern.test(entry))) {
    offenders.push(`${entry}: must not be shipped`);
  }
}

if (offenders.length > 0) {
  console.error('Package guard failed:');
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(`Package guard OK: ${SCANNED.length} files scanned, ${shipped.length} entries shipped.`);
```

- [ ] **Step 6: Add the icon**

Create a 128×128 PNG at `media/icon.png` from any solid-color source, then confirm it exists:

Run: `ls -la media/`
Expected: `icon.png` is listed.

- [ ] **Step 7: Write the minimum README and LICENSE that `vsce package` requires**

`vsce package` refuses to run without a `README.md` and a `LICENSE` file. Write these two placeholders now; the release plan replaces the README with the full text and leaves the LICENSE as it is.

`README.md`:

```markdown
# QuotaDeck CN

国产大模型额度监控 — MiniMax、DeepSeek、Qwen 的余额、用量与重置倒计时。

这是一个开发中的预览版本。完整说明见发布版本。
```

`LICENSE`:

```text
MIT License

Copyright (c) 2026 AlexMultiAgent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 8: Wire the guards into the npm scripts**

Replace the `scripts` block in `package.json` with:

```json
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "check:locales": "node scripts/check-locales.mjs",
    "guard:package": "node scripts/guard-package.mjs",
    "vscode:prepublish": "npm run build",
    "package": "npm run build && vsce package --no-dependencies && npm run guard:package"
  },
```

- [ ] **Step 9: Run the locale check**

Run: `npm run check:locales`
Expected: `Locale keys OK: 13 keys in both bundles.`

The script compares the two manifest bundles. The runtime message catalogue is
a separate artefact and `src/localization/index.test.ts` checks that both
bundles satisfy it.

- [ ] **Step 10: Package the extension**

Run: `npm run package`
Expected: `quota-deck-0.1.0.vsix` is created, followed by `Package guard OK: N files scanned, M entries shipped.`

If `vsce` complains about a missing `repository` field, add `"repository": { "type": "git", "url": "https://github.com/alexmultiagent/VSC-plugin-quota-deck.git" }` to `package.json` and re-run.

- [ ] **Step 11: Install the package locally**

This step needs the VS Code CLI (`code`) on `PATH`. If it is not installed, open the Extensions view, choose "Install from VSIX", and pick the generated file instead.

Run: `code --install-extension quota-deck-0.1.0.vsix`
Expected: `Extension alexmultiagent.quota-deck was successfully installed.`

- [ ] **Step 12: Commit**

```bash
git add package.json package.nls.json package.nls.zh-cn.json scripts media
git commit -m "build: add manifest contributions, localized titles and package guards"
```

---

## Verification

Run all of the following before declaring this plan complete.

```bash
npm run typecheck
npm test
npm run check:locales
npm run package
```

- [ ] **Step 1: Run the full verification block**

Expected: `tsc` is silent, vitest reports every test passing, the locale check reports 13 keys in both bundles, and the package step produces `quota-deck-0.1.0.vsix` with a clean package guard.

- [ ] **Step 2: Confirm the working tree is clean**

Run: `git status --short`
Expected: no output.

---

## Out of Scope for This Plan

- Provider adapters, endpoint calls, and parsers → `2026-11-16-quota-deck-cn-contracts.md` then `2026-11-16-quota-deck-cn-providers.md`
- The real status bar text, the tooltip, and the dashboard → `2026-11-16-quota-deck-cn-presentation.md`
- Onboarding, the final localization pass, and the marketplace submission → `2026-11-16-quota-deck-cn-release.md`
