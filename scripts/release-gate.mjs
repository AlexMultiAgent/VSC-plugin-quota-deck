import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGN_SIZE } from './make-icon.mjs';

export function readPngSize(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return undefined;
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return undefined;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function checkIcon(buffer) {
  if (buffer === undefined) return 'media/icon.png is missing';
  const size = readPngSize(buffer);
  if (size === undefined) return 'media/icon.png is not a PNG';
  if (size.width !== DESIGN_SIZE || size.height !== DESIGN_SIZE) {
    return `media/icon.png is ${size.width}x${size.height}, expected ${DESIGN_SIZE}x${DESIGN_SIZE}`;
  }
  return undefined;
}

export function checkVersionConsistency({
  version,
  packageLockVersion,
  changelog,
  tagCommit,
  headCommit,
}) {
  const failures = [];
  const changelogVersion = changelog.match(
    /^##\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/m,
  )?.[1];

  if (packageLockVersion !== version) {
    failures.push(
      `package-lock.json version ${packageLockVersion ?? '(missing)'} does not match ` +
      `package.json version ${version}.`,
    );
  }
  if (changelogVersion !== version) {
    failures.push(
      `package.json version ${version} does not match CHANGELOG.md latest release ` +
      `${changelogVersion ?? '(missing)'}.`,
    );
  }
  if (
    tagCommit !== undefined &&
    headCommit !== undefined &&
    tagCommit !== headCommit
  ) {
    failures.push(
      `Version ${version} is already tagged at ${tagCommit} but HEAD is ${headCommit}; ` +
      'bump the version before packaging.',
    );
  }
  return failures;
}

function gitCommit(root, ref) {
  try {
    return execFileSync('git', ['rev-parse', ref], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const failures = [];
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
  const required = [
    'name', 'displayName', 'description', 'version', 'publisher', 'license', 'engines',
    'categories', 'keywords', 'icon', 'repository', 'bugs', 'homepage', 'pricing',
    'contributes', 'main',
  ];
  for (const key of required) {
    if (manifest[key] === undefined) failures.push(`package.json is missing "${key}"`);
  }
  if (manifest.telemetry !== null) failures.push('package.json must declare "telemetry": null');

  failures.push(...checkVersionConsistency({
    version: manifest.version,
    packageLockVersion: packageLock.version,
    changelog,
    tagCommit: gitCommit(root, `v${manifest.version}^{commit}`),
    headCommit: gitCommit(root, 'HEAD'),
  }));

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

  let icon;
  try {
    icon = readFileSync(resolve(root, 'media', 'icon.png'));
  } catch {
    icon = undefined;
  }
  const iconFailure = checkIcon(icon);
  if (iconFailure !== undefined) failures.push(iconFailure);

  if (failures.length > 0) {
    console.error('Release gate failed:');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log('Release gate OK.');
}

if (process.argv[1]?.endsWith('release-gate.mjs')) main();
