import type { Translator } from '../localization';
import type { ProviderId, ProviderSnapshot } from '../core/types';
import type { MessageKey } from '../localization/messages';
import { rangeLabel } from './labels';

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

const PROVIDER_NAME: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

const REGION: Record<ProviderId, string> = {
  'minimax-cn': 'Domestic',
  'minimax-global': 'International',
  deepseek: '—',
  qwen: '—',
};

const SESSION_BADGE: Record<ProviderId, MessageKey> = {
  'minimax-cn': 'session.apiKey',
  'minimax-global': 'session.apiKey',
  deepseek: 'session.webSession',
  qwen: 'session.apiKey',
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

interface MiniMaxModelRow {
  readonly model: string;
  readonly remaining: number | null;
  readonly total: number | null;
}

interface UsagePoint {
  readonly date: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cacheHitTokens: number;
  readonly cacheMissTokens: number;
  readonly outputTokens: number;
  readonly cost: number;
  readonly currency: string;
}

interface UsageSummary {
  readonly cost: number;
  readonly requests: number;
  readonly tokens: number;
  readonly cacheHitRate: number | null;
}

function balances(snapshot: ProviderSnapshot | undefined): BalanceEntry[] {
  const state = snapshot?.capabilities['deepseek.balance'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { entries?: BalanceEntry[] } | undefined;
  return data?.entries ?? [];
}

function bar(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = clamped === 0 ? 0 : Math.max(1, Math.round((clamped / 100) * 10));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function formatMoney(amount: number, currency: string): string {
  return currency === 'CNY' ? `¥${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
}

function shanghaiTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function usageDate(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
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
    cost: points.reduce((sum, point) => sum + point.cost, 0),
    requests: points.reduce((sum, point) => sum + point.requests, 0),
    tokens: points.reduce((sum, point) => sum + point.totalTokens, 0),
    cacheHitRate: denominator === 0 ? null : cacheHit / denominator,
  };
}

function usageRow(label: string, summary: UsageSummary, currency: string): string {
  const cache = summary.cacheHitRate === null ? '' : `cache ${Math.round(summary.cacheHitRate * 100)}%`;
  return (
    `<tr><td>${escapeHtml(label)}</td>` +
    `<td>${escapeHtml(formatMoney(summary.cost, currency))}</td>` +
    `<td>${summary.requests} req · ${summary.tokens} tok</td>` +
    `<td class="t-muted">${escapeHtml(cache)}</td></tr>`
  );
}

function usageRows(snapshot: ProviderSnapshot | undefined, t: Translator): string {
  const state = snapshot?.capabilities['deepseek.usageAmount'];
  if (state === undefined) return '';
  if (state.kind === 'failed') {
    if (state.error.kind === 'auth') {
      return `<tr><td colspan="4" class="t-failed">${escapeHtml(t('dashboard.sessionExpired'))}</td></tr>`;
    }
    return '';
  }
  if (state.kind !== 'ok') return '';
  const data = state.data as { points?: UsagePoint[]; rangeId?: string } | undefined;
  const points = data?.points ?? [];
  if (points.length === 0) return '';

  const currency = points[0]!.currency || 'CNY';
  const rangeId = data?.rangeId ?? 'last7';
  const rows: string[] = [];
  if (rangeId === 'last7') {
    const today = usageDate(new Date().toISOString());
    const todayPoints = points.filter((point) => usageDate(point.date) === today);
    if (todayPoints.length > 0) rows.push(usageRow(t('dashboard.range.today'), summarize(todayPoints), currency));
    rows.push(usageRow(t('dashboard.range.last7'), summarize(points), currency));
  } else {
    rows.push(usageRow(rangeLabel(rangeId as Parameters<typeof rangeLabel>[0], t), summarize(points), currency));
  }
  return rows.join('');
}

function providerRows(snapshot: ProviderSnapshot | undefined, t: Translator): string {
  if (snapshot === undefined) {
    return `<tr><td colspan="4" class="t-muted">${escapeHtml(t('state.unconfigured'))}</td></tr>`;
  }

  const plan = snapshot.capabilities['minimax.plan'];
  if (plan !== undefined && plan.kind === 'ok') {
    const data = plan.data as { windows?: WindowView[]; models?: MiniMaxModelRow[] } | undefined;
    const rows = (data?.windows ?? [])
      .filter((window) => window.remainingPercent !== null)
      .map(
        (window) =>
          `<tr><td>${escapeHtml(window.window === 'weekly' ? 'Weekly' : '5-hour')}</td>` +
          `<td>${bar(window.remainingPercent ?? 0)} ${Math.round(window.remainingPercent ?? 0)}%</td>` +
          `<td class="t-muted">${window.resetAt === null ? '' : new Date(window.resetAt).toISOString().slice(11, 16)}</td>` +
          '<td></td></tr>',
      );
    for (const model of data?.models ?? []) {
      if (model.model === 'general' || model.total === null || model.total <= 0 || model.remaining === null) continue;
      const percent = Math.round((model.remaining / model.total) * 100);
      rows.push(`<tr><td>${escapeHtml(model.model)}</td><td>${bar(percent)} ${percent}%</td><td class="t-muted">${model.remaining}/${model.total}</td><td></td></tr>`);
    }
    const pointsState = snapshot.capabilities['minimax.points'];
    if (pointsState?.kind === 'ok') {
      const pointData = pointsState.data as { balance?: number | null } | undefined;
      if (typeof pointData?.balance === 'number') {
        rows.push(`<tr><td>${escapeHtml(t('capability.minimax.points'))}</td><td>${pointData.balance.toLocaleString('en-US')}</td><td></td><td></td></tr>`);
      }
    }
    const subscriptionState = snapshot.capabilities['minimax.subscription'];
    if (subscriptionState?.kind === 'ok') {
      const subscription = subscriptionState.data as { expiresAt?: number | null } | undefined;
      if (typeof subscription?.expiresAt === 'number') {
        rows.push(`<tr><td>Expires</td><td>${new Date(subscription.expiresAt).toISOString().slice(0, 10)}</td><td></td><td></td></tr>`);
      }
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
          '<td class="t-muted">balance</td><td></td></tr>',
      )
      .join('');
    return rows + usageRows(snapshot, t);
  }

  const usage = usageRows(snapshot, t);
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
): string {
  const cards = order
    .map((id) => {
      const snapshot = snapshots[id];
      const sourceBadge = snapshot === undefined ? '—' : t('source.account');
      const sessionBadge = t(SESSION_BADGE[id]);
      return (
        '<table class="t-card">' +
        `<tr><td class="t-title">${escapeHtml(PROVIDER_NAME[id])}</td>` +
        `<td class="t-muted">${escapeHtml(REGION[id])}</td>` +
        `<td class="t-badge">${escapeHtml(sourceBadge)}</td>` +
        `<td class="t-badge">${escapeHtml(sessionBadge)}</td></tr>` +
        `<tr><td colspan="4">${providerRows(snapshot, t)}</td></tr>` +
        '</table>'
      );
    })
    .join('');

  const footer =
    lastRefreshIso === undefined
      ? ''
      : `${escapeHtml(t('tooltip.updated'))} ${escapeHtml(shanghaiTime(lastRefreshIso))}`;

  return (
    '<div class="t-root">' +
    '<div class="t-header"><span class="t-brand">QuotaDeck CN</span>' +
    `<span class="t-badge">${escapeHtml(t('statusBar.tooltip.badge'))}</span>` +
    `<span class="t-muted">${escapeHtml(t('statusBar.tooltip.header'))}</span></div>` +
    cards +
    `<div class="t-footer"><span class="t-muted">${footer}</span>` +
    `<span class="t-muted">${escapeHtml(t('statusBar.tooltip.footer'))}</span></div>` +
    '</div>'
  );
}
