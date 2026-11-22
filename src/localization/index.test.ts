import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages';
import { enUs } from './en-us';
import { zhCn } from './zh-cn';
import { resolveLanguage, translatorFor } from './index';

describe('bundles', () => {
  it('covers every message key in both languages', () => {
    expect(Object.keys(enUs).sort()).toEqual(Object.keys(MESSAGES).sort());
    expect(Object.keys(zhCn).sort()).toEqual(Object.keys(MESSAGES).sort());
  });

  it('has no empty strings', () => {
    for (const bundle of [enUs, zhCn]) {
      for (const value of Object.values(bundle)) expect(value.length).toBeGreaterThan(0);
    }
  });

  it('carries the circle-arrow update glyph', () => {
    expect(zhCn['tooltip.updated']).toBe('⟳');
    expect(enUs['tooltip.updated']).toBe('⟳');
  });
});

describe('resolveLanguage', () => {
  it('resolves a Chinese display language to zh-CN', () => {
    expect(resolveLanguage('auto', 'zh-cn')).toBe('zh-CN');
  });

  it('resolves a Chinese display language with a region to zh-CN', () => {
    expect(resolveLanguage('auto', 'zh')).toBe('zh-CN');
  });

  it('resolves an explicit language over the display language', () => {
    expect(resolveLanguage('en-US', 'zh-cn')).toBe('en-US');
  });

  it('falls back to en-US for any other display language', () => {
    expect(resolveLanguage('auto', 'fr')).toBe('en-US');
  });
});

describe('translatorFor', () => {
  it('returns Chinese strings for the zh-CN bundle', () => {
    const t = translatorFor('zh-CN');
    expect(t('statusBar.noData')).toBe('未配置');
  });

  it('returns English strings for the en-US bundle', () => {
    const t = translatorFor('en-US');
    expect(t('statusBar.noData')).toBe('Not configured');
  });
});
