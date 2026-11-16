# QuotaDeck CN — Onboarding, Localization, and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the user-facing product — the QuickPick onboarding flow, the credential configuration and clearing commands, the provider switcher, the marketplace manifest, and the release package with every release gate green.

**Architecture:** Onboarding is a QuickPick flow that runs entirely in the extension host, so no credential ever enters a webview. Credentials are written through the `SecretStore` and never echoed back; clearing one disposes the provider instance so the in-memory copy is wiped too. The complete Chinese and English string catalogue already lives in the foundation plan, and this plan wires the commands that use it. The release gate checks that the manifest declares no telemetry collector, that no credential is exposed as a setting, and that the pricing calendar has not expired.

**Tech Stack:** TypeScript 5.6, Vitest 2.x, the VS Code QuickPick and input-box APIs, `@vscode/vsce` for packaging.

**Prerequisite:** `2026-11-16-quota-deck-cn-presentation.md` must be complete.

**Spec:** `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md` §6, §7, §9, §13

---

## File Structure

```text
src/presentation/onboarding.ts          the QuickPick onboarding flow
src/presentation/onboarding.test.ts
src/presentation/credentials.ts         credential entry and clearing
src/presentation/credentials.test.ts
src/presentation/switcher.ts            the provider switcher items
src/presentation/switcher.test.ts
README.md
LICENSE
CHANGELOG.md
```

The string catalogue is **not** built here. The foundation plan already ships
the complete catalogue in `src/localization/messages.ts`, with one English and
one Chinese bundle that must both satisfy it, and a `npm run check:locales`
script that fails the build when they diverge. This plan only adds the
commands that the catalogue describes and the release gate that enforces it.

The DeepSeek pricing calendar lives in `src/providers/deepseek/` in the
providers plan, because the dashboard reads the current peak/off-peak state
from it. This plan refreshes the calendar file and checks that it has not
expired.

---

### Task 1: Credential entry and clearing

**Files:**

- Create: `src/presentation/credentials.ts`
- Create: `src/presentation/credentials.test.ts`

Every credential is typed into a password input box and written straight to
Secret Storage. The value is never echoed, never put in a setting, and never
put in the output channel.

- [ ] **Step 1: Write the failing test**

```ts
// src/presentation/credentials.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, state, SecretStorage } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { SecretStore } from '../core/secrets';
import { clearCredential, configureDeepSeek, configureMiniMax } from './credentials';

const t = translatorFor('en-US');

describe('configureMiniMax', () => {
  beforeEach(() => __reset());

  it('writes the token plan key to the secret store', async () => {
    state.inputBoxResults = ['token-key', undefined];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    expect(await store.read('minimax-cn', 'token-plan-key')).toBe('token-key');
  });

  it('does not write a web cookie when the step is skipped', async () => {
    state.inputBoxResults = ['token-key', undefined];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    expect(await store.read('minimax-cn', 'web-cookie')).toBeUndefined();
  });

  it('writes a web cookie when one is entered', async () => {
    state.inputBoxResults = ['token-key', 'session=abc'];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    expect(await store.read('minimax-cn', 'web-cookie')).toBe('session=abc');
  });

  it('keeps the domestic and the global instance apart', async () => {
    state.inputBoxResults = ['cn-key', undefined, 'global-key', undefined];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    await configureMiniMax(store, 'minimax-global', t);
    expect(await store.read('minimax-cn', 'token-plan-key')).toBe('cn-key');
    expect(await store.read('minimax-global', 'token-plan-key')).toBe('global-key');
  });

  it('never echoes the entered value back to the user', async () => {
    state.inputBoxResults = ['token-key', undefined];
    const store = new SecretStore(SecretStorage);
    await configureMiniMax(store, 'minimax-cn', t);
    expect(state.output.join('\n')).not.toContain('token-key');
  });
});

describe('configureDeepSeek', () => {
  beforeEach(() => __reset());

  it('writes the api key', async () => {
    state.inputBoxResults = ['sk-test', undefined, undefined];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    expect(await store.read('deepseek', 'api-key')).toBe('sk-test');
  });

  it('writes the optional session credentials', async () => {
    state.inputBoxResults = ['sk-test', 'session-token', 'session=abc'];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    expect(await store.read('deepseek', 'session-token')).toBe('session-token');
    expect(await store.read('deepseek', 'web-cookie')).toBe('session=abc');
  });
});

describe('clearCredential', () => {
  beforeEach(() => __reset());

  it('clears a credential when the user confirms the clear action', async () => {
    state.inputBoxResults = ['sk-test', undefined, undefined];
    state.quickPickResults = ['Clear'];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    const cleared = await clearCredential(store, 'deepseek', 'api-key', t);
    expect(cleared).toBe(true);
    expect(await store.read('deepseek', 'api-key')).toBeUndefined();
  });

  it('keeps the credential when the user cancels', async () => {
    state.inputBoxResults = ['sk-test', undefined, undefined];
    state.quickPickResults = ['Cancel'];
    const store = new SecretStore(SecretStorage);
    await configureDeepSeek(store, t);
    const cleared = await clearCredential(store, 'deepseek', 'api-key', t);
    expect(cleared).toBe(false);
    expect(await store.read('deepseek', 'api-key')).toBe('sk-test');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/credentials.test.ts`
Expected: FAIL with `Failed to resolve import "./credentials"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/presentation/credentials.ts
import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { SecretStore } from '../core/secrets';
import type { CredentialKind, ProviderId } from '../core/types';

async function askSecret(label: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: label,
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'Leave empty to skip',
  });
}

export async function configureMiniMax(
  store: SecretStore,
  providerId: Extract<ProviderId, 'minimax-cn' | 'minimax-global'>,
  t: Translator,
): Promise<void> {
  const region = providerId === 'minimax-cn' ? 'cn' : 'global';
  const tokenPlan = await askSecret(t(`credentials.minimax.${region}.tokenPlan`));
  if (tokenPlan !== undefined && tokenPlan.length > 0) {
    await store.write(providerId, 'token-plan-key', tokenPlan);
  }
  const cookie = await askSecret(t(`credentials.minimax.${region}.cookie`));
  if (cookie !== undefined && cookie.length > 0) {
    await store.write(providerId, 'web-cookie', cookie);
  }
}

export async function configureDeepSeek(store: SecretStore, t: Translator): Promise<void> {
  const apiKey = await askSecret(t('credentials.deepseek.apiKey'));
  if (apiKey !== undefined && apiKey.length > 0) {
    await store.write('deepseek', 'api-key', apiKey);
  }
  const sessionToken = await askSecret(t('credentials.deepseek.sessionToken'));
  if (sessionToken !== undefined && sessionToken.length > 0) {
    await store.write('deepseek', 'session-token', sessionToken);
  }
  const cookie = await askSecret(t('credentials.deepseek.cookie'));
  if (cookie !== undefined && cookie.length > 0) {
    await store.write('deepseek', 'web-cookie', cookie);
  }
}

/**
 * Delete one credential. The caller disposes the provider afterwards, so the
 * in-memory copy of the credential is wiped as well.
 */
export async function clearCredential(
  store: SecretStore,
  providerId: ProviderId,
  credential: CredentialKind,
  t: Translator,
): Promise<boolean> {
  const confirmation = await vscode.window.showQuickPick(
    [t('credentials.clear.confirm'), t('credentials.clear.cancel')],
    { title: t('credentials.clear.title') },
  );
  if (confirmation !== t('credentials.clear.confirm')) return false;
  await store.delete(providerId, credential);
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/credentials.test.ts`
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/credentials.ts src/presentation/credentials.test.ts
git commit -m "feat: add credential entry and clearing through password input boxes"
```

---

### Task 2: Provider switcher

**Files:**

- Create: `src/presentation/switcher.ts`
- Create: `src/presentation/switcher.test.ts`

The switcher lists the four provider ids with their configured state and
marks the current primary provider. The extension writes the choice to
`quotaDeck.statusBar.primaryProvider`; the switcher itself never touches the
settings.

- [ ] **Step 1: Write the failing test**

```ts
// src/presentation/switcher.test.ts
import { describe, expect, it } from 'vitest';
import { translatorFor } from '../localization';
import { buildSwitcherItems } from './switcher';

const t = translatorFor('en-US');

describe('buildSwitcherItems', () => {
  it('lists every provider id', () => {
    const items = buildSwitcherItems({}, t);
    expect(items.map((item) => item.id)).toEqual([
      'minimax-cn',
      'minimax-global',
      'deepseek',
      'qwen',
    ]);
  });

  it('marks the current primary provider', () => {
    const items = buildSwitcherItems({}, t, 'deepseek');
    expect(items.find((item) => item.id === 'deepseek')?.picked).toBe(true);
    expect(items.find((item) => item.id === 'qwen')?.picked).toBe(false);
  });

  it('shows the configured state of every provider', () => {
    const items = buildSwitcherItems({ 'minimax-cn': true, deepseek: false }, t);
    expect(items.find((item) => item.id === 'minimax-cn')?.configured).toBe(true);
    expect(items.find((item) => item.id === 'deepseek')?.configured).toBe(false);
  });

  it('treats a provider with no entry as not configured', () => {
    const items = buildSwitcherItems({}, t);
    expect(items.every((item) => item.configured === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/switcher.test.ts`
Expected: FAIL with `Failed to resolve import "./switcher"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/presentation/switcher.ts
import type { Translator } from '../localization';
import type { ProviderId } from '../core/types';

export interface SwitcherItem {
  readonly id: ProviderId;
  readonly label: string;
  readonly detail: string;
  readonly configured: boolean;
  readonly picked: boolean;
}

const LABELS: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

export function buildSwitcherItems(
  configured: Partial<Record<ProviderId, boolean>>,
  t: Translator,
  primary: ProviderId = 'minimax-cn',
): SwitcherItem[] {
  return (Object.keys(LABELS) as ProviderId[]).map((id) => ({
    id,
    label: LABELS[id],
    detail: configured[id] === true ? t('switcher.configured') : t('switcher.notConfigured'),
    configured: configured[id] === true,
    picked: id === primary,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/switcher.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/switcher.ts src/presentation/switcher.test.ts
git commit -m "feat: add the provider switcher item list"
```

---

### Task 3: Onboarding flow and the final wiring

**Files:**

- Create: `src/presentation/onboarding.ts`
- Create: `src/presentation/onboarding.test.ts`
- Modify: `src/extension.ts`

The onboarding is a QuickPick flow that runs entirely in the extension host, so
no credential ever enters a webview. It ends with a next-step summary that
also lists the providers that still need a credential.

- [ ] **Step 1: Write the failing test**

```ts
// src/presentation/onboarding.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __reset, state } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { runOnboarding, type CredentialWriter } from './onboarding';

const t = translatorFor('en-US');

function writer(): CredentialWriter {
  return {
    configureMiniMax: vi.fn().mockResolvedValue(undefined),
    configureDeepSeek: vi.fn().mockResolvedValue(undefined),
  };
}

describe('runOnboarding', () => {
  beforeEach(() => __reset());

  it('offers every configurable provider', async () => {
    state.quickPickResults = [undefined];
    await runOnboarding(writer(), t);
    const offered = state.quickPickOffered[0] as Array<{ label: string }>;
    expect(offered.map((item) => item.label)).toEqual(['MiniMax CN', 'MiniMax Global', 'DeepSeek']);
  });

  it('stops cleanly when the user dismisses the provider picker', async () => {
    state.quickPickResults = [undefined];
    await expect(runOnboarding(writer(), t)).resolves.toBeUndefined();
    expect(state.quickPickOffered).toHaveLength(1);
  });

  it('configures the MiniMax instance the user picked', async () => {
    state.quickPickResults = ['MiniMax Global', 'Finish'];
    const target = writer();
    await runOnboarding(target, t);
    expect(target.configureMiniMax).toHaveBeenCalledWith('minimax-global');
    expect(target.configureDeepSeek).not.toHaveBeenCalled();
  });

  it('configures DeepSeek when the user picks it', async () => {
    state.quickPickResults = ['DeepSeek', 'Finish'];
    const target = writer();
    await runOnboarding(target, t);
    expect(target.configureDeepSeek).toHaveBeenCalled();
    expect(target.configureMiniMax).not.toHaveBeenCalled();
  });

  it('shows the next-step summary after the credentials are entered', async () => {
    state.quickPickResults = ['DeepSeek', 'Finish'];
    await runOnboarding(writer(), t);
    expect(state.quickPickOffered).toHaveLength(2);
    const summary = state.quickPickOffered[1] as string[];
    expect(summary.slice(0, 4)).toEqual(['Configure another', 'Refresh now', 'Open dashboard', 'Finish']);
  });

  it('lists the providers that still need a credential in the summary', async () => {
    state.quickPickResults = ['DeepSeek', 'Finish'];
    await runOnboarding(writer(), t, { 'minimax-cn': true, deepseek: false });
    const summary = state.quickPickOffered[1] as string[];
    expect(summary).not.toContain('MiniMax CN — Not configured');
    expect(summary).toContain('MiniMax Global — Not configured');
    expect(summary).toContain('DeepSeek — Not configured');
  });

  it('does not list a provider that is already configured', async () => {
    state.quickPickResults = ['DeepSeek', 'Finish'];
    await runOnboarding(writer(), t, { 'minimax-cn': true, deepseek: true });
    const summary = state.quickPickOffered[1] as string[];
    expect(summary.some((entry) => entry.startsWith('MiniMax CN'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/presentation/onboarding.test.ts`
Expected: FAIL with `Failed to resolve import "./onboarding"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/presentation/onboarding.ts
import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { ProviderId } from '../core/types';

export interface CredentialWriter {
  configureMiniMax(providerId: 'minimax-cn' | 'minimax-global'): Promise<void>;
  configureDeepSeek(): Promise<void>;
}

interface ProviderChoice {
  readonly id: 'minimax-cn' | 'minimax-global' | 'deepseek';
  readonly label: string;
}

const CHOICES: ProviderChoice[] = [
  { id: 'minimax-cn', label: 'MiniMax CN' },
  { id: 'minimax-global', label: 'MiniMax Global' },
  { id: 'deepseek', label: 'DeepSeek' },
];

const PROVIDER_LABEL: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

async function run(command: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(command);
  } catch {
    // The command is not registered yet in a fresh profile. The onboarding
    // must never fail because of it.
  }
}

/**
 * The summary lists the providers that still have no credential, so the user
 * can see what is left to do without leaving the flow.
 */
function summaryItems(
  configured: Partial<Record<ProviderId, boolean>>,
  t: Translator,
): string[] {
  const pending = (Object.keys(PROVIDER_LABEL) as ProviderId[])
    .filter((id) => id !== 'qwen')
    .filter((id) => configured[id] !== true)
    .map((id) => `${PROVIDER_LABEL[id]} — ${t('switcher.notConfigured')}`);
  return [
    t('onboarding.configureAnother'),
    t('onboarding.refreshNow'),
    t('onboarding.openDashboard'),
    t('onboarding.finish'),
    ...pending,
  ];
}

export async function runOnboarding(
  writer: CredentialWriter,
  t: Translator,
  configured: Partial<Record<ProviderId, boolean>> = {},
): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    CHOICES.map((choice) => ({ label: choice.label, id: choice.id })),
    { title: t('onboarding.chooseProvider') },
  );
  if (picked === undefined) return;

  if (picked.id === 'deepseek') {
    await writer.configureDeepSeek();
  } else {
    await writer.configureMiniMax(picked.id);
  }

  const summary = await vscode.window.showQuickPick(summaryItems(configured, t), {
    title: t('onboarding.nextStep'),
  });

  if (summary === t('onboarding.refreshNow')) {
    await run('quotaDeck.refresh');
  } else if (summary === t('onboarding.openDashboard')) {
    await run('quotaDeck.openDashboard');
  } else if (summary === t('onboarding.configureAnother')) {
    await runOnboarding(writer, t, configured);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/presentation/onboarding.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Replace `src/extension.ts`**

Replace the whole of `src/extension.ts` with the file below. It is the
complete file; the presentation plan wrote an earlier version of it and this
one adds the onboarding, the switcher and the credential commands.

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
import type { ConnectionState, ProviderId } from './core/types';
import { resolveLanguage, translatorFor } from './localization';
import { pricingState } from './providers/deepseek/pricing';
import { buildProviders } from './providers/registry';
import { DashboardPanel } from './presentation/dashboard/panel';
import { buildDashboardModel, type DashboardModel } from './presentation/dashboard/viewModel';
import { registerCommands } from './presentation/commands';
import { clearCredential, configureDeepSeek, configureMiniMax } from './presentation/credentials';
import { runOnboarding } from './presentation/onboarding';
import { buildFallbackItems } from './presentation/quickPickFallback';
import { StatusBarPresenter } from './presentation/statusBar';
import { buildSwitcherItems } from './presentation/switcher';
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

  // The connection state of every provider instance. It says which providers
  // have a credential, which is what the switcher shows and what decides
  // whether the status bar opens the dashboard or the onboarding.
  const connectionState = new Map<ProviderId, ConnectionState>();
  for (const provider of providers) {
    connectionState.set(provider.id, await provider.connect(secrets));
  }

  let range: RangeId = 'last7';
  let lastRefreshIso: string | undefined;

  const dashboard = new DashboardPanel(context.extensionUri, t('dashboard.title'), (next) => {
    void selectRange(next);
  });

  function configuredProviders(): Partial<Record<ProviderId, boolean>> {
    const result: Partial<Record<ProviderId, boolean>> = {};
    for (const [id, state] of connectionState) {
      result[id] = state.kind === 'ready' || state.kind === 'partial';
    }
    return result;
  }

  function anyConfigured(): boolean {
    return Object.values(configuredProviders()).some((value) => value === true);
  }

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

  /** Reconnect one provider so a new or cleared credential takes effect. */
  async function reconnect(providerId: ProviderId): Promise<void> {
    const provider = providers.find((candidate) => candidate.id === providerId);
    if (provider === undefined) return;
    provider.dispose();
    connectionState.set(providerId, await provider.connect(secrets));
  }

  const writer = {
    configureMiniMax: async (providerId: 'minimax-cn' | 'minimax-global'): Promise<void> => {
      await configureMiniMax(secrets, providerId, t);
      await reconnect(providerId);
      await refreshAll();
    },
    configureDeepSeek: async (): Promise<void> => {
      await configureDeepSeek(secrets, t);
      await reconnect('deepseek');
      await refreshAll();
    },
  };

  context.subscriptions.push(
    statusBar,
    dashboard,
    { dispose: () => scheduler.stop() },
    { dispose: () => coordinator.dispose() },
    ...registerCommands({
      refresh: () => scheduler.refreshNow(),
      openDashboard: async () => {
        if (!anyConfigured()) {
          await runOnboarding(writer, t, configuredProviders());
          return;
        }
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
      switchProvider: async () => {
        const current = readSettings();
        const items = buildSwitcherItems(configuredProviders(), t, current.primaryProvider);
        const picked = await vscode.window.showQuickPick(items, {
          title: t('switcher.title'),
        });
        if (picked === undefined) return;
        await vscode.workspace
          .getConfiguration('quotaDeck')
          .update('statusBar.primaryProvider', picked.id);
        const after = readSettings();
        statusBar.update(
          coordinator.getLast(),
          after.providerOrder,
          after.statusBarMode,
          after.primaryProvider,
        );
        refreshTooltip();
      },
      configureMiniMax: async () => {
        await runOnboarding(writer, t, configuredProviders());
      },
      configureDeepSeek: async () => {
        await writer.configureDeepSeek();
      },
      showHelp: async () => {
        await vscode.window.showInformationMessage(t('command.showHelp.message'));
      },
    }),
  );

  // The credential clearing command reuses the same code path as the input
  // boxes. It is registered here so the manifest and the code agree.
  context.subscriptions.push(
    vscode.commands.registerCommand('quotaDeck.clearCredential', async (providerId: ProviderId, credential: 'api-key' | 'token-plan-key' | 'session-token' | 'web-cookie') => {
      const cleared = await clearCredential(secrets, providerId, credential, t);
      if (!cleared) return;
      await reconnect(providerId);
      await refreshAll();
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

The `quotaDeck.clearCredential` command is not listed in the manifest's command
palette; it is a programmatic command, called from the settings UI in a later
release. It is registered here so the clearing path is exercised today.

- [ ] **Step 6: Run the whole suite and the build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors, all tests pass, both bundles build.

- [ ] **Step 7: Commit**

```bash
git add src/presentation/onboarding.ts src/presentation/onboarding.test.ts src/extension.ts
git commit -m "feat: add the quickpick onboarding flow and wire the credential commands"
```

---

### Task 4: Repository documentation

**Files:**

- Create: `README.md`
- Modify: `LICENSE`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write the README**

````markdown
# QuotaDeck CN

国产大模型额度监控 — MiniMax、DeepSeek、Qwen 的余额、用量与重置倒计时，
直接显示在 VS Code 状态栏，悬停即可查看，无需打开任何面板。

## Features

- 状态栏显示各服务商的剩余额度、余额与重置倒计时
- 悬停提示展示完整摘要，包含来源与会话标记
- 可选的仪表盘：时间范围切换、图表、模型明细与表格视图
- 凭据只保存在 VS Code Secret Storage
- 简体中文与英文界面
- 全部时间按 `Asia/Shanghai` 显示

## What it does not do

- 不代理模型请求，不提供对话补全
- 不把本地估算当成账户数据展示
- 不自动提取浏览器 Cookie
- 不做货币换算，也不合并不同币种的金额
- V1 不接入 Qwen、阿里云百炼及其他厂商

## Install

从 VS Code Marketplace 安装 `QuotaDeck CN — MiniMax DeepSeek Qwen`，
或下载 `.vsix` 后执行 `code --install-extension quota-deck-0.1.0.vsix`。

## Configure

1. 点击状态栏的 QuotaDeck 图标。没有配置任何凭据时会进入配置流程；
   已经配置过时直接打开仪表盘。
2. 选择服务商，输入对应的凭据。
3. 再次点击状态栏图标查看额度。

| 服务商 | 必需凭据 | 可选凭据 |
|---|---|---|
| MiniMax CN / Global | Token Plan Key | Web Session Cookie（用于积分） |
| DeepSeek | API Key | Platform Session Token、Platform Cookie（用于用量明细） |

凭据通过密码输入框填写，不会被回显，也不会写入设置或全局状态。

## Privacy

扩展不会采集任何遥测数据。除下表中的地址外，扩展不发起任何网络请求：

| 主机 | 用途 |
|---|---|
| `www.minimaxi.com` | MiniMax 国内账户 |
| `www.minimax.io` | MiniMax 国际账户 |
| `api.deepseek.com` | DeepSeek 余额 |
| `platform.deepseek.com` | DeepSeek 用量明细 |

## Commands

| Command | 说明 |
|---|---|
| `QuotaDeck CN: Open Dashboard` | 打开仪表盘 |
| `QuotaDeck CN: Refresh` | 立即刷新 |
| `QuotaDeck CN: Switch Provider` | 切换主服务商 |
| `QuotaDeck CN: Configure MiniMax` | 配置 MiniMax |
| `QuotaDeck CN: Configure DeepSeek` | 配置 DeepSeek |
| `QuotaDeck CN: Show Help` | 查看帮助 |

## License

MIT
````

- [ ] **Step 2: Confirm the LICENSE**

`LICENSE` already exists from the foundation plan and already carries the MIT
text and the copyright line. Do not change it. Confirm it with:

Run: `head -3 LICENSE`
Expected: `MIT License`, an empty line, and `Copyright (c) 2026 AlexMultiAgent`.

- [ ] **Step 3: Write the CHANGELOG**

```markdown
# Changelog

## 0.1.0 — 2026-11-16

- MiniMax 国内与国际账户的 Token Plan 额度、积分、订阅与用量
- DeepSeek 账户余额与用量明细
- 状态栏、悬停提示与可选仪表盘
- 简体中文与英文界面
- 所有凭据保存在 VS Code Secret Storage
```

- [ ] **Step 4: Confirm the locale catalogue is complete**

Run: `npm run check:locales`
Expected: `Locale keys OK: 96 keys in both bundles.`

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: add the readme and changelog"
```

---

### Task 5: Marketplace manifest

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Complete the manifest**

Add the following top-level keys to `package.json`, keeping the `contributes`
block from the foundation plan unchanged:

```json
  "icon": "media/icon.png",
  "galleryBanner": {
    "color": "#1baf7a",
    "theme": "dark"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/alexmultiagent/VSC-plugin-quota-deck.git"
  },
  "bugs": {
    "url": "https://github.com/alexmultiagent/VSC-plugin-quota-deck/issues"
  },
  "homepage": "https://github.com/alexmultiagent/VSC-plugin-quota-deck#readme",
  "pricing": "Free",
  "telemetry": null
```

`telemetry` declares that the extension has no telemetry collector. `vsce`
ignores the field, and the release gate checks that it is present and null.

The Qwen adapter needs no manifest entry in V1, so no Qwen key is added.

The final set of top-level keys is:

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
  "icon": "media/icon.png",
  "galleryBanner": { "color": "#1baf7a", "theme": "dark" },
  "repository": { "type": "git", "url": "https://github.com/alexmultiagent/VSC-plugin-quota-deck.git" },
  "bugs": { "url": "https://github.com/alexmultiagent/VSC-plugin-quota-deck/issues" },
  "homepage": "https://github.com/alexmultiagent/VSC-plugin-quota-deck#readme",
  "pricing": "Free",
  "telemetry": null,
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": { "...": "unchanged from the foundation plan" },
  "scripts": { "...": "unchanged from the foundation plan" },
  "devDependencies": { "...": "unchanged from the foundation plan" }
}
```

- [ ] **Step 2: Check the manifest with `vsce`**

Run: `npx vsce ls`
Expected: a list of the files that will be packaged, with no `src/`, no `docs/`, and no `**/*.map`.

- [ ] **Step 3: Package the extension**

Run: `npm run package`
Expected: `quota-deck-0.1.0.vsix` is created and the package guard passes.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build: complete the marketplace manifest"
```

---

### Task 6: Release gate

**Files:**

- Create: `scripts/release-gate.mjs`

- [ ] **Step 1: Write the release gate**

```js
// scripts/release-gate.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];

const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const required = [
  'name',
  'displayName',
  'description',
  'version',
  'publisher',
  'license',
  'engines',
  'categories',
  'keywords',
  'icon',
  'repository',
  'bugs',
  'homepage',
  'pricing',
  'contributes',
  'main',
];

for (const key of required) {
  if (manifest[key] === undefined) failures.push(`package.json is missing "${key}"`);
}

if (manifest.telemetry !== null) {
  failures.push('package.json must declare "telemetry": null');
}

// A credential must never be a setting. Only the documented, non-secret
// settings may appear under contributes.configuration.
const settings = Object.keys(manifest.contributes?.configuration?.properties ?? {});
const CREDENTIAL_SETTING = /cookie|secret|password|token|apikey|session/i;
for (const key of settings) {
  if (CREDENTIAL_SETTING.test(key)) {
    failures.push(`package.json declares a credential setting: "${key}"`);
  }
}

// The calendar is refreshed before every release. A stale calendar makes the
// peak/off-peak hint wrong.
const calendar = JSON.parse(
  readFileSync(resolve(root, 'src', 'providers', 'deepseek', 'pricing-calendar.json'), 'utf8'),
);
const daysLeft = (Date.parse(calendar.coverageEnd) - Date.now()) / 86_400_000;
if (daysLeft < 30) {
  failures.push(
    `the pricing calendar (version ${calendar.version}) covers only ${Math.floor(daysLeft)} more days; refresh it before the release`,
  );
}

for (const file of ['README.md', 'LICENSE', 'CHANGELOG.md']) {
  try {
    readFileSync(resolve(root, file));
  } catch {
    failures.push(`${file} is missing`);
  }
}

if (failures.length > 0) {
  console.error('Release gate failed:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log('Release gate OK.');
```

- [ ] **Step 2: Run the release gate**

Run: `node scripts/release-gate.mjs`
Expected: `Release gate OK.`

- [ ] **Step 3: Wire the gate into the package script**

In `package.json`, change the `package` script to:

```json
    "package": "npm run build && npm run guard:fixtures && node scripts/release-gate.mjs && vsce package --no-dependencies && npm run guard:package"
```

The fixture guard stays in the chain: it is the check that no unredacted
response ever reaches a committed fixture.

- [ ] **Step 4: Run the full release build**

Run: `npm run package`
Expected: the release gate passes, the package is created, and the package guard passes.

- [ ] **Step 5: Install the package into a clean profile**

Run: `code --install-extension quota-deck-0.1.0.vsix`
Expected: `Extension alexmultiagent.quota-deck was successfully installed.`

- [ ] **Step 6: Commit**

```bash
git add scripts/release-gate.mjs package.json
git commit -m "build: add the release gate for the marketplace submission"
```

---

### Task 7: Manual verification pass

**Files:**

- Modify: `docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md` (acceptance checklist)

- [ ] **Step 1: Install into a clean VS Code profile**

Run: `code --install-extension quota-deck-0.1.0.vsix`
Expected: the extension installs and activates without credentials, and the status bar shows the QuotaDeck item with an unconfigured segment.

- [ ] **Step 2: Verify each credential state**

Run the onboarding flow once per provider and confirm:

| State | Expected |
|---|---|
| No credentials | The onboarding flow opens; no error is shown |
| MiniMax CN configured | The quota cards render; the points card shows the unavailable state; the countdown ticks |
| MiniMax Global configured | The values do not mix with the domestic instance |
| DeepSeek API key only | The balance renders; the usage section explains the missing session credentials |
| DeepSeek session configured | The range switch, the charts, the model totals, and the multi-currency states render |
| A credential expired | Only the affected provider and capability show an error |

- [ ] **Step 3: Verify the themes and locales**

Toggle light, dark, and high-contrast, and switch between Chinese and English.
Expected: no tofu boxes in the progress bars, the status bar icon renders, and the tooltip header and badge follow the locale.

- [ ] **Step 4: Verify that no credential leaks**

Run the package guard, which scans every shipped file for credential patterns:

```bash
npm run guard:package
```

Expected: `Package guard OK: N files scanned, M entries shipped.`

Then check the built bundles for credential **values**:

```bash
grep -rniE "sk-[a-z0-9]{16,}|sessionid=[a-z0-9]|access_token=[a-z0-9]{8,}" dist/ out/ 2>/dev/null
```

Expected: no output. The grep looks for values, not for key names: the
bundles legitimately contain the string `quotaDeck.minimax.cn.tokenPlan`,
because that is the name of the Secret Storage entry, not a credential.

Then open the Output panel, the Settings JSON, and the webview HTML and
confirm that no credential appears.

- [ ] **Step 5: Record the acceptance results**

Add a dated checklist to the design spec under §14. Every row of the
acceptance list in §14 of the spec appears exactly once:

```markdown
### Verification record

| # | Acceptance criterion | Result | Verified on |
|---|---|---|---|
| 1 | The extension installs and activates without credentials | pending | |
| 2 | MiniMax domestic and international plan data can be configured independently | pending | |
| 3 | MiniMax points render when the optional web session is valid | pending | |
| 4 | MiniMax dynamic quota cards and reset countdowns render from account data | pending | |
| 5 | DeepSeek balance renders from an API Key | pending | |
| 6 | DeepSeek detailed usage renders from an optional platform session | pending | |
| 7 | DeepSeek supports all six time ranges and shows cost, requests, tokens, cache details, models, and currencies | pending | |
| 8 | Qwen is visible as an adapter placeholder with an honest, fully-unavailable capability matrix and performs no network request | pending | |
| 9 | The status bar can show all providers or a focused provider, and can switch the primary provider between any of the four provider ids | pending | |
| 10 | Hover presents a complete summary without requiring the dashboard | pending | |
| 11 | The dashboard is optional, singleton, theme-aware, and keyboard accessible | pending | |
| 12 | All credentials use Secret Storage, and clearing a credential wipes it from the provider instance | pending | |
| 13 | Chinese and English UI strings are complete, including command titles | pending | |
| 14 | Beijing time and currency labels are correct | pending | |
| 15 | Partial failures preserve last-known data and never affect unrelated providers or capabilities | pending | |
| 16 | Every capability in §4 has a committed fixture captured and sanitized through §11, or is explicitly marked `unsupported` | pending | |
| 17 | A verified `.vsix` is produced that satisfies §13 | pending | |
```

Replace every `pending` with the result you actually observed and put the date
on which you checked it. A failed row must be fixed and re-verified before the
release.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md
git commit -m "docs: record the v1 acceptance verification results"
```

---

## Verification

- [ ] **Step 1: Run every gate**

```bash
npm run typecheck
npm test
npm run check:locales
npm run guard:fixtures
npm run package
```

Expected: all five pass.

- [ ] **Step 2: Confirm the working tree is clean**

Run: `git status --short`
Expected: no output.

---

## Plan Series Completion

- [ ] **Step 1: Confirm all five plans are complete**

| Plan | Status |
|---|---|
| `2026-11-16-quota-deck-cn-foundation.md` | pending |
| `2026-11-16-quota-deck-cn-contracts.md` | pending |
| `2026-11-16-quota-deck-cn-providers.md` | pending |
| `2026-11-16-quota-deck-cn-presentation.md` | pending |
| `2026-11-16-quota-deck-cn-release.md` | pending |

- [ ] **Step 2: Tag the release**

Run: `git tag -a v0.1.0 -m "QuotaDeck CN v0.1.0"`
Expected: the tag is created locally. Push it only after the user approves.
