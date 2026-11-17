import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{16,}/,
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/,
  /"Cookie"\s*:\s*"[^"]{8,}"/i,
];
const LOCAL_PATH_PATTERN = /[A-Za-z]:\\Users\\|\/home\/[a-z0-9_-]+\//i;
const SCANNED = [
  'dist/extension.js',
  'dist/webview.js',
  'package.json',
  'package.nls.json',
  'package.nls.zh-cn.json',
  'README.md',
  'LICENSE',
];
const offenders = [];

for (const relative of SCANNED) {
  const full = resolve(root, relative);
  if (!existsSync(full)) {
    offenders.push(`${relative}: missing from the package`);
    continue;
  }
  const content = readFileSync(full).toString('utf8');
  if (LOCAL_PATH_PATTERN.test(content)) offenders.push(`${relative}: contains an absolute local path`);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) offenders.push(`${relative}: matches ${pattern}`);
  }
}

let shipped;
try {
  shipped = execSync('npx vsce ls', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
} catch (error) {
  console.error(`Package guard could not run "vsce ls": ${error.message}`);
  process.exit(1);
}

const FORBIDDEN = [
  /^src\//,
  /^docs\//,
  /^scripts\//,
  /^\.remember\//,
  /^\.superpowers\//,
  /\.map$/,
  /^node_modules\//,
  /^out\//,
  /^(?:esbuild\.mjs|tsconfig\.json|vitest\.config\.ts|package-lock\.json)$/,
];
for (const entry of shipped) {
  if (FORBIDDEN.some((pattern) => pattern.test(entry))) offenders.push(`${entry}: must not be shipped`);
}

if (offenders.length > 0) {
  console.error('Package guard failed:');
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(`Package guard OK: ${SCANNED.length} files scanned, ${shipped.length} entries shipped.`);
