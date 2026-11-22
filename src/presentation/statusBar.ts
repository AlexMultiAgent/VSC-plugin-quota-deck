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

/**
 * The tone of one provider's own segment. VS Code colours a whole status bar
 * item at once, so the presenter renders each provider as its own item; this
 * keeps a critical MiniMax window from painting DeepSeek and Qwen red too.
 */
function segmentTone(
  id: ProviderId,
  snapshot: ProviderSnapshot | undefined,
  warningThresholdPercent: number,
): QuotaTone {
  if (id === 'deepseek') return 'positive';
  const window = id === 'qwen' ? tightestQwenWindow(snapshot) : tightestWindow(snapshot);
  return window === undefined || window.remainingPercent === null
    ? 'positive'
    : quotaTone(window.remainingPercent, warningThresholdPercent);
}

export function visibleProviderIds(
  order: ProviderId[],
  mode: 'all' | 'focused',
  primary: ProviderId,
  configured?: Partial<Record<ProviderId, boolean>>,
): ProviderId[] {
  const available = (id: ProviderId): boolean =>
    configured === undefined || configured[id] === true;
  if (mode === 'focused') {
    return available(primary) ? [primary] : [];
  }
  const minimaxPrimary: ProviderId =
    primary === 'minimax-global' ? 'minimax-global' : 'minimax-cn';
  const minimaxFallback: ProviderId =
    minimaxPrimary === 'minimax-cn' ? 'minimax-global' : 'minimax-cn';
  // The shared slot may only represent a region that `providerOrder` still lists.
  // Choosing by `configured` alone would resurrect a region the user removed.
  const minimaxChoices: ProviderId[] = [minimaxPrimary, minimaxFallback].filter((id) =>
    order.includes(id),
  );
  const minimaxDisplay = minimaxChoices.find(available) ?? minimaxChoices[0];
  const candidates = order.reduce<ProviderId[]>((result, id) => {
    if (id === 'minimax-cn' || id === 'minimax-global') {
      if (
        minimaxDisplay !== undefined &&
        !result.includes('minimax-cn') &&
        !result.includes('minimax-global')
      ) {
        result.push(minimaxDisplay);
      }
      return result;
    }
    if (!result.includes(id)) result.push(id);
    return result;
  }, []);
  // In `all` mode the primary provider leads the status bar, so choosing DeepSeek
  // there moves the DeepSeek segment to the front; the rest keep `providerOrder`.
  const preferred =
    primary === 'minimax-cn' || primary === 'minimax-global' ? minimaxDisplay : primary;
  const ordered: ProviderId[] =
    preferred !== undefined && candidates.includes(preferred)
      ? [preferred, ...candidates.filter((id) => id !== preferred)]
      : candidates;
  return ordered.filter(available);
}

export interface StatusBarSegment {
  readonly id: ProviderId;
  readonly text: string;
  readonly tone: QuotaTone;
}

export function renderStatusBarSegments(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  order: ProviderId[],
  t: Translator,
  mode: 'all' | 'focused' = 'all',
  primary: ProviderId = 'minimax-cn',
  warningThresholdPercent = 20,
  configured?: Partial<Record<ProviderId, boolean>>,
  pricing: PricingState = pricingState(Date.now()),
): StatusBarSegment[] {
  const visible = visibleProviderIds(order, mode, primary, configured);
  return visible.map((id): StatusBarSegment => {
    const label = t(SEGMENT_LABEL[id]);
    const snapshot = snapshots[id];
    if (snapshot === undefined) {
      return {
        id,
        text: `${label} ${STATUS_ICON.muted} ${t('state.unconfigured')}`,
        tone: 'positive',
      };
    }

    const tone = segmentTone(id, snapshot, warningThresholdPercent);

    if (id === 'deepseek') {
      const balanceState = snapshot.capabilities['deepseek.balance'];
      if (balanceState?.kind === 'ok' || balanceState?.kind === 'stale') {
        const stale = balanceState.kind === 'stale' ? ` ${t('state.stale')}` : '';
        return {
          id,
          text:
            `${label} ${STATUS_ICON.neutral} ${formatBalance(deepSeekBalance(snapshot))}` +
            ` · ${pricingPeriodLabel(pricing, t)}${stale}`,
          tone,
        };
      }
      const state = unavailableState(snapshot, t);
      return { id, text: `${label} ${state.icon} ${state.label}`, tone };
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
        return { id, text: `${label} ${icon} ${parts.join(' · ')}${stale}`, tone };
      }
      const state = unavailableState(snapshot, t);
      return { id, text: `${label} ${state.icon} ${state.label}`, tone };
    }

    const parts = miniMaxWindowParts(snapshot, t);
    if (parts.length === 0) {
      const state = unavailableState(snapshot, t);
      return { id, text: `${label} ${state.icon} ${state.label}`, tone };
    }
    const window = tightestWindow(snapshot);
    const icon =
      window === undefined || window.remainingPercent === null
        ? STATUS_ICON.positive
        : STATUS_ICON[quotaTone(window.remainingPercent, warningThresholdPercent)];
    const stale = isStale(snapshot, 'minimax.plan') ? ` ${t('state.stale')}` : '';
    return { id, text: `${label} ${icon} ${parts.join(' · ')}${stale}`, tone };
  });
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
  const segments = renderStatusBarSegments(
    snapshots,
    order,
    t,
    mode,
    primary,
    warningThresholdPercent,
    configured,
    pricing,
  );
  if (segments.length === 0) return `$(pulse) ${t('statusBar.noData')}`;

  const kept = segments.slice(0, MAX_STATUS_BAR_SEGMENTS);
  const dropped = segments.length - kept.length;
  const text = kept.map((segment) => segment.text).join('  ');
  return dropped === 0 ? `$(pulse) ${text}` : `$(pulse) ${text} +${dropped}`;
}

const STATUS_BAR_PRIORITY = 100;

/**
 * VS Code has one colour and one background per status bar item, so each
 * provider segment gets its own item. A critical MiniMax window therefore
 * paints only the MiniMax segment, not the whole status bar.
 */
export class StatusBarPresenter {
  private readonly items: vscode.StatusBarItem[] = [];
  private t: Translator;
  private tooltips: ReadonlyMap<ProviderId, vscode.MarkdownString> = new Map();
  private segmentIds: ProviderId[] = [];
  private command = 'quotaDeck.openDashboard';

  constructor(t: Translator) {
    this.t = t;
    this.itemAt(0);
  }

  setTranslator(t: Translator): void {
    this.t = t;
  }

  /** The tooltip of the provider currently occupying the item at `index`. */
  private tooltipFor(index: number): vscode.MarkdownString | string {
    const id = this.segmentIds[index];
    return (
      (id === undefined ? undefined : this.tooltips.get(id)) ??
      this.t('statusBar.tooltip.header')
    );
  }

  private itemAt(index: number): vscode.StatusBarItem {
    while (this.items.length <= index) {
      const item = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        STATUS_BAR_PRIORITY - this.items.length,
      );
      item.command = this.command;
      this.items.push(item);
    }
    return this.items[index]!;
  }

  private apply(
    item: vscode.StatusBarItem,
    text: string,
    tone: QuotaTone,
    index: number,
  ): void {
    item.text = text;
    item.backgroundColor =
      tone === 'critical'
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : undefined;
    item.color =
      tone === 'critical'
        ? '#ffffff'
        : tone === 'warning'
          ? new vscode.ThemeColor('charts.orange')
          : new vscode.ThemeColor('charts.green');
    item.tooltip = this.tooltipFor(index);
    item.command = this.command;
    item.show();
  }

  private hideFrom(index: number): void {
    for (let i = index; i < this.items.length; i += 1) this.items[i]!.hide();
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
    const segments = renderStatusBarSegments(
      snapshots,
      order,
      this.t,
      mode,
      primary,
      warningThresholdPercent,
      configured,
      pricing,
    );
    if (segments.length === 0) {
      this.segmentIds = [];
      this.apply(this.itemAt(0), `$(pulse) ${this.t('statusBar.noData')}`, 'positive', 0);
      this.hideFrom(1);
      return;
    }

    const kept = segments.slice(0, MAX_STATUS_BAR_SEGMENTS);
    const dropped = segments.length - kept.length;
    this.segmentIds = kept.map((segment) => segment.id);
    kept.forEach((segment, index) => {
      let text = segment.text;
      if (index === 0) text = `$(pulse) ${text}`;
      if (dropped > 0 && index === kept.length - 1) text = `${text} +${dropped}`;
      this.apply(this.itemAt(index), text, segment.tone, index);
    });
    this.hideFrom(kept.length);
  }

  setTooltips(tooltips: ReadonlyMap<ProviderId, vscode.MarkdownString>): void {
    this.tooltips = tooltips;
    this.items.forEach((item, index) => {
      item.tooltip = this.tooltipFor(index);
    });
  }

  setCommand(command: string): void {
    this.command = command;
    for (const item of this.items) item.command = command;
  }

  dispose(): void {
    for (const item of this.items) item.dispose();
    this.items.length = 0;
  }
}
