import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { ProviderId, ProviderSnapshot } from '../core/types';
import type { MessageKey } from '../localization/messages';
import { capabilityValue } from '../core/capability';
import type { MiniMaxPlan } from '../providers/minimax/shape';
import type { DeepSeekBalance } from '../providers/deepseek/shape';
import type { QwenAccountBalance, QwenTokenPlan } from '../providers/qwen/shape';
import { pricingState, type PricingState } from '../providers/deepseek/pricing';
import { formatMoney, pickTightestWindow, selectPrimaryCurrency } from './display';
import { pricingPeriodLabel } from './labels';
import { quotaTone, type QuotaTone } from './quotaTone';

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

export function formatBalance(balance: BalanceView | undefined): string {
  if (balance === undefined) return '—';
  return formatMoney(balance.amount, balance.currency);
}

type MiniMaxWindowView = MiniMaxPlan['windows'][number];

function miniMaxWindows(snapshot: ProviderSnapshot | undefined): MiniMaxWindowView[] {
  return capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan')?.windows ?? [];
}

function isStale(snapshot: ProviderSnapshot | undefined, capability: string): boolean {
  return snapshot?.capabilities[capability]?.kind === 'stale';
}

function tightestWindow(snapshot: ProviderSnapshot | undefined): MiniMaxWindowView | undefined {
  return pickTightestWindow(miniMaxWindows(snapshot));
}

function windowLabel(window: MiniMaxWindowView['window'], t: Translator): string {
  return window === 'weekly'
    ? t('statusBar.window.weekly')
    : t('statusBar.window.fiveHour');
}

/** Both MiniMax windows, labelled so a 92% five-hour window cannot read as the weekly one. */
function miniMaxWindowParts(
  snapshot: ProviderSnapshot | undefined,
  t: Translator,
): string[] {
  return miniMaxWindows(snapshot).flatMap((window) => {
    const label = windowLabel(window.window, t);
    if (window.unlimited) return [`${label} ${t('tooltip.unlimited')}`];
    if (window.remainingPercent === null) return [];
    return [`${label} ${Math.round(window.remainingPercent)}%`];
  });
}

function deepSeekBalance(snapshot: ProviderSnapshot | undefined): BalanceView | undefined {
  const entries = capabilityValue<DeepSeekBalance>(snapshot, 'deepseek.balance')?.entries ?? [];
  if (entries.length === 0) return undefined;
  const currency = selectPrimaryCurrency(entries.map((entry) => entry.currency));
  if (currency === undefined) return undefined;
  const entry = entries.find((candidate) => candidate.currency === currency);
  return entry === undefined ? undefined : { currency: entry.currency, amount: entry.total };
}

function qwenBalance(snapshot: ProviderSnapshot | undefined): BalanceView | undefined {
  const balance = capabilityValue<QwenAccountBalance>(snapshot, 'qwen.accountBalance');
  return balance === undefined
    ? undefined
    : { currency: balance.currency, amount: balance.availableAmount };
}

interface QwenTokenPlanWindowView {
  readonly cycle: 'monthly' | 'weekly';
  readonly remainingPercent: number;
  readonly resetAt: number | null;
}

function qwenTokenPlanWindows(
  snapshot: ProviderSnapshot | undefined,
): QwenTokenPlanWindowView[] {
  const plan = capabilityValue<QwenTokenPlan>(snapshot, 'qwen.tokenPlan');
  return (plan?.windows ?? []).map((window) => ({
    cycle: window.cycle,
    remainingPercent: (1 - window.usedRatio) * 100,
    resetAt: window.resetAt,
  }));
}

function tightestQwenWindow(
  snapshot: ProviderSnapshot | undefined,
): QwenTokenPlanWindowView | undefined {
  return qwenTokenPlanWindows(snapshot).reduce<QwenTokenPlanWindowView | undefined>(
    (lowest, window) =>
      lowest === undefined || window.remainingPercent < lowest.remainingPercent
        ? window
        : lowest,
    undefined,
  );
}

const MAX_STATUS_BAR_SEGMENTS = 3;
const STATUS_ICON = {
  positive: '$(check)',
  caution: '$(warning)',
  warning: '$(warning)',
  critical: '$(error)',
  neutral: '$(dashboard)',
  muted: '$(circle-slash)',
} as const;

type StatusTone = keyof typeof STATUS_ICON;

function unavailableState(
  snapshot: ProviderSnapshot,
  t: Translator,
): { readonly icon: string; readonly label: string } {
  const states = Object.values(snapshot.capabilities);
  if (states.length > 0 && states.every((state) => state.kind === 'unsupported')) {
    return { icon: STATUS_ICON.muted, label: t('state.unsupported') };
  }
  const failed = states.find((state) => state.kind === 'failed');
  if (failed !== undefined && failed.kind === 'failed') {
    return { icon: STATUS_ICON.critical, label: t(failed.error.message) };
  }
  return { icon: STATUS_ICON.muted, label: t('state.unconfigured') };
}

function visibleTone(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  visible: readonly ProviderId[],
  warningThresholdPercent: number,
): QuotaTone {
  const tones = visible.flatMap((id) => {
    if (id === 'qwen') {
      const window = tightestQwenWindow(snapshots[id]);
      return window === undefined
        ? []
        : [quotaTone(window.remainingPercent, warningThresholdPercent)];
    }
    const window = tightestWindow(snapshots[id]);
    return window === undefined || window.remainingPercent === null
      ? []
      : [quotaTone(window.remainingPercent, warningThresholdPercent)];
  });
  if (tones.includes('critical')) return 'critical';
  if (tones.includes('warning')) return 'warning';
  if (tones.includes('caution')) return 'caution';
  return 'positive';
}

function visibleProviderIds(
  order: ProviderId[],
  mode: 'all' | 'focused',
  primary: ProviderId,
  configured?: Partial<Record<ProviderId, boolean>>,
): ProviderId[] {
  const minimaxPrimary = primary === 'minimax-global' ? 'minimax-global' : 'minimax-cn';
  const minimaxFallback = minimaxPrimary === 'minimax-cn' ? 'minimax-global' : 'minimax-cn';
  const minimaxDisplay = configured?.[minimaxPrimary] === true
    ? minimaxPrimary
    : configured?.[minimaxFallback] === true
      ? minimaxFallback
      : minimaxPrimary;
  const candidates = mode === 'focused'
    ? [primary]
    : order.reduce<ProviderId[]>((result, id) => {
        if (id === 'minimax-cn' || id === 'minimax-global') {
          if (!result.includes('minimax-cn') && !result.includes('minimax-global')) {
            result.push(minimaxDisplay);
          }
          return result;
        }
        if (!result.includes(id)) result.push(id);
        return result;
      }, []);
  return configured === undefined
    ? candidates
    : candidates.filter((id) => configured[id] === true);
}

export function renderStatusBarText(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  order: ProviderId[],
  t: Translator,
  mode: 'all' | 'focused' = 'all',
  primary: ProviderId = 'minimax-cn',
  warningThresholdPercent = 20,
  configured?: Partial<Record<ProviderId, boolean>>,
  pricing: PricingState = pricingState(Date.now()),
): string {
  const visible = visibleProviderIds(order, mode, primary, configured);
  if (visible.length === 0) return `$(pulse) ${t('statusBar.noData')}`;

  const segments = visible.map((id) => {
    const label = t(SEGMENT_LABEL[id]);
    const snapshot = snapshots[id];
    if (snapshot === undefined) {
      return `${label} ${STATUS_ICON.muted} ${t('state.unconfigured')}`;
    }

    if (id === 'deepseek') {
      const balanceState = snapshot.capabilities['deepseek.balance'];
      if (balanceState?.kind === 'ok' || balanceState?.kind === 'stale') {
        const stale = balanceState.kind === 'stale' ? ` ${t('state.stale')}` : '';
        return (
          `${label} ${STATUS_ICON.neutral} ${formatBalance(deepSeekBalance(snapshot))}` +
          ` · ${pricingPeriodLabel(pricing, t)}${stale}`
        );
      }
      const state = unavailableState(snapshot, t);
      return `${label} ${state.icon} ${state.label}`;
    }

    if (id === 'qwen') {
      const balanceState = snapshot.capabilities['qwen.accountBalance'];
      const balanceLive = balanceState?.kind === 'ok' || balanceState?.kind === 'stale';
      const window = tightestQwenWindow(snapshot);
      if (balanceLive || window !== undefined) {
        const parts: string[] = [];
        if (balanceLive) parts.push(formatBalance(qwenBalance(snapshot)));
        if (window !== undefined) {
          parts.push(`${t('statusBar.qwen.plan')} ${Math.round(window.remainingPercent)}%`);
        }
        const stale =
          balanceState?.kind === 'stale' ||
          snapshot.capabilities['qwen.tokenPlan']?.kind === 'stale'
            ? ` ${t('state.stale')}`
            : '';
        const icon =
          window === undefined
            ? STATUS_ICON.neutral
            : STATUS_ICON[quotaTone(window.remainingPercent, warningThresholdPercent)];
        return `${label} ${icon} ${parts.join(' · ')}${stale}`;
      }
      const state = unavailableState(snapshot, t);
      return `${label} ${state.icon} ${state.label}`;
    }

    const parts = miniMaxWindowParts(snapshot, t);
    if (parts.length === 0) {
      const state = unavailableState(snapshot, t);
      return `${label} ${state.icon} ${state.label}`;
    }
    const window = tightestWindow(snapshot);
    const icon =
      window === undefined || window.remainingPercent === null
        ? STATUS_ICON.positive
        : STATUS_ICON[quotaTone(window.remainingPercent, warningThresholdPercent)];
    const stale = isStale(snapshot, 'minimax.plan') ? ` ${t('state.stale')}` : '';
    return `${label} ${icon} ${parts.join(' · ')}${stale}`;
  });

  const kept = segments.slice(0, MAX_STATUS_BAR_SEGMENTS);
  const dropped = segments.length - kept.length;
  return dropped === 0 ? `$(pulse) ${kept.join('  ')}` : `$(pulse) ${kept.join('  ')} +${dropped}`;
}

export class StatusBarPresenter {
  private readonly item: vscode.StatusBarItem;
  private t: Translator;

  constructor(t: Translator) {
    this.t = t;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'quotaDeck.openDashboard';
  }

  setTranslator(t: Translator): void {
    this.t = t;
  }

  update(
    snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
    order: ProviderId[],
    mode: 'all' | 'focused' = 'all',
    primary: ProviderId = 'minimax-cn',
    warningThresholdPercent = 20,
    configured?: Partial<Record<ProviderId, boolean>>,
    pricing: PricingState = pricingState(Date.now()),
  ): void {
    this.item.text = renderStatusBarText(
      snapshots,
      order,
      this.t,
      mode,
      primary,
      warningThresholdPercent,
      configured,
      pricing,
    );
    const visible = visibleProviderIds(order, mode, primary, configured);
    const tone = visibleTone(snapshots, visible, warningThresholdPercent);
    this.item.backgroundColor =
      tone === 'critical'
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : undefined;
    this.item.color =
      tone === 'critical'
        ? '#ffffff'
        : tone === 'warning'
          ? new vscode.ThemeColor('charts.orange')
          : tone === 'caution'
            ? new vscode.ThemeColor('charts.yellow')
            : new vscode.ThemeColor('charts.green');
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
