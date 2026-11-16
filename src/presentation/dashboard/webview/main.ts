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

function draw(): void {
  if (!app || !current) return;
  document.body.dataset.loading = 'false';
  renderDashboard(app, current, {
    onRangeChange: (range) => {
      document.body.dataset.loading = 'true';
      vscode.postMessage({ kind: 'setRange', range });
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
  vscode.postMessage({ kind: 'ready' });
});
