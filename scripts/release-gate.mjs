import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const required = [
  'name', 'displayName', 'description', 'version', 'publisher', 'license', 'engines',
  'categories', 'keywords', 'icon', 'repository', 'bugs', 'homepage', 'pricing',
  'contributes', 'main',
];
for (const key of required) {
  if (manifest[key] === undefined) failures.push(`package.json is missing "${key}"`);
}
if (manifest.telemetry !== null) failures.push('package.json must declare "telemetry": null');

const settings = Object.keys(manifest.contributes?.configuration?.properties ?? {});
const credentialSetting = /cookie|secret|password|token|apikey|session/i;
for (const key of settings) {
  if (credentialSetting.test(key)) failures.push(`package.json declares a credential setting: "${key}"`);
}

const calendar = JSON.parse(
  readFileSync(resolve(root, 'src', 'providers', 'deepseek', 'pricing-calendar.json'), 'utf8'),
);
const daysLeft = (Date.parse(calendar.coverageEnd) - Date.now()) / 86_400_000;
if (daysLeft < 30) {
  failures.push(`pricing calendar ${calendar.version} covers only ${Math.floor(daysLeft)} more days`);
}
for (const file of ['README.md', 'LICENSE', 'CHANGELOG.md']) {
  try {
    readFileSync(resolve(root, file));
  } catch {
    failures.push(`${file} is missing`);
  }
}
if (failures.length > 0) {
  console.error('Release gate failed:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('Release gate OK.');
