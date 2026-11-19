import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, relative), 'utf8')) as Record<string, unknown>;
}

describe('marketplace localization', () => {
  it('resolves the extension name and description from package.nls', () => {
    const manifest = readJson('package.json');
    const english = readJson('package.nls.json');
    const chinese = readJson('package.nls.zh-cn.json');

    expect(manifest.displayName).toBe('%extension.displayName%');
    expect(manifest.description).toBe('%extension.description%');
    expect(english['extension.displayName']).toEqual(expect.any(String));
    expect(english['extension.description']).toEqual(expect.any(String));
    expect(chinese['extension.displayName']).toEqual(expect.any(String));
    expect(chinese['extension.description']).toEqual(expect.any(String));
    expect(chinese['extension.description']).not.toBe(english['extension.description']);
  });
});
