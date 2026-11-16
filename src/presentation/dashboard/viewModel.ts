import type { Translator } from '../../localization';
import type { ProviderId, ProviderSnapshot } from '../../core/types';
import type { RangeId } from '../../core/time';
import type { PricingState } from '../../providers/deepseek/pricing';
import type { Point, Series } from './charts';
import { capabilityLabel, rangeLabel } from '../labels';

export type ProviderHealth = 'ok' | 'partial' | 'failed' | 'not-configured' | 'unsupported';

export interface StatTile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone: 'neutral' | 'positive' | 'warning' | 'critical';
}

export interface HeroFigure {
  readonly label: string;
  readonly value: string;
}

export interface QuotaMeter {
  readonly key: string;
  readonly label: string;
  readonly percent: number | null;
  readonly resetLabel: string | null;
  readonly tone: 'positive' | 'warning' | 'critical' | 'muted';
}

export interface ProviderAccent {
  readonly light: string;
  readonly dark: string;
}

export interface DashboardProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly state: ProviderHealth;
  readonly accent: ProviderAccent;
  readonly meters: QuotaMeter[];
  readonly message: string | null;
  readonly fetchedAt: string | null;
}

export interface ModelUsageRow {
  readonly model: string;
  readonly requests: number;
  readonly totalTokens: number;
  readonly cost: number;
  readonly currency: string;
}

export interface BalanceRow {
  readonly currency: string;
  readonly total: number;
}

export interface UsageModel {
  readonly available: boolean;
  readonly currency: string | null;
  readonly categories: string[];
  readonly cost: Point[];
  readonly requests: Point[];
  readonly tokens: Point[];
  readonly tokenSeries: Series[];
  readonly byModel: ModelUsageRow[];
}

export interface QwenMatrixRow {
  readonly capability: string;
  readonly label: string;
  readonly state: 'unsupported';
}

export interface RangeOption {
  readonly id: RangeId;
  readonly label: string;
}

export interface DashboardLabels {
  readonly cost: string;
  readonly requests: string;
  readonly tokens: string;
  readonly cache: string;
  readonly usageTable: string;
  readonly modelTable: string;
  readonly balanceTable: string;
  readonly qwenTitle: string;
  readonly qwenUnsupported: string;
  readonly columnDate: string;
  readonly columnModel: string;
  readonly columnRequests: string;
  readonly columnTokens: string;
  readonly columnCost: string;
  readonly columnCurrency: string;
  readonly columnTotal: string;
}

export interface DashboardModel {
  readonly hero: HeroFigure;
  readonly tiles: StatTile[];
  readonly providers: DashboardProvider[];
  readonly usage: UsageModel;
  readonly qwen: QwenMatrixRow[];
  readonly balances: BalanceRow[];
  readonly range: RangeId;
  readonly rangeLabel: string;
  readonly ranges: RangeOption[];
  readonly pricingLabel: string;
  readonly labels: DashboardLabels;
}

export interface DashboardOptions {
  readonly snapshots: Partial<Record<ProviderId, ProviderSnapshot>>;
  readonly order: ProviderId[];
  readonly t: Translator;
  readonly range: RangeId;
  readonly pricing: PricingState;
}

const ACCENT: Record<ProviderId, ProviderAccent> = {
  'minimax-cn': { light: '#1baf7a', dark: '#199e70' },
  'minimax-global': { light: '#1baf7a', dark: '#199e70' },
  deepseek: { light: '#2a78d6', dark: '#3987e5' },
  qwen: { light: '#eb6834', dark: '#d95926' },
};

const NAME: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

const TOKEN_SERIES_COLORS = {
  cacheHit: { light: '#2a78d6', dark: '#3987e5' },
  cacheMiss: { light: '#eb6834', dark: '#d95926' },
  output: { light: '#1baf7a', dark: '#199e70' },
} as const;

const QWEN_CAPABILITIES = [
  'qwen.accountBalance',
  'qwen.modelQuota',
  'qwen.consumption',
  'qwen.accessKeyValidation',
] as const;

const BALANCE_PRIORITY = ['CNY', 'USD', 'EUR'];

interface WindowView {
  readonly window: string;
  readonly remainingPercent: number | null;
  readonly resetAt: number | null;
  readonly unlimited: boolean;
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

function tone(percent: number): 'positive' | 'warning' | 'critical' {
  if (percent <= 10) return 'critical';
  if (percent <= 30) return 'warning';
  return 'positive';
}

function formatMoney(amount: number, currency: string): string {
  return currency === 'CNY' ? `¥${amount.toFixed(2)}` : `${currency} ${amount.toFixed(2)}`;
}

function windows(snapshot: ProviderSnapshot | undefined): WindowView[] {
  const state = snapshot?.capabilities['minimax.plan'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { windows?: WindowView[] } | undefined;
  return data?.windows ?? [];
}

function usageData(snapshot: ProviderSnapshot | undefined): {
  points: UsagePoint[];
  byModel: ModelUsageRow[];
} {
  const state = snapshot?.capabilities['deepseek.usageAmount'];
  if (state === undefined || state.kind !== 'ok') return { points: [], byModel: [] };
  const data = state.data as { points?: UsagePoint[]; byModel?: ModelUsageRow[] } | undefined;
  return { points: data?.points ?? [], byModel: data?.byModel ?? [] };
}

function balanceRows(snapshot: ProviderSnapshot | undefined): BalanceRow[] {
  const state = snapshot?.capabilities['deepseek.balance'];
  if (state === undefined || state.kind !== 'ok') return [];
  const data = state.data as { entries?: BalanceRow[] } | undefined;
  return data?.entries ?? [];
}

function health(snapshot: ProviderSnapshot | undefined): ProviderHealth {
  if (snapshot === undefined) return 'not-configured';
  const states = Object.values(snapshot.capabilities);
  if (states.length === 0) return 'not-configured';
  if (states.every((state) => state.kind === 'unsupported')) return 'unsupported';
  if (states.every((state) => state.kind === 'unconfigured')) return 'not-configured';
  if (states.some((state) => state.kind === 'ok')) return 'ok';
  if (states.some((state) => state.kind === 'failed')) return 'failed';
  return 'partial';
}

export function buildDashboardModel(options: DashboardOptions): DashboardModel {
  const { snapshots, order, t, range, pricing } = options;
  const providers: DashboardProvider[] = order.map((id) => {
    const snapshot = snapshots[id];
    const state = health(snapshot);
    const meters: QuotaMeter[] = windows(snapshot).map((window) => {
      const percent = window.remainingPercent;
      return {
        key: window.window,
        label: window.window === 'weekly' ? 'Weekly' : '5-hour',
        percent,
        resetLabel: window.resetAt === null ? null : new Date(window.resetAt).toISOString(),
        tone: percent === null ? 'muted' : tone(percent),
      };
    });
    const failed = snapshot === undefined
      ? undefined
      : Object.values(snapshot.capabilities).find((entry) => entry.kind === 'failed');
    return {
      id,
      name: NAME[id],
      state,
      accent: ACCENT[id],
      meters,
      message: failed !== undefined && failed.kind === 'failed' ? t(failed.error.message) : null,
      fetchedAt: snapshot?.fetchedAt ?? null,
    };
  });

  const percents = providers
    .flatMap((provider) => provider.meters)
    .map((meter) => meter.percent)
    .filter((percent): percent is number => percent !== null);
  const lowest = percents.length > 0 ? Math.min(...percents) : null;
  const { points, byModel } = usageData(snapshots['deepseek']);
  const currency = points[0]?.currency ?? null;

  const usage: UsageModel = {
    available: points.length > 0,
    currency,
    categories: points.map((point) => point.date),
    cost: points.map((point) => ({ x: point.date, y: point.cost })),
    requests: points.map((point) => ({ x: point.date, y: point.requests })),
    tokens: points.map((point) => ({ x: point.date, y: point.totalTokens })),
    tokenSeries: [
      { label: t('dashboard.cacheHit'), color: TOKEN_SERIES_COLORS.cacheHit.light, darkColor: TOKEN_SERIES_COLORS.cacheHit.dark, values: points.map((p) => p.cacheHitTokens) },
      { label: t('dashboard.cacheMiss'), color: TOKEN_SERIES_COLORS.cacheMiss.light, darkColor: TOKEN_SERIES_COLORS.cacheMiss.dark, values: points.map((p) => p.cacheMissTokens) },
      { label: t('dashboard.output'), color: TOKEN_SERIES_COLORS.output.light, darkColor: TOKEN_SERIES_COLORS.output.dark, values: points.map((p) => p.outputTokens) },
    ],
    byModel,
  };

  const balances = balanceRows(snapshots['deepseek']);
  const primaryBalance =
    BALANCE_PRIORITY.map((code) => balances.find((entry) => entry.currency === code)).find(
      (entry) => entry !== undefined,
    ) ?? balances[0];
  const totalTokens = points.reduce((sum, point) => sum + point.totalTokens, 0);
  const totalCost = points.reduce((sum, point) => sum + point.cost, 0);

  const tiles: StatTile[] = [
    {
      key: 'balance',
      label: t('dashboard.accountBalance'),
      value: primaryBalance === undefined ? '—' : formatMoney(primaryBalance.total, primaryBalance.currency),
      tone: 'neutral',
    },
    { key: 'tokens', label: t('dashboard.tokens'), value: String(totalTokens), tone: 'neutral' },
    { key: 'cost', label: t('dashboard.cost'), value: currency === null ? '—' : formatMoney(totalCost, currency), tone: 'neutral' },
  ];

  const labels: DashboardLabels = {
    cost: t('dashboard.chart.cost'),
    requests: t('dashboard.chart.requests'),
    tokens: t('dashboard.chart.tokens'),
    cache: t('dashboard.chart.cache'),
    usageTable: t('dashboard.table.usage'),
    modelTable: t('dashboard.table.models'),
    balanceTable: t('dashboard.table.balances'),
    qwenTitle: t('dashboard.qwenTitle'),
    qwenUnsupported: t('dashboard.qwenUnsupported'),
    columnDate: t('dashboard.column.date'),
    columnModel: t('dashboard.column.model'),
    columnRequests: t('dashboard.column.requests'),
    columnTokens: t('dashboard.column.tokens'),
    columnCost: t('dashboard.column.cost'),
    columnCurrency: t('dashboard.column.currency'),
    columnTotal: t('dashboard.column.total'),
  };

  const pricingLabel =
    pricing === 'peak'
      ? t('dashboard.pricingPeak')
      : pricing === 'offPeak'
        ? t('dashboard.pricingOffPeak')
        : t('dashboard.pricingUnavailable');

  return {
    hero: { label: t('dashboard.lowestRemaining'), value: lowest === null ? '—' : `${Math.round(lowest)}%` },
    tiles,
    providers,
    usage,
    qwen: QWEN_CAPABILITIES.map((capability) => ({
      capability,
      label: capabilityLabel(capability, t),
      state: 'unsupported' as const,
    })),
    balances,
    range,
    rangeLabel: rangeLabel(range, t),
    ranges: (['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth'] as RangeId[]).map((id) => ({
      id,
      label: rangeLabel(id, t),
    })),
    pricingLabel,
    labels,
  };
}
