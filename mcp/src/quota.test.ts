import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectQuota, renderMarkdown } from './quota';

const NOW = Date.parse('2026-11-21T12:00:00Z');

function deepSeekFixture(): unknown {
  const path = new URL('../../src/test/fixtures/deepseek/balance/standard.json', import.meta.url);
  const fixture = JSON.parse(readFileSync(path, 'utf8')) as { response: unknown };
  return fixture.response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('collectQuota', () => {
  it('reports every provider as not-configured without fetching when no credential is set', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('fetch must not run without credentials');
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await collectQuota({ env: {}, now: NOW, language: 'zh-CN' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.providers.map((provider) => provider.id)).toEqual([
      'minimax-cn',
      'minimax-global',
      'deepseek',
      'qwen',
    ]);
    expect(report.providers.every((provider) => provider.state === 'not-configured')).toBe(true);
    expect(report.providers[0]?.stateLabel).toBe('未配置');
    expect(report.missingCredentials.map((missing) => missing.provider)).toEqual([
      'minimax-cn',
      'minimax-global',
      'deepseek',
      'qwen',
    ]);
    expect(report.missingCredentials[0]?.env).toContain('MINIMAX_CN_TOKEN_PLAN');
    expect(report.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it('reads a DeepSeek balance through the shared provider code and keeps the key out of the report', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(deepSeekFixture()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const report = await collectQuota({
      provider: 'deepseek',
      env: { DEEPSEEK_API_KEY: 'sk-test-secret' },
      now: NOW,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(report.providers).toHaveLength(1);
    expect(report.providers[0]?.id).toBe('deepseek');
    expect(report.providers[0]?.state).toBe('ok');
    expect(report.providers[0]?.accountValue?.label.toLowerCase()).toContain('balance');
    expect(report.providers[0]?.accountValue?.value).toContain('¥');
    expect(report.missingCredentials).toEqual([]);
    expect(JSON.stringify(report)).not.toContain('sk-test-secret');
    expect(renderMarkdown(report)).toContain('DeepSeek');
  });

  it('labels the report in the requested language', async () => {
    const report = await collectQuota({
      provider: 'deepseek',
      env: {},
      now: NOW,
      language: 'zh-CN',
    });

    expect(report.providers[0]?.stateLabel).toBe('未配置');
    expect(renderMarkdown(report)).toContain('未配置');
  });

  it('carries the selected range and time zone into the report', async () => {
    const report = await collectQuota({
      provider: 'deepseek',
      env: {},
      now: NOW,
      range: 'today',
      timeZone: 'America/New_York',
    });

    expect(report.range).toBe('today');
    expect(report.rangeLabel.length).toBeGreaterThan(0);
    expect(report.timeZone).toBe('America/New_York');
  });
});
