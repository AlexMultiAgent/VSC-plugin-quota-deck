import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { ProviderId, ProviderSnapshot } from '../core/types';
import type { MessageKey } from '../localization/messages';
import { formatCountdown } from '../core/time';

export interface BalanceView {
  readonly currency: string;
  readonly amount: number;
}

const SEGMENT_LABEL: Record<ProviderId, MessageKey> = {
  'minimax-cn': 'statusBar.segment.minimaxCn',
  'minimax-global': 'statusBar.segment.minimaxGlobal',
  deepseek: 'statusBar.segment.deepseek',
  qwen: 'statusBar.segment.qwen',
};

const BALANCE_PRIORITY = ['CNY', 'USD', 'EUR'];

export function formatBalance(balance: BalanceView | undefined): string {
  if (balance === undefined) return '—';
  if (balance.currency === 'CNY') return `¥${balance.amount.toFixed(2)}`;
  return `${balance.currency} ${balance.amount.toFixed(2)}`;
}

interface MiniMaxWindowView {
  readonly window: string;
  readonly remainingPercent: number | null;
  readonly resetAt: number | null;
  readonly unlimited: boolean;
}

function miniMaxWindows(snapshot: ProviderSnapshot | undefined): MiniMaxWindowView[] {
  const state = snapshot?.capabilities['minimax.plan'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { windows?: MiniMaxWindowView[] } | undefined;
  return data?.windows ?? [];
}

function tightestWindow(snapshot: ProviderSnapshot | undefined): MiniMaxWindowView | undefined {
  return miniMaxWindows(snapshot)
    .filter((window) => window.unlimited !== true && window.remainingPercent !== null)
    .sort((a, b) => (a.remainingPercent ?? 0) - (b.remainingPercent ?? 0))[0];
}

function deepSeekBalance(snapshot: ProviderSnapshot | undefined): BalanceView | undefined {
  const state = snapshot?.capabilities['deepseek.balance'];
  if (state === undefined || state.kind !== 'ok') return undefined;
  const data = state.data as { entries?: { currency: string; total: number }[] } | undefined;
  const entries = data?.entries ?? [];
  if (entries.length === 0) return undefined;
  for (const code of BALANCE_PRIORITY) {
    const entry = entries.find((candidate) => candidate.currency === code);
    if (entry !== undefined) return { currency: entry.currency, amount: entry.total };
  }
  const sorted = [...entries].sort((a, b) => a.currency.localeCompare(b.currency));
  return { currency: sorted[0]!.currency, amount: sorted[0]!.total };
}

const MAX_STATUS_BAR_SEGMENTS = 3;
const STATUS_ICON = {
  positive: '$(check)',
  warning: '$(warning)',
  critical: '$(error)',
  neutral: '$(dashboard)',
  muted: '$(circle-slash)',
} as const;

type StatusTone = keyof typeof STATUS_ICON;

function toneFor(percent: number): StatusTone {
  if (percent <= 10) return 'critical';
  if (percent <= 30) return 'warning';
  return 'positive';
}

export function renderStatusBarText(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  order: ProviderId[],
  t: Translator,
  mode: 'all' | 'focused' = 'all',
  primary: ProviderId = 'minimax-cn',
): string {
  const minimaxPrimary = primary === 'minimax-global' ? 'minimax-global' : 'minimax-cn';
  const visible = mode === 'focused'
    ? [primary]
    : order.reduce<ProviderId[]>((result, id) => {
        if (id === 'minimax-cn' || id === 'minimax-global') {
          if (!result.includes('minimax-cn') && !result.includes('minimax-global')) {
            result.push(minimaxPrimary);
          }
          return result;
        }
        if (!result.includes(id)) result.push(id);
        return result;
      }, []);
  if (visible.length === 0) return t('statusBar.noData');

  const segments = visible.map((id) => {
    const label = t(SEGMENT_LABEL[id]);
    const snapshot = snapshots[id];
    if (snapshot === undefined) {
      return `${label} ${STATUS_ICON.muted} ${t('state.unconfigured')}`;
    }

    if (id === 'deepseek') {
      return `${label} ${STATUS_ICON.neutral} ${formatBalance(deepSeekBalance(snapshot))}`;
    }

    const window = tightestWindow(snapshot);
    if (window === undefined) {
      return `${label} ${STATUS_ICON.muted} ${t('state.unconfigured')}`;
    }
    const percent = window.remainingPercent!;
    const countdown = window.resetAt === null ? '' : ` · ${formatCountdown(window.resetAt - Date.now())}`;
    return `${label} ${STATUS_ICON[toneFor(percent)]} ${Math.round(percent)}%${countdown}`;
  });

  const title = `$(pulse) ${t('statusBar.title')}  `;
  const kept = segments.slice(0, MAX_STATUS_BAR_SEGMENTS);
  const dropped = segments.length - kept.length;
  return dropped === 0 ? `${title}${kept.join('  ')}` : `${title}${kept.join('  ')} +${dropped}`;
}

export class StatusBarPresenter {
  private readonly item: vscode.StatusBarItem;
  private readonly t: Translator;

  constructor(t: Translator) {
    this.t = t;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'quotaDeck.openDashboard';
  }

  update(
    snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
    order: ProviderId[],
    mode: 'all' | 'focused' = 'all',
    primary: ProviderId = 'minimax-cn',
  ): void {
    this.item.text = renderStatusBarText(snapshots, order, this.t, mode, primary);
    this.item.tooltip = this.t('statusBar.tooltip.header');
    this.item.show();
  }

  setTooltip(markdown: vscode.MarkdownString): void {
    this.item.tooltip = markdown;
  }

  setCommand(command: string): void {
    this.item.command = command;
  }

  dispose(): void {
    this.item.dispose();
  }
}
