import * as vscode from 'vscode';
import type { OverviewItem, OverviewState } from './model';

const STATE_ICON: Record<OverviewState, { icon: string; color: string }> = {
  positive: { icon: 'circle-filled', color: 'charts.green' },
  warning: { icon: 'warning', color: 'charts.orange' },
  critical: { icon: 'error', color: 'errorForeground' },
  failed: { icon: 'error', color: 'errorForeground' },
  stale: { icon: 'history', color: 'descriptionForeground' },
  muted: { icon: 'circle-outline', color: 'descriptionForeground' },
};

export class QuotaOverviewProvider implements vscode.TreeDataProvider<OverviewItem> {
  private items: readonly OverviewItem[] = [];
  private readonly emitter = new vscode.EventEmitter<
    void | OverviewItem | null | undefined
  >();

  readonly onDidChangeTreeData = this.emitter.event;

  update(items: readonly OverviewItem[]): void {
    this.items = items;
    this.emitter.fire(undefined);
  }

  getTreeItem(element: OverviewItem): vscode.TreeItem {
    const node = new vscode.TreeItem(
      element.label,
      element.children.length === 0
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed,
    );
    const icon = STATE_ICON[element.state];
    node.id = element.id;
    node.description = element.description;
    node.tooltip = element.tooltip;
    node.iconPath = new vscode.ThemeIcon(
      icon.icon,
      new vscode.ThemeColor(icon.color),
    );
    if (element.action !== null) {
      node.command = {
        command:
          element.action.kind === 'openDashboard'
            ? 'quotaDeck.openDashboard'
            : 'quotaDeck.configureProviders',
        title: element.action.title,
      };
    }
    return node;
  }

  getChildren(element?: OverviewItem): OverviewItem[] {
    return element === undefined ? [...this.items] : [...element.children];
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
