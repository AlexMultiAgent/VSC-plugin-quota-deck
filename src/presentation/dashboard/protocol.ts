import type { DashboardModel } from './viewModel';
import type { DashboardLocalization } from './locale';
import { PROVIDER_IDS } from '../../core/types';
import { RANGE_IDS, type RangeId } from '../../core/time';

export type HostMessage =
  | { readonly kind: 'state'; readonly model: DashboardModel; readonly range: RangeId }
  | { readonly kind: 'locale'; readonly localization: DashboardLocalization };

export type WebviewMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'configure' }
  | { readonly kind: 'refresh' }
  | { readonly kind: 'setRange'; readonly range: RangeId };

const LABEL_KEYS = [
  'configureProviders',
  'refreshNow',
  'historyRange',
  'historyUsage',
  'liveQuotaNote',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function hasAllowedKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

export function isRangeId(value: unknown): value is RangeId {
  return typeof value === 'string' && (RANGE_IDS as readonly string[]).includes(value);
}

function isStringOrNull(value: unknown): boolean {
  return typeof value === 'string' || value === null;
}

function isNumberOrNull(value: unknown): boolean {
  return typeof value === 'number' || value === null;
}

function isMeters(value: unknown): boolean {
  return Array.isArray(value) && value.every(
    (meter) =>
      isRecord(meter) &&
      hasAllowedKeys(
        meter,
        ['key', 'label', 'percent', 'valueLabel', 'resetLabel', 'tone'],
        ['group', 'unlimited'],
      ) &&
      typeof meter.key === 'string' &&
      typeof meter.label === 'string' &&
      isNumberOrNull(meter.percent) &&
      isStringOrNull(meter.valueLabel) &&
      isStringOrNull(meter.resetLabel) &&
      typeof meter.tone === 'string' &&
      (meter.group === undefined || typeof meter.group === 'string') &&
      (meter.unlimited === undefined || typeof meter.unlimited === 'boolean'),
  );
}

function isProviderAccountValue(value: unknown): boolean {
  return value === null || (
    isRecord(value) &&
    hasExactKeys(value, ['key', 'label', 'value']) &&
    value.key === 'balance' &&
    typeof value.label === 'string' &&
    typeof value.value === 'string'
  );
}

function isProviderDetails(value: unknown): boolean {
  return Array.isArray(value) && value.every(
    (detail) =>
      isRecord(detail) &&
      hasAllowedKeys(detail, ['label', 'value'], ['group']) &&
      typeof detail.label === 'string' &&
      typeof detail.value === 'string' &&
      (detail.group === undefined || typeof detail.group === 'string'),
  );
}

function isRangeOptions(value: unknown): boolean {
  return Array.isArray(value) && value.every(
    (entry) =>
      isRecord(entry) &&
      hasExactKeys(entry, ['id', 'label']) &&
      isRangeId(entry.id) &&
      typeof entry.label === 'string',
  );
}

function isLabels(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, LABEL_KEYS) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function isDashboardModel(value: unknown): value is DashboardModel {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'hero',
      'historyTiles',
      'hasHistoryData',
      'providers',
      'range',
      'rangeLabel',
      'ranges',
      'labels',
    ])
  ) {
    return false;
  }

  if (
    value.hero !== null &&
    (
      !isRecord(value.hero) ||
      !hasExactKeys(value.hero, ['label', 'value', 'sourceLabel']) ||
      typeof value.hero.label !== 'string' ||
      typeof value.hero.value !== 'string' ||
      !isStringOrNull(value.hero.sourceLabel)
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(value.historyTiles) ||
    typeof value.hasHistoryData !== 'boolean' ||
    !value.historyTiles.every(
      (tile) =>
        isRecord(tile) &&
        hasExactKeys(tile, ['key', 'label', 'value', 'tone', 'scope']) &&
        typeof tile.key === 'string' &&
        typeof tile.label === 'string' &&
        typeof tile.value === 'string' &&
        typeof tile.tone === 'string' &&
        typeof tile.scope === 'string',
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(value.providers) ||
    !value.providers.every(
      (provider) =>
        isRecord(provider) &&
        hasExactKeys(provider, [
          'id',
          'name',
          'state',
          'stateLabel',
          'accent',
          'meters',
          'accountValue',
          'details',
          'hoursLabel',
          'note',
          'message',
          'fetchedAt',
        ]) &&
        typeof provider.id === 'string' &&
        (PROVIDER_IDS as readonly string[]).includes(provider.id) &&
        typeof provider.name === 'string' &&
        typeof provider.state === 'string' &&
        typeof provider.stateLabel === 'string' &&
        isRecord(provider.accent) &&
        hasExactKeys(provider.accent, ['light', 'dark']) &&
        typeof provider.accent.light === 'string' &&
        typeof provider.accent.dark === 'string' &&
        isMeters(provider.meters) &&
        isProviderAccountValue(provider.accountValue) &&
        isProviderDetails(provider.details) &&
        isStringOrNull(provider.hoursLabel) &&
        isStringOrNull(provider.note) &&
        isStringOrNull(provider.message) &&
        isStringOrNull(provider.fetchedAt),
    )
  ) {
    return false;
  }

  return (
    isRangeId(value.range) &&
    typeof value.rangeLabel === 'string' &&
    isRangeOptions(value.ranges) &&
    isLabels(value.labels)
  );
}

function isDashboardLocalization(value: unknown): value is DashboardLocalization {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'language',
      'title',
      'loading',
      'reloading',
      'loadFailed',
      'retry',
    ]) &&
    (value.language === 'zh-CN' || value.language === 'en-US') &&
    typeof value.title === 'string' &&
    typeof value.loading === 'string' &&
    typeof value.reloading === 'string' &&
    typeof value.loadFailed === 'string' &&
    typeof value.retry === 'string'
  );
}

export function isHostMessage(value: unknown): value is HostMessage {
  if (!isRecord(value)) return false;
  if (value.kind === 'state') {
    return hasExactKeys(value, ['kind', 'model', 'range']) &&
      isRangeId(value.range) &&
      isDashboardModel(value.model);
  }
  if (value.kind === 'locale') {
    return hasExactKeys(value, ['kind', 'localization']) &&
      isDashboardLocalization(value.localization);
  }
  return false;
}

export function isWebviewMessage(value: unknown): value is WebviewMessage {
  if (!isRecord(value)) return false;
  if (value.kind === 'ready') return hasExactKeys(value, ['kind']);
  if (value.kind === 'configure') return hasExactKeys(value, ['kind']);
  if (value.kind === 'refresh') return hasExactKeys(value, ['kind']);
  if (value.kind === 'setRange') {
    return hasExactKeys(value, ['kind', 'range']) && isRangeId(value.range);
  }
  return false;
}

export function hostMessage(message: HostMessage): HostMessage {
  return message;
}
