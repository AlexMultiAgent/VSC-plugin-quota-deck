import * as vscode from 'vscode';
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
  readonly timeZone: string;
}

const DEFAULT_ORDER: ProviderId[] = ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('quotaDeck');
  const language = config.get<Language>('language', 'auto');
  const refresh = config.get<number>('refreshIntervalMinutes', 5);
  const mode = config.get<StatusBarMode>('statusBar.mode', 'all');
  const primary = config.get<string>('statusBar.primaryProvider', 'minimax-cn');
  const order = config.get<unknown[]>('statusBar.providerOrder', DEFAULT_ORDER);
  const timeZone = config.get<string>('timeZone', 'Asia/Shanghai');

  const validOrder = Array.isArray(order)
    ? order.filter((id): id is ProviderId => typeof id === 'string' && isProviderId(id))
    : [];

  return {
    language,
    refreshIntervalMinutes: clamp(refresh, 1, 60),
    pauseWhenUnfocused: config.get<boolean>('pauseWhenUnfocused', true),
    statusBarMode: mode,
    primaryProvider: isProviderId(primary) ? primary : 'minimax-cn',
    providerOrder: validOrder.length > 0 ? [...new Set(validOrder)] : [...DEFAULT_ORDER],
    timeZone,
  };
}
