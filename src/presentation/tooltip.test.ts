import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, renderTooltip } from './tooltip';
import { translatorFor } from '../localization';
import { makeSnapshot } from '../test/helpers/snapshot';

const t = translatorFor('en-US');

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
    const html = renderTooltip({}, ['minimax-cn', 'deepseek', 'qwen'], t);
    expect(html.indexOf('MiniMax CN')).toBeLessThan(html.indexOf('DeepSeek'));
    expect(html.indexOf('DeepSeek')).toBeLessThan(html.indexOf('Qwen'));
  });

  it('shows source and session badges separately', () => {
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
    expect(html).toContain('Account');
    expect(html).toContain('Web Session');
  });

  it('marks the MiniMax plan as an API-key session', () => {
    expect(renderTooltip({}, ['minimax-cn'], t)).toContain('API Key');
  });

  it('shows a block-character progress bar', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: '2026-11-16T00:00:00.000Z',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 60, resetAt: null, unlimited: false }] },
        },
      }),
    };
    expect(renderTooltip(snapshots, ['minimax-cn'], t)).toContain('██████░░░░');
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

  it('shows today and seven-day usage totals', () => {
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
    expect(html).toContain('Last 7 days');
    expect(html).toContain('Today');
    expect(html).toContain('cache');
  });

  it('warns when the DeepSeek session expired', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.usageAmount': { kind: 'failed', error: { kind: 'auth', message: 'error.auth' } },
      }),
    };
    expect(renderTooltip(snapshots, ['deepseek'], t)).toContain('session expired');
  });

  it('shows the last refresh time and dashboard hint', () => {
    const html = renderTooltip({}, ['qwen'], t, '2026-11-16T04:00:00.000Z');
    expect(html).toContain('2026-11-16 12:00');
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

  it('keeps two currencies apart in the usage summary', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.usageAmount': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            rangeId: 'last7',
            points: [
              { date: '2026-11-16T00:00:00.000Z', requests: 3, totalTokens: 300, cacheHitTokens: 100, cacheMissTokens: 50, outputTokens: 150 },
            ],
            costs: [
              { date: '2026-11-16T00:00:00.000Z', cost: 50, currency: 'CNY' },
              { date: '2026-11-16T00:00:00.000Z', cost: 7, currency: 'USD' },
            ],
            byModel: [],
            modelCosts: [],
            currencies: ['CNY', 'USD'],
          },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['deepseek'], t);
    expect(html).toContain('¥50.00');
    expect(html).toContain('USD 7.00');
    expect(html).not.toContain('¥57.00');
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
