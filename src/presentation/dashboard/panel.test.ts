import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, state, Uri, ViewColumn, window as mockWindow } from '../../test/__mocks__/vscode';
import { translatorFor } from '../../localization';
import { buildDashboardModel } from './viewModel';
import { DashboardPanel } from './panel';

const t = translatorFor('en-US');
const englishLocalization = {
  language: 'en-US',
  title: 'QuotaDeck CN',
  loading: 'Loading quota data…',
  reloading: 'Reloading quota data…',
  loadFailed: 'Quota data is temporarily unavailable.',
  retry: 'Reload',
} as const;
const chineseLocalization = {
  language: 'zh-CN',
  title: 'QuotaDeck CN — 用量与洞察',
  loading: '正在加载额度数据…',
  reloading: '正在重新加载额度数据…',
  loadFailed: '暂时无法接收额度数据。',
  retry: '重新加载',
} as const;

describe('DashboardPanel', () => {
  beforeEach(() => __reset());

  it('creates a webview panel with a nonce content security policy', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), englishLocalization, () => undefined);
    panel.show();
    const html = state.webviewPanels[0]!.webview.html;
    expect(html).toContain("default-src 'none'");
    expect(html).toMatch(/nonce-[A-Za-z0-9+/=]+/);
    expect(html).toContain('vscode-resource:');
    expect(html).toContain('<html lang="en-US">');
    expect(html).toContain('data-title="QuotaDeck CN"');
    expect(html).toContain('Loading quota data');
  });

  it('uses the localized title', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), chineseLocalization, () => undefined);
    panel.show();
    expect(state.webviewPanels[0]!.title).toBe('QuotaDeck CN — 用量与洞察');
  });

  it('updates an open panel when the localization changes', async () => {
    const panel = new DashboardPanel(Uri.file('/ext'), chineseLocalization, () => undefined);
    panel.show();
    panel.setLocalization(englishLocalization);
    await Promise.resolve();

    const webview = state.webviewPanels[0]!.webview;
    expect(state.webviewPanels[0]!.title).toBe('QuotaDeck CN');
    expect(webview.postedMessages.at(-1)).toEqual({
      kind: 'locale',
      localization: englishLocalization,
    });
  });

  it('posts localization before state when the webview is ready', async () => {
    const panel = new DashboardPanel(Uri.file('/ext'), englishLocalization, () => undefined);
    panel.show();
    const model = buildDashboardModel({ snapshots: {}, order: ['deepseek'], t, range: 'last7', pricing: 'peak' });
    panel.update(model);
    const webview = state.webviewPanels[0]!.webview;
    webview.postedMessages.length = 0;

    webview.receiveMessage({ kind: 'ready' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(webview.postedMessages.map((message) =>
      typeof message === 'object' && message !== null && 'kind' in message
        ? message.kind
        : undefined,
    )).toEqual(['locale', 'state']);
  });

  it('never injects a provider string into the html', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), englishLocalization, () => undefined);
    panel.show();
    const model = buildDashboardModel({ snapshots: {}, order: ['deepseek'], t, range: 'last7', pricing: 'peak' });
    panel.update(model);
    expect(state.webviewPanels[0]!.webview.html).not.toContain('onerror=');
  });

  it('is a singleton', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), englishLocalization, () => undefined);
    panel.show();
    panel.show();
    expect(state.webviewPanels).toHaveLength(1);
  });

  it('posts the model to the webview', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), englishLocalization, () => undefined);
    panel.show();
    const model = buildDashboardModel({ snapshots: {}, order: ['deepseek'], t, range: 'last7', pricing: 'peak' });
    panel.update(model);
    expect(state.webviewPanels[0]!.webview.postedMessages.length).toBeGreaterThan(0);
  });

  it('hands a range change to the host', () => {
    const seen: string[] = [];
    const panel = new DashboardPanel(Uri.file('/ext'), englishLocalization, (range) => {
      seen.push(range);
    });
    panel.show();
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'setRange', range: 'last30' });
    expect(seen).toEqual(['last30']);
  });

  it('hands a configuration request to the host', () => {
    let requested = 0;
    const panel = new DashboardPanel(
      Uri.file('/ext'),
      englishLocalization,
      () => undefined,
      () => { requested += 1; },
    );
    panel.show();
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'configure' });
    expect(requested).toBe(1);
  });

  it('hands a refresh request to the host', () => {
    let requested = 0;
    const panel = new DashboardPanel(
      Uri.file('/ext'),
      englishLocalization,
      () => undefined,
      () => undefined,
      () => { requested += 1; },
    );
    panel.show();
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'refresh' });
    expect(requested).toBe(1);
  });

  it('ignores malformed messages', () => {
    const seen: string[] = [];
    const panel = new DashboardPanel(Uri.file('/ext'), englishLocalization, (range) => {
      seen.push(range);
    });
    panel.show();
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'setRange', range: 'forever' });
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'evil' });
    expect(seen).toEqual([]);
  });

  it('can reopen after the host panel is closed', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), englishLocalization, () => undefined);
    panel.show();
    state.webviewPanels[0]!.dispose();
    panel.show();
    expect(state.webviewPanels).toHaveLength(2);
  });

  it('reattaches a restored panel so its messages reach the host again', async () => {
    const panel = new DashboardPanel(Uri.file('/ext'), englishLocalization, () => undefined);
    const restored = mockWindow.createWebviewPanel(
      'quotaDeck.dashboard',
      'QuotaDeck CN',
      ViewColumn.Active,
      {},
    );
    panel.restore(restored as never);

    expect(restored.title).toBe('QuotaDeck CN');
    expect(restored.webview.html).toContain('id="app"');
    restored.webview.receiveMessage({ kind: 'ready' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(restored.webview.postedMessages.length).toBeGreaterThan(0);
  });
});
