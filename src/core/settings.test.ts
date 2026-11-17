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
    expect(settings.warningThresholdPercent).toBe(20);
    expect(settings.timeZone).toBe('Asia/Shanghai');
  });

  it('reads configured values', () => {
    seedConfiguration({
      refreshIntervalMinutes: 15,
      'statusBar.primaryProvider': 'minimax-global',
      'statusBar.warningThresholdPercent': 25,
    });
    const settings = readSettings();
    expect(settings.refreshIntervalMinutes).toBe(15);
    expect(settings.primaryProvider).toBe('minimax-global');
    expect(settings.warningThresholdPercent).toBe(25);
  });

  it('clamps the refresh interval into 1..60', () => {
    seedConfiguration({ refreshIntervalMinutes: 999 });
    expect(readSettings().refreshIntervalMinutes).toBe(60);
  });

  it('falls back to the default interval when the setting is not a number', () => {
    seedConfiguration({ refreshIntervalMinutes: '5' });
    expect(readSettings().refreshIntervalMinutes).toBe(5);
  });

  it('falls back to the default threshold when the setting is not a number', () => {
    seedConfiguration({ 'statusBar.warningThresholdPercent': '20' });
    expect(readSettings().warningThresholdPercent).toBe(20);
  });

  it('clamps the warning threshold above the critical threshold', () => {
    seedConfiguration({ 'statusBar.warningThresholdPercent': 1 });
    expect(readSettings().warningThresholdPercent).toBe(11);
  });

  it('clamps an excessive warning threshold to 99', () => {
    seedConfiguration({ 'statusBar.warningThresholdPercent': 120 });
    expect(readSettings().warningThresholdPercent).toBe(99);
  });

  it('drops unknown ids and duplicates from the provider order', () => {
    seedConfiguration({ 'statusBar.providerOrder': ['deepseek', 'kimi', 'deepseek', 'qwen'] });
    expect(readSettings().providerOrder).toEqual(['deepseek', 'qwen']);
  });

  it('falls back to the default order when every id is invalid', () => {
    seedConfiguration({ 'statusBar.providerOrder': ['kimi', 'moonshot'] });
    expect(readSettings().providerOrder).toEqual(['minimax-cn', 'minimax-global', 'deepseek', 'qwen']);
  });

  it('keeps a valid time zone', () => {
    seedConfiguration({ timeZone: 'America/New_York' });
    expect(readSettings().timeZone).toBe('America/New_York');
  });

  it('falls back to the default time zone for an unknown zone', () => {
    seedConfiguration({ timeZone: 'Not/AZone' });
    expect(readSettings().timeZone).toBe('Asia/Shanghai');
  });
});
