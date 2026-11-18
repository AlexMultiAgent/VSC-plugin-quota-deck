import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TreeItemCollapsibleState, __reset } from '../../test/__mocks__/vscode';
import type { OverviewItem } from './model';
import { QuotaOverviewProvider } from './provider';

const leaf: OverviewItem = {
  id: 'provider:minimax-cn:window:fiveHour',
  label: '5 小时',
  description: '剩余 100% · 已使用 0%',
  tooltip: '5 小时\n剩余 100%',
  state: 'positive',
  stateLabel: '正常',
  action: null,
  children: [],
};

const provider: OverviewItem = {
  id: 'provider:minimax-cn',
  label: 'MiniMax CN',
  description: '每周 22%',
  tooltip: 'MiniMax CN',
  state: 'warning',
  stateLabel: '额度偏低',
  action: { kind: 'openDashboard', title: 'Open Dashboard' },
  children: [leaf],
};

describe('QuotaOverviewProvider', () => {
  beforeEach(() => __reset());

  it('maps item state, hierarchy, and provider click action', () => {
    const tree = new QuotaOverviewProvider();
    tree.update([provider]);
    const node = tree.getTreeItem(tree.getChildren()[0]!);
    expect(node.id).toBe('provider:minimax-cn');
    expect(node.description).toBe('每周 22%');
    expect(node.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
    expect(node.command).toEqual({
      command: 'quotaDeck.openDashboard',
      title: 'Open Dashboard',
    });
    expect(node.iconPath).toEqual(expect.objectContaining({ id: 'warning' }));
    expect(node.iconPath).toEqual(expect.objectContaining({
      color: expect.objectContaining({ id: 'charts.orange' }),
    }));
    expect(tree.getChildren(provider)[0]).toBe(leaf);
  });

  it('maps the empty configuration action to its command', () => {
    const tree = new QuotaOverviewProvider();
    const configure: OverviewItem = {
      ...provider,
      id: 'configure',
      label: '配置服务商',
      state: 'muted',
      action: { kind: 'configureProviders', title: '配置服务商' },
      children: [],
    };
    tree.update([configure]);
    expect(tree.getTreeItem(configure).command).toEqual({
      command: 'quotaDeck.configureProviders',
      title: '配置服务商',
    });
  });

  it('leaves detail rows unclickable and collapsed', () => {
    const tree = new QuotaOverviewProvider();
    const node = tree.getTreeItem(leaf);
    expect(node.command).toBeUndefined();
    expect(node.collapsibleState).toBe(TreeItemCollapsibleState.None);
  });

  it('fires a change event on update', () => {
    const tree = new QuotaOverviewProvider();
    const listener = vi.fn();
    tree.onDidChangeTreeData(listener);
    tree.update([provider]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
