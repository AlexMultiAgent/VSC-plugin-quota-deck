import { describe, expect, it } from 'vitest';
import { state } from './__mocks__/vscode';

describe('test harness', () => {
  it('exposes the mocked vscode module', () => {
    expect(state.registeredCommands.size).toBe(0);
    expect(typeof state.configuration.set).toBe('function');
  });
});
