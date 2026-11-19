import type { Translator } from '../../localization';
import type { MessageKey } from '../../localization/messages';
import { capabilityValue } from '../../core/capability';
import { zonedParts } from '../../core/time';
import type { ProviderId, ProviderSnapshot } from '../../core/types';
import type { PricingState } from '../../providers/deepseek/pricing';
import type { DeepSeekBalance } from '../../providers/deepseek/shape';
import type {
  MiniMaxPlan,
  MiniMaxSubscription,
  MiniMaxWindow,
} from '../../providers/minimax/shape';
import type {
  QwenAccountBalance,
  QwenTokenPlan,
  QwenTokenPlanSubscription,
} from '../../providers/qwen/shape';
import {
  formatMoney,
  pickTightestWindow,
  providerDisplayName,
  selectPrimaryCurrency,
} from '../display';
import { pricingPeriodLabel } from '../labels';
import { quotaTone, type QuotaTone } from '../quotaTone';

export type OverviewState =
  | 'positive'
  | 'caution'
  | 'warning'
  | 'critical'
  | 'failed'
  | 'stale'
  | 'muted';

export type OverviewAction =
  | { readonly kind: 'openDashboard'; readonly title: string }
  | { readonly kind: 'configureProviders'; readonly title: string };

export interface OverviewItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly tooltip: string;
  readonly state: OverviewState;
  readonly stateLabel: string;
  readonly action: OverviewAction | null;
  readonly children: readonly OverviewItem[];
}

export interface OverviewOptions {
  readonly snapshots: Partial<Record<ProviderId, ProviderSnapshot>>;
  readonly configured: Partial<Record<ProviderId, boolean>>;
  readonly order: ProviderId[];
  readonly t: Translator;
  readonly pricing: PricingState;
  readonly timeZone: string;
  readonly warningThresholdPercent: number;
  readonly lastRefreshIso?: string | undefined;
}

const TONE_STATE: Record<QuotaTone, OverviewState> = {
  positive: 'positive',
  caution: 'caution',
  warning: 'warning',
  critical: 'critical',
};

const TONE_LABEL: Record<QuotaTone, MessageKey> = {
  positive: 'state.ok',
  caution: 'overview.state.caution',
  warning: 'overview.state.warning',
  critical: 'overview.state.critical',
};

interface StateSummary {
  readonly state: OverviewState;
  readonly label: string;
  readonly detail?: string;
}

function instantLabel(value: number | string, timeZone: string): string | undefined {
  const instant = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(instant)) return undefined;
  const parts = zonedParts(instant, timeZone);
  const pad = (part: number): string => String(part).padStart(2, '0');
  return (
    `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ` +
    `${pad(parts.hour)}:${pad(parts.minute)}`
  );
}

function windowLabel(window: MiniMaxWindow['window'], t: Translator): string {
  return window === 'weekly'
    ? t('tooltip.window.weekly')
    : t('tooltip.window.fiveHour');
}

function modelLabel(model: string, t: Translator): string {
  return model === 'video' ? t('tooltip.model.video') : model;
}

function quotaRow(label: string, percent: number, threshold: number, t: Translator): {
  readonly tone: QuotaTone;
  readonly state: OverviewState;
  readonly stateLabel: string;
} {
  const tone = quotaTone(percent, threshold);
  return {
    tone,
    state: TONE_STATE[tone],
    stateLabel: t(TONE_LABEL[tone]),
  };
}

function primaryStatus(
  snapshot: ProviderSnapshot | undefined,
  capabilityId: string,
  t: Translator,
): StateSummary {
  if (snapshot === undefined) {
    return { state: 'muted', label: t('overview.state.loading') };
  }
  const capability = snapshot.capabilities[capabilityId];
  if (capability === undefined || capability.kind === 'unconfigured') {
    return { state: 'muted', label: t('state.unconfigured') };
  }
  if (capability.kind === 'unsupported') {
    return { state: 'muted', label: t('state.unsupported') };
  }
  if (capability.kind === 'stale') {
    return { state: 'stale', label: t('state.stale') };
  }
  if (capability.kind === 'failed') {
    return {
      state: 'failed',
      label: t('state.failed'),
      detail: t(capability.error.message),
    };
  }
  return { state: 'positive', label: t('state.ok') };
}

function stateDescription(status: StateSummary): string {
  return status.state === 'failed' || status.state === 'stale' ? status.label : '';
}

function currencySummary(amount: number, currency: string): string {
  const money = formatMoney(amount, currency);
  return currency === 'CNY' ? `${currency} ${money}` : money;
}

function qwenAmount(amount: number, currency: string): string {
  return currency === 'CNY'
    ? `${formatMoney(amount, currency)} ${currency}`
    : formatMoney(amount, currency);
}

function detailTooltip(label: string, description: string, extra?: string): string {
  return [label, description, extra]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join('\n');
}

function providerTooltip(
  label: string,
  stateLabel: string,
  detail: string | undefined,
  children: readonly OverviewItem[],
  options: OverviewOptions,
): string {
  const lines = [label];
  if (stateLabel.length > 0) lines.push(stateLabel);
  if (detail !== undefined && detail.length > 0 && detail !== stateLabel) {
    lines.push(detail);
  }
  for (const child of children) {
    lines.push(child.description.length > 0 ? `${child.label}: ${child.description}` : child.label);
  }
  lines.push(`${options.t('tooltip.sourceBadge')}: ${options.t('tooltip.dataSourceAccount')}`);
  if (options.lastRefreshIso !== undefined) {
    const updated = instantLabel(options.lastRefreshIso, options.timeZone);
    if (updated !== undefined) {
      lines.push(
        `${options.t('tooltip.updated')} ${updated} · ${options.timeZone}`,
      );
    }
  }
  return lines.join('\n');
}

function providerItem(
  id: ProviderId,
  label: string,
  state: OverviewState,
  stateLabel: string,
  description: string,
  children: readonly OverviewItem[],
  options: OverviewOptions,
  detail?: string,
): OverviewItem {
  return {
    id: `provider:${id}`,
    label,
    description,
    tooltip: providerTooltip(label, stateLabel, detail, children, options),
    state,
    stateLabel,
    action: {
      kind: 'openDashboard',
      title: options.t('onboarding.openDashboard'),
    },
    children,
  };
}

function miniMaxChildren(
  id: 'minimax-cn' | 'minimax-global',
  snapshot: ProviderSnapshot | undefined,
  options: OverviewOptions,
): OverviewItem[] {
  const children: OverviewItem[] = [];
  const plan = capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan');

  for (const window of plan?.windows ?? []) {
    if (window.remainingPercent === null) continue;
    const percent = Math.round(window.remainingPercent);
    const used = Math.max(0, 100 - percent);
    const label = windowLabel(window.window, options.t);
    const quota = quotaRow(label, percent, options.warningThresholdPercent, options.t);
    const reset =
      window.resetAt === null
        ? undefined
        : `${options.t('tooltip.resetAt')} ${instantLabel(window.resetAt, options.timeZone) ?? ''}`;
    children.push({
      id: `provider:${id}:window:${window.window}`,
      label,
      description:
        `${options.t('tooltip.remaining')} ${percent}% · ` +
        `${options.t('tooltip.used')} ${used}%`,
      tooltip: detailTooltip(
        label,
        `${options.t('tooltip.remaining')} ${percent}% · ` +
          `${options.t('tooltip.used')} ${used}%`,
        reset,
      ),
      state: quota.state,
      stateLabel: quota.stateLabel,
      action: null,
      children: [],
    });
  }

  for (const model of plan?.models ?? []) {
    if (
      model.model === 'general' ||
      model.total == null ||
      model.total <= 0 ||
      model.remaining == null ||
      model.used == null
    ) {
      continue;
    }
    const percent = Math.round(
      Math.max(
        0,
        Math.min(100, model.remainingPercent ?? (model.remaining / model.total) * 100),
      ),
    );
    const label = modelLabel(model.model, options.t);
    const quota = quotaRow(label, percent, options.warningThresholdPercent, options.t);
    children.push({
      id: `provider:${id}:model:${model.model}`,
      label,
      description:
        `${options.t('tooltip.remaining')} ${model.remaining}/${model.total} ` +
        `${options.t('tooltip.times')} · ` +
        `${options.t('tooltip.used')} ${model.used} ${options.t('tooltip.times')}`,
      tooltip: detailTooltip(
        label,
        `${options.t('tooltip.remaining')} ${model.remaining}/${model.total} ` +
          `${options.t('tooltip.times')} · ` +
          `${options.t('tooltip.used')} ${model.used} ${options.t('tooltip.times')}`,
      ),
      state: quota.state,
      stateLabel: quota.stateLabel,
      action: null,
      children: [],
    });
  }

  const subscription = capabilityValue<MiniMaxSubscription>(
    snapshot,
    'minimax.subscription',
  );
  if (typeof subscription?.expiresAt === 'number') {
    const expiry = instantLabel(subscription.expiresAt, options.timeZone);
    if (expiry !== undefined) {
      children.push({
        id: `provider:${id}:subscription`,
        label: options.t('tooltip.expires'),
        description: expiry,
        tooltip: detailTooltip(options.t('tooltip.expires'), expiry),
        state: 'muted',
        stateLabel: '',
        action: null,
        children: [],
      });
    }
  }

  return children;
}

function miniMaxItem(
  id: 'minimax-cn' | 'minimax-global',
  options: OverviewOptions,
): OverviewItem {
  const snapshot = options.snapshots[id];
  const status = primaryStatus(snapshot, 'minimax.plan', options.t);
  const plan = capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan');
  const tightest = pickTightestWindow(plan?.windows ?? []);
  const children = miniMaxChildren(id, snapshot, options);
  let state = status.state;
  let stateLabel = status.label;
  let description = stateDescription(status);

  if (tightest?.remainingPercent !== null && tightest?.remainingPercent !== undefined) {
    const percent = Math.round(tightest.remainingPercent);
    const quota = quotaRow(
      windowLabel(tightest.window, options.t),
      percent,
      options.warningThresholdPercent,
      options.t,
    );
    if (status.state === 'positive') {
      state = quota.state;
      stateLabel = quota.stateLabel;
      description = `${windowLabel(tightest.window, options.t)} ${percent}%`;
    }
  }

  return providerItem(
    id,
    providerDisplayName(id),
    state,
    stateLabel,
    description,
    children,
    options,
    status.detail,
  );
}

function deepSeekItem(options: OverviewOptions): OverviewItem {
  const snapshot = options.snapshots.deepseek;
  const status = primaryStatus(snapshot, 'deepseek.balance', options.t);
  const balance = capabilityValue<DeepSeekBalance>(snapshot, 'deepseek.balance');
  const children: OverviewItem[] = [];

  for (const entry of balance?.entries ?? []) {
    children.push({
      id: `provider:deepseek:balance:${entry.currency}`,
      label: entry.currency,
      description: formatMoney(entry.total, entry.currency),
      tooltip: detailTooltip(entry.currency, formatMoney(entry.total, entry.currency)),
      state: 'muted',
      stateLabel: '',
      action: null,
      children: [],
    });
  }

  const period = pricingPeriodLabel(options.pricing, options.t);
  children.push({
    id: 'provider:deepseek:pricing',
    label: period,
    description: '',
    tooltip: period,
    state: 'muted',
    stateLabel: '',
    action: null,
    children: [],
  });

  const primaryCurrency = selectPrimaryCurrency(
    balance?.entries.map((candidate) => candidate.currency) ?? [],
  );
  const entry = balance?.entries.find((candidate) => candidate.currency === primaryCurrency);
  return providerItem(
    'deepseek',
    providerDisplayName('deepseek'),
    status.state,
    status.label,
    status.state === 'positive'
      ? entry === undefined
        ? ''
        : currencySummary(entry.total, entry.currency)
      : stateDescription(status),
    children,
    options,
    status.detail,
  );
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

function tokenPlanWindowLabel(
  cycle: QwenTokenPlanWindowView['cycle'],
  t: Translator,
): string {
  return cycle === 'weekly' ? t('tooltip.window.weekly') : t('tooltip.window.monthly');
}

function qwenItem(options: OverviewOptions): OverviewItem {
  const snapshot = options.snapshots.qwen;
  const status = primaryStatus(snapshot, 'qwen.accountBalance', options.t);
  const balance = capabilityValue<QwenAccountBalance>(snapshot, 'qwen.accountBalance');
  const balanceChildren: OverviewItem[] = [];
  const planChildren: OverviewItem[] = [];

  if (balance !== undefined) {
    const fields: Array<{ id: string; label: string; amount: number }> = [
      {
        id: 'available',
        label: options.t('dashboard.qwen.availableBalance'),
        amount: balance.availableAmount,
      },
      {
        id: 'available-cash',
        label: options.t('dashboard.qwen.availableCash'),
        amount: balance.availableCashAmount,
      },
      {
        id: 'credit',
        label: options.t('dashboard.qwen.credit'),
        amount: balance.creditAmount,
      },
      {
        id: 'mybank-credit',
        label: options.t('dashboard.qwen.mybankCredit'),
        amount: balance.mybankCreditAmount,
      },
    ];
    if (balance.quotaLimit !== null) {
      fields.push({
        id: 'quota-limit',
        label: options.t('dashboard.qwen.quotaLimit'),
        amount: balance.quotaLimit,
      });
    }
    for (const field of fields) {
      const amount = qwenAmount(field.amount, balance.currency);
      balanceChildren.push({
        id: `provider:qwen:${field.id}`,
        label: field.label,
        description: amount,
        tooltip: detailTooltip(field.label, amount),
        state: 'muted',
        stateLabel: '',
        action: null,
        children: [],
      });
    }
  }

  for (const window of qwenTokenPlanWindows(snapshot)) {
    const percent = Math.round(window.remainingPercent);
    const used = Math.max(0, 100 - percent);
    const label = tokenPlanWindowLabel(window.cycle, options.t);
    const quota = quotaRow(label, percent, options.warningThresholdPercent, options.t);
    const reset =
      window.resetAt === null
        ? undefined
        : `${options.t('tooltip.resetAt')} ${instantLabel(window.resetAt, options.timeZone) ?? ''}`;
    const description =
      `${options.t('tooltip.remaining')} ${percent}% · ` +
      `${options.t('tooltip.used')} ${used}%`;
    planChildren.push({
      id: `provider:qwen:tokenPlan:${window.cycle}`,
      label,
      description,
      tooltip: detailTooltip(label, description, reset),
      state: quota.state,
      stateLabel: quota.stateLabel,
      action: null,
      children: [],
    });
  }

  const subscription = capabilityValue<QwenTokenPlanSubscription>(
    snapshot,
    'qwen.tokenPlanSubscription',
  );
  if (subscription?.status === 'active') {
    if (subscription.specCode !== null) {
      planChildren.push({
        id: 'provider:qwen:plan',
        label: options.t('dashboard.qwen.planTier'),
        description: subscription.specCode,
        tooltip: detailTooltip(
          options.t('dashboard.qwen.planTier'),
          subscription.specCode,
        ),
        state: 'muted',
        stateLabel: '',
        action: null,
        children: [],
      });
    }
    if (subscription.expiresAt !== null) {
      const expiry = instantLabel(subscription.expiresAt, options.timeZone);
      if (expiry !== undefined) {
        planChildren.push({
          id: 'provider:qwen:expires',
          label: options.t('tooltip.expires'),
          description: expiry,
          tooltip: detailTooltip(options.t('tooltip.expires'), expiry),
          state: 'muted',
          stateLabel: '',
          action: null,
          children: [],
        });
      }
    }
  } else if (subscription?.status === 'none') {
    planChildren.push({
      id: 'provider:qwen:notSubscribed',
      label: options.t('dashboard.qwen.notSubscribed'),
      description: '',
      tooltip: options.t('dashboard.qwen.notSubscribed'),
      state: 'muted',
      stateLabel: '',
      action: null,
      children: [],
    });
  }

  const failed = [
    snapshot?.capabilities['qwen.tokenPlan'],
    snapshot?.capabilities['qwen.tokenPlanSubscription'],
  ].find((state) => state?.kind === 'failed');
  if (failed?.kind === 'failed') {
    const message = options.t(failed.error.message);
    planChildren.push({
      id: 'provider:qwen:tokenPlanFailed',
      label: options.t('capability.qwen.tokenPlan'),
      description: message,
      tooltip: message,
      state: 'failed',
      stateLabel: options.t('state.failed'),
      action: null,
      children: [],
    });
  }

  const windows = qwenTokenPlanWindows(snapshot);
  const tightest = windows.reduce<QwenTokenPlanWindowView | undefined>(
    (lowest, window) =>
      lowest === undefined || window.remainingPercent < lowest.remainingPercent
        ? window
        : lowest,
    undefined,
  );

  const children: OverviewItem[] = [];
  if (balanceChildren.length > 0) {
    const label = options.t('dashboard.accountBalance');
    const amount =
      balance === undefined ? '' : qwenAmount(balance.availableAmount, balance.currency);
    children.push({
      id: 'provider:qwen:balanceGroup',
      label,
      description: amount,
      tooltip: detailTooltip(label, amount),
      state: 'muted',
      stateLabel: '',
      action: null,
      children: balanceChildren,
    });
  }
  if (planChildren.length > 0) {
    const label = options.t('dashboard.qwen.tokenPlanSection');
    const description =
      tightest === undefined ? '' : `${Math.round(tightest.remainingPercent)}%`;
    children.push({
      id: 'provider:qwen:tokenPlanGroup',
      label,
      description,
      tooltip: detailTooltip(label, description),
      state: 'muted',
      stateLabel: '',
      action: null,
      children: planChildren,
    });
  }

  const balanceText =
    balance === undefined
      ? ''
      : qwenAmount(balance.availableAmount, balance.currency);
  const planText =
    tightest === undefined
      ? ''
      : `${options.t('dashboard.qwen.tokenPlanSection')} ` +
        `${Math.round(tightest.remainingPercent)}%`;
  let state = status.state;
  let stateLabel = status.label;
  if (tightest !== undefined && status.state !== 'failed') {
    const percent = Math.round(tightest.remainingPercent);
    const quota = quotaRow(
      tokenPlanWindowLabel(tightest.cycle, options.t),
      percent,
      options.warningThresholdPercent,
      options.t,
    );
    state = quota.state;
    stateLabel = quota.stateLabel;
  }
  const description =
    [balanceText, planText].filter((part) => part.length > 0).join(' · ') ||
    stateDescription(status);

  return providerItem(
    'qwen',
    providerDisplayName('qwen'),
    state,
    stateLabel,
    description,
    children,
    options,
    status.detail,
  );
}

export function buildOverviewItems(options: OverviewOptions): OverviewItem[] {
  const selected = options.order.filter((id) => options.configured[id] === true);
  if (selected.length === 0) {
    return [{
      id: 'configure',
      label: options.t('dashboard.configureProviders'),
      description: '',
      tooltip: options.t('dashboard.configureProviders'),
      state: 'muted',
      stateLabel: options.t('state.unconfigured'),
      action: {
        kind: 'configureProviders',
        title: options.t('dashboard.configureProviders'),
      },
      children: [],
    }];
  }
  return selected.map((id) => {
    if (id === 'minimax-cn' || id === 'minimax-global') {
      return miniMaxItem(id, options);
    }
    if (id === 'deepseek') return deepSeekItem(options);
    return qwenItem(options);
  });
}
