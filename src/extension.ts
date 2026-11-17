import * as vscode from 'vscode';
import { SnapshotCache } from './core/cache';
import { Coordinator } from './core/coordinator';
import { HttpClient } from './core/http';
import { Scheduler } from './core/scheduler';
import { SecretStore } from './core/secrets';
import { readSettings } from './core/settings';
import type { RangeId } from './core/time';
import type { ConnectionState, ProviderId } from './core/types';
import { resolveLanguage, translatorFor } from './localization';
import { pricingState } from './providers/deepseek/pricing';
import { buildProviders } from './providers/registry';
import { registerCommands } from './presentation/commands';
import { clearCredential, configureDeepSeek, configureMiniMax } from './presentation/credentials';
import { DashboardPanel } from './presentation/dashboard/panel';
import { buildDashboardModel, type DashboardModel } from './presentation/dashboard/viewModel';
import { runOnboarding } from './presentation/onboarding';
import { buildFallbackItems } from './presentation/quickPickFallback';
import { StatusBarPresenter } from './presentation/statusBar';
import { buildSwitcherItems } from './presentation/switcher';
import { renderTooltip } from './presentation/tooltip';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  let settings = readSettings();
  let t = translatorFor(resolveLanguage(settings.language, vscode.env.language));
  const cache = new SnapshotCache({
    get: (key) => context.globalState.get(key),
    set: (key, value) => context.globalState.update(key, value),
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
    timeZone: settings.timeZone,
    onRateLimited: (retryAfterMs) => scheduler.pauseUntil(Date.now() + retryAfterMs),
  });
  const secrets = new SecretStore(context.secrets);
  const connectionState = new Map<ProviderId, ConnectionState>();
  for (const provider of providers) connectionState.set(provider.id, await provider.connect(secrets));

  let range: RangeId = 'last7';
  let lastRefreshIso: string | undefined;
  const dashboard = new DashboardPanel(context.extensionUri, t('dashboard.title'), (next) => {
    void selectRange(next);
  }, () => {
    void configureProviders();
  });

  function configuredProviders(): Partial<Record<ProviderId, boolean>> {
    const result: Partial<Record<ProviderId, boolean>> = {};
    for (const [id, state] of connectionState) {
      result[id] = state.kind === 'ready' || state.kind === 'partial';
    }
    return result;
  }

  function anyConfigured(): boolean {
    return Object.values(configuredProviders()).some((value) => value === true);
  }

  function currentModel(snapshots = coordinator.getLast()): DashboardModel {
    return buildDashboardModel({
      snapshots,
      order: settings.providerOrder,
      t,
      range,
      pricing: pricingState(Date.now()),
      warningThresholdPercent: settings.warningThresholdPercent,
    });
  }

  function refreshTooltip(): void {
    const markdown = new vscode.MarkdownString(
      renderTooltip(coordinator.getLast(), settings.providerOrder, t, lastRefreshIso, settings.timeZone),
    );
    markdown.supportHtml = true;
    markdown.isTrusted = false;
    statusBar.setTooltip(markdown);
  }

  async function refreshAll(): Promise<void> {
    const snapshots = await coordinator.refreshAll(range);
    lastRefreshIso = new Date().toISOString();
    statusBar.update(
      snapshots,
      settings.providerOrder,
      settings.statusBarMode,
      settings.primaryProvider,
      settings.warningThresholdPercent,
      configuredProviders(),
    );
    dashboard.update(currentModel(snapshots));
    refreshTooltip();
  }

  async function selectRange(next: RangeId): Promise<void> {
    range = next;
    await refreshAll();
  }

  async function reconnect(providerId: ProviderId): Promise<void> {
    const provider = providers.find((candidate) => candidate.id === providerId);
    if (provider === undefined) return;
    provider.dispose();
    connectionState.set(providerId, await provider.connect(secrets));
  }

  const writer = {
    configureMiniMax: async (providerId: 'minimax-cn' | 'minimax-global'): Promise<void> => {
      await configureMiniMax(secrets, providerId, t);
      await reconnect(providerId);
      await refreshAll();
    },
    configureDeepSeek: async (): Promise<void> => {
      await configureDeepSeek(secrets, t);
      await reconnect('deepseek');
      await refreshAll();
    },
  };

  async function configureProviders(): Promise<void> {
    await runOnboarding(writer, t, configuredProviders);
  }

  context.subscriptions.push(
    statusBar,
    dashboard,
    { dispose: () => scheduler.stop() },
    { dispose: () => coordinator.dispose() },
    ...registerCommands({
      refresh: () => scheduler.refreshNow(),
      openDashboard: async () => {
        if (!anyConfigured()) {
          await runOnboarding(writer, t, configuredProviders);
          return;
        }
        try {
          dashboard.show();
          dashboard.update(currentModel());
          refreshTooltip();
        } catch {
          const items = buildFallbackItems(coordinator.getLast(), settings.providerOrder, t);
          await vscode.window.showQuickPick(items, { title: 'QuotaDeck CN' });
        }
      },
      switchProvider: async () => {
        const items = buildSwitcherItems(configuredProviders(), t, settings.primaryProvider);
        const picked = await vscode.window.showQuickPick(items, { title: t('switcher.title') });
        if (picked === undefined || typeof picked !== 'object' || !('id' in picked)) return;
        await vscode.workspace
          .getConfiguration('quotaDeck')
          .update('statusBar.primaryProvider', picked.id);
        settings = readSettings();
        statusBar.update(
          coordinator.getLast(),
          settings.providerOrder,
          settings.statusBarMode,
          settings.primaryProvider,
          settings.warningThresholdPercent,
          configuredProviders(),
        );
        refreshTooltip();
      },
      configureMiniMax: async () => {
        await configureProviders();
      },
      configureDeepSeek: async () => {
        await writer.configureDeepSeek();
      },
      configureProviders,
      showHelp: async () => {
        await vscode.window.showInformationMessage(t('command.showHelp.message'));
      },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'quotaDeck.clearCredential',
      async (
        providerId: ProviderId,
        credential: 'api-key' | 'token-plan-key' | 'session-token' | 'web-cookie',
      ) => {
        const cleared = await clearCredential(secrets, providerId, credential, t);
        if (!cleared) return;
        await reconnect(providerId);
        await refreshAll();
      },
    ),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => scheduler.setFocused(state.focused)),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('quotaDeck')) return;
      settings = readSettings();
      t = translatorFor(resolveLanguage(settings.language, vscode.env.language));
      statusBar.setTranslator(t);
      scheduler.reconfigure({
        refreshIntervalMinutes: settings.refreshIntervalMinutes,
        pauseWhenUnfocused: settings.pauseWhenUnfocused,
      });
      void refreshAll();
    }),
  );

  scheduler.start(refreshAll);
  const cached = await coordinator.loadCached();
  const current = readSettings();
  statusBar.update(
    cached,
    current.providerOrder,
    current.statusBarMode,
    current.primaryProvider,
    current.warningThresholdPercent,
    configuredProviders(),
  );
  dashboard.update(currentModel(cached));
  refreshTooltip();
  void refreshAll();
}

export function deactivate(): void {}
