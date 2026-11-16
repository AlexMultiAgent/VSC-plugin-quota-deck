import * as vscode from 'vscode';
import type { Translator } from '../localization';
import type { ProviderId, ProviderSnapshot } from '../core/types';

export class StatusBarPresenter {
  private readonly item: vscode.StatusBarItem;
  private readonly t: Translator;

  constructor(t: Translator) {
    this.t = t;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'quotaDeck.openDashboard';
  }

  update(
    _snapshots?: Partial<Record<ProviderId, ProviderSnapshot>>,
    _order?: ProviderId[],
    _mode?: 'all' | 'focused',
    _primary?: ProviderId,
  ): void {
    this.item.text = `${this.t('statusBar.title')}  ${this.t('statusBar.segment.unavailable')}`;
    this.item.tooltip = this.t('statusBar.tooltip.header');
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
