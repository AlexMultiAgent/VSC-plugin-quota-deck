import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, renderTooltip } from './tooltip';
import { translatorFor } from '../localization';
import { readMiniMaxPlan, readMiniMaxSubscription } from '../providers/minimax/shape';
import { loadFixture } from '../test/helpers/fixture';
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

  it('renders a thick, long text block track without bracket characters', () => {
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
      '<span style="color:var(--vscode-charts-green);">██████████</span>' +
        '<span style="color:var(--vscode-descriptionForeground);">██████</span>',
    );
    expect(html).not.toContain('░');
    expect(html).not.toContain('[██████');
    expect(html).not.toContain('<code>');
  });

  it('renders every MiniMax quota track at the same long width', () => {
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
    const tracks = [
      ...html.matchAll(
        />([█]*)<\/span><span style="color:var\(--vscode-descriptionForeground\);">([█]*)<\/span>/g,
      ),
    ].map((match) => `${match[1]}${match[2]}`);

    expect(tracks).toHaveLength(3);
    expect(tracks.every((track) => track.length === 16)).toBe(true);
    expect(html).not.toContain('░');
    expect(html).not.toMatch(/[━─]/);
    expect(html).not.toContain('>[');
  });

  it('keeps quota bars visible when VS Code strips inline styles', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [
              { window: 'fiveHour', remainingPercent: 93, resetAt: null, unlimited: false },
              { window: 'weekly', remainingPercent: 21, resetAt: null, unlimited: false },
            ],
            models: [{ model: 'video', remaining: 3, total: 3 }],
          },
        },
      }),
    };
    const html = renderTooltip(snapshots, ['minimax-cn'], zh);
    const visibleText = html
      .replace(/\sstyle="[^"]*"/g, '')
      .replace(/<[^>]+>/g, '');

    expect(visibleText).toContain('████████████████');
    expect(visibleText).toContain('████████████████');
    expect(visibleText).toContain('████████████████');
  });

  it('keeps provider detail rows directly inside each card table', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [{ window: 'fiveHour', remainingPercent: 100, resetAt: null, unlimited: false }],
            models: [],
          },
        },
      }),
    };

    const html = renderTooltip(snapshots, ['minimax-cn'], zh);

    expect(html).not.toContain('<tr><td colspan="4"><tr>');
  });

  it('shows the video remaining count the provider parsed', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [
              { window: 'fiveHour', remainingPercent: 100, resetAt: null, unlimited: false },
              { window: 'weekly', remainingPercent: 22, resetAt: null, unlimited: false },
            ],
            models: [{
              model: 'video',
              remaining: 3,
              remainingPercent: 100,
              total: 3,
              used: 0,
            }],
          },
        },
      }),
    };

    const html = renderTooltip(snapshots, ['minimax-cn'], zh);
    const visibleText = html.replace(/<[^>]+>/g, '');

    expect(visibleText).toContain('████████████████100%');
    expect(visibleText).toContain('████████████████22%');
    expect(visibleText).toContain('████████████████3/3');
    expect(html).toContain('视频');
    expect(html).not.toContain('剩余');
    expect(html).not.toContain('已使用');
    expect(html).not.toContain('次');
    expect(html).not.toContain('>video<');
    expect(visibleText).not.toContain('视频████████████████0%');
  });

  it('shows zero remaining uses when a MiniMax media allowance is fully used', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [],
            models: [{
              model: 'video',
              remaining: 0,
              remainingPercent: 0,
              total: 3,
              used: 3,
            }],
          },
        },
      }),
    };

    const html = renderTooltip(snapshots, ['minimax-cn'], zh);

    expect(html).toContain('min-width:42px;margin-left:10px;">0/3</span>');
    expect(html).not.toContain('视频████████████████100%');
    expect(html).not.toContain('剩余');
    expect(html).not.toContain('已使用');
    expect(html).not.toContain('次');
  });

  it('renders the captured MiniMax video quota as three of three remaining', () => {
    const fixture = loadFixture('minimax-cn', 'minimax.plan', 'standard') as {
      response: unknown;
    };
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: readMiniMaxPlan(fixture.response),
        },
      }),
    };

    const html = renderTooltip(snapshots, ['minimax-cn'], zh);
    const visibleText = html.replace(/<[^>]+>/g, '');

    expect(visibleText).toContain('3/3');
    expect(visibleText).not.toContain('0/3');
    expect(visibleText).toContain('90%');
    expect(visibleText).toContain('14%');
  });

  it('shows the video reset time after its quota track', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [],
            models: [{
              model: 'video',
              remaining: 3,
              remainingPercent: 100,
              resetAt: Date.parse('2026-11-19T00:00:00.000Z'),
              total: 3,
            }],
          },
        },
      }),
    };

    const html = renderTooltip(snapshots, ['minimax-cn'], zh, undefined, 'Asia/Shanghai');

    expect(html).toContain('title="下次重置 2026-11-19 08:00">↻ 11-19 08:00</td>');
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
    expect(html).toContain('title="下次重置 2026-11-16 12:00">↻ 11-16 12:00</td>');
    expect(html).toContain('title="下次重置 2026-11-16 16:00">↻ 11-16 16:00</td>');
    expect(html).not.toContain('重置于');
    expect(html).toContain('Asia/Shanghai');
    expect(html).not.toContain('Domestic');
    expect(html).not.toContain('5-hour');
    expect(html).not.toContain('Weekly');
    expect(html).not.toContain('Resets');
  });

  it('emphasizes provider names instead of MiniMax quota labels and values', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [
              { window: 'fiveHour', remainingPercent: 5, resetAt: null, unlimited: false },
            ],
            models: [{ model: 'video', remaining: 3, total: 3 }],
          },
        },
      }),
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { entries: [{ currency: 'CNY', total: 8.05 }] },
        },
      }),
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            availableAmount: 0,
            availableCashAmount: 0,
            creditAmount: 0,
            mybankCreditAmount: 0,
            quotaLimit: 0,
            currency: 'CNY',
          },
        },
      }),
    };

    const html = renderTooltip(
      snapshots,
      ['minimax-cn', 'deepseek', 'qwen'],
      zh,
      undefined,
      'Asia/Shanghai',
      'offPeak',
    );

    expect(html).toContain('<tr><td class="t-title"><strong>MiniMax CN</strong></td>');
    expect(html).toContain('<tr><td class="t-title"><strong>DeepSeek</strong></td>');
    expect(html).toContain('<tr><td class="t-title"><strong>Qwen</strong></td>');
    expect(html).not.toContain('<strong>Token Plan 额度</strong>');
    expect(html).not.toContain('<strong>5 小时</strong>');
    expect(html).not.toContain('<strong>视频</strong>');
    expect(html).not.toContain('<strong style="display:inline-block;vertical-align:middle;');
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

    const html = renderTooltip(snapshots, ['minimax-cn'], t, undefined, 'Asia/Shanghai');

    expect(html).toContain('title="Next reset 2026-11-16 12:00">↻ 11-16 12:00</td>');
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

    const peakHtml = renderTooltip(
      snapshots,
      ['deepseek'],
      t,
      undefined,
      'Asia/Shanghai',
      'peak',
    );
    const offPeakHtml = renderTooltip(
      snapshots,
      ['deepseek'],
      t,
      undefined,
      'Asia/Shanghai',
      'offPeak',
    );

    expect(peakHtml).toContain(
      '<span style="color:var(--vscode-charts-orange, #d18616);font-weight:600;">☀ Peak</span>',
    );
    expect(peakHtml).not.toContain('Off-peak');
    expect(offPeakHtml).toContain(
      '<span style="color:var(--vscode-charts-green, #89d185);font-weight:600;">🌙 Off-peak</span>',
    );
    expect(offPeakHtml).not.toContain('>Peak<');
  });

  it('uses the official Chinese DeepSeek periods with non-color symbols', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { entries: [{ currency: 'CNY', total: 8.05 }] },
        },
      }),
    };

    const peakHtml = renderTooltip(
      snapshots,
      ['deepseek'],
      zh,
      undefined,
      'Asia/Shanghai',
      'peak',
    );
    const offPeakHtml = renderTooltip(
      snapshots,
      ['deepseek'],
      zh,
      undefined,
      'Asia/Shanghai',
      'offPeak',
    );

    expect(peakHtml).toContain('☀ 高峰时段');
    expect(peakHtml).not.toContain('忙时');
    expect(offPeakHtml).toContain('🌙 空闲时段');
    expect(offPeakHtml).not.toContain('>闲时<');
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
    expect(html).toContain('Click to open the dashboard');
  });

  it('puts the dashboard hint on a second footer line', () => {
    const html = renderTooltip({}, ['qwen'], zh, '2026-11-18T10:43:00.000Z', 'Asia/Shanghai');

    expect(html).toContain(
      '<span class="t-muted">⇄ 2026-11-18 18:43 · Asia/Shanghai</span>' +
        '<br><span class="t-muted">点击在仪表盘中查看更多分析</span>',
    );
  });

  it('separates configured provider cards', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { windows: [], models: [] },
        },
      }),
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { entries: [{ currency: 'CNY', total: 10, granted: 0, toppedUp: 10 }] },
        },
      }),
    };

    const html = renderTooltip(snapshots, ['minimax-cn', 'deepseek'], t);
    const minimax = html.indexOf('MiniMax CN');
    const separator = html.indexOf('class="t-provider-separator"');
    const deepseek = html.indexOf('DeepSeek');

    expect(separator).toBeGreaterThan(minimax);
    expect(separator).toBeLessThan(deepseek);
  });

  it('separates the header and last two footer lines', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { windows: [], models: [] },
        },
      }),
    };

    const html = renderTooltip(
      snapshots,
      ['minimax-cn'],
      zh,
      '2026-11-18T14:31:00.000Z',
      'Asia/Shanghai',
    );
    const headerSeparator = html.indexOf('class="t-header-separator"');
    const provider = html.indexOf('MiniMax CN');
    const footerSeparator = html.indexOf('class="t-footer-separator"');
    const footer = html.indexOf('账户实时数据');

    expect(headerSeparator).toBeLessThan(provider);
    expect(footerSeparator).toBeGreaterThan(provider);
    expect(footerSeparator).toBeLessThan(footer);
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

  it('shows MiniMax media quota and expiry without cookie-only points', () => {
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
    expect(html).toContain('Video');
    expect(html).not.toContain('6,850');
    expect(html).toContain('2027-06-30');
  });

  it('shows the MiniMax expiry in the configured time zone', () => {
    const fixture = loadFixture('minimax-cn', 'minimax.subscription', 'standard') as {
      response: unknown;
    };
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { windows: [], models: [] },
        },
        'minimax.subscription': {
          kind: 'ok',
          fetchedAt: 'x',
          data: readMiniMaxSubscription(fixture.response),
        },
      }),
    };

    const html = renderTooltip(snapshots, ['minimax-cn'], zh, undefined, 'Asia/Shanghai');

    expect(html).toContain('2027-07-06 00:00');
    expect(html).not.toContain('2027-07-05');
  });
});
