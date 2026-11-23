import * as vscode from 'vscode';
import { AUTO_TIME_ZONE, resolveTimeZone } from './time';
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
  readonly warningThresholdPercent: number;
  readonly timeZone: string;
}

const DEFAULT_ORDER: ProviderId[] = ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'];
const DEFAULT_WARNING_THRESHOLD_PERCENT = 20;
const DEFAULT_REFRESH_INTERVAL_MINUTES = 3;
const DEFAULT_TIME_ZONE = AUTO_TIME_ZONE;

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
}

function numberSetting(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('quotaDeck');
  const languageValue = config.get<unknown>('language', 'auto');
  const refresh = numberSetting(config.get<unknown>('refreshIntervalMinutes'), DEFAULT_REFRESH_INTERVAL_MINUTES);
  const modeValue = config.get<unknown>('statusBar.mode', 'all');
  const primary = config.get<string>('statusBar.primaryProvider', 'minimax-cn');
  const order = config.get<unknown[]>('statusBar.providerOrder', DEFAULT_ORDER);
  const pauseWhenUnfocused = config.get<unknown>('pauseWhenUnfocused', true);
  const warningThreshold = numberSetting(
    config.get<unknown>('statusBar.warningThresholdPercent'),
    DEFAULT_WARNING_THRESHOLD_PERCENT,
  );
  const timeZone = resolveTimeZone(config.get<unknown>('timeZone', DEFAULT_TIME_ZONE));

  const validOrder = Array.isArray(order)
    ? order.filter((id): id is ProviderId => typeof id === 'string' && isProviderId(id))
    : [];
  const providerOrder = validOrder.length > 0 ? [...new Set(validOrder)] : [...DEFAULT_ORDER];

  return {
    language:
      languageValue === 'zh-CN' || languageValue === 'en-US' ? languageValue : 'auto',
    refreshIntervalMinutes: clamp(refresh, 1, 60, DEFAULT_REFRESH_INTERVAL_MINUTES),
    pauseWhenUnfocused: pauseWhenUnfocused !== false,
    statusBarMode: modeValue === 'focused' ? 'focused' : 'all',
    primaryProvider: isProviderId(primary) ? primary : 'minimax-cn',
    providerOrder,
    warningThresholdPercent: clamp(warningThreshold, 11, 99, DEFAULT_WARNING_THRESHOLD_PERCENT),
    timeZone,
  };
}
