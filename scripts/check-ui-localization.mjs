import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HAN = /\p{Script=Han}/u;
const IGNORED_DIRECTORIES = new Set(['localization']);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return IGNORED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(full);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) && !/(?:\.test|\.d)\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

export function findHardcodedChinese(source, filename = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const violations = [];

  function visit(node) {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (HAN.test(node.text)) {
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({
          file: filename,
          line: start.line + 1,
          column: start.character + 1,
          text: node.text,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export function scanProductionSources(root) {
  const sourceRoot = resolve(root, 'src');
  const scannedFiles = sourceFiles(sourceRoot)
    .map((file) => resolve(file))
    .sort()
    .map((file) => relative(root, file).split(sep).join('/'));
  const violations = scannedFiles.flatMap((file) => {
    const source = readFileSync(resolve(root, file), 'utf8');
    return findHardcodedChinese(source, file);
  });
  return { scannedFiles, violations };
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = scanProductionSources(root);
  if (result.violations.length === 0) {
    console.log(`UI localization OK: ${result.scannedFiles.length} production sources scanned.`);
    return;
  }

  console.error('Hardcoded Chinese UI text found:');
  for (const violation of result.violations) {
    console.error(
      `  ${violation.file}:${violation.line}:${violation.column} ${JSON.stringify(violation.text)}`,
    );
  }
  process.exitCode = 1;
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
