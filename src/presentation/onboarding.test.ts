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

  it('stops cleanly when the provider picker is dismissed', async () => {
    state.quickPickResults = [undefined];
    await expect(runOnboarding(writer(), t)).resolves.toBeUndefined();
    expect(state.quickPickOffered).toHaveLength(1);
  });

  it('configures the picked MiniMax instance', async () => {
    state.quickPickResults = ['MiniMax Global', 'Finish'];
    const target = writer();
    await runOnboarding(target, t);
    expect(target.configureMiniMax).toHaveBeenCalledWith('minimax-global');
    expect(target.configureDeepSeek).not.toHaveBeenCalled();
  });

  it('configures DeepSeek when picked', async () => {
    state.quickPickResults = ['DeepSeek', 'Finish'];
    const target = writer();
    await runOnboarding(target, t);
    expect(target.configureDeepSeek).toHaveBeenCalled();
    expect(target.configureMiniMax).not.toHaveBeenCalled();
  });

  it('shows the next-step summary', async () => {
    state.quickPickResults = ['DeepSeek', 'Finish'];
    await runOnboarding(writer(), t);
    const summary = state.quickPickOffered[1] as string[];
    expect(summary.slice(0, 4)).toEqual(['Configure another', 'Refresh now', 'Open dashboard', 'Finish']);
  });

  it('lists providers that still need credentials', async () => {
    state.quickPickResults = ['DeepSeek', 'Finish'];
    await runOnboarding(writer(), t, { 'minimax-cn': true, deepseek: false });
    const summary = state.quickPickOffered[1] as string[];
    expect(summary).not.toContain('MiniMax CN — Not configured');
    expect(summary).toContain('MiniMax Global — Not configured');
    expect(summary).toContain('DeepSeek — Not configured');
  });

  it('does not list configured providers', async () => {
    state.quickPickResults = ['DeepSeek', 'Finish'];
    await runOnboarding(writer(), t, { 'minimax-cn': true, deepseek: true });
    const summary = state.quickPickOffered[1] as string[];
    expect(summary.some((entry) => entry.startsWith('MiniMax CN'))).toBe(false);
  });

  it('reads the configuration state again after writing a credential', async () => {
    let configured = false;
    const target: CredentialWriter = {
      configureMiniMax: vi.fn(async () => { configured = true; }),
      configureDeepSeek: vi.fn(async () => { configured = true; }),
    };
    state.quickPickResults = ['MiniMax CN', 'Finish'];
    await runOnboarding(target, t, () => ({ 'minimax-cn': configured, deepseek: false }));
    const summary = state.quickPickOffered[1] as string[];
    expect(summary).not.toContain('MiniMax CN — Not configured');
  });
});
