import * as vscode from 'vscode';
import { SnapshotCache } from './core/cache';
import { Coordinator } from './core/coordinator';
import { HttpClient } from './core/http';
import { Scheduler } from './core/scheduler';
import { SecretStore } from './core/secrets';
import { readSettings } from './core/settings';
import type { RangeId } from './core/time';
import { resolveLanguage, translatorFor } from './localization';
import { pricingState } from './providers/deepseek/pricing';
import { buildProviders } from './providers/registry';
import { registerCommands } from './presentation/commands';
import { DashboardPanel } from './presentation/dashboard/panel';
import { buildDashboardModel, type DashboardModel } from './presentation/dashboard/viewModel';
import { buildFallbackItems } from './presentation/quickPickFallback';
import { StatusBarPresenter } from './presentation/statusBar';
import { renderTooltip } from './presentation/tooltip';

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

  let range: RangeId = 'last7';
  let lastRefreshIso: string | undefined;

  const dashboard = new DashboardPanel(context.extensionUri, t('dashboard.title'), (next) => {
    void selectRange(next);
  });

  function currentModel(snapshots = coordinator.getLast()): DashboardModel {
    const current = readSettings();
    return buildDashboardModel({
      snapshots,
      order: current.providerOrder,
      t,
      range,
      pricing: pricingState(Date.now()),
    });
  }

  function refreshTooltip(): void {
    const current = readSettings();
    const markdown = new vscode.MarkdownString(
      renderTooltip(coordinator.getLast(), current.providerOrder, t, lastRefreshIso),
    );
    markdown.supportHtml = true;
    markdown.isTrusted = false;
    statusBar.setTooltip(markdown);
  }

  async function refreshAll(): Promise<void> {
    const snapshots = await coordinator.refreshAll(range);
    lastRefreshIso = new Date().toISOString();
    const current = readSettings();
    statusBar.update(snapshots, current.providerOrder, current.statusBarMode, current.primaryProvider);
    dashboard.update(currentModel(snapshots));
    refreshTooltip();
  }

  async function selectRange(next: RangeId): Promise<void> {
    range = next;
    await refreshAll();
  }

  context.subscriptions.push(
    statusBar,
    dashboard,
    { dispose: () => scheduler.stop() },
    { dispose: () => coordinator.dispose() },
    ...registerCommands({
      refresh: () => scheduler.refreshNow(),
      openDashboard: async () => {
        try {
          dashboard.show();
          dashboard.update(currentModel());
          refreshTooltip();
        } catch {
          const current = readSettings();
          const items = buildFallbackItems(coordinator.getLast(), current.providerOrder);
          await vscode.window.showQuickPick(items, { title: 'QuotaDeck CN' });
        }
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
  const current = readSettings();
  statusBar.update(cached, current.providerOrder, current.statusBarMode, current.primaryProvider);
  dashboard.update(currentModel(cached));
  refreshTooltip();
  void refreshAll();
}

export function deactivate(): void {}
