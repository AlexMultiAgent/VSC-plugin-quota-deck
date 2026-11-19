import { describe, expect, it } from 'vitest';
import { DESIGN_SIZE } from './make-icon.mjs';
import { checkIcon, checkVersionConsistency, shipsInVsix } from './release-gate.mjs';

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
      changedFiles: ['src/extension.ts'],
    })).toContain(
      'Version 0.2.2 is already tagged at released-commit but HEAD is new-commit; ' +
      'src/extension.ts changed and ships in the VSIX. Bump the version before packaging.',
    );
  });

  it('rejects reusing a version tag when the changed files cannot be determined', () => {
    expect(checkVersionConsistency({
      ...releaseReady,
      tagCommit: 'released-commit',
    })).toContain(
      'Version 0.2.2 is already tagged at released-commit but HEAD is new-commit; ' +
      'the changed files could not be determined, so bump the version before packaging.',
    );
  });

  it('accepts a docs-only commit after the tagged commit', () => {
    expect(checkVersionConsistency({
      ...releaseReady,
      tagCommit: 'released-commit',
      changedFiles: ['CLAUDE.md', 'docs/superpowers/specs/2026-11-16-quota-deck-cn-design.md'],
    })).toEqual([]);
  });
});

describe('shipsInVsix', () => {
  it('treats the extension sources as shipping', () => {
    expect(shipsInVsix('src/extension.ts')).toBe(true);
    expect(shipsInVsix('src/localization/messages.ts')).toBe(true);
  });

  it('treats the manifest, the assets and the packaged documents as shipping', () => {
    expect(shipsInVsix('package.json')).toBe(true);
    expect(shipsInVsix('package.nls.zh-cn.json')).toBe(true);
    expect(shipsInVsix('README.md')).toBe(true);
    expect(shipsInVsix('CHANGELOG.md')).toBe(true);
    expect(shipsInVsix('media/icon.png')).toBe(true);
  });

  it('treats developer documentation and tooling as not shipping', () => {
    expect(shipsInVsix('CLAUDE.md')).toBe(false);
    expect(shipsInVsix('docs/contracts/minimax.md')).toBe(false);
    expect(shipsInVsix('scripts/release-gate.mjs')).toBe(false);
    expect(shipsInVsix('tsconfig.json')).toBe(false);
  });
});
