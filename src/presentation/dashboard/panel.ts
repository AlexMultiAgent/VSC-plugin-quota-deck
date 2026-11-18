import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { isWebviewMessage } from './protocol';
import type { RangeId } from '../../core/time';
import type { DashboardModel } from './viewModel';

const VIEW_TYPE = 'quotaDeck.dashboard';

function nonce(): string {
  return randomBytes(24).toString('base64');
}

export class DashboardPanel {
  private panel: vscode.WebviewPanel | undefined;
  private model: DashboardModel | undefined;
  private range: RangeId = 'last7';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly title: string,
    private readonly onRangeChange: (range: RangeId) => void,
    private readonly onConfigure: () => void = () => undefined,
    private readonly onRefresh: () => void = () => undefined,
  ) {}

  show(): void {
    if (this.panel !== undefined) {
      this.panel.reveal();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      this.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
          vscode.Uri.joinPath(this.extensionUri, 'dist'),
        ],
      },
    );

    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!isWebviewMessage(message)) return;
      if (message.kind === 'ready') {
        void this.push();
        return;
      }
      if (message.kind === 'setRange') {
        this.range = message.range;
        this.onRangeChange(message.range);
        return;
      }
      if (message.kind === 'configure') {
        this.onConfigure();
        return;
      }
      if (message.kind === 'refresh') {
        this.onRefresh();
      }
    });
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.html = this.html();
  }

  update(model: DashboardModel): void {
    this.model = model;
    this.range = model.range;
    void this.push();
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private async push(): Promise<void> {
    if (this.panel === undefined || this.model === undefined) return;
    await this.panel.webview.postMessage({ kind: 'state', model: this.model, range: this.range });
  }

  private html(): string {
    const scriptNonce = nonce();
    const styleNonce = nonce();
    const localScript = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js');
    const scriptUri = this.panel === undefined
      ? localScript.toString()
      : this.panel.webview.asWebviewUri(localScript).toString();
    return (
      '<!DOCTYPE html>' +
      '<html lang="en">' +
      '<head>' +
      '<meta charset="UTF-8" />' +
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${scriptNonce}'; img-src data:; font-src 'none';">` +
      '<title>QuotaDeck CN</title>' +
      `<style nonce="${styleNonce}">${DASHBOARD_STYLES}</style>` +
      '</head>' +
      '<body><div id="app"><div class="webview-status" role="status">正在加载额度数据…</div></div>' +
      `<script nonce="${scriptNonce}" src="${scriptUri}"></script>` +
      '</body></html>'
    );
  }
}

const DASHBOARD_STYLES = `
:root { color-scheme: light dark; }
body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 16px; background: var(--vscode-editor-background); color: var(--vscode-foreground); }
body[data-loading="true"] #app { opacity: 0.55; transition: opacity 120ms ease-out; }
@media (prefers-reduced-motion: reduce) { body[data-loading="true"] #app { transition: none; } }
.webview-status { color: var(--vscode-descriptionForeground); margin: 24px 0 12px; }
.hero { font-size: 48px; font-weight: 600; line-height: 1.1; }
.hero-label { color: var(--vscode-descriptionForeground); font-size: 13px; }
.hero-source { color: var(--vscode-foreground); font-size: 13px; font-weight: 600; margin-top: 4px; }
.hero-section { margin-bottom: 16px; }
.action-row { display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 12px; }
.action-button { background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; color: var(--vscode-button-foreground); cursor: pointer; font: inherit; padding: 5px 12px; }
.action-button:hover { background: var(--vscode-button-hoverBackground); }
.action-button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
.tile { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; }
.tile-label { color: var(--vscode-descriptionForeground); font-size: 12px; }
.tile-value { font-size: 24px; font-weight: 600; }
.summary-section { margin-bottom: 20px; }
.summary-title { font-size: 15px; margin: 0 0 10px; }
.summary-group { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-bottom: 10px; padding: 12px; }
.summary-group-title { color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 600; margin: 0 0 8px; }
.summary-group .tiles { margin-bottom: 0; }
.filter-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.filter-button { background: transparent; border: 1px solid var(--vscode-panel-border); border-radius: 4px; color: var(--vscode-foreground); cursor: pointer; font: inherit; padding: 4px 10px; }
.filter-button.is-selected { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.filter-button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.providers { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 20px; }
.provider-card { border: 1px solid var(--vscode-panel-border); border-top-width: 3px; border-radius: 6px; padding: 12px; }
.provider-name { align-items: center; display: flex; font-size: 15px; gap: 8px; margin: 0 0 4px; }
.provider-dot { border-radius: 50%; display: inline-block; height: 10px; width: 10px; }
.provider-state, .provider-error { color: var(--vscode-descriptionForeground); font-size: 12px; }
.provider-balance { align-items: baseline; display: flex; gap: 6px; margin-top: 8px; }
.provider-balance-label { color: var(--vscode-descriptionForeground); font-size: 12px; }
.provider-balance-value { font-size: 16px; }
.provider-capabilities { display: grid; gap: 4px; margin: 10px 0 0; }
.provider-capability { display: flex; gap: 8px; justify-content: space-between; font-size: 12px; }
.provider-capability dt, .provider-capability dd { margin: 0; }
.provider-capability dd { color: var(--vscode-descriptionForeground); }
.provider-capability.is-positive dd { color: var(--vscode-testing-iconPassed); }
.provider-capability.is-warning dd { color: var(--vscode-editorWarning-foreground); }
.provider-capability.is-critical dd { color: var(--vscode-errorForeground); }
.provider-capability-message { color: var(--vscode-descriptionForeground); font-size: 11px; margin: -1px 0 3px; }
.provider-range-usage { align-items: baseline; display: flex; gap: 6px; margin-top: 8px; }
.provider-range-label { color: var(--vscode-descriptionForeground); font-size: 12px; }
.provider-range-value { font-variant-numeric: tabular-nums; }
.provider-error { color: var(--vscode-errorForeground); margin: 8px 0 0; }
.history-controls { margin: 4px 0 16px; }
.history-title { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
.filter-note { color: var(--vscode-descriptionForeground); font-size: 11px; margin: 8px 0 0; }
.meter { display: grid; grid-template-columns: 72px 1fr 48px; align-items: center; gap: 8px; margin-top: 6px; }
.meter-label, .meter-value { color: var(--vscode-descriptionForeground); font-size: 12px; }
.meter-value { font-variant-numeric: tabular-nums; text-align: right; }
.meter-value.is-positive { color: var(--vscode-testing-iconPassed); }
.meter-value.is-caution { color: var(--vscode-charts-yellow); }
.meter-value.is-warning { color: var(--vscode-charts-orange); }
.meter-value.is-critical { color: var(--vscode-errorForeground); font-weight: 600; }
.meter-track { background: var(--vscode-editorWidget-background); border-radius: 4px; height: 8px; overflow: hidden; }
.meter-fill { height: 100%; border-radius: 4px; }
.chart-card, .table-card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin-bottom: 12px; padding: 12px; }
.chart-title { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
.chart-body { position: relative; }
.chart { width: 100%; height: auto; }
.grid { stroke: var(--vscode-panel-border); }
.axis-label { fill: var(--vscode-descriptionForeground); font-size: 11px; }
.legend-label { fill: var(--vscode-foreground); font-size: 12px; }
.data-table { border-collapse: collapse; width: 100%; }
.data-table th, .data-table td { border-bottom: 1px solid var(--vscode-panel-border); padding: 6px 8px; text-align: left; }
.data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.qwen-matrix { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; }
.qwen-title { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
.qwen-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
.qwen-state { color: var(--vscode-descriptionForeground); }
.qwen-note { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 0 0 8px; }
`;
