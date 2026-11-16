import type { Translator } from '../localization';
import type { RangeId } from '../core/time';

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

export function capabilityLabel(capability: string, t: Translator): string {
  switch (capability) {
    case 'qwen.accountBalance':
      return t('capability.qwen.accountBalance');
    case 'qwen.modelQuota':
      return t('capability.qwen.modelQuota');
    case 'qwen.consumption':
      return t('capability.qwen.consumption');
    case 'qwen.accessKeyValidation':
      return t('capability.qwen.accessKeyValidation');
    default:
      return capability;
  }
}
