import { describe, expect, it } from 'vitest';
import type { HostMessage } from '../protocol';
import { createHostMessageHandler } from './hostMessages';

const WEBVIEW_ORIGIN = 'vscode-webview://11111111-2222-3333-4444-555555555555';

const LOCALIZATION = {
  language: 'en-US',
  title: 'QuotaDeck CN',
  loading: 'Loading quota data…',
  reloading: 'Reloading quota data…',
  loadFailed: 'Quota data is temporarily unavailable.',
  retry: 'Reload',
};

function hostEvent(data: unknown, origin: string): MessageEvent<unknown> {
  return { data, origin } as unknown as MessageEvent<unknown>;
}

function collect(): { applied: HostMessage[]; handler: (event: MessageEvent<unknown>) => void } {
  const applied: HostMessage[] = [];
  return { applied, handler: createHostMessageHandler(WEBVIEW_ORIGIN, (message) => applied.push(message)) };
}

describe('host message handler', () => {
  it('applies a message that comes from the webview origin', () => {
    const { applied, handler } = collect();

    handler(hostEvent({ kind: 'locale', localization: LOCALIZATION }, WEBVIEW_ORIGIN));

    expect(applied).toHaveLength(1);
    expect(applied[0]?.kind).toBe('locale');
  });

  it('drops a message from another origin', () => {
    const { applied, handler } = collect();

    handler(hostEvent({ kind: 'locale', localization: LOCALIZATION }, 'https://example.com'));

    expect(applied).toHaveLength(0);
  });

  it('drops a payload that is not a host message', () => {
    const { applied, handler } = collect();

    handler(hostEvent({ kind: 'state', model: {}, range: 'last7' }, WEBVIEW_ORIGIN));

    expect(applied).toHaveLength(0);
  });

  it('drops a payload that carries extra keys', () => {
    const { applied, handler } = collect();

    handler(
      hostEvent(
        { kind: 'locale', localization: LOCALIZATION, extra: true },
        WEBVIEW_ORIGIN,
      ),
    );

    expect(applied).toHaveLength(0);
  });
});
