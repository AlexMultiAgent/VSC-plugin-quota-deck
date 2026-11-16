import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const english = JSON.parse(readFileSync(resolve(root, 'package.nls.json'), 'utf8'));
const chinese = JSON.parse(readFileSync(resolve(root, 'package.nls.zh-cn.json'), 'utf8'));

const englishKeys = Object.keys(english).sort();
const chineseKeys = Object.keys(chinese).sort();
const missingInChinese = englishKeys.filter((key) => !(key in chinese));
const missingInEnglish = chineseKeys.filter((key) => !(key in english));

if (missingInChinese.length > 0 || missingInEnglish.length > 0) {
  console.error('Locale key mismatch.');
  if (missingInChinese.length > 0) console.error(`Missing in zh-cn: ${missingInChinese.join(', ')}`);
  if (missingInEnglish.length > 0) console.error(`Missing in en-us: ${missingInEnglish.join(', ')}`);
  process.exit(1);
}

const manifest = readFileSync(resolve(root, 'package.json'), 'utf8');
const placeholders = [...manifest.matchAll(/"%([^%]+)%"/g)].map((match) => match[1]);
const unresolved = placeholders.filter((key) => !(key in english));
if (unresolved.length > 0) {
  console.error(`Unresolved manifest placeholders: ${unresolved.join(', ')}`);
  process.exit(1);
}

console.log(`Locale keys OK: ${englishKeys.length} keys in both bundles.`);
