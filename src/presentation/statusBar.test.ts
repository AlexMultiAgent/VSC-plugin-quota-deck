import { beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { __reset, state } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { makeSnapshot } from '../test/helpers/snapshot';
import { formatBalance, renderStatusBarText, StatusBarPresenter } from './statusBar';

const t = translatorFor('en-US');

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

  it('shows the title and the provider segments', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'deepseek'], t);
    expect(text).toContain('QuotaDeck CN');
    expect(text).toContain('MM');
    expect(text).toContain('DS');
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

  it('drops the trailing segments and appends a count', () => {
    const text = renderStatusBarText({}, ['minimax-cn', 'minimax-global', 'deepseek', 'qwen'], t);
    expect(text).toMatch(/\+\d/);
    expect(text).not.toContain('QW');
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
});
