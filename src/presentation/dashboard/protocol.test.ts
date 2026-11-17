import { describe, expect, it } from 'vitest';
import { hostMessage, isHostMessage, isWebviewMessage } from './protocol';
import type { DashboardModel } from './viewModel';

function emptyModel(): DashboardModel {
  return {
    hero: { label: 'x', value: '1' },
    tiles: [],
    providers: [],
    usage: { available: false, currency: null, categories: [], cost: [], requests: [], tokens: [], tokenSeries: [], byModel: [] },
    qwen: [],
    balances: [],
    range: 'last7',
    rangeLabel: 'Last 7 days',
    ranges: [{ id: 'last7', label: 'Last 7 days' }],
    pricingLabel: 'Peak pricing right now',
    labels: {
      configureProviders: 'Configure providers',
      cost: 'Cost', requests: 'Requests', tokens: 'Tokens', cache: 'Cache', usageTable: 'Usage',
      modelTable: 'Models', balanceTable: 'Balances', qwenTitle: 'Qwen', qwenUnsupported: 'Not supported',
      qwenUnavailableReason: 'Qwen credentials are not available in V1.',
      columnDate: 'Date', columnModel: 'Model', columnRequests: 'Requests', columnTokens: 'Tokens',
      columnCost: 'Cost', columnCurrency: 'Currency', columnTotal: 'Total',
    },
  };
}

describe('host messages', () => {
  it('accepts a state message', () => {
    expect(isHostMessage({ kind: 'state', model: emptyModel(), range: 'last7' })).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(isHostMessage({ kind: 'evil' })).toBe(false);
  });

  it('rejects a malformed model', () => {
    expect(isHostMessage({ kind: 'state', model: { hero: { label: 1, value: '1' } }, range: 'last7' })).toBe(false);
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
