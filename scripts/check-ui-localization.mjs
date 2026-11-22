import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeLineStarts,
  createScanner,
  LanguageVariant,
  SyntaxKind,
} from 'typescript/unstable/ast';

const HAN = /\p{Script=Han}/u;
const IGNORED_DIRECTORIES = new Set(['localization']);

// TypeScript 7 no longer exposes the compiler API from its main entry; the
// scanner under `unstable/ast` is the supported way to lex a source file.
// A scanner cannot tell a regular expression from a division on its own, so a
// `/` is rescanned as a regex only in token positions where an expression may
// start. Comments never reach the loop because the scanner skips trivia.
const REGEX_PRECEDING = new Set([
  SyntaxKind.Unknown,
  SyntaxKind.OpenParenToken,
  SyntaxKind.OpenBracketToken,
  SyntaxKind.OpenBraceToken,
  SyntaxKind.CommaToken,
  SyntaxKind.SemicolonToken,
  SyntaxKind.ColonToken,
  SyntaxKind.EqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.ExclamationToken,
  SyntaxKind.QuestionToken,
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
  SyntaxKind.PlusToken,
  SyntaxKind.MinusToken,
  SyntaxKind.AsteriskToken,
  SyntaxKind.AsteriskAsteriskToken,
  SyntaxKind.PercentToken,
  SyntaxKind.LessThanToken,
  SyntaxKind.GreaterThanToken,
  SyntaxKind.LessThanEqualsToken,
  SyntaxKind.GreaterThanEqualsToken,
  SyntaxKind.AmpersandToken,
  SyntaxKind.BarToken,
  SyntaxKind.CaretToken,
  SyntaxKind.TildeToken,
  SyntaxKind.EqualsGreaterThanToken,
  SyntaxKind.DotDotDotToken,
  SyntaxKind.ReturnKeyword,
  SyntaxKind.CaseKeyword,
  SyntaxKind.ThrowKeyword,
  SyntaxKind.TypeOfKeyword,
  SyntaxKind.VoidKeyword,
  SyntaxKind.DeleteKeyword,
  SyntaxKind.InKeyword,
  SyntaxKind.InstanceOfKeyword,
  SyntaxKind.NewKeyword,
  SyntaxKind.YieldKeyword,
  SyntaxKind.AwaitKeyword,
  SyntaxKind.ElseKeyword,
  SyntaxKind.DoKeyword,
  SyntaxKind.OfKeyword,
  SyntaxKind.ExtendsKeyword,
  SyntaxKind.DefaultKeyword,
]);

function positionOf(lineStarts, position) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (lineStarts[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: position - lineStarts[low] + 1 };
}

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
  const scanner = createScanner(true, LanguageVariant.Standard, source);
  const lineStarts = computeLineStarts(source);
  const violations = [];
  const templateDepths = [];
  let braceDepth = 0;
  let previous = SyntaxKind.Unknown;

  function record(text, position) {
    if (!HAN.test(text)) return;
    const { line, column } = positionOf(lineStarts, position);
    violations.push({ file: filename, line, column, text });
  }

  function scanTemplateContinuation() {
    const token = scanner.reScanTemplateToken(false);
    if (token === SyntaxKind.TemplateMiddle || token === SyntaxKind.TemplateTail) {
      record(scanner.getTokenValue(), scanner.getTokenStart());
      if (token === SyntaxKind.TemplateTail) templateDepths.pop();
    }
    return token;
  }

  let token = scanner.scan();
  while (token !== SyntaxKind.EndOfFile) {
    if (token === SyntaxKind.StringLiteral || token === SyntaxKind.NoSubstitutionTemplateLiteral) {
      record(scanner.getTokenValue(), scanner.getTokenStart());
    } else if (token === SyntaxKind.TemplateHead) {
      record(scanner.getTokenValue(), scanner.getTokenStart());
      templateDepths.push(braceDepth);
    } else if (token === SyntaxKind.TemplateMiddle || token === SyntaxKind.TemplateTail) {
      record(scanner.getTokenValue(), scanner.getTokenStart());
      if (token === SyntaxKind.TemplateTail) templateDepths.pop();
    } else if (token === SyntaxKind.OpenBraceToken) {
      braceDepth += 1;
    } else if (token === SyntaxKind.CloseBraceToken) {
      if (templateDepths.length > 0 && braceDepth === templateDepths[templateDepths.length - 1]) {
        previous = scanTemplateContinuation();
        token = scanner.scan();
        continue;
      }
      braceDepth = Math.max(0, braceDepth - 1);
    } else if (token === SyntaxKind.SlashToken && REGEX_PRECEDING.has(previous)) {
      const rescanned = scanner.reScanSlashToken();
      if (rescanned === SyntaxKind.RegularExpressionLiteral) {
        previous = rescanned;
        token = scanner.scan();
        continue;
      }
    }
    previous = token;
    token = scanner.scan();
  }
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
