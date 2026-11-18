import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  pickTightestWindow,
  providerDisplayName,
  remainingBar,
  selectPrimaryCurrency,
} from './display';

describe('formatMoney', () => {
  it('renders CNY with the yuan symbol', () => {
    expect(formatMoney(112.8, 'CNY')).toBe('¥112.80');
  });

  it('renders every other currency with its ISO code', () => {
    expect(formatMoney(12.3, 'USD')).toBe('USD 12.30');
  });
});

describe('selectPrimaryCurrency', () => {
  it('prefers CNY', () => {
    expect(selectPrimaryCurrency(['USD', 'CNY', 'EUR'])).toBe('CNY');
  });

  it('prefers USD over EUR', () => {
    expect(selectPrimaryCurrency(['EUR', 'USD'])).toBe('USD');
  });

  it('falls back to the remaining currencies in ascending code order', () => {
    expect(selectPrimaryCurrency(['EUR', 'JPY'])).toBe('EUR');
  });

  it('returns undefined when there is no currency', () => {
    expect(selectPrimaryCurrency([])).toBeUndefined();
  });
});

describe('providerDisplayName', () => {
  it('names every provider', () => {
    expect(providerDisplayName('minimax-cn')).toBe('MiniMax CN');
    expect(providerDisplayName('minimax-global')).toBe('MiniMax Global');
    expect(providerDisplayName('deepseek')).toBe('DeepSeek');
    expect(providerDisplayName('qwen')).toBe('Qwen');
  });
});

describe('pickTightestWindow', () => {
  const window = (remainingPercent: number | null, unlimited = false) => ({
    remainingPercent,
    unlimited,
  });

  it('picks the window with the least quota left', () => {
    expect(pickTightestWindow([window(40), window(12)])?.remainingPercent).toBe(12);
  });

  it('ignores unlimited windows', () => {
    expect(pickTightestWindow([window(5, true), window(30)])?.remainingPercent).toBe(30);
  });

  it('ignores windows without a percentage', () => {
    expect(pickTightestWindow([window(null), window(30)])?.remainingPercent).toBe(30);
  });

  it('returns undefined when no window qualifies', () => {
    expect(pickTightestWindow([window(null)])).toBeUndefined();
  });
});

describe('remainingBar', () => {
  it('fills a fixed-width line track', () => {
    expect(remainingBar(60)).toBe('━━━━━━────');
    expect(remainingBar(65)).toBe('━━━━━━━───');
  });

  it('keeps one filled segment for a small remainder', () => {
    expect(remainingBar(3)).toBe('━─────────');
  });

  it('renders an empty track for zero', () => {
    expect(remainingBar(0)).toBe('──────────');
  });

  it('clamps a percentage above one hundred', () => {
    expect(remainingBar(140)).toBe('━━━━━━━━━━');
  });

  it('keeps every track the same rendered width', () => {
    const widths = [0, 3, 26, 69, 100].map((percent) => [...remainingBar(percent)].length);
    expect(new Set(widths)).toEqual(new Set([10]));
  });
});
