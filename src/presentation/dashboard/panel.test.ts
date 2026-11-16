import { beforeEach, describe, expect, it } from 'vitest';
import { __reset, state, Uri } from '../../test/__mocks__/vscode';
import { translatorFor } from '../../localization';
import { buildDashboardModel } from './viewModel';
import { DashboardPanel } from './panel';

const t = translatorFor('en-US');

describe('DashboardPanel', () => {
  beforeEach(() => __reset());

  it('creates a webview panel with a nonce content security policy', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', () => undefined);
    panel.show();
    const html = state.webviewPanels[0]!.webview.html;
    expect(html).toContain("default-src 'none'");
    expect(html).toMatch(/nonce-[A-Za-z0-9+/=]+/);
  });

  it('uses the localized title', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN — 用量与洞察', () => undefined);
    panel.show();
    expect(state.webviewPanels[0]!.title).toBe('QuotaDeck CN — 用量与洞察');
  });

  it('never injects a provider string into the html', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', () => undefined);
    panel.show();
    const model = buildDashboardModel({ snapshots: {}, order: ['deepseek'], t, range: 'last7', pricing: 'peak' });
    panel.update(model);
    expect(state.webviewPanels[0]!.webview.html).not.toContain('onerror=');
  });

  it('is a singleton', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', () => undefined);
    panel.show();
    panel.show();
    expect(state.webviewPanels).toHaveLength(1);
  });

  it('posts the model to the webview', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', () => undefined);
    panel.show();
    const model = buildDashboardModel({ snapshots: {}, order: ['deepseek'], t, range: 'last7', pricing: 'peak' });
    panel.update(model);
    expect(state.webviewPanels[0]!.webview.postedMessages.length).toBeGreaterThan(0);
  });

  it('hands a range change to the host', () => {
    const seen: string[] = [];
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', (range) => {
      seen.push(range);
    });
    panel.show();
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'setRange', range: 'last30' });
    expect(seen).toEqual(['last30']);
  });

  it('ignores malformed messages', () => {
    const seen: string[] = [];
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', (range) => {
      seen.push(range);
    });
    panel.show();
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'setRange', range: 'forever' });
    state.webviewPanels[0]!.webview.receiveMessage({ kind: 'evil' });
    expect(seen).toEqual([]);
  });

  it('can reopen after the host panel is closed', () => {
    const panel = new DashboardPanel(Uri.file('/ext'), 'QuotaDeck CN', () => undefined);
    panel.show();
    state.webviewPanels[0]!.dispose();
    panel.show();
    expect(state.webviewPanels).toHaveLength(2);
  });
});
