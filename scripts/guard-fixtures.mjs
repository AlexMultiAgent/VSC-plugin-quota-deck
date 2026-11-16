import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { SECRET_PATTERNS } from './sanitize.mjs';

export function findSecretLikeValues(value, path = '') {
  if (typeof value === 'string') {
    return SECRET_PATTERNS.some((pattern) => pattern.test(value)) ? [{ path, value }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findSecretLikeValues(entry, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      findSecretLikeValues(entry, path === '' ? key : `${path}.${key}`),
    );
  }
  return [];
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function main() {
  const root = resolve(process.cwd(), 'src', 'test', 'fixtures');
  let files;
  try {
    files = walk(root);
  } catch {
    console.log('Fixture guard OK: 0 files scanned.');
    return;
  }

  const failures = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    for (const hit of findSecretLikeValues(parsed)) {
      failures.push(`${relative(process.cwd(), file)} → ${hit.path}`);
    }
  }

  if (failures.length > 0) {
    console.error('Fixture guard failed: a committed fixture contains a secret-shaped value.');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(`Fixture guard OK: ${files.length} files scanned.`);
}

if (process.argv[1]?.endsWith('guard-fixtures.mjs')) main();
