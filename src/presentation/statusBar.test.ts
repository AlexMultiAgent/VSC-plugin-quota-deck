import { beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { __reset, state } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { makeSnapshot } from '../test/helpers/snapshot';
import { formatBalance, renderStatusBarText, StatusBarPresenter } from './statusBar';

const t = translatorFor('en-US');
const zh = translatorFor('zh-CN');

describe('formatBalance', () => {
  it('renders CNY with the yuan symbol', () => {
    expect(formatBalance({ currency: 'CNY', amount: 112.8 })).toBe('¥112.80');
  });

  it('renders every other currency with its ISO code', () => {
    expect(formatBalance({ currency: 'USD', amount: 12.3 })).toBe('USD 12.30');
  });

  it('renders a dash for an absent balance', () => {
    expect(formatBalance(undefined)).toBe('—');
  });
});

describe('renderStatusBarText', () => {
  beforeEach(() => __reset());

  it('shows compact provider segments without repeating the extension name', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'deepseek'], t);
    expect(text).not.toContain('QuotaDeck CN');
    expect(text).toContain('MM');
    expect(text).toContain('DS');
  });

  it('keeps the empty state compact while retaining the status icon', () => {
    const text = renderStatusBarText({}, ['minimax-cn'], t, 'all', 'minimax-cn', 20, {
      'minimax-cn': false,
    });
    expect(text).toBe('$(pulse) Not configured');
  });

  it('shows only the primary provider in focused mode', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'deepseek'], t, 'focused', 'deepseek');
    expect(text).toContain('DS');
    expect(text).not.toContain('MM');
  });

  it('marks an unconfigured provider as not configured', () => {
    const text = renderStatusBarText({}, ['qwen'], t);
    expect(text).toContain('Not configured');
  });

  it('shows the failure reason for a MiniMax network error', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': { kind: 'failed', error: { kind: 'network', message: 'error.network' } },
      }),
    };
    const text = renderStatusBarText(snapshots, ['minimax-cn'], t);
    expect(text).not.toContain('Not configured');
    expect(text).toContain(t('error.network'));
  });

  it('shows the failure reason for a MiniMax authentication error', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': { kind: 'failed', error: { kind: 'auth', message: 'error.auth' } },
      }),
    };
    const text = renderStatusBarText(snapshots, ['minimax-cn'], t);
    expect(text).not.toContain('Not configured');
    expect(text).toContain('$(error)');
  });

  it('shows the failure reason for a DeepSeek usage error', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': { kind: 'failed', error: { kind: 'timeout', message: 'error.timeout' } },
      }),
    };
    const text = renderStatusBarText(snapshots, ['deepseek'], t);
    expect(text).toContain(t('error.timeout'));
  });

  it('shows the DeepSeek pricing period beside the balance', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { available: true, entries: [{ currency: 'CNY', total: 112.8, granted: 12.8, toppedUp: 100 }] },
        },
      }),
    };
    const text = renderStatusBarText(
      snapshots,
      ['deepseek'],
      t,
      'all',
      'minimax-cn',
      20,
      undefined,
      'offPeak',
    );

    expect(text).toBe('$(pulse) DS $(dashboard) ¥112.80 · Off-peak');
  });

  it('uses compact two-character DeepSeek periods in Chinese', () => {
    const snapshots = {
      deepseek: makeSnapshot('deepseek', {
        'deepseek.balance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { entries: [{ currency: 'CNY', total: 8.05 }] },
        },
      }),
    };
    const offPeak = renderStatusBarText(
      snapshots,
      ['deepseek'],
      zh,
      'all',
      'minimax-cn',
      20,
      undefined,
      'offPeak',
    );
    const peak = renderStatusBarText(
      snapshots,
      ['deepseek'],
      zh,
      'all',
      'minimax-cn',
      20,
      undefined,
      'peak',
    );

    expect(offPeak).toBe('$(pulse) DS $(dashboard) ¥8.05 · 空闲');
    expect(peak).toBe('$(pulse) DS $(dashboard) ¥8.05 · 高峰');
  });

  it('shows the Qwen account balance without turning a negative value into zero', () => {
    const snapshots = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            availableAmount: -12.34,
            creditAmount: 5,
            mybankCreditAmount: 6,
            availableCashAmount: -18.34,
            quotaLimit: 1000,
            currency: 'CNY',
          },
        },
      }),
    };
    const text = renderStatusBarText(snapshots, ['qwen'], t);

    expect(text).toBe('$(pulse) QW $(dashboard) ¥-12.34');
  });

  it('shows a stale value with a stale marker', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'stale',
          fetchedAt: 'x',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 42, resetAt: null, unlimited: false }] },
          reason: 'error.network',
        },
      }),
    };
    const text = renderStatusBarText(snapshots, ['minimax-cn'], t);
    expect(text).toContain('42%');
    expect(text).toContain(t('state.stale'));
  });

  it('does not show a stale value as fresh', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'stale',
          fetchedAt: 'x',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 42, resetAt: null, unlimited: false }] },
          reason: 'error.network',
        },
      }),
    };
    const text = renderStatusBarText(snapshots, ['minimax-cn'], t);
    expect(text).toContain(t('state.stale'));
  });

  it('renders the remaining percentage', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 42, resetAt: null, unlimited: false }] },
        },
      }),
    };
    const text = renderStatusBarText(snapshots, ['minimax-cn'], t);
    expect(text).toContain('42%');
  });

  it('prioritizes the five-hour window over a lower weekly balance', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [
              { window: 'fiveHour', remainingPercent: 92, resetAt: null, unlimited: false },
              { window: 'weekly', remainingPercent: 37, resetAt: null, unlimited: false },
            ],
          },
        },
      }),
    };
    const text = renderStatusBarText(snapshots, ['minimax-cn'], t);
    expect(text).toContain('92%');
    expect(text).not.toContain('37%');
  });

  it('uses the four-stage quota tones', () => {
    const windowAt = (remainingPercent: number) => ({
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok' as const,
          fetchedAt: 'x',
          data: { windows: [{ window: 'fiveHour', remainingPercent, resetAt: null, unlimited: false }] },
        },
      }),
    });

    expect(renderStatusBarText(windowAt(50), ['minimax-cn'], t, 'all', 'minimax-cn', 20))
      .toContain('MM $(check) 50%');
    expect(renderStatusBarText(windowAt(49), ['minimax-cn'], t, 'all', 'minimax-cn', 20))
      .toContain('MM $(warning) 49%');
    expect(renderStatusBarText(windowAt(19), ['minimax-cn'], t, 'all', 'minimax-cn', 20))
      .toContain('MM $(warning) 19%');
    expect(renderStatusBarText(windowAt(5), ['minimax-cn'], t, 'all', 'minimax-cn', 20))
      .toContain('MM $(error) 5%');
  });

  it('hides providers that are not configured', () => {
    const snapshots = {
      'minimax-cn': makeSnapshot('minimax-cn', {
        'minimax.plan': {
          kind: 'ok' as const,
          fetchedAt: 'x',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 42, resetAt: null, unlimited: false }] },
        },
      }),
    };
    const configured = {
      'minimax-cn': true,
      deepseek: false,
      qwen: false,
    };
    const text = renderStatusBarText(
      snapshots,
      ['minimax-cn', 'deepseek', 'qwen'],
      t,
      'all',
      'minimax-cn',
      20,
      configured,
    );
    expect(text).toContain('MM');
    expect(text).not.toContain('DS');
    expect(text).not.toContain('QW');
  });

  it('shows a configured MiniMax Global account when MiniMax CN is the primary', () => {
    const snapshots = {
      'minimax-global': makeSnapshot('minimax-global', {
        'minimax.plan': {
          kind: 'ok' as const,
          fetchedAt: 'x',
          data: { windows: [{ window: 'fiveHour', remainingPercent: 42, resetAt: null, unlimited: false }] },
        },
      }),
    };
    const text = renderStatusBarText(
      snapshots,
      ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'],
      t,
      'all',
      'minimax-cn',
      20,
      { 'minimax-cn': false, 'minimax-global': true, deepseek: false, qwen: false },
    );
    expect(text).toContain('MG');
    expect(text).toContain('42%');
    expect(text).not.toContain('未配置');
  });

  it('collapses the two MiniMax regions so all three families remain visible', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'], t);
    expect(text).not.toMatch(/\+\d/);
    expect(text).toContain('MM');
    expect(text).toContain('DS');
    expect(text).toContain('QW');
    expect(text).not.toContain('MG');
  });

  it('carries a status icon on every segment', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'deepseek', 'qwen'], t);
    expect(text).toContain('$(circle-slash)');
  });

  it('starts with the pulse codicon', () => {
    expect(renderStatusBarText({}, ['qwen'], t).startsWith('$(pulse)')).toBe(true);
  });
});

describe('StatusBarPresenter', () => {
  beforeEach(() => __reset());

  it('creates exactly one status bar item', () => {
    const presenter = new StatusBarPresenter(t);
    expect(state.statusBarItems).toHaveLength(1);
    presenter.dispose();
  });

  it('opens the dashboard when the item is clicked', () => {
    const presenter = new StatusBarPresenter(t);
    expect(state.statusBarItems[0]!.command).toBe('quotaDeck.openDashboard');
    presenter.dispose();
  });

  it('carries the rich tooltip on the item', () => {
    const presenter = new StatusBarPresenter(t);
    presenter.update({}, ['minimax-cn'], 'all', 'minimax-cn');
    const markdown = new vscode.MarkdownString('<div>hello</div>');
    presenter.setTooltip(markdown);
    const tooltip = state.statusBarItems[0]!.tooltip as { value: string };
    expect(tooltip.value).toContain('hello');
    presenter.dispose();
  });

  it('switches the click command', () => {
    const presenter = new StatusBarPresenter(t);
    presenter.setCommand('quotaDeck.configureMiniMax');
    expect(state.statusBarItems[0]!.command).toBe('quotaDeck.configureMiniMax');
    presenter.dispose();
  });

  it('uses transparent backgrounds and colored text below the configured threshold', () => {
    const presenter = new StatusBarPresenter(t);
    presenter.update(
      {
        'minimax-cn': makeSnapshot('minimax-cn', {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: { windows: [{ window: 'fiveHour', remainingPercent: 19, resetAt: null, unlimited: false }] },
          },
        }),
      },
      ['minimax-cn'],
      'all',
      'minimax-cn',
      20,
      { 'minimax-cn': true },
    );
    expect(state.statusBarItems[0]!.backgroundColor).toBeUndefined();
    expect((state.statusBarItems[0]!.color as { id: string }).id).toBe('charts.orange');
    presenter.dispose();
  });

  it('uses green text without a warning background when the five-hour window is healthy', () => {
    const presenter = new StatusBarPresenter(t);
    presenter.update(
      {
        'minimax-cn': makeSnapshot('minimax-cn', {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: {
              windows: [
                { window: 'fiveHour', remainingPercent: 92, resetAt: null, unlimited: false },
                { window: 'weekly', remainingPercent: 19, resetAt: null, unlimited: false },
              ],
            },
          },
        }),
      },
      ['minimax-cn'],
      'all',
      'minimax-cn',
      20,
      { 'minimax-cn': true },
    );
    expect(state.statusBarItems[0]!.backgroundColor).toBeUndefined();
    expect((state.statusBarItems[0]!.color as { id: string }).id).toBe('charts.green');
    presenter.dispose();
  });

  it('uses yellow text without a warning background in the caution stage', () => {
    const presenter = new StatusBarPresenter(t);
    presenter.update(
      {
        'minimax-cn': makeSnapshot('minimax-cn', {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: { windows: [{ window: 'fiveHour', remainingPercent: 49, resetAt: null, unlimited: false }] },
          },
        }),
      },
      ['minimax-cn'],
      'all',
      'minimax-cn',
      20,
      { 'minimax-cn': true },
    );
    expect(state.statusBarItems[0]!.backgroundColor).toBeUndefined();
    expect((state.statusBarItems[0]!.color as { id: string }).id).toBe('charts.yellow');
    presenter.dispose();
  });

  it('uses an error background at the critical threshold', () => {
    const presenter = new StatusBarPresenter(t);
    presenter.update(
      {
        'minimax-cn': makeSnapshot('minimax-cn', {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: { windows: [{ window: 'fiveHour', remainingPercent: 5, resetAt: null, unlimited: false }] },
          },
        }),
      },
      ['minimax-cn'],
      'all',
      'minimax-cn',
      20,
      { 'minimax-cn': true },
    );
    expect((state.statusBarItems[0]!.backgroundColor as { id: string }).id)
      .toBe('statusBarItem.errorBackground');
    expect(state.statusBarItems[0]!.color).toBe('#ffffff');
    presenter.dispose();
  });

  it('does not warn for providers hidden by focused mode', () => {
    const presenter = new StatusBarPresenter(t);
    presenter.update(
      {
        'minimax-cn': makeSnapshot('minimax-cn', {
          'minimax.plan': {
            kind: 'ok',
            fetchedAt: 'x',
            data: { windows: [{ window: 'fiveHour', remainingPercent: 19, resetAt: null, unlimited: false }] },
          },
        }),
        deepseek: makeSnapshot('deepseek', {
          'deepseek.balance': {
            kind: 'ok',
            fetchedAt: 'x',
            data: { entries: [{ currency: 'CNY', total: 10 }] },
          },
        }),
      },
      ['minimax-cn', 'deepseek'],
      'focused',
      'deepseek',
      20,
      { 'minimax-cn': true, deepseek: true },
    );
    expect(state.statusBarItems[0]!.backgroundColor).toBeUndefined();
    presenter.dispose();
  });
});

  it('adds the tightest Qwen Token Plan window to the balance segment', () => {
    const snapshots = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            availableAmount: -12.34,
            creditAmount: 5,
            mybankCreditAmount: 6,
            availableCashAmount: -18.34,
            quotaLimit: 1000,
            currency: 'CNY',
          },
        },
        'qwen.tokenPlan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            windows: [
              { cycle: 'monthly', usedRatio: 0.62, resetAt: null },
              { cycle: 'weekly', usedRatio: 0.9, resetAt: null },
            ],
          },
        },
      }),
    };

    expect(renderStatusBarText(snapshots, ['qwen'], t)).toBe(
      '$(pulse) QW $(warning) ¥-12.34 · Plan 10%',
    );
  });

  it('keeps the Qwen balance when the Token Plan capability failed', () => {
    const snapshots = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': {
          kind: 'ok',
          fetchedAt: 'x',
          data: {
            availableAmount: -12.34,
            creditAmount: 5,
            mybankCreditAmount: 6,
            availableCashAmount: -18.34,
            quotaLimit: 1000,
            currency: 'CNY',
          },
        },
        'qwen.tokenPlan': {
          kind: 'failed',
          error: { kind: 'auth', message: 'error.qwen.loginExpired' },
        },
      }),
    };

    expect(renderStatusBarText(snapshots, ['qwen'], t)).toBe(
      '$(pulse) QW $(dashboard) ¥-12.34',
    );
  });

  it('shows a live Qwen window when the balance is unavailable', () => {
    const snapshots = {
      qwen: makeSnapshot('qwen', {
        'qwen.accountBalance': {
          kind: 'failed',
          error: { kind: 'auth', message: 'error.auth' },
        },
        'qwen.tokenPlan': {
          kind: 'ok',
          fetchedAt: 'x',
          data: { windows: [{ cycle: 'monthly', usedRatio: 0.62, resetAt: null }] },
        },
      }),
    };

    expect(renderStatusBarText(snapshots, ['qwen'], t)).toBe(
      '$(pulse) QW $(warning) Plan 38%',
    );
  });
