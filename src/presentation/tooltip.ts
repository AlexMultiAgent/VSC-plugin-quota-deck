import type { Translator } from '../localization';
import type { ProviderId, ProviderSnapshot } from '../core/types';
import type { MessageKey } from '../localization/messages';
import { SHANGHAI } from '../core/time';
import { capabilityValue } from '../core/capability';
import type { MiniMaxPlan, MiniMaxPoints, MiniMaxSubscription } from '../providers/minimax/shape';
import type { DeepSeekBalance } from '../providers/deepseek/shape';
import type { QwenAccountBalance } from '../providers/qwen/shape';
import { pricingState, type PricingState } from '../providers/deepseek/pricing';
import { formatMoney, providerDisplayName, remainingBar } from './display';
import { pricingPeriodLabel, rangeLabel } from './labels';

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

interface UsagePoint {
  readonly date: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cacheHitTokens: number;
  readonly cacheMissTokens: number;
  readonly outputTokens: number;
}

interface UsageCost {
  readonly date: string;
  readonly cost: number;
  readonly currency: string;
}

interface UsageSummary {
  readonly requests: number;
  readonly tokens: number;
  readonly cacheHitRate: number | null;
}

function hasUsableConfiguration(snapshot: ProviderSnapshot | undefined): snapshot is ProviderSnapshot {
  return snapshot !== undefined && Object.values(snapshot.capabilities).some(
    (state) => state.kind !== 'unconfigured' && state.kind !== 'unsupported',
  );
}

function balances(snapshot: ProviderSnapshot | undefined): BalanceEntry[] {
  return capabilityValue<DeepSeekBalance>(snapshot, 'deepseek.balance')?.entries ?? [];
}

function bar(percent: number): string {
  const track = remainingBar(percent);
  const filled = [...track].filter((segment) => segment === '━').length;
  return (
    `<span style="color:var(--vscode-charts-green);">${'━'.repeat(filled)}</span>` +
    `<span style="color:var(--vscode-descriptionForeground);">${'─'.repeat(track.length - filled)}</span>`
  );
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

function usageDate(value: string, timeZone: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(parsed));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function summarize(points: readonly UsagePoint[]): UsageSummary {
  const cacheHit = points.reduce((sum, point) => sum + point.cacheHitTokens, 0);
  const cacheMiss = points.reduce((sum, point) => sum + point.cacheMissTokens, 0);
  const denominator = cacheHit + cacheMiss;
  return {
    requests: points.reduce((sum, point) => sum + point.requests, 0),
    tokens: points.reduce((sum, point) => sum + point.totalTokens, 0),
    cacheHitRate: denominator === 0 ? null : cacheHit / denominator,
  };
}

function usageRow(
  label: string,
  summary: UsageSummary,
  cost: number,
  currency: string,
  t: Translator,
): string {
  const cache = summary.cacheHitRate === null
    ? ''
    : `${t('dashboard.cacheHit')} ${Math.round(summary.cacheHitRate * 100)}%`;
  return (
    `<tr><td>${escapeHtml(label)}</td>` +
    `<td>${escapeHtml(formatMoney(cost, currency))}</td>` +
    `<td>${summary.requests} ${escapeHtml(t('tooltip.requestsShort'))} · ` +
    `${summary.tokens} ${escapeHtml(t('tooltip.tokensShort'))}</td>` +
    `<td class="t-muted">${escapeHtml(cache)}</td></tr>`
  );
}

function costTotals(costs: readonly UsageCost[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of costs) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.cost);
  }
  return totals;
}

function usageRows(snapshot: ProviderSnapshot | undefined, t: Translator, timeZone: string): string {
  if (snapshot?.providerId === 'deepseek') return '';
  const state = snapshot?.capabilities['deepseek.usageAmount'];
  if (state === undefined) return '';
  if (state.kind === 'failed') {
    if (state.error.kind === 'auth') {
      return `<tr><td colspan="4" class="t-failed">${escapeHtml(t('dashboard.sessionExpired'))}</td></tr>`;
    }
    return '';
  }
  if (state.kind !== 'ok' && state.kind !== 'stale') return '';
  const data = state.data as
    | { points?: UsagePoint[]; costs?: UsageCost[]; rangeId?: string }
    | undefined;
  const points = data?.points ?? [];
  if (points.length === 0) return '';

  const costs = data?.costs ?? [];
  const rangeId = data?.rangeId ?? 'last7';
  const rows: string[] = [];
  const pushRows = (label: string, subset: readonly UsagePoint[]) => {
    const summary = summarize(subset);
    const totals = costTotals(costs.filter((row) => subset.some((point) => point.date === row.date)));
    if (totals.size === 0) {
      rows.push(usageRow(label, summary, 0, 'CNY', t));
      return;
    }
    for (const [currency, total] of totals) {
      rows.push(usageRow(label, summary, total, currency, t));
    }
  };
  if (rangeId === 'last7') {
    const today = usageDate(new Date().toISOString(), timeZone);
    const todayPoints = points.filter((point) => usageDate(point.date, timeZone) === today);
    if (todayPoints.length > 0) pushRows(t('dashboard.range.today'), todayPoints);
    pushRows(t('dashboard.range.last7'), points);
  } else {
    pushRows(rangeLabel(rangeId as Parameters<typeof rangeLabel>[0], t), points);
  }
  return rows.join('');
}

function providerRows(snapshot: ProviderSnapshot | undefined, t: Translator, timeZone: string): string {
  if (snapshot === undefined) {
    return `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.unconfigured'))}</td></tr>`;
  }

  const qwenBalance = capabilityValue<QwenAccountBalance>(snapshot, 'qwen.accountBalance');
  if (qwenBalance !== undefined) {
    const row = (label: string, amount: number, suffix = '') =>
      `<tr><td>${escapeHtml(label)}</td>` +
      `<td>${escapeHtml(formatMoney(amount, qwenBalance.currency))}</td>` +
      `<td class="t-muted">${escapeHtml(qwenBalance.currency)}${escapeHtml(suffix)}</td><td></td></tr>`;
    let rows =
      row(t('dashboard.qwen.availableBalance'), qwenBalance.availableAmount) +
      row(t('dashboard.qwen.availableCash'), qwenBalance.availableCashAmount) +
      row(t('dashboard.qwen.credit'), qwenBalance.creditAmount) +
      row(t('dashboard.qwen.mybankCredit'), qwenBalance.mybankCreditAmount);
    if (qwenBalance.quotaLimit !== null) {
      rows += row(t('dashboard.qwen.quotaLimit'), qwenBalance.quotaLimit);
    }
    return rows;
  }

  const plan = capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan');
  if (plan !== undefined) {
    const rows = plan.windows
      .filter((window) => window.remainingPercent !== null)
      .map(
        (window) =>
          `<tr><td>${escapeHtml(
            window.window === 'weekly'
              ? t('tooltip.window.weekly')
              : t('tooltip.window.fiveHour'),
          )}</td>` +
          `<td>${bar(window.remainingPercent ?? 0)}</td>` +
          `<td>${Math.round(window.remainingPercent ?? 0)}%</td>` +
          `<td class="t-muted">${escapeHtml(
            window.resetAt === null
              ? ''
              : `${t('tooltip.resetAt')} ${zonedTime(new Date(window.resetAt).toISOString(), timeZone)}`,
          )}</td></tr>`,
      );
    for (const model of plan.models ?? []) {
      if (model.model === 'general' || model.total === null || model.total <= 0 || model.remaining === null) continue;
      const percent = Math.round((model.remaining / model.total) * 100);
      rows.push(
        `<tr><td>${escapeHtml(model.model)}</td>` +
        `<td>${bar(percent)}</td>` +
        `<td>${percent}%</td>` +
        `<td class="t-muted">${model.remaining}/${model.total}</td></tr>`,
      );
    }
    const points = capabilityValue<MiniMaxPoints>(snapshot, 'minimax.points');
    if (typeof points?.balance === 'number') {
      rows.push(`<tr><td>${escapeHtml(t('capability.minimax.points'))}</td><td>${points.balance.toLocaleString('en-US')}</td><td></td><td></td></tr>`);
    }
    const subscription = capabilityValue<MiniMaxSubscription>(snapshot, 'minimax.subscription');
    if (typeof subscription?.expiresAt === 'number') {
      rows.push(
        `<tr><td>${escapeHtml(t('tooltip.expires'))}</td>` +
        `<td>${new Date(subscription.expiresAt).toISOString().slice(0, 10)}</td>` +
        '<td></td><td></td></tr>',
      );
    }
    if (rows.length > 0) return rows.join('');
  }

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
    return rows + usageRows(snapshot, t, timeZone);
  }

  const usage = usageRows(snapshot, t, timeZone);
  if (usage.length > 0) return usage;

  const failed = Object.values(snapshot.capabilities).find((state) => state.kind === 'failed');
  if (failed !== undefined && failed.kind === 'failed') {
    return `<tr><td colspan="4" class="t-failed">${escapeHtml(t(failed.error.message))}</td></tr>`;
  }
  const unsupported = Object.values(snapshot.capabilities).find((state) => state.kind === 'unsupported');
  if (unsupported !== undefined && unsupported.kind === 'unsupported') {
    return `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.unsupported'))}</td></tr>`;
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
): string {
  const cards = order
    .filter((id) => hasUsableConfiguration(snapshots[id]))
    .map((id) => {
      const snapshot = snapshots[id];
      const region = REGION[id] === '' ? '' : t(REGION[id]);
      const period =
        id === 'deepseek'
          ? `<tr><td colspan="4" class="t-muted">${escapeHtml(pricingPeriodLabel(pricing, t))}</td></tr>`
          : '';
      return (
        '<table class="t-card">' +
        `<tr><td class="t-title">${escapeHtml(providerDisplayName(id))}</td>` +
        `<td class="t-muted">${escapeHtml(region)}</td></tr>` +
        period +
        `<tr><td colspan="4">${providerRows(snapshot, t, timeZone)}</td></tr>` +
        '</table>'
      );
    })
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
    cards +
    `<div class="t-footer"><span class="t-muted">${escapeHtml(footerDetails)}</span>` +
    `<span class="t-muted">${escapeHtml(t('statusBar.tooltip.footer'))}</span></div>` +
    '</div>'
  );
}
