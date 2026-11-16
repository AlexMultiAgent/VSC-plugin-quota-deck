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
