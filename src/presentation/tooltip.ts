import type { Translator } from '../localization';
import type { ProviderId, ProviderSnapshot } from '../core/types';
import type { MessageKey } from '../localization/messages';
import { SHANGHAI } from '../core/time';
import { capabilityValue } from '../core/capability';
import type {
  MiniMaxAccountBalance,
  MiniMaxPlan,
  MiniMaxSubscription,
} from '../providers/minimax/shape';
import { withAvailability } from '../providers/minimax/shape';
import type { DeepSeekBalance } from '../providers/deepseek/shape';
import type {
  QwenAccountBalance,
  QwenTokenPlan,
  QwenTokenPlanSubscription,
} from '../providers/qwen/shape';
import { pricingState, type PricingState } from '../providers/deepseek/pricing';
import {
  formatCompactDuration,
  formatExpiryRemaining,
  formatMoney,
  formatRemainingDays,
  providerDisplayName,
  quotaStateText,
} from './display';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

const REGION: Record<ProviderId, MessageKey | ''> = {
  'minimax-cn': 'tooltip.region.domestic',
  'minimax-global': 'tooltip.region.international',
  deepseek: '',
  qwen: '',
};

interface WindowView {
  readonly window: string;
  readonly remainingPercent: number | null;
  readonly resetAt: number | null;
  readonly unlimited: boolean;
}

interface BalanceEntry {
  readonly currency: string;
  readonly total: number;
}

function hasUsableConfiguration(snapshot: ProviderSnapshot | undefined): snapshot is ProviderSnapshot {
  return snapshot !== undefined && Object.values(snapshot.capabilities).some(
    (state) => state.kind !== 'unconfigured' && state.kind !== 'unsupported',
  );
}

function balances(snapshot: ProviderSnapshot | undefined): BalanceEntry[] {
  return capabilityValue<DeepSeekBalance>(snapshot, 'deepseek.balance')?.entries ?? [];
}

/**
 * The capabilities this tooltip actually renders. A failure or stale marker
 * for any of them is shown even when another capability still produced rows:
 * a live balance must not hide a failed Token Plan, and vice versa.
 */
const TIP_CAPABILITIES: Record<ProviderId, readonly string[]> = {
  'minimax-cn': ['minimax.plan', 'minimax.subscription', 'minimax.accountBalance'],
  'minimax-global': ['minimax.plan', 'minimax.subscription', 'minimax.accountBalance'],
  deepseek: ['deepseek.balance'],
  qwen: ['qwen.accountBalance', 'qwen.tokenPlan', 'qwen.tokenPlanSubscription'],
};

const CAPABILITY_TITLE: Record<string, MessageKey> = {
  'minimax.plan': 'capability.minimax.plan',
  'minimax.subscription': 'capability.minimax.subscription',
  'minimax.accountBalance': 'capability.minimax.accountBalance',
  'deepseek.balance': 'capability.deepseek.balance',
  'qwen.accountBalance': 'capability.qwen.accountBalance',
  'qwen.tokenPlan': 'capability.qwen.tokenPlan',
  'qwen.tokenPlanSubscription': 'capability.qwen.tokenPlanSubscription',
};

function capabilityTitle(capability: string, t: Translator): string {
  const key = CAPABILITY_TITLE[capability];
  return key === undefined ? capability : t(key);
}

function stateRows(id: ProviderId, snapshot: ProviderSnapshot, t: Translator): string {
  const tracked = TIP_CAPABILITIES[id];
  let rows = '';
  for (const capability of tracked) {
    const state = snapshot.capabilities[capability];
    if (state?.kind !== 'failed') continue;
    rows +=
      `<tr><td>${escapeHtml(capabilityTitle(capability, t))}</td>` +
      `<td colspan="3" class="t-failed">` +
      `${escapeHtml(t(state.error.message))}</td></tr>`;
  }
  if (tracked.some((capability) => snapshot.capabilities[capability]?.kind === 'stale')) {
    rows += `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.stale'))}</td></tr>`;
  }
  return rows;
}

function bar(percent: number): string {
  const width = Math.min(100, Math.max(0, percent));
  const filled = Math.round((width / 100) * 16);
  return (
    '<span style="color:var(--vscode-charts-green);">' +
    `${'█'.repeat(filled)}</span>` +
    '<span style="color:var(--vscode-descriptionForeground);">' +
    `${'█'.repeat(16 - filled)}</span>`
  );
}

function pricingPeriod(pricing: PricingState, t: Translator): string {
  const color =
    pricing === 'peak'
      ? 'var(--vscode-charts-orange, #d18616)'
      : pricing === 'offPeak'
        ? 'var(--vscode-charts-green, #89d185)'
        : 'var(--vscode-descriptionForeground)';
  const weight = pricing === 'unavailable' ? '400' : '600';
  const label =
    pricing === 'peak'
      ? t('hours.peakDetail')
      : pricing === 'offPeak'
        ? t('hours.offPeakDetail')
        : t('hours.unavailableDetail');
  return (
    `<span style="color:${color};font-weight:${weight};">` +
    `${escapeHtml(label)}</span>`
  );
}

function quotaValue(value: string): string {
  return (
    '<span style="display:inline-block;vertical-align:middle;' +
    `min-width:42px;margin-left:10px;">${escapeHtml(value)}</span>`
  );
}

/**
 * The marker that says a window's number cannot be spent yet.
 *
 * A blocked window keeps its own percentage — that is real account data — and
 * gains a note that the empty weekly window is what holds it back. An empty
 * window is labelled instead: 0 % on its own does not say whether the window
 * is spent or merely blocked.
 */
function quotaStateSuffix(blocked: boolean, remainingPercent: number, t: Translator): string {
  const marker = quotaStateText(blocked, remainingPercent, t);
  return marker === '' ? '' : `<span class="t-muted"> ${escapeHtml(marker)}</span>`;
}

function zonedTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/**
 * The clock glyph is a theme icon: `supportThemeIcons` on the tooltip's
 * MarkdownString makes VS Code rewrite it into a codicon before rendering.
 * The countdown itself is deliberately not translated, so both languages read
 * the same.
 */
const RESET_ICON = '$(clock)';

function resetCell(resetAt: number | null | undefined, now: number): string {
  if (resetAt == null) return '<td colspan="2"></td>';
  return (
    '<td class="t-muted" colspan="2" align="left" ' +
    'style="white-space:nowrap;">' +
    `${RESET_ICON} ${escapeHtml(formatCompactDuration(resetAt - now))}</td>`
  );
}

function tokenPlanWindowLabel(cycle: 'monthly' | 'weekly', t: Translator): string {
  return cycle === 'weekly' ? t('tooltip.window.weekly') : t('tooltip.window.monthly');
}

function qwenTokenPlanRows(
  snapshot: ProviderSnapshot,
  t: Translator,
  timeZone: string,
  now: number,
): string {
  const plan = capabilityValue<QwenTokenPlan>(snapshot, 'qwen.tokenPlan');
  const subscription = capabilityValue<QwenTokenPlanSubscription>(
    snapshot,
    'qwen.tokenPlanSubscription',
  );
  let rows = '';

  if (plan !== undefined && plan.windows.length > 0) {
    rows += `<tr><td colspan="4">${escapeHtml(t('dashboard.qwen.tokenPlanSection'))}</td></tr>`;
    for (const window of plan.windows) {
      const remaining = Math.max(0, Math.min(100, (1 - window.usedRatio) * 100));
      const label = tokenPlanWindowLabel(window.cycle, t);
      rows +=
        `<tr><td>${escapeHtml(label)}</td>` +
        `<td>${bar(remaining)}${quotaValue(`${Math.round(remaining)}%`)}</td>` +
        `${resetCell(window.resetAt, now)}</tr>`;
    }
  }

  if (subscription?.status === 'active') {
    if (subscription.specCode !== null) {
      rows +=
        `<tr><td>${escapeHtml(t('dashboard.qwen.planTier'))}</td>` +
        `<td>${escapeHtml(subscription.specCode)}</td><td></td><td></td></tr>`;
    }
    if (subscription.expiresAt !== null) {
      const expiry = zonedTime(new Date(subscription.expiresAt).toISOString(), timeZone);
      const remaining =
        subscription.expiresAt <= now
          ? t('tooltip.expired')
          : typeof subscription.remainingDays === 'number'
            ? formatRemainingDays(subscription.remainingDays, t)
            : formatExpiryRemaining(subscription.expiresAt, now, t);
      rows +=
        `<tr><td>${escapeHtml(t('tooltip.expires'))}</td>` +
        `<td>${escapeHtml(`${expiry} · ${remaining}`)}</td><td></td><td></td></tr>`;
    }
  } else if (subscription?.status === 'none') {
    rows +=
      `<tr><td colspan="4" class="t-muted">` +
      `${escapeHtml(t('dashboard.qwen.notSubscribed'))}</td></tr>`;
  }

  return rows;
}

function providerRows(
  id: ProviderId,
  snapshot: ProviderSnapshot | undefined,
  t: Translator,
  timeZone: string,
  now: number,
): string {
  if (snapshot === undefined) {
    return `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.unconfigured'))}</td></tr>`;
  }

  if (id === 'qwen') {
    const qwenBalance = capabilityValue<QwenAccountBalance>(snapshot, 'qwen.accountBalance');
    let rows = '';
    if (qwenBalance !== undefined) {
      rows +=
        `<tr><td>${escapeHtml(t('dashboard.accountBalance'))}</td>` +
        `<td>${escapeHtml(formatMoney(qwenBalance.availableAmount, qwenBalance.currency))}</td>` +
        `<td class="t-muted">${escapeHtml(qwenBalance.currency)}</td><td></td></tr>`;
    }
    rows += qwenTokenPlanRows(snapshot, t, timeZone, now);
    if (rows.length > 0) return rows + stateRows(id, snapshot, t);
  }

  const miniMaxBalance = capabilityValue<MiniMaxAccountBalance>(
    snapshot,
    'minimax.accountBalance',
  );
  const miniMaxBalanceRow =
    miniMaxBalance === undefined
      ? ''
      : `<tr><td>${escapeHtml(t('dashboard.accountBalance'))}</td>` +
        `<td>${escapeHtml(formatMoney(miniMaxBalance.availableAmount, miniMaxBalance.currency))}</td>` +
        `<td class="t-muted">${escapeHtml(miniMaxBalance.currency)}</td><td></td></tr>`;
  const plan = capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan');
  if (plan !== undefined) {
    const available = withAvailability(plan);
    const rows: string[] = [
      ...(miniMaxBalanceRow.length > 0 ? [miniMaxBalanceRow] : []),
      `<tr><td colspan="4">${escapeHtml(t('capability.minimax.plan'))}</td></tr>`,
    ];
    for (const window of available.windows) {
      const label =
        window.window === 'weekly'
          ? t('tooltip.window.weekly')
          : t('tooltip.window.fiveHour');
      if (window.unlimited) {
        rows.push(
          `<tr><td>${escapeHtml(label)}</td>` +
          `<td>${escapeHtml(t('tooltip.unlimited'))}</td>` +
          `${resetCell(window.resetAt, now)}</tr>`,
        );
        continue;
      }
      if (window.remainingPercent === null) continue;
      const remaining = Math.round(window.remainingPercent);
      rows.push(
        `<tr><td>${escapeHtml(label)}</td>` +
        `<td>${bar(window.remainingPercent)}${quotaValue(`${remaining}%`)}` +
        `${quotaStateSuffix(window.blocked, window.remainingPercent, t)}</td>` +
        `${resetCell(window.resetAt, now)}</tr>`,
      );
    }
    for (const model of available.models ?? []) {
      if (
        model.model === 'general' ||
        model.total == null ||
        model.total <= 0 ||
        model.remaining == null
      ) {
        continue;
      }
      const percent = Math.round(
        Math.max(
          0,
          Math.min(100, model.remainingPercent ?? (model.remaining / model.total) * 100),
        ),
      );
      const label = model.model === 'video' ? t('tooltip.model.video') : model.model;
      rows.push(
        `<tr><td>${escapeHtml(label)}</td>` +
        `<td>${bar(percent)}${quotaValue(`${model.remaining}/${model.total}`)}` +
        `${quotaStateSuffix(model.blocked, percent, t)}</td>` +
        `${resetCell(model.resetAt, now)}</tr>`,
      );
      // The media allowance has its own weekly pool, and it is the pool that
      // decides whether the model can be used at all.
      if (
        model.weeklyTotal == null ||
        model.weeklyTotal <= 0 ||
        model.weeklyRemaining == null
      ) {
        continue;
      }
      const weeklyPercent = Math.round(
        Math.max(
          0,
          Math.min(
            100,
            model.weeklyRemainingPercent ??
              (model.weeklyRemaining / model.weeklyTotal) * 100,
          ),
        ),
      );
      rows.push(
        `<tr><td>${escapeHtml(`${label} · ${t('tooltip.window.weekly')}`)}</td>` +
        `<td>${bar(weeklyPercent)}` +
        `${quotaValue(`${model.weeklyRemaining}/${model.weeklyTotal}`)}` +
        `${quotaStateSuffix(model.weeklyRemainingPercent !== null && model.weeklyRemainingPercent <= 0, weeklyPercent, t)}</td>` +
        `${resetCell(model.weeklyResetAt, now)}</tr>`,
      );
    }
    const subscription = capabilityValue<MiniMaxSubscription>(snapshot, 'minimax.subscription');
    if (subscription?.planName) {
      rows.push(
        `<tr><td>${escapeHtml(t('dashboard.minimax.planName'))}</td>` +
        `<td>${escapeHtml(subscription.planName)}</td>` +
        '<td></td><td></td></tr>',
      );
    }
    if (typeof subscription?.expiresAt === 'number') {
      const expiry = zonedTime(new Date(subscription.expiresAt).toISOString(), timeZone);
      const remaining = formatExpiryRemaining(subscription.expiresAt, now, t);
      rows.push(
        `<tr><td>${escapeHtml(t('tooltip.expires'))}</td>` +
        `<td>${escapeHtml(`${expiry} · ${remaining}`)}</td>` +
        '<td></td><td></td></tr>',
      );
    }
    rows.push(
      `<tr><td colspan="4" class="t-muted">${escapeHtml(t('dashboard.minimax.creditsConsoleOnly'))}</td></tr>`,
    );
    if (rows.length > 0) return rows.join('') + stateRows(id, snapshot, t);
  }
  if (miniMaxBalanceRow.length > 0) return miniMaxBalanceRow + stateRows(id, snapshot, t);

  const balance = balances(snapshot);
  if (balance.length > 0) {
    const rows = balance
      .map(
        (entry) =>
          `<tr><td>${escapeHtml(entry.currency)}</td>` +
          `<td>${escapeHtml(formatMoney(entry.total, entry.currency))}</td>` +
          `<td class="t-muted">${escapeHtml(t('tooltip.balance'))}</td><td></td></tr>`,
      )
      .join('');
    return rows + stateRows(id, snapshot, t);
  }

  const failed = Object.values(snapshot.capabilities).find((state) => state.kind === 'failed');
  if (failed !== undefined && failed.kind === 'failed') {
    return `<tr><td colspan="4" class="t-failed">${escapeHtml(t(failed.error.message))}</td></tr>`;
  }
  const unsupported = Object.values(snapshot.capabilities).find((state) => state.kind === 'unsupported');
  if (unsupported !== undefined && unsupported.kind === 'unsupported') {
    return `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.unsupported'))}</td></tr>`;
  }
  const stale = Object.values(snapshot.capabilities).find((state) => state.kind === 'stale');
  if (stale !== undefined) {
    return `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.stale'))}</td></tr>`;
  }
  return `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.unconfigured'))}</td></tr>`;
}

export function renderTooltip(
  snapshots: Partial<Record<ProviderId, ProviderSnapshot>>,
  order: ProviderId[],
  t: Translator,
  lastRefreshIso?: string,
  timeZone: string = SHANGHAI,
  pricing: PricingState = pricingState(Date.now()),
  now: number = Date.now(),
): string {
  const providerCards = order
    .filter((id) => hasUsableConfiguration(snapshots[id]))
    .map((id) => {
      const snapshot = snapshots[id];
      const region = REGION[id] === '' ? '' : t(REGION[id]);
      const period =
        id === 'deepseek'
          ? `<tr><td colspan="4">${pricingPeriod(pricing, t)}</td></tr>`
          : '';
      return (
        '<table class="t-card">' +
        `<tr><td class="t-title"><strong>${escapeHtml(providerDisplayName(id))}</strong></td>` +
        `<td class="t-muted">${escapeHtml(region)}</td></tr>` +
        period +
        providerRows(id, snapshot, t, timeZone, now) +
        '</table>'
      );
    });
  const cards = providerCards
    .map(
      (card, index) =>
        (index === 0
          ? ''
          : '<hr class="t-provider-separator" style="border:0;border-top:1px solid ' +
            'var(--vscode-widget-border, var(--vscode-descriptionForeground, #666));' +
            'margin:10px 0 4px;">') + card,
    )
    .join('');

  const footer =
    lastRefreshIso === undefined
      ? ''
      : `${escapeHtml(t('tooltip.updated'))} ${escapeHtml(zonedTime(lastRefreshIso, timeZone))}` +
        ` · ${escapeHtml(timeZone)}`;
  const provenance = cards === '' ? '' : t('tooltip.dataSourceAccount');
  const footerDetails = [provenance, footer].filter((part) => part !== '').join(' · ');

  return (
    '<div class="t-root">' +
    '<div class="t-header"><span class="t-brand">QuotaDeck CN</span>' +
    `<span class="t-badge">${escapeHtml(t('statusBar.tooltip.badge'))}</span>` +
    `<span class="t-muted">${escapeHtml(t('statusBar.tooltip.header'))}</span></div>` +
    '<hr class="t-header-separator" style="border:0;border-top:1px solid ' +
    'var(--vscode-widget-border, var(--vscode-descriptionForeground, #666));' +
    'margin:8px 0 6px;">' +
    cards +
    '<hr class="t-footer-separator" style="border:0;border-top:1px solid ' +
    'var(--vscode-widget-border, var(--vscode-descriptionForeground, #666));' +
    'margin:10px 0 6px;">' +
    `<div class="t-footer"><span class="t-muted">${escapeHtml(footerDetails)}</span>` +
    `<br><span class="t-muted">${escapeHtml(t('statusBar.tooltip.footer'))}</span></div>` +
    '</div>'
  );
}
