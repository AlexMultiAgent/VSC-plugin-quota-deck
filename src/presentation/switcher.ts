import type { Translator } from '../localization';
import type { ProviderId } from '../core/types';

export interface SwitcherItem {
  readonly id: ProviderId;
  readonly label: string;
  readonly detail: string;
  readonly configured: boolean;
  readonly picked: boolean;
}

const LABELS: Record<ProviderId, string> = {
  'minimax-cn': 'MiniMax CN',
  'minimax-global': 'MiniMax Global',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
};

export function buildSwitcherItems(
  configured: Partial<Record<ProviderId, boolean>>,
  t: Translator,
  primary: ProviderId = 'minimax-cn',
): SwitcherItem[] {
  return (Object.keys(LABELS) as ProviderId[]).map((id) => ({
    id,
    label: LABELS[id],
    detail: configured[id] === true ? t('switcher.configured') : t('switcher.notConfigured'),
    configured: configured[id] === true,
    picked: id === primary,
  }));
}
