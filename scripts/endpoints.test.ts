import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENDPOINTS, ORIGINS } from '../src/providers/endpoints';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('provider endpoints', () => {
  it('defines an endpoint for every provider capability', () => {
    const providerSources = [
      'src/providers/minimax/provider.ts',
      'src/providers/deepseek/provider.ts',
    ];
    for (const file of providerSources) {
      const source = readFileSync(join(root, file), 'utf8');
      const ids = [...source.matchAll(/'(?:minimax|deepseek)\.[A-Za-z]+'/g)].map((match) =>
        match[0].slice(1, -1),
      );
      for (const id of new Set(ids)) {
        expect(ENDPOINTS[id as keyof typeof ENDPOINTS], `${file}: ${id}`).toBeDefined();
      }
    }
  });

  it('names an origin for every provider', () => {
    expect(ORIGINS['minimax-cn']).toMatch(/^https:\/\//);
    expect(ORIGINS['minimax-global']).toMatch(/^https:\/\//);
    expect(ORIGINS['deepseek-api']).toMatch(/^https:\/\//);
    expect(ORIGINS).not.toHaveProperty('deepseek-platform');
  });

  it('does not retain DeepSeek platform detail endpoints', () => {
    expect(ENDPOINTS).not.toHaveProperty('deepseek.usageAmount');
    expect(ENDPOINTS).not.toHaveProperty('deepseek.usageCost');
    expect(ENDPOINTS).not.toHaveProperty('deepseek.accountSummary');
  });

  it('names the Qwen OAuth and Token Plan origins and endpoints', () => {
    expect(ORIGINS['qwen-auth']).toBe('https://t.qianwenai.com');
    expect(ORIGINS['qwen-cli']).toBe('https://cli.qianwenai.com');
    expect(ORIGINS['qwen-data']).toBe('https://cs-data.qianwenai.com');
    expect(ENDPOINTS['qwen.deviceCode']).toBe('/cli/device/code');
    expect(ENDPOINTS['qwen.devicePoll']).toBe('/cli/device/token');
    expect(ENDPOINTS['qwen.consoleAccess']).toBe('/data/v2/api.json');
    expect(ENDPOINTS['qwen.fundBalance']).toBe('/data/v2/api.json');
    expect(ENDPOINTS['qwen.tokenPlanUsage']).toContain(
      'zeldaHttp.apikeyMgr.%2Ftokenplan%2Fpersonal%2Fapi%2Fv2%2Fusage',
    );
    expect(ENDPOINTS['qwen.tokenPlanSubscription']).toContain(
      'zeldaHttp.apikeyMgr.%2Ftokenplan%2Fpersonal%2Fapi%2Fv2%2Fsubscription',
    );
  });

  it('keeps every endpoint a path on its origin', () => {
    for (const [id, path] of Object.entries(ENDPOINTS)) {
      expect(path, id).toMatch(/^\//);
    }
  });
});
