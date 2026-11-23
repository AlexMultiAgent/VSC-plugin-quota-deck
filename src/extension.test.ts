import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __reset,
  fireConfigurationChange,
  state,
  ViewColumn,
  window as mockWindow,
} from './test/__mocks__/vscode';
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

function changingBalanceFetch() {
  let calls = 0;
  return vi.fn().mockImplementation(async () => {
    calls += 1;
    const total = `${calls * 10}.00`;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          is_available: true,
          balance_infos: [
            {
              currency: 'CNY',
              total_balance: total,
              granted_balance: '0.00',
              topped_up_balance: total,
            },
          ],
        }),
    };
  });
}

describe('status bar refresh', () => {
  beforeEach(() => __reset());
  afterEach(() => vi.useRealTimers());

  it('shows the refreshed balance after a manual refresh', async () => {
    state.configuration.set('quotaDeck.statusBar.providerOrder', ['deepseek']);
    globalThis.fetch = changingBalanceFetch();
    const ctx = context({ 'quotaDeck.deepseek.apiKey': 'sk-test' });
    await activate(ctx as never);

    const item = state.statusBarItems[0]!;
    await vi.waitFor(() => expect(item.text).toContain('¥10.00'));

    await state.registeredCommands.get('quotaDeck.refresh')!();

    expect(item.text).toContain('¥20.00');
    expect(item.text).not.toContain('¥10.00');
    for (const subscription of ctx.subscriptions) subscription.dispose();
  });

  it('shows the refreshed balance after an automatic interval tick', async () => {
    vi.useFakeTimers();
    state.configuration.set('quotaDeck.statusBar.providerOrder', ['deepseek']);
    globalThis.fetch = changingBalanceFetch();
    const ctx = context({ 'quotaDeck.deepseek.apiKey': 'sk-test' });
    await activate(ctx as never);
    await vi.advanceTimersByTimeAsync(0);

    const item = state.statusBarItems[0]!;
    expect(item.text).toContain('¥10.00');

    await vi.advanceTimersByTimeAsync(3 * 60_000);

    expect(item.text).toContain('¥20.00');
    expect(item.text).not.toContain('¥10.00');
    for (const subscription of ctx.subscriptions) subscription.dispose();
  });
});

describe('dashboard restoration', () => {
  beforeEach(() => __reset());

  it('registers a serializer for the dashboard webview', async () => {
    const ctx = context();
    await activate(ctx as never);
    expect(state.webviewPanelSerializers.has('quotaDeck.dashboard')).toBe(true);
    for (const subscription of ctx.subscriptions) subscription.dispose();
  });

  it('reattaches a restored dashboard at its saved range and repaints it', async () => {
    state.configuration.set('quotaDeck.statusBar.providerOrder', ['deepseek']);
    globalThis.fetch = changingBalanceFetch();
    const ctx = context({ 'quotaDeck.deepseek.apiKey': 'sk-test' });
    await activate(ctx as never);
    const serializer = state.webviewPanelSerializers.get('quotaDeck.dashboard')!;
    const panel = mockWindow.createWebviewPanel(
      'quotaDeck.dashboard',
      'QuotaDeck CN',
      ViewColumn.Active,
      {},
    );

    await serializer.deserializeWebviewPanel(panel, { range: 'last30' });

    type StateMessage = {
      kind: 'state';
      model: { range: string; providers: Array<{ accountValue: { value: string } | null }> };
    };
    const lastState = panel.webview.postedMessages.filter(
      (message): message is StateMessage =>
        typeof message === 'object' &&
        message !== null &&
        'kind' in message &&
        message.kind === 'state',
    ).at(-1);
    expect(lastState?.model.range).toBe('last30');
    expect(lastState?.model.providers[0]?.accountValue?.value).toContain('¥');
    for (const subscription of ctx.subscriptions) subscription.dispose();
  });
});

describe('opening the dashboard', () => {
  beforeEach(() => __reset());
  afterEach(() => vi.useRealTimers());

  it('pushes refreshed data to the open dashboard when it asks to refresh', async () => {
    state.configuration.set('quotaDeck.statusBar.providerOrder', ['deepseek']);
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      calls += 1;
      const total = `${calls * 10}.00`;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({
            is_available: true,
            balance_infos: [
              {
                currency: 'CNY',
                total_balance: total,
                granted_balance: '0.00',
                topped_up_balance: total,
              },
            ],
          }),
      };
    });
    const ctx = context({ 'quotaDeck.deepseek.apiKey': 'sk-test' });
    await activate(ctx as never);
    await vi.waitFor(() => expect(state.statusBarItems[0]!.text).toContain('¥10.00'));

    await state.registeredCommands.get('quotaDeck.openDashboard')!();
    const webview = state.webviewPanels[0]!.webview;
    type StateMessage = {
      kind: 'state';
      model: { providers: Array<{ accountValue: { value: string } | null }> };
    };
    const lastState = (): StateMessage | undefined =>
      webview.postedMessages.filter(
        (message): message is StateMessage =>
          typeof message === 'object' &&
          message !== null &&
          'kind' in message &&
          message.kind === 'state',
      ).at(-1);
    await vi.waitFor(() =>
      expect(lastState()?.model.providers[0]?.accountValue?.value).toBe('¥20.00'),
    );

    webview.receiveMessage({ kind: 'refresh' });

    await vi.waitFor(() =>
      expect(lastState()?.model.providers[0]?.accountValue?.value).toBe('¥30.00'),
    );
    expect(state.statusBarItems[0]!.text).toContain('¥30.00');
    for (const subscription of ctx.subscriptions) subscription.dispose();
  });

  it('pushes refreshed data to an open dashboard on an automatic interval tick', async () => {
    vi.useFakeTimers();
    state.configuration.set('quotaDeck.statusBar.providerOrder', ['deepseek']);
    globalThis.fetch = changingBalanceFetch();
    const ctx = context({ 'quotaDeck.deepseek.apiKey': 'sk-test' });
    await activate(ctx as never);
    await vi.advanceTimersByTimeAsync(0);

    await state.registeredCommands.get('quotaDeck.openDashboard')!();
    const webview = state.webviewPanels[0]!.webview;
    type StateMessage = {
      kind: 'state';
      model: { providers: Array<{ accountValue: { value: string } | null }> };
    };
    const lastState = (): StateMessage | undefined =>
      webview.postedMessages.filter(
        (message): message is StateMessage =>
          typeof message === 'object' &&
          message !== null &&
          'kind' in message &&
          message.kind === 'state',
      ).at(-1);
    expect(lastState()?.model.providers[0]?.accountValue?.value).toBe('¥20.00');

    await vi.advanceTimersByTimeAsync(3 * 60_000);

    expect(lastState()?.model.providers[0]?.accountValue?.value).toBe('¥30.00');
    expect(state.statusBarItems[0]!.text).toContain('¥30.00');
    for (const subscription of ctx.subscriptions) subscription.dispose();
  });

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
