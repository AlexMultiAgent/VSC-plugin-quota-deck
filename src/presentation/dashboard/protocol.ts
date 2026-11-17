import type { DashboardModel } from './viewModel';
import { RANGE_IDS, type RangeId } from '../../core/time';

export type HostMessage =
  | { readonly kind: 'state'; readonly model: DashboardModel; readonly range: RangeId }
  | { readonly kind: 'locale'; readonly strings: Record<string, string> };

export type WebviewMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'configure' }
  | { readonly kind: 'setRange'; readonly range: RangeId };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isRangeId(value: unknown): value is RangeId {
  return typeof value === 'string' && (RANGE_IDS as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isStringOrNull(value: unknown): boolean {
  return typeof value === 'string' || value === null;
}

function isNumberOrNull(value: unknown): boolean {
  return typeof value === 'number' || value === null;
}

function isPoints(value: unknown): boolean {
  return Array.isArray(value) && value.every(
    (point) => isRecord(point) && typeof point.x === 'string' && typeof point.y === 'number',
  );
}

function isTokenSeries(value: unknown): boolean {
  return Array.isArray(value) && value.every(
    (series) =>
      isRecord(series) &&
      typeof series.label === 'string' &&
      typeof series.color === 'string' &&
      typeof series.darkColor === 'string' &&
      Array.isArray(series.values) &&
      series.values.every((entry) => typeof entry === 'number'),
  );
}

function isMeters(value: unknown): boolean {
  return Array.isArray(value) && value.every(
    (meter) =>
      isRecord(meter) &&
      typeof meter.key === 'string' &&
      typeof meter.label === 'string' &&
      isNumberOrNull(meter.percent) &&
      isStringOrNull(meter.resetLabel) &&
      typeof meter.tone === 'string',
  );
}

function isModelRows(value: unknown): boolean {
  return Array.isArray(value) && value.every(
    (row) =>
      isRecord(row) &&
      typeof row.model === 'string' &&
      typeof row.requests === 'number' &&
      typeof row.totalTokens === 'number' &&
      typeof row.cost === 'number' &&
      typeof row.currency === 'string',
  );
}

function isBalanceRows(value: unknown): boolean {
  return Array.isArray(value) && value.every(
    (row) => isRecord(row) && typeof row.currency === 'string' && typeof row.total === 'number',
  );
}

function isRangeOptions(value: unknown): boolean {
  return Array.isArray(value) && value.every(
    (entry) => isRecord(entry) && isRangeId(entry.id) && typeof entry.label === 'string',
  );
}

function isLabels(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isDashboardModel(value: unknown): value is DashboardModel {
  if (!isRecord(value)) return false;
  if (!isRecord(value.hero) || typeof value.hero.label !== 'string' || typeof value.hero.value !== 'string') {
    return false;
  }
  if (!Array.isArray(value.tiles) || !value.tiles.every(
    (tile) => isRecord(tile) && typeof tile.key === 'string' && typeof tile.label === 'string' &&
      typeof tile.value === 'string' && typeof tile.tone === 'string',
  )) return false;
  if (!Array.isArray(value.providers) || !value.providers.every(
    (provider) => isRecord(provider) && typeof provider.id === 'string' &&
      typeof provider.name === 'string' && typeof provider.state === 'string' &&
      isRecord(provider.accent) && typeof provider.accent.light === 'string' &&
      typeof provider.accent.dark === 'string' && isMeters(provider.meters) &&
      isStringOrNull(provider.message) && isStringOrNull(provider.fetchedAt),
  )) return false;
  if (!isRecord(value.usage)) return false;
  const usage = value.usage;
  if (
    typeof usage.available !== 'boolean' ||
    !isStringOrNull(usage.currency) ||
    !isStringArray(usage.categories) ||
    !isPoints(usage.cost) ||
    !isPoints(usage.requests) ||
    !isPoints(usage.tokens) ||
    !isTokenSeries(usage.tokenSeries) ||
    !isModelRows(usage.byModel)
  ) return false;
  if (!Array.isArray(value.qwen) || !value.qwen.every(
    (row) => isRecord(row) && typeof row.capability === 'string' &&
      typeof row.label === 'string' && typeof row.state === 'string',
  )) return false;
  if (!isBalanceRows(value.balances)) return false;
  if (typeof value.rangeLabel !== 'string' || !isRangeOptions(value.ranges)) return false;
  if (typeof value.pricingLabel !== 'string' || !isLabels(value.labels)) return false;
  return isRangeId(value.range);
}

export function isHostMessage(value: unknown): value is HostMessage {
  if (!isRecord(value)) return false;
  if (value.kind === 'state') {
    return hasExactKeys(value, ['kind', 'model', 'range']) &&
      isRangeId(value.range) && isDashboardModel(value.model);
  }
  if (value.kind === 'locale') {
    return hasExactKeys(value, ['kind', 'strings']) && isRecord(value.strings) &&
      Object.values(value.strings).every((entry) => typeof entry === 'string');
  }
  return false;
}

export function isWebviewMessage(value: unknown): value is WebviewMessage {
  if (!isRecord(value)) return false;
  if (value.kind === 'ready') return hasExactKeys(value, ['kind']);
  if (value.kind === 'configure') return hasExactKeys(value, ['kind']);
  if (value.kind === 'setRange') {
    return hasExactKeys(value, ['kind', 'range']) && isRangeId(value.range);
  }
  return false;
}

export function hostMessage(message: HostMessage): HostMessage {
  return message;
}
