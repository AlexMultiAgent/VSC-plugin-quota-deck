import { describe, expect, it } from 'vitest';
import { translatorFor } from '../localization';
import {
  formatCompactDuration,
  formatDateTime,
  formatDuration,
  formatExpiryRemaining,
  formatMoney,
  formatRemainingDays,
  pickTightestWindow,
  providerDisplayName,
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

const zh = translatorFor('zh-CN');
const en = translatorFor('en-US');
const DAY = 86_400_000;
const now = Date.parse('2026-11-20T00:00:00.000Z');

describe('formatExpiryRemaining', () => {
  it('rounds a partial day up', () => {
    expect(formatExpiryRemaining(now + 10 * DAY + 1, now, zh)).toBe('剩余 11天');
  });

  it('uses the short day unit in English', () => {
    expect(formatExpiryRemaining(now + 10 * DAY, now, en)).toBe('Remaining 10d');
  });

  it('marks an expired subscription', () => {
    expect(formatExpiryRemaining(now - 1, now, zh)).toBe('已过期');
    expect(formatExpiryRemaining(now - 1, now, en)).toBe('Expired');
  });

  it('formats an explicit day count', () => {
    expect(formatRemainingDays(7, zh)).toBe('剩余 7天');
  });
});

describe('formatDateTime', () => {
  it('formats an instant in the requested time zone', () => {
    expect(
      formatDateTime(Date.parse('2026-11-20T10:00:00.000Z'), 'Asia/Shanghai'),
    ).toBe('2026-11-20 18:00');
  });
});

describe('formatCompactDuration', () => {
  it('keeps the minutes under a day, even at zero', () => {
    expect(formatCompactDuration(180 * 60_000)).toBe('3h0m');
    expect(formatCompactDuration(210 * 60_000)).toBe('3h30m');
  });

  it('renders days and hours for a span of a day or more', () => {
    expect(formatCompactDuration((6 * 24 + 22) * 3_600_000)).toBe('6d22h');
    expect(formatCompactDuration(24 * 3_600_000)).toBe('1d0h');
    expect(formatCompactDuration((24 + 1) * 3_600_000 + 30 * 60_000)).toBe('1d1h');
  });

  it('drops the hour below the first hour', () => {
    expect(formatCompactDuration(45 * 60_000)).toBe('45m');
  });

  it('clamps a span that has already passed to zero', () => {
    expect(formatCompactDuration(-1)).toBe('0m');
  });
});

describe('formatDuration', () => {
  it('renders hours and minutes in Chinese', () => {
    expect(formatDuration(210 * 60_000, zh)).toBe('3小时30分钟');
  });

  it('renders hours and minutes in English', () => {
    expect(formatDuration(210 * 60_000, en)).toBe('3h 30m');
  });

  it('renders days and hours in Chinese', () => {
    expect(formatDuration((6 * 24 + 23) * 3_600_000, zh)).toBe('6天23小时');
  });

  it('renders days and hours in English', () => {
    expect(formatDuration((6 * 24 + 23) * 3_600_000, en)).toBe('6d 23h');
  });

  it('clamps a span that has already passed to zero', () => {
    expect(formatDuration(-1, zh)).toBe('0分钟');
    expect(formatDuration(-1, en)).toBe('0m');
  });
});
