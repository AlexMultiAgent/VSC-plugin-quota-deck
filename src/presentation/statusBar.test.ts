import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, state } from '../test/__mocks__/vscode';
import { translatorFor } from '../localization';
import { StatusBarPresenter } from './statusBar';

describe('StatusBarPresenter', () => {
  beforeEach(() => __reset());

  it('creates one status bar item and shows it', () => {
    const presenter = new StatusBarPresenter(translatorFor('zh-CN'));
    presenter.update({}, []);
    expect(state.statusBarItems).toHaveLength(1);
    expect(state.statusBarItems[0]!.visible).toBe(true);
  });

  it('shows the product title before any provider is configured', () => {
    const presenter = new StatusBarPresenter(translatorFor('zh-CN'));
    presenter.update({}, []);
    expect(state.statusBarItems[0]!.text).toContain('QuotaDeck CN');
  });
});
