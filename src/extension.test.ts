import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __reset, fireConfigurationChange, state } from './test/__mocks__/vscode';
import { activate } from './extension';

function context(secrets: Readonly<Record<string, string>> = {}) {
  return {
    subscriptions: [] as Array<{ dispose(): void }>,
    globalState: {
      get: () => undefined,
      update: () => Promise.resolve(),
    },
    secrets: {
      get: async (key: string) => secrets[key],
      store: async () => undefined,
      delete: async () => undefined,
    },
    extensionUri: { scheme: 'file', authority: '', path: '/ext', query: '', fragment: '', fsPath: '/ext', with: () => undefined, toString: () => 'file:///ext', toJSON: () => ({}) },
  };
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('extension configuration changes', () => {
  beforeEach(() => __reset());

  it('registers a configuration listener on activation', async () => {
    const ctx = context();
    await activate(ctx as never);
    expect(state.configurationListeners.length).toBeGreaterThan(0);
  });

  it('re-renders the status bar when the language setting changes', async () => {
    const ctx = context();
    await activate(ctx as never);
    const item = state.statusBarItems[0]!;
    const before = item.text;
    state.configuration.set('quotaDeck.language', 'en-US');
    fireConfigurationChange();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(item.text).not.toBe(before);
  });
});

describe('opening the dashboard', () => {
  beforeEach(() => __reset());

  it('refreshes provider data instead of only redrawing cached snapshots', async () => {
    state.configuration.set('quotaDeck.statusBar.providerOrder', ['deepseek']);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ is_available: true, balance_infos: [] }),
    });
    globalThis.fetch = fetchMock;
    const ctx = context({
      'quotaDeck.deepseek.apiKey': 'sk-test',
    });
    await activate(ctx as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = fetchMock.mock.calls.length;
    expect(before).toBeGreaterThan(0);

    await state.registeredCommands.get('quotaDeck.openDashboard')!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    for (const subscription of ctx.subscriptions) subscription.dispose();
  });
});

describe('Activity Bar overview', () => {
  beforeEach(() => __reset());

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
    const execute = vi.spyOn(vscodeModule.commands, 'executeCommand')
      .mockResolvedValue(undefined);
    const ctx = context();
    await activate(ctx as never);

    await state.registeredCommands.get('quotaDeck.openSettings')!();

    expect(execute).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      '@ext:alexmultiagent.quota-deck',
    );
  });
});
