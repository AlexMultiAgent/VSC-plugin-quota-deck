import type { Translator } from '../localization';
import type { RangeId } from '../core/time';
import type { PricingState } from '../providers/deepseek/pricing';

export function rangeLabel(range: RangeId, t: Translator): string {
  switch (range) {
    case 'today':
      return t('dashboard.range.today');
    case 'yesterday':
      return t('dashboard.range.yesterday');
    case 'last7':
      return t('dashboard.range.last7');
    case 'last30':
      return t('dashboard.range.last30');
    case 'thisMonth':
      return t('dashboard.range.thisMonth');
    case 'lastMonth':
      return t('dashboard.range.lastMonth');
  }
}

export function pricingPeriodLabel(pricing: PricingState, t: Translator): string {
  return pricing === 'peak'
    ? t('hours.peak')
    : pricing === 'offPeak'
      ? t('hours.offPeak')
      : t('hours.unavailable');
}
