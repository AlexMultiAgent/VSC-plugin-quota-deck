import * as vscode from 'vscode';
import { SnapshotCache } from './core/cache';
import { Coordinator } from './core/coordinator';
import { HttpClient } from './core/http';
import { Scheduler } from './core/scheduler';
import { SecretStore } from './core/secrets';
import { readSettings } from './core/settings';
import { resolveLanguage, translatorFor } from './localization';
import { buildProviders } from './providers/registry';
import { registerCommands } from './presentation/commands';
import { StatusBarPresenter } from './presentation/statusBar';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const settings = readSettings();
  const t = translatorFor(resolveLanguage(settings.language, vscode.env.language));

  const cache = new SnapshotCache({
    get: (key) => context.globalState.get(key),
    set: (key, value) => void context.globalState.update(key, value),
  });

  const http = new HttpClient({ timeoutMs: 15_000, maxAttempts: 3 });
  const providers = buildProviders(http);
  const statusBar = new StatusBarPresenter(t);
  const scheduler = new Scheduler({
    refreshIntervalMinutes: settings.refreshIntervalMinutes,
    pauseWhenUnfocused: settings.pauseWhenUnfocused,
  });
  const coordinator = new Coordinator({
    providers,
    cache,
    onRateLimited: (retryAfterMs) => scheduler.pauseUntil(Date.now() + retryAfterMs),
  });
  const secrets = new SecretStore(context.secrets);
  for (const provider of providers) await provider.connect(secrets);

  const refreshAll = async (): Promise<void> => {
    const snapshots = await coordinator.refreshAll();
    const current = readSettings();
    statusBar.update(snapshots, current.providerOrder, current.statusBarMode, current.primaryProvider);
  };

  context.subscriptions.push(
    statusBar,
    { dispose: () => scheduler.stop() },
    { dispose: () => coordinator.dispose() },
    ...registerCommands({
      refresh: () => scheduler.refreshNow(),
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

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => scheduler.setFocused(state.focused)),
  );

  scheduler.start(refreshAll);
  const cached = await coordinator.loadCached();
  statusBar.update(cached, settings.providerOrder, settings.statusBarMode, settings.primaryProvider);
  void refreshAll();
}

export function deactivate(): void {}
