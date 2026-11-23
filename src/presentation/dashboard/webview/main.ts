import type { DashboardModel } from '../viewModel';
import type { DashboardLocalization } from '../locale';
import { renderDashboard } from './render';
import { createHostMessageHandler } from './hostMessages';

declare const acquireVsCodeApi: () => {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const app = document.getElementById('app');
let current: DashboardModel | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let loadingTimer: ReturnType<typeof setTimeout> | undefined;
type StatusKind = 'loading' | 'reloading' | 'failed';
let statusKind: StatusKind | undefined = 'loading';

/** Keep a dead host from leaving the dashboard dimmed forever. */
const LOADING_TIMEOUT_MS = 30_000;

function beginLoading(): void {
  document.body.dataset.loading = 'true';
  if (loadingTimer !== undefined) clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    loadingTimer = undefined;
    document.body.dataset.loading = 'false';
  }, LOADING_TIMEOUT_MS);
}

function endLoading(): void {
  if (loadingTimer !== undefined) {
    clearTimeout(loadingTimer);
    loadingTimer = undefined;
  }
  document.body.dataset.loading = 'false';
}

const fallbackLocalization: DashboardLocalization = {
  language: 'en-US',
  title: 'QuotaDeck CN',
  loading: 'Loading quota data…',
  reloading: 'Reloading quota data…',
  loadFailed: 'Quota data is temporarily unavailable.',
  retry: 'Reload',
};

function readLocalization(): DashboardLocalization {
  const data = document.body.dataset;
  return {
    language: data.dashboardLanguage === 'zh-CN' ? 'zh-CN' : 'en-US',
    title: data.title ?? fallbackLocalization.title,
    loading: data.loadingLabel ?? fallbackLocalization.loading,
    reloading: data.reloadingLabel ?? fallbackLocalization.reloading,
    loadFailed: data.loadFailedLabel ?? fallbackLocalization.loadFailed,
    retry: data.retryLabel ?? fallbackLocalization.retry,
  };
}

let localization = readLocalization();

function requestState(): void {
  vscode.postMessage({ kind: 'ready' });
}

function showStatus(kind: StatusKind): void {
  if (!app || current) return;
  statusKind = kind;
  const status = document.createElement('div');
  status.className = 'webview-status';
  status.setAttribute('role', 'status');
  status.textContent =
    kind === 'loading'
      ? localization.loading
      : kind === 'reloading'
        ? localization.reloading
        : localization.loadFailed;
  app.replaceChildren(status);
  if (kind !== 'failed') return;
  const retry = document.createElement('button');
  retry.className = 'action-button';
  retry.type = 'button';
  retry.textContent = localization.retry;
  retry.addEventListener('click', () => {
    showStatus('reloading');
    requestState();
  });
  app.appendChild(retry);
}

function applyLocalization(next: DashboardLocalization): void {
  localization = next;
  document.documentElement.lang = next.language;
  document.body.dataset.dashboardLanguage = next.language;
  document.body.dataset.title = next.title;
  document.body.dataset.loadingLabel = next.loading;
  document.body.dataset.reloadingLabel = next.reloading;
  document.body.dataset.loadFailedLabel = next.loadFailed;
  document.body.dataset.retryLabel = next.retry;
  if (statusKind !== undefined) showStatus(statusKind);
}

function scheduleInitialRetry(): void {
  retryTimer = setTimeout(() => {
    if (current) return;
    requestState();
    retryTimer = setTimeout(() => {
      if (current) return;
      showStatus('failed');
    }, 3_000);
  }, 1_200);
}

function draw(): void {
  if (!app || !current) return;
  if (retryTimer !== undefined) clearTimeout(retryTimer);
  endLoading();
  statusKind = undefined;
  renderDashboard(app, current, {
    onRangeChange: (range) => {
      beginLoading();
      vscode.postMessage({ kind: 'setRange', range });
    },
    onConfigure: () => {
      vscode.postMessage({ kind: 'configure' });
    },
    onRefresh: () => {
      beginLoading();
      vscode.postMessage({ kind: 'refresh' });
    },
  });
}

window.addEventListener('message', createHostMessageHandler(window.location.origin, (message) => {
  if (message.kind === 'locale') {
    applyLocalization(message.localization);
    return;
  }
  current = message.model;
  vscode.setState({ range: message.range });
  draw();
}));

window.addEventListener('load', () => {
  requestState();
  scheduleInitialRetry();
});
