import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, renderTooltip } from './tooltip';
import { translatorFor } from '../localization';
import { makeSnapshot } from '../test/helpers/snapshot';

const t = translatorFor('en-US');
const zh = translatorFor('zh-CN');

describe('escapeHtml', () => {
  it('escapes the characters that could break out of markup', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('escapes an ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
});

describe('renderTooltip', () => {
  it('shows the brand header and badge', () => {
    const html = renderTooltip({}, [], t);
    expect(html).toContain('QuotaDeck CN');
    expect(html).toContain('CN MODELS');
  });

  it('lists providers in the given order', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok' as const,
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { windows: [] },
        },
      }),
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok' as const,
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { entries: [] },
        },
      }),
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': { kind: 'unsupported' as const, reason: 'not available' },
      }),
    };
    const html = renderTooltip(snapshots, ['minimax-cn', 'deepseek', 'qwen'], t);
    expect(html.indexOf('MiniMax CN')).toBeLessThan(html.indexOf('DeepSeek'));
    expect(html).not.toContain('Qwen');
  });

  it('hides providers that have no usable configuration from hover details', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok' as const,
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 88, resetAt: null, unlimited: false }] },
        },
      }),
      'minimax-global': makeSnapshot('minimax-global', {
        'minimax.plan': { kind: 'unconfigured' as const, reason: 'missing token plan key' },
      }),
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': { kind: 'unconfigured' as const, reason: 'missing api key' },
      }),
    };

    const html = renderTooltip(
      snapshots,
      ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'],
      t,
    );

    expect(html).toContain('MiniMax CN');
    expect(html).not.toContain('MiniMax Global');
    expect(html).not.toContain('DeepSeek');
    expect(html).not.toContain('Qwen');
  });

  it('shows account provenance once instead of repeating provider badges', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 60, resetAt: null, unlimited: false }] },
        },
      }),
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { entries: [{ currency: 'CNY', total: 112.8, granted: 12.8, toppedUp: 100 }] },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['minimax-cn', 'deepseek'], t);
    expect(html.match(/Live account data/g)).toHaveLength(1);
    expect(html).not.toContain('>Account<');
    expect(html).not.toContain('API Key');
    expect(html).not.toContain('AccessKey');
  });

  it('shows a fixed-width colored line track without bracket characters', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 60, resetAt: null, unlimited: false }] },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['minimax-cn'], t);
    expect(html).toContain(
      '<span style="color:var(--vscode-charts-green);">━━━━━━</span>' +
        '<span style="color:var(--vscode-descriptionForeground);">────</span>',
    );
    expect(html).not.toContain('[██████');
    expect(html).not.toContain('<code>');
  });

  it('renders every MiniMax quota track at the same width', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [
              { window: 'fiveHour', remainingPercent: 69, resetAt: null, unlimited: false },
              { window: 'weekly', remainingPercent: 26, resetAt: null, unlimited: false },
            ],
            models: [{ model: 'video', remaining: 0, total: 3 }],
          },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['minimax-cn'], t);
    const trackSegments = [...html.matchAll(/>([━─]+)<\/span>/g)].map((match) => match[1]!);

    expect(trackSegments.filter((segment) => segment.includes('━'))).toHaveLength(2);
    expect(trackSegments.filter((segment) => segment.includes('─'))).toHaveLength(3);
    expect(html).not.toContain('>[');
  });

  it('localizes MiniMax regions, windows, reset times, and the configured time zone', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: '2026-11-16T04:00:00.000Z',
          data: {
            windows: [
              {
                window: 'fiveHour',
                remainingPercent: 35,
                resetAt: Date.parse('2026-11-16T04:00:00.000Z'),
                unlimited: false,
              },
              {
                window: 'weekly',
                remainingPercent: 24,
                resetAt: Date.parse('2026-11-16T08:00:00.000Z'),
                unlimited: false,
              },
            ],
          },
        },
      }),
    };

    const html = renderTooltip(
      snapshots,
      ['minimax-cn'],
      zh,
      '2026-11-16T04:00:00.000Z',
      'Asia/Shanghai',
    );

    expect(html).toContain('国内版');
    expect(html).toContain('5 小时');
    expect(html).toContain('每周');
    expect(html).toContain('重置于 2026-11-16 12:00');
    expect(html).toContain('重置于 2026-11-16 16:00');
    expect(html).toContain('Asia/Shanghai');
    expect(html).not.toContain('Domestic');
    expect(html).not.toContain('5-hour');
    expect(html).not.toContain('Weekly');
    expect(html).not.toContain('Resets');
  });

  it('labels the reset time in English', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: '2026-11-16T04:00:00.000Z',
          data: {
            windows: [{
              window: 'fiveHour',
              remainingPercent: 35,
              resetAt: Date.parse('2026-11-16T04:00:00.000Z'),
              unlimited: false,
            }],
          },
        },
      }),
    };

    expect(renderTooltip(snapshots, ['minimax-cn'], t, undefined, 'Asia/Shanghai')).toContain(
      'Resets 2026-11-16 12:00',
    );
  });

  it('escapes provider-controlled strings', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { entries: [{ currency: '<img src=x onerror=alert(1)>', total: 1 }] },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['deepseek'], t);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('shows the balance rows', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { entries: [{ currency: 'CNY', total: 112.8, granted: 12.8, toppedUp: 100 }] },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['deepseek'], t);
    expect(html).toContain('CNY');
    expect(html).toContain('112.80');
  });

  it('localizes balance and subscription expiry labels', () => {
    const deepseek = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok' as const,
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { entries: [{ currency: 'CNY', total: 112.8 }] },
        },
      }),
    };
    const minimax = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok' as const,
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { windows: [] },
        },
        'minimax.subscription': {
          kind: 'ok' as const,
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { expiresAt: Date.parse('2027-06-30T00:00:00.000Z'), planName: null },
        },
      }),
    };

    const balanceHtml = renderTooltip(deepseek, ['deepseek'], zh);
    const expiryHtml = renderTooltip(minimax, ['minimax-cn'], zh);

    expect(balanceHtml).toContain('余额');
    expect(balanceHtml).not.toContain('>balance<');
    expect(expiryHtml).toContain('到期');
    expect(expiryHtml).not.toContain('Expires');
  });

  it('does not show DeepSeek detailed usage retained in a legacy cache', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T04:00:00.000Z'));
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.usageAmount': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: {
            rangeId: 'last7',
            points: [{ date: '2026-11-16T00:00:00.000Z', requests: 3, totalTokens: 300, cacheHitTokens: 100, cacheMissTokens: 50, outputTokens: 150 }],
            costs: [{ date: '2026-11-16T00:00:00.000Z', cost: 1.5, currency: 'CNY' }],
            byModel: [],
            modelCosts: [],
            currencies: ['CNY'],
          },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['deepseek'], t);
    vi.useRealTimers();
    expect(html).not.toContain('Last 7 days');
    expect(html).not.toContain('Today');
    expect(html).not.toContain('cache');
  });

  it('shows Qwen available, cash, and credit amounts from the account balance', () => {
    const snapshots = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            availableAmount: -12.34,
            availableCashAmount: -18.34,
            creditAmount: 5,
            mybankCreditAmount: 6,
            quotaLimit: 1000,
            currency: 'CNY',
          },
        },
        'qwen.modelQuota': { kind: 'unsupported', reason: 'not public' },
        'qwen.consumption': { kind: 'unsupported', reason: 'not public' },
      }),
    };

    const html = renderTooltip(snapshots, ['qwen'], t);

    expect(html).toContain('Available balance');
    expect(html).toContain('¥-12.34');
    expect(html).toContain('Available cash');
    expect(html).toContain('¥-18.34');
    expect(html).toContain('Credit');
    expect(html).toContain('¥5.00');
    expect(html).not.toContain('AccessKey');
  });

  it('shows the DeepSeek peak or off-peak period in hover details', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { available: true, entries: [{ currency: 'CNY', total: 10, granted: 0, toppedUp: 10 }] },
        },
      }),
    };

    const html = renderTooltip(
      snapshots,
      ['deepseek'],
      t,
      undefined,
      'Asia/Shanghai',
      'peak',
    );

    expect(html).toContain('Peak');
    expect(html).not.toContain('Off-peak');
  });

  it('does not ask for a DeepSeek platform session from a legacy cache', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.usageAmount': { kind: 'failed', error: { kind: 'auth', message: 'error.auth' } },
      }),
    };
    expect(renderTooltip(snapshots, ['deepseek'], t)).not.toContain('session expired');
  });

  it('shows the last refresh time and dashboard hint', () => {
    const html = renderTooltip({}, ['qwen'], t, '2026-11-16T04:00:00.000Z');
    expect(html).toContain('2026-11-16 12:00');
    expect(html).toContain('Asia/Shanghai');
    expect(html).toContain('Open the dashboard');
  });

  it('never renders a raw credential', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { entries: [{ currency: 'CNY', total: 1, granted: 0, toppedUp: 0 }] },
        },
      }),
    };
    expect(renderTooltip(snapshots, ['deepseek'], t)).not.toContain('cookie');
  });

  it('shows MiniMax media quota, points, and expiry', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [{ window: 'fiveHour', remainingPercent: 40, resetAt: null, unlimited: false }],
            models: [{ model: 'video', remaining: 3, total: 3 }],
          },
        },
        'minimax.points': { kind: 'ok', fetchedAt: 'x', data: { balance: 6850, expiresAt: null } },
        'minimax.subscription': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { expiresAt: Date.parse('2027-06-30T00:00:00Z'), planName: null },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['minimax-cn'], t);
    expect(html).toContain('video');
    expect(html).toContain('6,850');
    expect(html).toContain('2027-06-30');
  });
});
