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

/**
 * Files whose change alters what `@vscode/vsce` ships. `src/` feeds `dist/`,
 * and the rest are the manifest, the assets and the packaged documents. A
 * commit that touches none of them leaves the VSIX byte-identical, so it does
 * not need a new version number.
 */
const PACKAGE_AFFECTING = [
  /^src\//,
  /^media\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^package\.nls(\.zh-cn)?\.json$/,
  /^README\.md$/i,
  /^CHANGELOG\.md$/i,
  /^LICENSE$/,
  /^esbuild\.mjs$/,
  /^\.vscodeignore$/,
];

export function shipsInVsix(file) {
  return PACKAGE_AFFECTING.some((pattern) => pattern.test(file));
}

export function checkVersionConsistency({
  version,
  packageLockVersion,
  changelog,
  tagCommit,
  headCommit,
  changedFiles,
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
    if (changedFiles === undefined) {
      failures.push(
        `Version ${version} is already tagged at ${tagCommit} but HEAD is ${headCommit}; ` +
        'the changed files could not be determined, so bump the version before packaging.',
      );
    } else {
      const shipping = changedFiles.filter((file) => shipsInVsix(file));
      if (shipping.length > 0) {
        failures.push(
          `Version ${version} is already tagged at ${tagCommit} but HEAD is ${headCommit}; ` +
          `${shipping.join(', ')} changed and ships in the VSIX. ` +
          'Bump the version before packaging.',
        );
      }
    }
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

function gitChangedFiles(root, from, to) {
  try {
    return execFileSync('git', ['diff', '--name-only', `${from}..${to}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
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

  const tagCommit = gitCommit(root, `v${manifest.version}^{commit}`);
  const headCommit = gitCommit(root, 'HEAD');

  failures.push(...checkVersionConsistency({
    version: manifest.version,
    packageLockVersion: packageLock.version,
    changelog,
    tagCommit,
    headCommit,
    changedFiles:
      tagCommit !== undefined && headCommit !== undefined
        ? gitChangedFiles(root, tagCommit, headCommit)
        : undefined,
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
