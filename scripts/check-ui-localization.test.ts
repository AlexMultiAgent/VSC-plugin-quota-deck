import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findHardcodedChinese,
  scanProductionSources,
} from './check-ui-localization.mjs';

const cleanup: string[] = [];

afterEach(() => {
  for (const directory of cleanup.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('findHardcodedChinese', () => {
  it('finds Chinese text in string and template literals', () => {
    const source = [
      "const status = '正在加载';",
      'const error = `暂时无法连接 ${host}`;',
    ].join('\n');

    expect(findHardcodedChinese(source, 'sample.ts').map((entry) => entry.text)).toEqual([
      '正在加载',
      '暂时无法连接 ',
    ]);
  });

  it('ignores Chinese text in comments', () => {
    const source = '// 这是注释\n/* 也是注释 */\nconst status = "ready";';

    expect(findHardcodedChinese(source, 'sample.ts')).toEqual([]);
  });

  it('finds Chinese represented by unicode escapes', () => {
    const source = "const status = '\\u6b63\\u5728\\u52a0\\u8f7d';";

    expect(findHardcodedChinese(source, 'sample.ts').map((entry) => entry.text)).toEqual([
      '正在加载',
    ]);
  });

  it('ignores Chinese inside regular expression literals', () => {
    const source = "const pattern = /[\"'中文]/g; const status = 'ready';";

    expect(findHardcodedChinese(source, 'sample.ts')).toEqual([]);
  });

  it('finds Chinese after a template substitution with nested braces', () => {
    const source = 'const label = `value ${ { key: 1 } } 中文`;';

    expect(findHardcodedChinese(source, 'sample.ts').map((entry) => entry.text)).toEqual([
      ' 中文',
    ]);
  });

  it('does not treat division after an increment as a regular expression', () => {
    const source = "let x = 1; x++; const y = x / 2; const status = '中文';";

    expect(findHardcodedChinese(source, 'sample.ts').map((entry) => entry.text)).toEqual([
      '中文',
    ]);
  });
});

describe('scanProductionSources', () => {
  it('excludes tests and localization resources', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'quota-deck-i18n-'));
    cleanup.push(root);
    mkdirSync(resolve(root, 'src', 'localization'), { recursive: true });
    mkdirSync(resolve(root, 'src', 'presentation'), { recursive: true });
    writeFileSync(
      resolve(root, 'src', 'presentation', 'ui.ts'),
      "export const loading = '正在加载';",
    );
    writeFileSync(
      resolve(root, 'src', 'presentation', 'ui.test.ts'),
      "export const loading = '测试文案';",
    );
    writeFileSync(
      resolve(root, 'src', 'localization', 'zh-cn.ts'),
      "export const loading = '正在加载';",
    );

    const result = scanProductionSources(root);

    expect(result.scannedFiles).toEqual(['src/presentation/ui.ts']);
    expect(result.violations.map((entry) => entry.file)).toEqual([
      'src/presentation/ui.ts',
    ]);
  });

  it('passes for the current production sources', () => {
    const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

    expect(scanProductionSources(root).violations).toEqual([]);
  });
});
