import type { Translator } from '../../localization';
import type { CapabilityState, ProviderId, ProviderSnapshot } from '../../core/types';
import { SHANGHAI, type RangeId } from '../../core/time';
import { capabilityValue } from '../../core/capability';
import type { PricingState } from '../../providers/deepseek/pricing';
import type { DeepSeekBalance } from '../../providers/deepseek/shape';
import type {
  MiniMaxAccountBalance,
  MiniMaxPlan,
  MiniMaxSubscription,
  MiniMaxTokenUsage,
} from '../../providers/minimax/shape';
import type {
  QwenAccountBalance,
  QwenTokenPlan,
  QwenTokenPlanSubscription,
} from '../../providers/qwen/shape';
import {
  formatExpiryRemaining,
  formatMoney,
  providerDisplayName,
  selectPrimaryCurrency,
} from '../display';
import { pricingPeriodLabel, rangeLabel } from '../labels';
import { quotaTone } from '../quotaTone';

export type ProviderHealth = 'ok' | 'partial' | 'failed' | 'stale' | 'not-configured' | 'unsupported';

export interface StatTile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone: 'neutral' | 'positive' | 'warning' | 'critical';
  readonly scope: string;
}

export interface HeroFigure {
  readonly label: string;
  readonly value: string;
  readonly sourceLabel: string | null;
}

export interface QuotaMeter {
  readonly key: string;
  readonly label: string;
  readonly percent: number | null;
  readonly valueLabel: string | null;
  readonly resetLabel: string | null;
  readonly tone: 'positive' | 'warning' | 'critical' | 'muted';
  /** An unlimited window has no percentage and renders without a track. */
  readonly unlimited?: boolean;
  /** Optional section heading; consecutive meters with the same group share one. */
  readonly group?: string;
}

export interface ProviderAccent {
  readonly light: string;
  readonly dark: string;
}

export type CapabilityHealth = CapabilityState['kind'];

export interface ProviderAccountValue {
  readonly key: 'balance';
  readonly label: string;
  readonly value: string;
}

export interface ProviderDetail {
  readonly label: string;
  readonly value: string;
  /** Optional section heading; consecutive details with the same group share one. */
  readonly group?: string;
}

export interface DashboardProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly state: ProviderHealth;
  readonly stateLabel: string;
  readonly accent: ProviderAccent;
  readonly meters: QuotaMeter[];
  readonly accountValue: ProviderAccountValue | null;
  readonly details: ProviderDetail[];
  readonly hoursLabel: string | null;
  readonly note: string | null;
  readonly message: string | null;
  readonly fetchedAt: string | null;
}

export interface RangeOption {
  readonly id: RangeId;
  readonly label: string;
}

export interface DashboardLabels {
  readonly configureProviders: string;
  readonly refreshNow: string;
  readonly historyRange: string;
  readonly historyUsage: string;
  readonly liveQuotaNote: string;
}

export interface DashboardModel {
  readonly hero: HeroFigure | null;
  readonly historyTiles: StatTile[];
  readonly hasHistoryData: boolean;
  readonly providers: DashboardProvider[];
  readonly range: RangeId;
  readonly rangeLabel: string;
  readonly ranges: RangeOption[];
  readonly labels: DashboardLabels;
}

export interface DashboardOptions {
  readonly snapshots: Partial<Record<ProviderId, ProviderSnapshot>>;
  readonly order: ProviderId[];
  readonly t: Translator;
  readonly range: RangeId;
  readonly pricing: PricingState;
  readonly timeZone?: string;
  readonly warningThresholdPercent?: number;
  readonly now?: number;
}

export interface HistoryTileGroup {
  readonly scope: string;
  readonly tiles: StatTile[];
}

export function groupHistoryTiles(tiles: readonly StatTile[]): HistoryTileGroup[] {
  const groups = new Map<string, StatTile[]>();
  for (const tile of tiles) {
    const entries = groups.get(tile.scope) ?? [];
    entries.push(tile);
    groups.set(tile.scope, entries);
  }
  return [...groups.entries()].map(([scope, entries]) => ({ scope, tiles: entries }));
}

const ACCENT: Record<ProviderId, ProviderAccent> = {
  'minimax-cn': { light: '#1baf7a', dark: '#199e70' },
  'minimax-global': { light: '#1baf7a', dark: '#199e70' },
  deepseek: { light: '#2a78d6', dark: '#3987e5' },
  qwen: { light: '#eb6834', dark: '#d95926' },
};

type WindowView = MiniMaxPlan['windows'][number];

function windows(snapshot: ProviderSnapshot | undefined): WindowView[] {
  return capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan')?.windows ?? [];
}

function mediaMeters(
  snapshot: ProviderSnapshot | undefined,
  warningThresholdPercent: number,
  timeZone: string,
  now: number,
  t: Translator,
): QuotaMeter[] {
  return (capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan')?.models ?? []).flatMap((model) => {
    if (model.model === 'general' || model.model.includes('MiniMax-M')) return [];
    const meters: QuotaMeter[] = [];
    const modelName =
      model.model === 'video' ? t('tooltip.model.video') : model.model;
    if (model.total !== null && model.total > 0 && model.remaining !== null) {
      const percent = Math.max(
        0,
        Math.min(100, model.remainingPercent ?? (model.remaining / model.total) * 100),
      );
      meters.push({
        key: `model:${model.model}:current`,
        label: `${modelName} · ${t('dashboard.minimax.currentWindow')}`,
        percent,
        valueLabel: `${model.remaining}/${model.total} · ${Math.round(percent)}%`,
        resetLabel:
          model.resetAt == null
            ? null
            : resetLabel(model.resetAt, timeZone, now, t),
        tone: quotaTone(percent, warningThresholdPercent),
      });
    }
    if (
      model.weeklyTotal !== null &&
      model.weeklyTotal > 0 &&
      model.weeklyRemaining !== null
    ) {
      const percent = Math.max(
        0,
        Math.min(
          100,
          model.weeklyRemainingPercent ??
            (model.weeklyRemaining / model.weeklyTotal) * 100,
        ),
      );
      meters.push({
        key: `model:${model.model}:weekly`,
        label: `${modelName} · ${t('tooltip.window.weekly')}`,
        percent,
        valueLabel:
          `${model.weeklyRemaining}/${model.weeklyTotal} · ${Math.round(percent)}%`,
        resetLabel:
          model.weeklyResetAt == null
            ? null
            : resetLabel(model.weeklyResetAt, timeZone, now, t),
        tone: quotaTone(percent, warningThresholdPercent),
      });
    }
    return meters;
  });
}

function qwenTokenPlanMeters(
  snapshot: ProviderSnapshot | undefined,
  warningThresholdPercent: number,
  timeZone: string,
  now: number,
  t: Translator,
): QuotaMeter[] {
  const plan = capabilityValue<QwenTokenPlan>(snapshot, 'qwen.tokenPlan');
  return (plan?.windows ?? []).map((window) => {
    const percent = Math.max(0, Math.min(100, (1 - window.usedRatio) * 100));
    return {
      key: `qwen-token-plan:${window.cycle}`,
      label:
        window.cycle === 'weekly'
          ? t('tooltip.window.weekly')
          : t('tooltip.window.monthly'),
      group: t('dashboard.qwen.tokenPlanSection'),
      percent,
      valueLabel: `${Math.round(percent)}%`,
      resetLabel:
        window.resetAt === null ? null : resetLabel(window.resetAt, timeZone, now, t),
      tone: quotaTone(percent, warningThresholdPercent),
    };
  });
}

function balanceRows(snapshot: ProviderSnapshot | undefined): DeepSeekBalance['entries'] {
  return capabilityValue<DeepSeekBalance>(snapshot, 'deepseek.balance')?.entries ?? [];
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

function providerBalance(snapshot: ProviderSnapshot | undefined): string | null {
  const qwen = capabilityValue<QwenAccountBalance>(snapshot, 'qwen.accountBalance');
  if (qwen !== undefined) {
    return formatMoney(qwen.availableAmount, qwen.currency);
  }
  const balances = balanceRows(snapshot);
  if (balances.length === 0) return null;
  const currency = selectPrimaryCurrency(balances.map((entry) => entry.currency));
  const primary = currency === undefined
    ? balances[0]
    : balances.find((entry) => entry.currency === currency);
  return primary === undefined ? null : formatMoney(primary.total, primary.currency);
}

function providerAccountValue(
  id: ProviderId,
  snapshot: ProviderSnapshot | undefined,
  t: Translator,
): ProviderAccountValue | null {
  if (id === 'minimax-cn' || id === 'minimax-global') return null;
  const balance = providerBalance(snapshot);
  return balance === null
    ? null
    : {
        key: 'balance',
        label: t('dashboard.accountBalance'),
        value: balance,
      };
}

function zonedDateTime(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function durationLabel(milliseconds: number, t: Translator): string {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${t('dashboard.duration.day')}`);
  if (hours > 0) parts.push(`${hours}${t('dashboard.duration.hour')}`);
  if (minutes > 0) parts.push(`${minutes}${t('dashboard.duration.minute')}`);
  if (parts.length === 0) parts.push(`0${t('dashboard.duration.minute')}`);
  return parts.join('').trim();
}

function resetLabel(
  resetAt: number,
  timeZone: string,
  now: number,
  t: Translator,
): string {
  return (
    `${t('tooltip.resetAt')} ${zonedDateTime(resetAt, timeZone)}` +
    ` · ${t('dashboard.resetRemaining')} ${durationLabel(resetAt - now, t)}`
  );
}

function providerDetails(
  id: ProviderId,
  snapshot: ProviderSnapshot | undefined,
  t: Translator,
  timeZone: string,
  now: number,
): ProviderDetail[] {
  const details: ProviderDetail[] = [];
  if (id === 'minimax-cn' || id === 'minimax-global') {
    const subscription = capabilityValue<MiniMaxSubscription>(snapshot, 'minimax.subscription');
    if (subscription?.planName) {
      details.push({
        label: t('dashboard.minimax.planName'),
        value: subscription.planName,
      });
    }
    if (typeof subscription?.expiresAt === 'number') {
      details.push({
        label: t('tooltip.expires'),
        value:
          `${zonedDateTime(subscription.expiresAt, timeZone)} · ` +
          formatExpiryRemaining(subscription.expiresAt, now, t),
      });
    }
    if (typeof subscription?.voiceSlotTotal === 'number' && typeof subscription.voiceSlotUsed === 'number') {
      details.push({
        label: t('dashboard.minimax.voiceSlots'),
        value: `${subscription.voiceSlotUsed}/${subscription.voiceSlotTotal}`,
      });
    }
    if (typeof subscription?.renewalPrice === 'number') {
      details.push({
        label: t('dashboard.minimax.renewalPrice'),
        value: formatMoney(
          subscription.renewalPrice,
          id === 'minimax-cn' ? 'CNY' : 'USD',
        ),
      });
    }
    const plan = capabilityValue<MiniMaxPlan>(snapshot, 'minimax.plan');
    if (
      plan?.weeklyBoostPermille !== null &&
      plan?.weeklyBoostPermille !== undefined &&
      plan.weeklyBoostPermille !== 1000
    ) {
      details.push({
        label: t('dashboard.minimax.weeklyBoost'),
        value: `${(plan.weeklyBoostPermille / 1000).toLocaleString('en-US', {
          maximumFractionDigits: 3,
        })}×`,
      });
    }
    const balance = capabilityValue<MiniMaxAccountBalance>(
      snapshot,
      'minimax.accountBalance',
    );
    if (balance !== undefined) {
      const group = t('dashboard.accountBalance');
      details.push(
        {
          label: t('dashboard.minimax.availableBalance'),
          value: formatMoney(balance.availableAmount, balance.currency),
          group,
        },
        {
          label: t('dashboard.minimax.cashBalance'),
          value: formatMoney(balance.cashBalance, balance.currency),
          group,
        },
        {
          label: t('dashboard.minimax.voucherBalance'),
          value: formatMoney(balance.voucherBalance, balance.currency),
          group,
        },
        {
          label: t('dashboard.minimax.creditBalance'),
          value: formatMoney(balance.creditBalance, balance.currency),
          group,
        },
        {
          label: t('dashboard.minimax.owedAmount'),
          value: formatMoney(balance.owedAmount, balance.currency),
          group,
        },
      );
    }
  }
  if (id === 'qwen') {
    const balance = capabilityValue<QwenAccountBalance>(snapshot, 'qwen.accountBalance');
    if (balance !== undefined) {
      const group = t('dashboard.accountBalanceDetails');
      details.push(
        {
          label: t('dashboard.qwen.availableCash'),
          value: formatMoney(balance.availableCashAmount, balance.currency),
          group,
        },
        {
          label: t('dashboard.qwen.credit'),
          value: formatMoney(balance.creditAmount, balance.currency),
          group,
        },
      );
      if (typeof balance.availableCreditAmount === 'number') {
        details.push({
          label: t('dashboard.qwen.availableCredit'),
          value: formatMoney(balance.availableCreditAmount, balance.currency),
          group,
        });
      }
      if (balance.quotaLimit !== null) {
        details.push({
          label: t('dashboard.qwen.quotaLimit'),
          value: formatMoney(balance.quotaLimit, balance.currency),
          group,
        });
      }
      if (typeof balance.quotaConsumedAmount === 'number') {
        details.push({
          label: t('dashboard.qwen.quotaConsumed'),
          value: formatMoney(balance.quotaConsumedAmount, balance.currency),
          group,
        });
      }
      if (typeof balance.unclearedAmount === 'number') {
        details.push({
          label: t('dashboard.qwen.uncleared'),
          value: formatMoney(balance.unclearedAmount, balance.currency),
          group,
        });
      }
      if (typeof balance.unpaidAmount === 'number') {
        details.push({
          label: t('dashboard.qwen.unpaid'),
          value: formatMoney(balance.unpaidAmount, balance.currency),
          group,
        });
      }
      if (typeof balance.fundAccountStatus === 'string') {
        details.push({
          label: t('dashboard.qwen.accountStatus'),
          value:
            balance.fundAccountStatus === 'VALID'
              ? t('dashboard.qwen.statusValid')
              : balance.fundAccountStatus,
          group,
        });
      }
    }
    const tokenPlan = capabilityValue<QwenTokenPlanSubscription>(
      snapshot,
      'qwen.tokenPlanSubscription',
    );
    const planGroup = t('dashboard.qwen.tokenPlanSection');
    if (tokenPlan?.status === 'active') {
      if (tokenPlan.specCode !== null) {
        details.push({
          label: t('dashboard.qwen.planTier'),
          value: tokenPlan.specCode,
          group: planGroup,
        });
      }
      if (tokenPlan.expiresAt !== null) {
        details.push({
          label: t('tooltip.expires'),
          value: zonedDateTime(tokenPlan.expiresAt, timeZone),
          group: planGroup,
        });
      }
      if (tokenPlan.remainingDays !== null) {
        details.push({
          label: t('dashboard.qwen.remainingDays'),
          value: String(tokenPlan.remainingDays),
          group: planGroup,
        });
      }
      if (typeof tokenPlan.startedAt === 'number') {
        details.push({
          label: t('dashboard.qwen.startedAt'),
          value: zonedDateTime(tokenPlan.startedAt, timeZone),
          group: planGroup,
        });
      }
      if (typeof tokenPlan.autoRenew === 'boolean') {
        details.push({
          label: t('dashboard.qwen.autoRenew'),
          value: t(tokenPlan.autoRenew ? 'dashboard.yes' : 'dashboard.no'),
          group: planGroup,
        });
      }
    } else if (tokenPlan?.status === 'none') {
      details.push({
        label: t('dashboard.qwen.planTier'),
        value: t('dashboard.qwen.notSubscribed'),
        group: planGroup,
      });
    }
  }
  if (id === 'deepseek') {
    const balance = capabilityValue<DeepSeekBalance>(snapshot, 'deepseek.balance');
    if (balance !== undefined) {
      if (typeof balance.available === 'boolean') {
        details.push({
          label: t('dashboard.deepseek.accountStatus'),
          value: t(
            balance.available
              ? 'dashboard.deepseek.available'
              : 'dashboard.deepseek.unavailable',
          ),
        });
      }
      const multiCurrency = balance.entries.length > 1;
      for (const entry of balance.entries) {
        const prefix = multiCurrency ? `${entry.currency} · ` : '';
        if (multiCurrency) {
          details.push({
            label: `${prefix}${t('dashboard.deepseek.balance')}`,
            value: formatMoney(entry.total, entry.currency),
          });
        }
        if (Number.isFinite(entry.granted)) {
          details.push({
            label: `${prefix}${t('dashboard.deepseek.grantedBalance')}`,
            value: formatMoney(entry.granted, entry.currency),
          });
        }
        if (Number.isFinite(entry.toppedUp)) {
          details.push({
            label: `${prefix}${t('dashboard.deepseek.toppedUpBalance')}`,
            value: formatMoney(entry.toppedUp, entry.currency),
          });
        }
      }
    }
  }
  const liveFetchedAt = snapshot === undefined
    ? null
    : Object.values(snapshot.capabilities)
      .flatMap((state) =>
        state.kind === 'ok' || state.kind === 'stale'
          ? [Date.parse(state.fetchedAt)]
          : [],
      )
      .filter((timestamp) => !Number.isNaN(timestamp))
      .reduce<number | null>(
        (latest, timestamp) => latest === null || timestamp > latest ? timestamp : latest,
        null,
      );
  if (liveFetchedAt !== null) {
    details.push({
      label: t('dashboard.updatedAt'),
      value: zonedDateTime(liveFetchedAt, timeZone),
    });
  }
  return details;
}

export function buildDashboardModel(options: DashboardOptions): DashboardModel {
  const { snapshots, order, t, range, pricing } = options;
  const timeZone = options.timeZone ?? SHANGHAI;
  const warningThresholdPercent = options.warningThresholdPercent ?? 20;
  const now = options.now ?? Date.now();
  const providers: DashboardProvider[] = order.flatMap((id) => {
    const snapshot = snapshots[id];
    const state = health(snapshot);
    if (state === 'not-configured') return [];
    const meters: QuotaMeter[] = windows(snapshot).map((window): QuotaMeter => {
      const percent = window.unlimited ? null : window.remainingPercent;
      const meterTone: QuotaMeter['tone'] = window.unlimited
        ? 'positive'
        : percent === null
          ? 'muted'
          : quotaTone(percent, warningThresholdPercent);
      return {
        key: String(window.window),
        label: window.window === 'weekly'
          ? t('tooltip.window.weekly')
          : t('tooltip.window.fiveHour'),
        percent,
        valueLabel: window.unlimited
          ? t('tooltip.unlimited')
          : percent === null
            ? null
            : `${Math.round(percent)}%`,
        resetLabel:
          window.resetAt === null
            ? null
            : resetLabel(window.resetAt, timeZone, now, t),
        tone: meterTone,
        unlimited: window.unlimited,
      };
    })
      .concat(mediaMeters(snapshot, warningThresholdPercent, timeZone, now, t))
      .concat(qwenTokenPlanMeters(snapshot, warningThresholdPercent, timeZone, now, t));
    const failed = snapshot === undefined
      ? undefined
      : Object.values(snapshot.capabilities).find((entry) => entry.kind === 'failed');
    const stale = snapshot === undefined
      ? undefined
      : Object.values(snapshot.capabilities).find((entry) => entry.kind === 'stale');
    return [{
      id,
      name: providerDisplayName(id),
      state,
      stateLabel: healthLabel(state, t),
      accent: ACCENT[id],
      meters,
      accountValue: providerAccountValue(id, snapshot, t),
      details: providerDetails(id, snapshot, t, timeZone, now),
      hoursLabel: id === 'deepseek' ? pricingPeriodLabel(pricing, t) : null,
      note: snapshot === undefined
        ? null
        : id === 'minimax-cn' || id === 'minimax-global'
          ? t('dashboard.minimax.creditsConsoleOnly')
          : id === 'deepseek'
            ? t('dashboard.deepseek.officialBilling')
            : id === 'qwen'
              ? t('dashboard.qwen.unsupportedDetail')
              : null,
      message: failed !== undefined && failed.kind === 'failed'
        ? t(failed.error.message)
        : stale !== undefined && stale.kind === 'stale'
          ? t('state.stale')
          : null,
      fetchedAt: snapshot?.fetchedAt ?? null,
    }];
  });

  const liveQuotas = providers.flatMap((provider) =>
    provider.meters
      .filter((meter) => !meter.key.startsWith('model:') && meter.percent !== null)
      .map((meter) => ({
        percent: meter.percent as number,
        providerName: provider.name,
        meterLabel: meter.label,
      })),
  );
  const lowestQuota = liveQuotas.reduce<(typeof liveQuotas)[number] | null>(
    (lowest, candidate) => lowest === null || candidate.percent < lowest.percent ? candidate : lowest,
    null,
  );

  const historyTiles: StatTile[] = [];
  for (const id of order) {
    if (id !== 'minimax-cn' && id !== 'minimax-global') continue;
    const usage = capabilityValue<MiniMaxTokenUsage>(snapshots[id], 'minimax.tokenUsage');
    if (usage === undefined || !usage.hasUsageRecords) continue;
    historyTiles.push({
      key: 'minimaxTokens',
      label: t('capability.minimax.tokenUsage'),
      value: usage.tokens.toLocaleString('en-US'),
      tone: 'neutral',
      scope: providerDisplayName(id),
    });
    if (usage.currency !== null && typeof usage.cash === 'number') {
      historyTiles.push({
        key: 'minimaxCost',
        label: t('dashboard.minimax.cost'),
        value: formatMoney(usage.cash, usage.currency),
        tone: 'neutral',
        scope: providerDisplayName(id),
      });
    }
  }
  return {
    hero: lowestQuota === null
      ? null
      : {
          label: t('dashboard.lowestRemaining'),
          value: `${Math.round(lowestQuota.percent)}%`,
          sourceLabel: `${lowestQuota.providerName} · ${lowestQuota.meterLabel}`,
        },
    historyTiles,
    hasHistoryData: historyTiles.length > 0,
    providers,
    range,
    rangeLabel: rangeLabel(range, t),
    ranges: (['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth'] as RangeId[]).map((id) => ({
      id,
      label: rangeLabel(id, t),
    })),
    labels: {
      configureProviders: t('dashboard.configureProviders'),
      refreshNow: t('dashboard.refreshNow'),
      historyRange: t('dashboard.historyRange'),
      historyUsage: t('dashboard.historyUsage'),
      liveQuotaNote: t('dashboard.liveQuotaNote'),
    },
  };
}
