import type { Language } from '../core/settings';
import { enUs } from './en-us';
import { zhCn } from './zh-cn';
import type { MessageBundle, MessageKey } from './messages';

export type ResolvedLanguage = 'zh-CN' | 'en-US';
export type Translator = (key: MessageKey) => string;

export function resolveLanguage(preference: Language, displayLanguage: string): ResolvedLanguage {
  if (preference === 'zh-CN' || preference === 'en-US') return preference;
  const normalized = displayLanguage.toLowerCase();
  return normalized === 'zh' || normalized.startsWith('zh-') ? 'zh-CN' : 'en-US';
}

export function translatorFor(language: ResolvedLanguage): Translator {
  const bundle: MessageBundle = language === 'zh-CN' ? zhCn : enUs;
  return (key) => bundle[key];
}
