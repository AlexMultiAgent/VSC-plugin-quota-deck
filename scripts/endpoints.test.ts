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
    expect(ORIGINS['deepseek-platform']).toMatch(/^https:\/\//);
  });

  it('keeps every endpoint a path on its origin', () => {
    for (const [id, path] of Object.entries(ENDPOINTS)) {
      expect(path, id).toMatch(/^\//);
    }
  });
});
