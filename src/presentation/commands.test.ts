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
      loginQwen: async () => undefined,
      configureProviders: async () => undefined,
      showHelp: async () => undefined,
      openSettings: async () => undefined,
    });
    expect([...state.registeredCommands.keys()].sort()).toEqual([
      'quotaDeck.configureDeepSeek',
      'quotaDeck.configureMiniMax',
      'quotaDeck.configureProviders',
      'quotaDeck.loginQwen',
      'quotaDeck.openDashboard',
      'quotaDeck.openSettings',
      'quotaDeck.refresh',
      'quotaDeck.showHelp',
      'quotaDeck.switchProvider',
    ]);
  });

  it('registers the settings handler', async () => {
    let calls = 0;
    registerCommands({
      refresh: async () => undefined,
      openDashboard: async () => undefined,
      switchProvider: async () => undefined,
      configureMiniMax: async () => undefined,
      configureDeepSeek: async () => undefined,
      loginQwen: async () => undefined,
      configureProviders: async () => undefined,
      showHelp: async () => undefined,
      openSettings: async () => {
        calls += 1;
      },
    });

    await state.registeredCommands.get('quotaDeck.openSettings')!();

    expect(calls).toBe(1);
  });
});
