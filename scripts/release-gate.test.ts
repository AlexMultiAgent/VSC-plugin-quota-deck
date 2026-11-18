import { describe, expect, it } from 'vitest';
import { DESIGN_SIZE } from './make-icon.mjs';
import { checkIcon, checkVersionConsistency } from './release-gate.mjs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngWithSize(width: number, height: number): Buffer {
  const png = Buffer.alloc(40);
  PNG_SIGNATURE.copy(png, 0);
  png.write('IHDR', 12, 'ascii');
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}

describe('checkIcon', () => {
  it('accepts a correctly sized PNG', () => {
    expect(checkIcon(pngWithSize(DESIGN_SIZE, DESIGN_SIZE))).toBeUndefined();
  });

  it('rejects a missing icon', () => {
    expect(checkIcon(undefined)).toBe('media/icon.png is missing');
  });

  it('rejects a non-PNG file', () => {
    expect(checkIcon(Buffer.from('not a png'))).toBe('media/icon.png is not a PNG');
  });

  it('rejects a wrong-sized icon', () => {
    expect(checkIcon(pngWithSize(256, 256))).toBe(
      `media/icon.png is 256x256, expected ${DESIGN_SIZE}x${DESIGN_SIZE}`,
    );
  });
});

describe('checkVersionConsistency', () => {
  const releaseReady = {
    version: '0.2.2',
    packageLockVersion: '0.2.2',
    changelog: '# Changelog\n\n## 0.2.2 — 2026-11-18\n\n- Fix tooltip.\n',
    headCommit: 'new-commit',
  };

  it('accepts a synchronized version that has not been tagged yet', () => {
    expect(checkVersionConsistency(releaseReady)).toEqual([]);
  });

  it('rejects a package-lock version that differs from package.json', () => {
    expect(checkVersionConsistency({
      ...releaseReady,
      packageLockVersion: '0.2.1',
    })).toContain(
      'package-lock.json version 0.2.1 does not match package.json version 0.2.2.',
    );
  });

  it('rejects a latest changelog version that differs from package.json', () => {
    expect(checkVersionConsistency({
      ...releaseReady,
      changelog: '# Changelog\n\n## 0.2.1 — 2026-11-18\n\n- Previous release.\n',
    })).toContain(
      'package.json version 0.2.2 does not match CHANGELOG.md latest release 0.2.1.',
    );
  });

  it('accepts packaging the exact commit already tagged for the same version', () => {
    expect(checkVersionConsistency({
      ...releaseReady,
      tagCommit: 'new-commit',
    })).toEqual([]);
  });

  it('rejects reusing a version tag after the tagged commit', () => {
    expect(checkVersionConsistency({
      ...releaseReady,
      tagCommit: 'released-commit',
    })).toContain(
      'Version 0.2.2 is already tagged at released-commit but HEAD is new-commit; bump the version before packaging.',
    );
  });
});
