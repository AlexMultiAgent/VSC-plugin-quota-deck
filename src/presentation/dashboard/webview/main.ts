import { isHostMessage } from '../protocol';
import type { DashboardModel } from '../viewModel';
import { renderDashboard } from './render';

declare const acquireVsCodeApi: () => {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();
const app = document.getElementById('app');
let current: DashboardModel | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function requestState(): void {
  vscode.postMessage({ kind: 'ready' });
}

function showStatus(message: string, retryLabel?: string): void {
  if (!app || current) return;
  const status = document.createElement('div');
  status.className = 'webview-status';
  status.setAttribute('role', 'status');
  status.textContent = message;
  app.replaceChildren(status);
  if (retryLabel === undefined) return;
  const retry = document.createElement('button');
  retry.className = 'action-button';
  retry.type = 'button';
  retry.textContent = retryLabel;
  retry.addEventListener('click', () => {
    showStatus('正在重新加载额度数据…');
    requestState();
  });
  app.appendChild(retry);
}

function scheduleInitialRetry(): void {
  retryTimer = setTimeout(() => {
    if (current) return;
    requestState();
    retryTimer = setTimeout(() => {
      if (current) return;
      showStatus('暂时无法接收额度数据。', '重新加载');
    }, 3_000);
  }, 1_200);
}

function draw(): void {
  if (!app || !current) return;
  if (retryTimer !== undefined) clearTimeout(retryTimer);
  document.body.dataset.loading = 'false';
  renderDashboard(app, current, {
    onRangeChange: (range) => {
      document.body.dataset.loading = 'true';
      vscode.postMessage({ kind: 'setRange', range });
    },
    onConfigure: () => {
      vscode.postMessage({ kind: 'configure' });
    },
    onRefresh: () => {
      vscode.postMessage({ kind: 'refresh' });
    },
  });
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isHostMessage(event.data) || event.data.kind !== 'state') return;
  current = event.data.model;
  vscode.setState({ range: event.data.range });
  draw();
});

window.addEventListener('load', () => {
  requestState();
  scheduleInitialRetry();
});
