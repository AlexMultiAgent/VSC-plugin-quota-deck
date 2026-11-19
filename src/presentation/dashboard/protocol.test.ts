import { describe, expect, it } from 'vitest';
import { hostMessage, isHostMessage, isWebviewMessage } from './protocol';
import type { DashboardModel } from './viewModel';

function emptyModel(): DashboardModel {
  return {
    hero: null,
    historyTiles: [],
    hasHistoryData: false,
    providers: [],
    range: 'last7',
    rangeLabel: 'Last 7 days',
    ranges: [{ id: 'last7', label: 'Last 7 days' }],
    labels: {
      configureProviders: 'Configure providers',
      refreshNow: 'Refresh now',
      historyRange: 'History usage range',
      historyUsage: 'Historical usage',
      liveQuotaNote: 'The range affects only MiniMax Token history.',
    },
  };
}

describe('host messages', () => {
  it('accepts a state message', () => {
    expect(isHostMessage({ kind: 'state', model: emptyModel(), range: 'last7' })).toBe(true);
  });

  it('accepts a localization message', () => {
    expect(isHostMessage({
      kind: 'locale',
      localization: {
        language: 'en-US',
        title: 'QuotaDeck CN',
        loading: 'Loading quota data…',
        reloading: 'Reloading quota data…',
        loadFailed: 'Quota data is temporarily unavailable.',
        retry: 'Reload',
      },
    })).toBe(true);
  });

  it('rejects an incomplete localization message', () => {
    expect(isHostMessage({
      kind: 'locale',
      localization: {
        language: 'en-US',
        title: 'QuotaDeck CN',
        loading: 'Loading quota data…',
      },
    })).toBe(false);
  });

  it('accepts a hero with a live percentage', () => {
    const model: DashboardModel = {
      ...emptyModel(),
      hero: { label: 'Lowest remaining quota', value: '20%', sourceLabel: 'MiniMax CN · Weekly' },
    };
    expect(isHostMessage({ kind: 'state', model, range: 'last7' })).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(isHostMessage({ kind: 'evil' })).toBe(false);
  });

  it('rejects a malformed model', () => {
    expect(
      isHostMessage({
        kind: 'state',
        model: { hero: { label: 1, value: '1' } },
        range: 'last7',
      }),
    ).toBe(false);
  });

  it('validates provider account values and detail rows', () => {
    const model = emptyModel();
    model.providers.push({
      id: 'qwen',
      name: 'Qwen',
      state: 'ok',
      stateLabel: 'Available',
      accent: { light: '#eb6834', dark: '#d95926' },
      meters: [],
      accountValue: { key: 'balance', label: 'Account balance', value: '¥10.00' },
      details: [
        { label: 'Available cash', value: '¥12.00' },
        { label: 'Credit', value: '¥5.00' },
      ],
      hoursLabel: null,
      note: 'Account balance only.',
      message: null,
      fetchedAt: null,
    });
    expect(isHostMessage({ kind: 'state', model, range: 'last7' })).toBe(true);

    const provider = model.providers[0]!;
    model.providers.splice(0, 1, {
      ...provider,
      accountValue: {
        key: 'points' as never,
        label: 'Points',
        value: '10',
      },
    });
    expect(isHostMessage({ kind: 'state', model, range: 'last7' })).toBe(false);
  });

  it('rejects retired account history fields from the host contract', () => {
    const model = emptyModel() as DashboardModel & { accountTotals?: unknown; usage?: unknown };
    model.usage = { available: true };
    model.accountTotals = [{ currency: 'CNY', amount: 2 }];
    expect(isHostMessage({ kind: 'state', model, range: 'last7' })).toBe(false);
  });

  it('rejects malformed provider details', () => {
    const model = emptyModel();
    model.providers.push({
      id: 'deepseek',
      name: 'DeepSeek',
      state: 'partial',
      stateLabel: 'Partially available',
      accent: { light: '#2a78d6', dark: '#3987e5' },
      meters: [],
      accountValue: null,
      details: [{ label: 'Credit', value: 1 as never }],
      hoursLabel: 'Peak',
      note: null,
      message: null,
      fetchedAt: null,
    });
    expect(isHostMessage({ kind: 'state', model, range: 'last7' })).toBe(false);
  });

  it('accepts meters with count labels and resets', () => {
    const model = emptyModel();
    model.providers.push({
      id: 'minimax-cn',
      name: 'MiniMax CN',
      state: 'ok',
      stateLabel: 'Healthy',
      accent: { light: '#1baf7a', dark: '#199e70' },
      meters: [{
        key: 'model:video:current',
        label: 'Video · Current window',
        percent: 100,
        valueLabel: '3/3 · 100%',
        resetLabel: 'Next reset 2026-11-20 00:00',
        tone: 'positive',
      }],
      accountValue: null,
      details: [],
      hoursLabel: null,
      note: null,
      message: null,
      fetchedAt: '2026-11-19T01:00:00.000Z',
    });
    expect(isHostMessage({ kind: 'state', model, range: 'last7' })).toBe(true);

    model.providers[0]!.meters.splice(0, 1, {
      key: 'legacy',
      label: 'Legacy',
      percent: 50,
      resetLabel: null,
      tone: 'caution',
    } as never);
    expect(isHostMessage({ kind: 'state', model, range: 'last7' })).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isHostMessage('state')).toBe(false);
  });
});

describe('webview messages', () => {
  it('accepts a ready message', () => {
    expect(isWebviewMessage({ kind: 'ready' })).toBe(true);
  });

  it('accepts a range change', () => {
    expect(isWebviewMessage({ kind: 'setRange', range: 'last7' })).toBe(true);
  });

  it('accepts a request to configure providers', () => {
    expect(isWebviewMessage({ kind: 'configure' })).toBe(true);
  });

  it('accepts a request to refresh quota data', () => {
    expect(isWebviewMessage({ kind: 'refresh' })).toBe(true);
  });

  it('rejects an unknown range', () => {
    expect(isWebviewMessage({ kind: 'setRange', range: 'forever' })).toBe(false);
  });

  it('rejects extra properties', () => {
    expect(isWebviewMessage({ kind: 'ready', extra: true })).toBe(false);
  });
});

describe('hostMessage', () => {
  it('builds the state message the panel posts', () => {
    const message = hostMessage({ kind: 'state', model: emptyModel(), range: 'last7' });
    expect(message.kind).toBe('state');
    expect(message.kind === 'state' ? message.range : undefined).toBe('last7');
  });
});
