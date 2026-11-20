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
import { pricingState, type PricingState } from './providers/deepseek/pricing';
import { ENDPOINTS } from './providers/endpoints';
import { buildProviders, QWEN_AUTH_ORIGIN } from './providers/registry';
import { registerCommands } from './presentation/commands';
import {
  clearCredential,
  configureDeepSeek,
  configureMiniMax,
  pickStoredCredential,
} from './presentation/credentials';
import { buildHealthReport, writeHealthReport } from './presentation/health';
import { showHelp } from './presentation/help';
import { DashboardPanel } from './presentation/dashboard/panel';
import { dashboardLocalization } from './presentation/dashboard/locale';
import { buildDashboardModel, type DashboardModel } from './presentation/dashboard/viewModel';
import { runOnboarding } from './presentation/onboarding';
import { buildOverviewItems } from './presentation/overview/model';
import { QuotaOverviewProvider } from './presentation/overview/provider';
import { loginQwen } from './presentation/qwenLogin';
import { buildFallbackItems } from './presentation/quickPickFallback';
import { StatusBarPresenter } from './presentation/statusBar';
import { buildSwitcherItems } from './presentation/switcher';
import { renderTooltip } from './presentation/tooltip';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  let settings = readSettings();
  let language = resolveLanguage(settings.language, vscode.env.language);
  let t = translatorFor(language);
  const cache = new SnapshotCache({
    get: (key) => context.globalState.get(key),
    set: (key, value) => context.globalState.update(key, value),
  });
  const http = new HttpClient({ timeoutMs: 15_000, maxAttempts: 3 });
  const providers = buildProviders(http);
  const statusBar = new StatusBarPresenter(t);
  const overview = new QuotaOverviewProvider();
  const healthChannel = vscode.window.createOutputChannel('QuotaDeck CN');
  const overviewView = vscode.window.createTreeView('quotaDeck.overview', {
    treeDataProvider: overview,
    canSelectMany: false,
    showCollapseAll: true,
  });
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
  const dashboard = new DashboardPanel(context.extensionUri, dashboardLocalization(language, t), (next) => {
    void selectRange(next);
  }, () => {
    void configureProviders();
  }, () => {
    void scheduler.refreshNow();
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

  function currentModel(
    snapshots = coordinator.getLast(),
    pricing: PricingState = pricingState(Date.now()),
  ): DashboardModel {
    return buildDashboardModel({
      snapshots,
      order: settings.providerOrder,
      t,
      range,
      pricing,
      timeZone: settings.timeZone,
      warningThresholdPercent: settings.warningThresholdPercent,
    });
  }

  function refreshTooltip(pricing: PricingState = pricingState(Date.now())): void {
    const markdown = new vscode.MarkdownString(
      renderTooltip(
        coordinator.getLast(),
        settings.providerOrder,
        t,
        lastRefreshIso,
        settings.timeZone,
        pricing,
      ),
    );
    markdown.supportHtml = true;
    markdown.isTrusted = false;
    statusBar.setTooltip(markdown);
  }

  function updateOverview(
    snapshots = coordinator.getLast(),
    pricing: PricingState = pricingState(Date.now()),
  ): void {
    overview.update(buildOverviewItems({
      snapshots,
      configured: configuredProviders(),
      order: settings.providerOrder,
      t,
      pricing,
      timeZone: settings.timeZone,
      warningThresholdPercent: settings.warningThresholdPercent,
      lastRefreshIso,
    }));
  }

  async function refreshAll(): Promise<void> {
    const snapshots = await coordinator.refreshAll(range);
    const pricing = pricingState(Date.now());
    lastRefreshIso = new Date().toISOString();
    statusBar.update(
      snapshots,
      settings.providerOrder,
      settings.statusBarMode,
      settings.primaryProvider,
      settings.warningThresholdPercent,
      configuredProviders(),
      pricing,
    );
    dashboard.update(currentModel(snapshots, pricing));
    refreshTooltip(pricing);
    updateOverview(snapshots, pricing);
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
    loginQwen: async (): Promise<void> => {
      const signedIn = await loginQwen(secrets, context, t, http, {
        origin: QWEN_AUTH_ORIGIN,
        codePath: ENDPOINTS['qwen.deviceCode'],
        tokenPath: ENDPOINTS['qwen.devicePoll'],
      });
      if (!signedIn) return;
      await reconnect('qwen');
      await refreshAll();
    },
  };

  async function configureProviders(): Promise<void> {
    await runOnboarding(writer, t, configuredProviders);
  }

  context.subscriptions.push(
    statusBar,
    dashboard,
    overview,
    overviewView,
    healthChannel,
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
          const pricing = pricingState(Date.now());
          dashboard.update(currentModel(undefined, pricing));
          refreshTooltip(pricing);
          await refreshAll();
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
        const pricing = pricingState(Date.now());
        statusBar.update(
          coordinator.getLast(),
          settings.providerOrder,
          settings.statusBarMode,
          settings.primaryProvider,
          settings.warningThresholdPercent,
          configuredProviders(),
          pricing,
        );
        refreshTooltip(pricing);
      },
      configureMiniMax: async () => {
        await configureProviders();
      },
      configureDeepSeek: async () => {
        await writer.configureDeepSeek();
      },
      loginQwen: async () => {
        await writer.loginQwen();
      },
      configureProviders,
      showHelp: () => showHelp(t),
      checkConnection: async () => {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: t('health.checking'),
          },
          async () => {
            await refreshAll();
          },
        );
        writeHealthReport(
          healthChannel,
          buildHealthReport({
            providers,
            snapshots: coordinator.getLast(),
            connection: connectionState,
            order: settings.providerOrder,
            t,
            timeZone: settings.timeZone,
            now: Date.now(),
          }),
        );
      },
      openSettings: async () => {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:alexmultiagent.quota-deck',
        );
      },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('quotaDeck.clearCredential', async () => {
      const target = await pickStoredCredential(secrets, t);
      if (target === undefined) return;
      const cleared = await clearCredential(secrets, target.providerId, target.credential, t);
      if (!cleared) return;
      await reconnect(target.providerId);
      await refreshAll();
    }),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => scheduler.setFocused(state.focused)),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('quotaDeck')) return;
      settings = readSettings();
      language = resolveLanguage(settings.language, vscode.env.language);
      t = translatorFor(language);
      statusBar.setTranslator(t);
      dashboard.setLocalization(dashboardLocalization(language, t));
      coordinator.setTimeZone(settings.timeZone);
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
  const pricing = pricingState(Date.now());
  statusBar.update(
    cached,
    current.providerOrder,
    current.statusBarMode,
    current.primaryProvider,
    current.warningThresholdPercent,
    configuredProviders(),
    pricing,
  );
  dashboard.update(currentModel(cached, pricing));
  refreshTooltip(pricing);
  updateOverview(cached, pricing);
  void refreshAll();
}

export function deactivate(): void {}
