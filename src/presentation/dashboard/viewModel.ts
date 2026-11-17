import type { Translator } from '../../localization';
import type { CapabilityState, ProviderId, ProviderSnapshot } from '../../core/types';
import type { RangeId } from '../../core/time';
import { capabilityValue } from '../../core/capability';
import type { PricingState } from '../../providers/deepseek/pricing';
import type { AccountTotalSource } from '../../providers/deepseek/aggregate';
import type { DeepSeekBalance } from '../../providers/deepseek/shape';
import type { DeepSeekUsage, UsageCost, UsagePoint } from '../../providers/deepseek/usage';
import type { MiniMaxPlan, MiniMaxPoints, MiniMaxTokenUsage } from '../../providers/minimax/shape';
import type { Point, Series } from './charts';
import { formatMoney, providerDisplayName, selectPrimaryCurrency } from '../display';
import { capabilityLabel, rangeLabel } from '../labels';
import { quotaTone } from '../quotaTone';

export type ProviderHealth = 'ok' | 'partial' | 'failed' | 'stale' | 'not-configured' | 'unsupported';

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
  readonly tone: 'positive' | 'caution' | 'warning' | 'critical' | 'muted';
}

export interface ProviderAccent {
  readonly light: string;
  readonly dark: string;
}

export type CapabilityHealth = CapabilityState['kind'];

export interface ProviderRangeUsage {
  readonly label: string;
  readonly value: string;
}

export interface ProviderCapabilityView {
  readonly id: string;
  readonly label: string;
  readonly state: CapabilityHealth;
  readonly stateLabel: string;
  readonly tone: 'positive' | 'warning' | 'critical' | 'muted';
  readonly message: string | null;
}

export interface DashboardProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly state: ProviderHealth;
  readonly stateLabel: string;
  readonly accent: ProviderAccent;
  readonly meters: QuotaMeter[];
  readonly balance: string | null;
  readonly rangeUsage: ProviderRangeUsage | null;
  readonly capabilities: ProviderCapabilityView[];
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

export interface CurrencyTotalRow {
  readonly currency: string;
  readonly amount: number;
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
  readonly costTotals: CurrencyTotalRow[];
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
  readonly configureProviders: string;
  readonly refreshNow: string;
  readonly accountBalance: string;
  readonly historyRange: string;
  readonly liveQuotaNote: string;
  readonly cost: string;
  readonly requests: string;
  readonly tokens: string;
  readonly cache: string;
  readonly usageTable: string;
  readonly modelTable: string;
  readonly balanceTable: string;
  readonly costTable: string;
  readonly accountTotalTable: string;
  readonly accountTotalSummary: string;
  readonly accountTotalAggregated: string;
  readonly accountTotalUnavailable: string;
  readonly qwenTitle: string;
  readonly qwenUnsupported: string;
  readonly qwenUnavailableReason: string;
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
  readonly accountTotals: CurrencyTotalRow[];
  readonly accountTotalSource: AccountTotalSource;
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
  readonly warningThresholdPercent?: number;
}

const ACCENT: Record<ProviderId, ProviderAccent> = {
  'minimax-cn': { light: '#1baf7a', dark: '#199e70' },
  'minimax-global': { light: '#1baf7a', dark: '#199e70' },
  deepseek: { light: '#2a78d6', dark: '#3987e5' },
  qwen: { light: '#eb6834', dark: '#d95926' },
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

type WindowView = MiniMaxPlan['windows'][number];

function windows(snapshot: ProviderSnapshot | undefined): WindowView[] {
  return capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan')?.windows ?? [];
}

function mediaMeters(snapshot: ProviderSnapshot | undefined, warningThresholdPercent: number): QuotaMeter[] {
  return (capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan')?.models ?? []).flatMap((model) => {
    if (model.total === null || model.total <= 0 || model.remaining === null) return [];
    if (model.model === 'general' || model.model.includes('MiniMax-M')) return [];
    const percent = Math.max(0, Math.min(100, (model.remaining / model.total) * 100));
    return [{
      key: `model:${model.model}`,
      label: model.model,
      percent,
      resetLabel: null,
      tone: quotaTone(percent, warningThresholdPercent),
    }];
  });
}

function pointsBalance(snapshots: Partial<Record<ProviderId, ProviderSnapshot>>): number | null {
  for (const id of ['minimax-cn', 'minimax-global'] as const) {
    const balance = capabilityValue<MiniMaxPoints>(snapshots[id], 'minimax.points')?.balance;
    if (typeof balance === 'number') return balance;
  }
  return null;
}

function tokenUsage(snapshots: Partial<Record<ProviderId, ProviderSnapshot>>): number | null {
  for (const id of ['minimax-cn', 'minimax-global'] as const) {
    const tokens = capabilityValue<MiniMaxTokenUsage>(snapshots[id], 'minimax.tokenUsage')?.tokens;
    if (typeof tokens === 'number') return tokens;
  }
  return null;
}

function usageData(snapshot: ProviderSnapshot | undefined): {
  points: UsagePoint[];
  costs: UsageCost[];
  byModel: ModelUsageRow[];
} {
  const usage = capabilityValue<DeepSeekUsage>(snapshot, 'deepseek.usageAmount');
  if (usage === undefined) return { points: [], costs: [], byModel: [] };
  const byModel: ModelUsageRow[] = [];
  for (const model of usage.byModel) {
    const modelCosts = usage.modelCosts.filter((entry) => entry.model === model.model);
    if (modelCosts.length === 0) {
      byModel.push({ model: model.model, requests: model.requests, totalTokens: model.totalTokens, cost: 0, currency: '' });
      continue;
    }
    for (const entry of modelCosts) {
      byModel.push({
        model: model.model,
        requests: model.requests,
        totalTokens: model.totalTokens,
        cost: entry.cost,
        currency: entry.currency,
      });
    }
  }
  return { points: usage.points, costs: usage.costs, byModel };
}

function balanceRows(snapshot: ProviderSnapshot | undefined): BalanceRow[] {
  return capabilityValue<DeepSeekBalance>(snapshot, 'deepseek.balance')?.entries ?? [];
}

function currencyTotals(costs: readonly UsageCost[]): CurrencyTotalRow[] {
  const totals = new Map<string, number>();
  for (const row of costs) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.cost);
  }
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function accountTotals(snapshot: ProviderSnapshot | undefined): {
  totals: CurrencyTotalRow[];
  source: AccountTotalSource;
} {
  const state = snapshot?.capabilities['deepseek.accountSummary'];
  if (state === undefined || (state.kind !== 'ok' && state.kind !== 'stale')) {
    return { totals: [], source: 'unavailable' };
  }
  const data = state.data as
    | { totals?: CurrencyTotalRow[]; source?: AccountTotalSource }
    | undefined;
  return {
    totals: data?.totals ?? [],
    source: data?.source ?? 'unavailable',
  };
}

function costOnDate(costs: readonly UsageCost[], date: string): number {
  return costs.find((row) => row.date === date)?.cost ?? 0;
}

function health(snapshot: ProviderSnapshot | undefined): ProviderHealth {
  if (snapshot === undefined) return 'not-configured';
  const states = Object.values(snapshot.capabilities);
  if (states.length === 0) return 'not-configured';
  if (states.every((state) => state.kind === 'unsupported')) return 'unsupported';
  if (states.every((state) => state.kind === 'unconfigured')) return 'not-configured';
  const hasLiveValue = states.some((state) => state.kind === 'ok' || state.kind === 'stale');
  if (states.some((state) => state.kind === 'failed') && !hasLiveValue) return 'failed';
  if (states.every((state) => state.kind === 'stale')) return 'stale';
  if (states.every((state) => state.kind === 'ok')) return 'ok';
  return 'partial';
}

function healthLabel(state: ProviderHealth, t: Translator): string {
  switch (state) {
    case 'ok':
      return t('state.ok');
    case 'partial':
      return t('state.partial');
    case 'failed':
      return t('state.failed');
    case 'stale':
      return t('state.stale');
    case 'unsupported':
      return t('state.unsupported');
    case 'not-configured':
      return t('state.unconfigured');
  }
}

function capabilityHealthLabel(state: CapabilityHealth, t: Translator): string {
  switch (state) {
    case 'ok':
      return t('state.ok');
    case 'stale':
      return t('state.stale');
    case 'failed':
      return t('state.failed');
    case 'unsupported':
      return t('state.unsupported');
    case 'unconfigured':
      return t('state.unconfigured');
  }
}

function capabilityTone(state: CapabilityHealth): ProviderCapabilityView['tone'] {
  if (state === 'ok') return 'positive';
  if (state === 'stale') return 'warning';
  if (state === 'failed') return 'critical';
  return 'muted';
}

function providerCapabilities(
  snapshot: ProviderSnapshot | undefined,
  t: Translator,
): ProviderCapabilityView[] {
  if (snapshot === undefined) return [];
  return Object.entries(snapshot.capabilities).map(([id, state]) => ({
    id,
    label: capabilityLabel(id, t),
    state: state.kind,
    stateLabel: capabilityHealthLabel(state.kind, t),
    tone: capabilityTone(state.kind),
    message:
      state.kind === 'failed'
        ? t(state.error.message)
        : state.kind === 'unconfigured' &&
            snapshot.providerId === 'deepseek' &&
            id !== 'deepseek.balance'
          ? state.reason === 'no allow-listed session cookie'
            ? t('dashboard.deepseek.invalidCookie')
            : t('dashboard.deepseek.missingSession')
          : null,
  }));
}

function providerBalance(snapshot: ProviderSnapshot | undefined): string | null {
  const balances = balanceRows(snapshot);
  if (balances.length === 0) return null;
  const currency = selectPrimaryCurrency(balances.map((entry) => entry.currency));
  const primary = currency === undefined
    ? balances[0]
    : balances.find((entry) => entry.currency === currency);
  return primary === undefined ? null : formatMoney(primary.total, primary.currency);
}

function providerRangeUsage(
  id: ProviderId,
  snapshot: ProviderSnapshot | undefined,
  t: Translator,
): ProviderRangeUsage | null {
  if (id !== 'minimax-cn' && id !== 'minimax-global') return null;
  const usage = capabilityValue<MiniMaxTokenUsage>(snapshot, 'minimax.tokenUsage');
  if (usage === undefined) return null;
  return {
    label: `${rangeLabel(usage.rangeId, t)} · ${t('dashboard.tokens')}`,
    value: usage.tokens.toLocaleString('en-US'),
  };
}

export function buildDashboardModel(options: DashboardOptions): DashboardModel {
  const { snapshots, order, t, range, pricing } = options;
  const warningThresholdPercent = options.warningThresholdPercent ?? 20;
  const providers: DashboardProvider[] = order.map((id) => {
    const snapshot = snapshots[id];
    const state = health(snapshot);
    const meters: QuotaMeter[] = windows(snapshot).map((window) => {
      const percent = window.remainingPercent;
      const meterTone: QuotaMeter['tone'] =
        percent === null ? 'muted' : quotaTone(percent, warningThresholdPercent);
      return {
        key: String(window.window),
        label: window.window === 'weekly' ? 'Weekly' : '5-hour',
        percent,
        resetLabel: window.resetAt === null ? null : new Date(window.resetAt).toISOString(),
        tone: meterTone,
      };
    }).concat(mediaMeters(snapshot, warningThresholdPercent));
    const failed = snapshot === undefined
      ? undefined
      : Object.values(snapshot.capabilities).find((entry) => entry.kind === 'failed');
    const stale = snapshot === undefined
      ? undefined
      : Object.values(snapshot.capabilities).find((entry) => entry.kind === 'stale');
    return {
      id,
      name: providerDisplayName(id),
      state,
      stateLabel: healthLabel(state, t),
      accent: ACCENT[id],
      meters,
      balance: id === 'deepseek' ? providerBalance(snapshot) : null,
      rangeUsage: providerRangeUsage(id, snapshot, t),
      capabilities: providerCapabilities(snapshot, t),
      message:
        failed !== undefined && failed.kind === 'failed'
          ? t(failed.error.message)
          : stale !== undefined && stale.kind === 'stale'
            ? t('state.stale')
            : null,
      fetchedAt: snapshot?.fetchedAt ?? null,
    };
  });

  const percents = providers
    .flatMap((provider) => provider.meters)
    .map((meter) => meter.percent)
    .filter((percent): percent is number => percent !== null);
  const lowest = percents.length > 0 ? Math.min(...percents) : null;
  const { points, costs, byModel } = usageData(snapshots['deepseek']);
  const costTotals = currencyTotals(costs);

  const usage: UsageModel = {
    available: points.length > 0,
    currency: costTotals[0]?.currency ?? null,
    categories: points.map((point) => point.date),
    cost: points.map((point) => ({ x: point.date, y: costOnDate(costs, point.date) })),
    requests: points.map((point) => ({ x: point.date, y: point.requests })),
    tokens: points.map((point) => ({ x: point.date, y: point.totalTokens })),
    tokenSeries: [
      { label: t('dashboard.cacheHit'), color: TOKEN_SERIES_COLORS.cacheHit.light, darkColor: TOKEN_SERIES_COLORS.cacheHit.dark, values: points.map((p) => p.cacheHitTokens) },
      { label: t('dashboard.cacheMiss'), color: TOKEN_SERIES_COLORS.cacheMiss.light, darkColor: TOKEN_SERIES_COLORS.cacheMiss.dark, values: points.map((p) => p.cacheMissTokens) },
      { label: t('dashboard.output'), color: TOKEN_SERIES_COLORS.output.light, darkColor: TOKEN_SERIES_COLORS.output.dark, values: points.map((p) => p.outputTokens) },
    ],
    byModel,
    costTotals,
  };

  const balances = balanceRows(snapshots['deepseek']);
  const account = accountTotals(snapshots['deepseek']);
  const balanceCurrency = selectPrimaryCurrency(balances.map((entry) => entry.currency));
  const primaryBalance =
    balanceCurrency === undefined
      ? balances[0]
      : balances.find((entry) => entry.currency === balanceCurrency);
  const totalTokens = points.reduce((sum, point) => sum + point.totalTokens, 0);
  const headlineCost = account.totals[0] ?? costTotals[0];

  const tiles: StatTile[] = [
    {
      key: 'balance',
      label: t('dashboard.accountBalance'),
      value: primaryBalance === undefined ? '—' : formatMoney(primaryBalance.total, primaryBalance.currency),
      tone: 'neutral',
    },
    { key: 'tokens', label: t('dashboard.tokens'), value: String(totalTokens), tone: 'neutral' },
    {
      key: 'cost',
      label: t('dashboard.cost'),
      value: headlineCost === undefined ? '—' : formatMoney(headlineCost.amount, headlineCost.currency),
      tone: 'neutral',
    },
  ];
  const pointsTileValue = pointsBalance(snapshots);
  if (pointsTileValue !== null) {
    tiles.push({
      key: 'points',
      label: t('capability.minimax.points'),
      value: pointsTileValue.toLocaleString('en-US'),
      tone: 'neutral',
    });
  }
  const tokenUsageValue = tokenUsage(snapshots);
  if (tokenUsageValue !== null) {
    tiles.push({
      key: 'minimaxTokens',
      label: t('capability.minimax.tokenUsage'),
      value: tokenUsageValue.toLocaleString('en-US'),
      tone: 'neutral',
    });
  }

  const labels: DashboardLabels = {
    configureProviders: t('dashboard.configureProviders'),
    refreshNow: t('dashboard.refreshNow'),
    accountBalance: t('dashboard.accountBalance'),
    historyRange: t('dashboard.historyRange'),
    liveQuotaNote: t('dashboard.liveQuotaNote'),
    cost: t('dashboard.chart.cost'),
    requests: t('dashboard.chart.requests'),
    tokens: t('dashboard.chart.tokens'),
    cache: t('dashboard.chart.cache'),
    usageTable: t('dashboard.table.usage'),
    modelTable: t('dashboard.table.models'),
    balanceTable: t('dashboard.table.balances'),
    costTable: t('dashboard.table.costs'),
    accountTotalTable: t('dashboard.table.accountTotals'),
    accountTotalSummary: t('dashboard.accountTotal.summary'),
    accountTotalAggregated: t('dashboard.accountTotal.aggregated'),
    accountTotalUnavailable: t('dashboard.accountTotal.unavailable'),
    qwenTitle: t('dashboard.qwenTitle'),
    qwenUnsupported: t('dashboard.qwenUnsupported'),
    qwenUnavailableReason: t('dashboard.qwenUnavailableReason'),
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
    accountTotals: account.totals,
    accountTotalSource: account.source,
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
