import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { isWebviewMessage } from './protocol';
import type { RangeId } from '../../core/time';
import type { DashboardModel } from './viewModel';
import type { DashboardLocalization } from './locale';

const VIEW_TYPE = 'quotaDeck.dashboard';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function nonce(): string {
  return randomBytes(24).toString('base64');
}

export class DashboardPanel {
  private panel: vscode.WebviewPanel | undefined;
  private model: DashboardModel | undefined;
  private range: RangeId = 'last7';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private localization: DashboardLocalization,
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
      this.localization.title,
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
        void this.bootstrap();
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
    void this.pushState();
  }

  setLocalization(localization: DashboardLocalization): void {
    this.localization = localization;
    if (this.panel === undefined) return;
    this.panel.title = localization.title;
    void this.pushLocalization();
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private async bootstrap(): Promise<void> {
    await this.pushLocalization();
    await this.pushState();
  }

  private async pushLocalization(): Promise<void> {
    if (this.panel === undefined) return;
    await this.panel.webview.postMessage({
      kind: 'locale',
      localization: this.localization,
    });
  }

  private async pushState(): Promise<void> {
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
      `<html lang="${escapeHtml(this.localization.language)}">` +
      '<head>' +
      '<meta charset="UTF-8" />' +
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${scriptNonce}'; img-src data:; font-src 'none';">` +
      `<title>${escapeHtml(this.localization.title)}</title>` +
      `<style nonce="${styleNonce}">${DASHBOARD_STYLES}</style>` +
      '</head>' +
      `<body data-dashboard-language="${escapeHtml(this.localization.language)}"` +
      ` data-title="${escapeHtml(this.localization.title)}"` +
      ` data-loading-label="${escapeHtml(this.localization.loading)}"` +
      ` data-reloading-label="${escapeHtml(this.localization.reloading)}"` +
      ` data-load-failed-label="${escapeHtml(this.localization.loadFailed)}"` +
      ` data-retry-label="${escapeHtml(this.localization.retry)}">` +
      `<div id="app"><div class="webview-status" role="status">${escapeHtml(this.localization.loading)}</div></div>` +
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
.hero { font-size: 42px; font-weight: 600; line-height: 1.1; }
.hero-label { color: var(--vscode-descriptionForeground); font-size: 13px; }
.hero-source { color: var(--vscode-foreground); font-size: 13px; font-weight: 600; margin-top: 4px; }
.hero-section { border: 1px solid var(--vscode-panel-border); border-radius: 8px; margin-bottom: 16px; padding: 16px 18px; }
.action-row { display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 12px; }
.action-button { background: var(--vscode-button-background); border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; color: var(--vscode-button-foreground); cursor: pointer; font: inherit; padding: 5px 12px; }
.action-button:hover { background: var(--vscode-button-hoverBackground); }
.action-button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.history-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.history-tiles.is-single { grid-template-columns: minmax(0, 1fr); }
.tile { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 12px; }
.tile-label { color: var(--vscode-descriptionForeground); font-size: 12px; }
.tile-value { font-size: 24px; font-weight: 600; }
.filter-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.filter-button { background: transparent; border: 1px solid var(--vscode-panel-border); border-radius: 4px; color: var(--vscode-foreground); cursor: pointer; font: inherit; padding: 4px 10px; }
.filter-button.is-selected { border-color: var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.filter-button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.providers { display: grid; gap: 16px; margin-bottom: 20px; }
.provider-card { border: 1px solid var(--vscode-panel-border); border-top-width: 3px; border-radius: 8px; padding: 16px 18px; }
.provider-header { align-items: center; display: flex; gap: 12px; justify-content: space-between; margin-bottom: 12px; }
.provider-name { align-items: center; display: flex; font-size: 17px; gap: 8px; margin: 0; }
.provider-dot { border-radius: 50%; display: inline-block; height: 10px; width: 10px; }
.provider-badges { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.provider-state, .provider-error { color: var(--vscode-descriptionForeground); font-size: 12px; }
.provider-state { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 8px; }
.provider-state.is-hours { color: var(--vscode-charts-green); }
.provider-account { align-items: baseline; display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.provider-account-label { color: var(--vscode-descriptionForeground); font-size: 12px; }
.provider-account-value { font-size: 26px; font-variant-numeric: tabular-nums; }
.provider-details { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 14px 0 0; }
.provider-detail { border: 1px solid var(--vscode-panel-border); border-radius: 6px; display: flex; gap: 12px; justify-content: space-between; padding: 8px 10px; }
.provider-detail dt { color: var(--vscode-descriptionForeground); font-size: 12px; }
.provider-detail dd { font-size: 12px; font-variant-numeric: tabular-nums; margin: 0; text-align: right; }
.provider-note { border-left: 2px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); font-size: 11px; margin: 14px 0 0; padding-left: 10px; }
.provider-error { color: var(--vscode-errorForeground); margin: 8px 0 0; }
.history-section { margin: 4px 0 16px; }
.history-title { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
.history-group { margin-top: 12px; }
.history-group-title { color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 600; margin: 0 0 8px; }
.filter-note { color: var(--vscode-descriptionForeground); font-size: 11px; margin: 8px 0 0; }
.meter-list { display: grid; gap: 12px; margin-top: 4px; }
.meter { display: grid; gap: 5px; }
.meter-head { align-items: baseline; display: flex; gap: 12px; justify-content: space-between; }
.meter-label { font-size: 13px; font-weight: 600; }
.meter-value { color: var(--vscode-descriptionForeground); font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }
.meter-value.is-positive { color: var(--vscode-testing-iconPassed); }
.meter-value.is-caution { color: var(--vscode-charts-yellow); }
.meter-value.is-warning { color: var(--vscode-charts-orange); }
.meter-value.is-critical { color: var(--vscode-errorForeground); font-weight: 600; }
.meter-track { background: var(--vscode-editorWidget-background); border-radius: 4px; height: 9px; overflow: hidden; }
.meter-fill { height: 100%; border-radius: 4px; }
.meter-reset { color: var(--vscode-descriptionForeground); font-size: 11px; }
@media (max-width: 560px) {
  body { padding: 12px; }
  .action-row, .provider-header { align-items: stretch; flex-direction: column; }
  .provider-badges { justify-content: flex-start; }
  .hero { font-size: 36px; }
}
`;
