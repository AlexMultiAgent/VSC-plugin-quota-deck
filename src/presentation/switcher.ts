import type { Translator } from '../localization';
import type { ProviderId } from '../core/types';
import { PROVIDER_IDS } from '../core/types';
import { providerDisplayName } from './display';

export interface SwitcherItem {
  readonly id: ProviderId;
  readonly label: string;
  readonly detail: string;
  readonly configured: boolean;
  readonly picked: boolean;
}

export function buildSwitcherItems(
  configured: Partial<Record<ProviderId, boolean>>,
  t: Translator,
  primary: ProviderId = 'minimax-cn',
): SwitcherItem[] {
  return PROVIDER_IDS.map((id) => ({
    id,
    label: providerDisplayName(id),
    detail: configured[id] === true ? t('switcher.configured') : t('switcher.notConfigured'),
    configured: configured[id] === true,
    picked: id === primary,
  }));
}
