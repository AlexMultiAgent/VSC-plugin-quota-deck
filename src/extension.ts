import * as vscode from 'vscode';
import { SnapshotCache } from './core/cache';
import { Coordinator } from './core/coordinator';
import { readSettings } from './core/settings';
import { resolveLanguage, translatorFor } from './localization';
import { registerCommands } from './presentation/commands';
import { StatusBarPresenter } from './presentation/statusBar';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const settings = readSettings();
  const t = translatorFor(resolveLanguage(settings.language, vscode.env.language));

  const cache = new SnapshotCache({
    get: (key) => context.globalState.get(key),
    set: (key, value) => void context.globalState.update(key, value),
  });

  const coordinator = new Coordinator({ providers: [], cache });
  const statusBar = new StatusBarPresenter(t);

  context.subscriptions.push(
    statusBar,
    { dispose: () => coordinator.dispose() },
    ...registerCommands({
      refresh: async () => {
        await coordinator.refreshAll();
        statusBar.update();
      },
      openDashboard: async () => {
        await vscode.window.showInformationMessage('仪表盘将在后续版本提供。');
      },
      switchProvider: async () => {
        await vscode.window.showInformationMessage('切换服务商将在后续版本提供。');
      },
      configureMiniMax: async () => {
        await vscode.window.showInformationMessage('凭据配置将在后续版本提供。');
      },
      configureDeepSeek: async () => {
        await vscode.window.showInformationMessage('凭据配置将在后续版本提供。');
      },
      showHelp: async () => {
        await vscode.window.showInformationMessage('QuotaDeck CN — 国产大模型额度监控');
      },
    }),
  );

  statusBar.update();
}

export function deactivate(): void {}
