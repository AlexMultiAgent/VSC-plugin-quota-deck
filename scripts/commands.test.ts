import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, relative), 'utf8')) as Record<string, unknown>;
}

describe('command manifest', () => {
  it('contributes the Qianwen login command with localized titles', () => {
    const manifest = readJson('package.json') as {
      contributes: { commands: Array<{ command: string; title: string }> };
    };
    const command = manifest.contributes.commands.find(
      (candidate) => candidate.command === 'quotaDeck.loginQwen',
    );
    expect(command?.title).toBe('%command.loginQwen.title%');

    const english = readJson('package.nls.json');
    const chinese = readJson('package.nls.zh-cn.json');
    expect(english['command.loginQwen.title']).toEqual(expect.any(String));
    expect(chinese['command.loginQwen.title']).toEqual(expect.any(String));
  });
});
