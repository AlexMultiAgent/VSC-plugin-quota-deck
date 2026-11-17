import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, fireConfigurationChange, state } from './test/__mocks__/vscode';
import { activate } from './extension';

function context() {
  return {
    subscriptions: [] as Array<{ dispose(): void }>,
    globalState: {
      get: () => undefined,
      update: () => Promise.resolve(),
    },
    secrets: {
      get: async () => undefined,
      store: async () => undefined,
      delete: async () => undefined,
    },
    extensionUri: { scheme: 'file', authority: '', path: '/ext', query: '', fragment: '', fsPath: '/ext', with: () => undefined, toString: () => 'file:///ext', toJSON: () => ({}) },
  };
}

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
