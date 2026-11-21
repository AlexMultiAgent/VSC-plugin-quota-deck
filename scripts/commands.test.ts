import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, relative), 'utf8')) as Record<string, unknown>;
}

function readSource(relative: string): string {
  return readFileSync(resolve(root, relative), 'utf8');
}

interface CommandManifest {
  contributes: {
    commands: Array<{ command: string; title: string }>;
    menus: { commandPalette?: Array<{ command: string }> };
  };
}

/**
 * Every command the extension registers must also be contributed, with a title that
 * resolves in both bundles. `quotaDeck.clearCredential` once had a handler, a
 * confirmation dialog and tests, but no manifest entry, so no user could reach it.
 */
function registeredCommandIds(): string[] {
  const sources = ['src/presentation/commands.ts', 'src/extension.ts'].map(readSource);
  const ids = sources.flatMap((source) =>
    [...source.matchAll(/registerCommand\(\s*'([^']+)'/g)].map((match) => match[1]),
  );
  return [...new Set(ids)].sort();
}

describe('command manifest', () => {
  it('contributes the Qianwen login command with localized titles', () => {
    const manifest = readJson('package.json') as CommandManifest;
    const command = manifest.contributes.commands.find(
      (candidate) => candidate.command === 'quotaDeck.loginQwen',
    );
    expect(command?.title).toBe('%command.loginQwen.title%');

    const english = readJson('package.nls.json');
    const chinese = readJson('package.nls.zh-cn.json');
    expect(english['command.loginQwen.title']).toEqual(expect.any(String));
    expect(chinese['command.loginQwen.title']).toEqual(expect.any(String));
  });

  it('contributes every registered command with a title in both bundles', () => {
    const manifest = readJson('package.json') as CommandManifest;
    const english = readJson('package.nls.json');
    const chinese = readJson('package.nls.zh-cn.json');
    const registered = registeredCommandIds();

    expect(registered.length).toBeGreaterThan(0);
    for (const id of registered) {
      const command = manifest.contributes.commands.find((candidate) => candidate.command === id);
      expect(command, `${id} is registered but not contributed`).toBeDefined();
      const placeholder = /^%(.+)%$/.exec(command?.title ?? '');
      expect(placeholder, `${id} has a hardcoded title`).not.toBeNull();
      const key = placeholder?.[1] ?? '';
      expect(english[key], `${id} is missing from package.nls.json`).toEqual(expect.any(String));
      expect(chinese[key], `${id} is missing from package.nls.zh-cn.json`).toEqual(
        expect.any(String),
      );
    }
  });

  it('contributes the time zone picker with localized titles', () => {
    const manifest = readJson('package.json') as CommandManifest;
    expect(registeredCommandIds()).toContain('quotaDeck.pickTimeZone');

    const command = manifest.contributes.commands.find(
      (candidate) => candidate.command === 'quotaDeck.pickTimeZone',
    );
    expect(command?.title).toBe('%command.pickTimeZone.title%');
    expect(manifest.contributes.menus.commandPalette?.map((entry) => entry.command)).toContain(
      'quotaDeck.pickTimeZone',
    );

    const english = readJson('package.nls.json');
    const chinese = readJson('package.nls.zh-cn.json');
    expect(english['command.pickTimeZone.title']).toEqual(expect.any(String));
    expect(chinese['command.pickTimeZone.title']).toEqual(expect.any(String));
  });
});
