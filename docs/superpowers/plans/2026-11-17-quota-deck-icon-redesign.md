# QuotaDeck CN Icon Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic bar-chart marketplace icon with the approved 240° gauge dial, rendered through a supersampling rasteriser, and ship it as release v0.1.1.

**Architecture:** `scripts/make-icon.mjs` becomes a dependency-free rasteriser that evaluates the icon's geometry per sub-pixel sample and encodes the result with the PNG writer already in the repo. The generator exports its palette, geometry and `renderIcon()` so a Vitest test and the release gate assert against the same source of truth. The release gate additionally verifies the committed `media/icon.png` is a 128 × 128 PNG.

**Tech Stack:** Node.js (`node:zlib`, `node:fs`), Vitest, plain ESM `.mjs` scripts — no new dependencies.

**Design spec:** `docs/superpowers/specs/2026-11-17-quota-deck-icon-design.md`

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `scripts/make-icon.mjs` | Rewrite | Sample-based rasteriser: geometry constants, per-sample shape tests, PNG encoder, `renderIcon()` |
| `scripts/make-icon.test.ts` | Create | Asserts PNG validity, size, determinism, transparency, and that each visual layer renders |
| `scripts/release-gate.mjs` | Modify | Adds the `media/icon.png` 128 × 128 PNG check |
| `package.json` | Modify | Adds the `icon` script; bumps `version` to `0.1.1` |
| `package-lock.json` | Modify | Bumps the two `version` fields to `0.1.1` |
| `media/icon.png` | Regenerate | The 128 × 128 rendered asset |
| `CHANGELOG.md` | Modify | Adds the `0.1.1` entry |
| `CLAUDE.md` | Modify | Documents the `npm run icon` command |
| `.vscodeignore` | Modify | Already excludes `CLAUDE.md`; no change needed for this plan |

All geometry is expressed in a 128 × 128 **design space**. The output size is a parameter, so the
mapping from output pixel to design space is `designX = (outX + (sx + 0.5) / SAMPLES) * (128 / size)`.

---

### Task 1: Write the failing icon test

**Files:**

- Create: `scripts/make-icon.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DESIGN_SIZE, PALETTE, renderIcon } from './make-icon.mjs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readHeader(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * The generator writes filter type 0 on every row, so decoding is inflate
 * plus skipping one filter byte per row — no defiltering needed.
 */
function decodePixels(png: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const { width, height } = readHeader(png);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    expect(raw[rowStart]).toBe(0);
    raw.copy(pixels, y * width * 4, rowStart + 1, rowStart + 1 + width * 4);
  }
  return pixels;
}

function pixelAt(pixels: Buffer, x: number, y: number): number[] {
  const index = (y * DESIGN_SIZE + x) * 4;
  return [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!, pixels[index + 3]!];
}

describe('renderIcon', () => {
  it('emits a valid PNG signature', () => {
    const png = renderIcon();
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  });

  it('declares a 128x128 image', () => {
    const header = readHeader(renderIcon());
    expect(header.width).toBe(128);
    expect(header.height).toBe(128);
  });

  it('renders deterministically', () => {
    expect(renderIcon().equals(renderIcon())).toBe(true);
  });

  it('leaves the four corners transparent', () => {
    const pixels = decodePixels(renderIcon());
    for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127]] as const) {
      expect(pixelAt(pixels, x, y)[3]).toBe(0);
    }
  });

  it('fills the centre with the opaque tile', () => {
    const pixels = decodePixels(renderIcon());
    expect(pixelAt(pixels, 64, 64)[3]).toBe(255);
  });

  it('draws the value arc in the brand green', () => {
    const pixels = decodePixels(renderIcon());
    const [r, g, b, a] = pixelAt(pixels, 64, 25);
    expect(a).toBe(255);
    expect(Math.abs(r - PALETTE.brand[0]!)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - PALETTE.brand[1]!)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - PALETTE.brand[2]!)).toBeLessThanOrEqual(2);
  });

  it('draws the knob in white', () => {
    const pixels = decodePixels(renderIcon());
    expect(pixelAt(pixels, 80, 28)).toEqual([255, 255, 255, 255]);
  });

  it('draws the track where the value arc is absent', () => {
    const pixels = decodePixels(renderIcon());
    const track = pixelAt(pixels, 98, 44);
    const plainTile = pixelAt(pixels, 64, 100);
    expect(track[3]).toBe(255);
    expect(track[0]!).toBeGreaterThan(plainTile[0]! + 30);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/make-icon.test.ts`

Expected: FAIL — the import of `renderIcon` from `./make-icon.mjs` fails because the module does not
export it yet. Vitest reports a syntax/import error for that file.

---

### Task 2: Implement the rasterising generator

**Files:**

- Modify: `scripts/make-icon.mjs` (full rewrite)

- [ ] **Step 1: Replace `scripts/make-icon.mjs` with the rasteriser**

```js
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DESIGN_SIZE = 128;
export const SUBPIXEL_SAMPLES = 8;

export const PALETTE = {
  tileTop: [0x1a, 0x29, 0x37],
  tileBottom: [0x0a, 0x12, 0x19],
  brand: [0x1b, 0xaf, 0x7a],
  white: [0xff, 0xff, 0xff],
};

export const GEOMETRY = {
  cornerRadius: 27,
  glow: { cx: 35.8, cy: 19.2, radius: 108.8, opacity: 0.34 },
  arc: { cx: 64, cy: 64, radius: 39, width: 13 },
  track: { startDeg: 150, endDeg: 390, opacity: 0.22 },
  value: { startDeg: 150, endDeg: 294 },
  knob: { cx: 79.9, cy: 28.4, radius: 7.5 },
};

const HALF_STROKE = GEOMETRY.arc.width / 2;

function lerp(from, to, t) {
  return from + (to - from) * t;
}

function mix(from, to, t) {
  return [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)];
}

/** Source-over composite of a straight-alpha colour onto a straight-alpha destination. */
function over(destination, color, alpha) {
  if (alpha <= 0) return destination;
  const outAlpha = alpha + destination[3] * (1 - alpha);
  if (outAlpha === 0) return [0, 0, 0, 0];
  const weight = destination[3] * (1 - alpha);
  return [
    (color[0] * alpha + destination[0] * weight) / outAlpha,
    (color[1] * alpha + destination[1] * weight) / outAlpha,
    (color[2] * alpha + destination[2] * weight) / outAlpha,
    outAlpha,
  ];
}

function insideRoundedRect(x, y, radius, size) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function angleDegrees(x, y) {
  const angle = (Math.atan2(y - GEOMETRY.arc.cy, x - GEOMETRY.arc.cx) * 180) / Math.PI;
  return angle < 0 ? angle + 360 : angle;
}

/** True when the point is inside the stroked band and within the arc's angular range. */
function withinArc(x, y, startDeg, endDeg) {
  const distance = Math.hypot(x - GEOMETRY.arc.cx, y - GEOMETRY.arc.cy);
  if (Math.abs(distance - GEOMETRY.arc.radius) > HALF_STROKE) return false;
  const angle = angleDegrees(x, y);
  const start = ((startDeg % 360) + 360) % 360;
  const end = ((endDeg % 360) + 360) % 360;
  return start <= end ? angle >= start && angle < end : angle >= start || angle < end;
}

/** The round cap disc at one end of the value arc. */
function insideCap(x, y, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cx = GEOMETRY.arc.cx + GEOMETRY.arc.radius * Math.cos(radians);
  const cy = GEOMETRY.arc.cy + GEOMETRY.arc.radius * Math.sin(radians);
  return Math.hypot(x - cx, y - cy) <= HALF_STROKE;
}

function sample(x, y) {
  if (!insideRoundedRect(x, y, GEOMETRY.cornerRadius, DESIGN_SIZE)) return [0, 0, 0, 0];

  const { glow, track, value, knob } = GEOMETRY;
  const gradientT = (x + y) / (2 * DESIGN_SIZE);
  let pixel = over([0, 0, 0, 0], mix(PALETTE.tileTop, PALETTE.tileBottom, gradientT), 1);

  const glowDistance = Math.hypot(x - glow.cx, y - glow.cy);
  const glowAlpha = glow.opacity * (1 - Math.min(glowDistance / glow.radius, 1));
  pixel = over(pixel, PALETTE.brand, glowAlpha);

  if (withinArc(x, y, track.startDeg, track.endDeg)) {
    pixel = over(pixel, PALETTE.white, track.opacity);
  }

  const onValueArc =
    withinArc(x, y, value.startDeg, value.endDeg) ||
    insideCap(x, y, value.startDeg) ||
    insideCap(x, y, value.endDeg);
  if (onValueArc) pixel = over(pixel, PALETTE.brand, 1);

  if (Math.hypot(x - knob.cx, y - knob.cy) <= knob.radius) {
    pixel = over(pixel, PALETTE.white, 1);
  }

  return pixel;
}

function renderPixels(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = DESIGN_SIZE / size;
  const total = SUBPIXEL_SAMPLES * SUBPIXEL_SAMPLES;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;
      for (let sy = 0; sy < SUBPIXEL_SAMPLES; sy++) {
        for (let sx = 0; sx < SUBPIXEL_SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SUBPIXEL_SAMPLES) * scale;
          const y = (py + (sy + 0.5) / SUBPIXEL_SAMPLES) * scale;
          const point = sample(x, y);
          accR += point[0] * point[3];
          accG += point[1] * point[3];
          accB += point[2] * point[3];
          accA += point[3];
        }
      }
      const index = (py * size + px) * 4;
      const alpha = accA / total;
      if (alpha > 0) {
        pixels[index] = Math.round((accR / accA) * 255);
        pixels[index + 1] = Math.round((accG / accA) * 255);
        pixels[index + 2] = Math.round((accB / accA) * 255);
        pixels[index + 3] = Math.round(alpha * 255);
      }
    }
  }
  return pixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng(pixels, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function renderIcon(size = DESIGN_SIZE) {
  return encodePng(renderPixels(size), size, size);
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  mkdirSync(resolve(root, 'media'), { recursive: true });
  writeFileSync(resolve(root, 'media', 'icon.png'), renderIcon());
  console.log(`Wrote media/icon.png (${DESIGN_SIZE}x${DESIGN_SIZE})`);
}

if (process.argv[1]?.endsWith('make-icon.mjs')) main();
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run scripts/make-icon.test.ts`

Expected: PASS — 8 tests passed.

- [ ] **Step 3: Run the whole suite to confirm nothing regressed**

Run: `npm test`

Expected: PASS — 38 test files, 259 tests passed (37 files / 251 tests before this plan, plus the new
icon test file).

---

### Task 3: Wire the `icon` script and regenerate the asset

**Files:**

- Modify: `package.json` (add a script)
- Regenerate: `media/icon.png`

- [ ] **Step 1: Add the `icon` script to `package.json`**

Insert it after the `watch` script so the build-related scripts stay together:

```json
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "icon": "node scripts/make-icon.mjs",
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 2: Regenerate the icon**

Run: `npm run icon`

Expected: `Wrote media/icon.png (128x128)`

- [ ] **Step 3: Confirm the regeneration is reproducible**

Run: `npm run icon && md5sum media/icon.png && npm run icon && md5sum media/icon.png`

Expected: the two hashes are identical, which proves the generator is deterministic and a
regeneration will not produce a spurious diff.

- [ ] **Step 4: Commit the generator, the test, the script and the asset**

```bash
git add scripts/make-icon.mjs scripts/make-icon.test.ts package.json media/icon.png
git commit -m "feat: redesign the marketplace icon

Replace the generic bar chart with a 240-degree gauge dial in the brand green
and rasterise it with supersampling instead of hard-edged rectangle fills.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Add the icon check to the release gate

**Files:**

- Modify: `scripts/release-gate.mjs`

- [ ] **Step 1: Restructure `scripts/release-gate.mjs` so the icon check is testable**

`scripts/release-gate.mjs` currently runs entirely at module top level and calls `process.exit(1)`.
Importing it from a test would therefore run the whole gate and could kill the test process. Wrap
the body in `main()`, add the same CLI guard that `scripts/guard-fixtures.mjs` uses, and export the
icon check as a pure function.

Replace the whole file with:

```js
import { readFileSync } from 'node:fs';
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

function main() {
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
```

Two details matter here. The CLI guard is what makes the module safe to import — without it the
`process.exit(1)` inside `main()` would terminate the Vitest worker. And the expected size comes
from `DESIGN_SIZE` in the icon module rather than a duplicated literal, so the gate and the
generator cannot drift apart.

- [ ] **Step 2: Write the test**

Create `scripts/release-gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DESIGN_SIZE } from './make-icon.mjs';
import { checkIcon } from './release-gate.mjs';

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
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx vitest run scripts/release-gate.test.ts`

Expected: PASS — 4 tests passed.

- [ ] **Step 4: Run the release gate to confirm the real icon passes**

Run: `node scripts/release-gate.mjs`

Expected: `Release gate OK.`

- [ ] **Step 5: Commit**

```bash
git add scripts/release-gate.mjs scripts/release-gate.test.ts
git commit -m "build: validate the marketplace icon before packaging

Nothing checked the icon's dimensions, so a mis-sized regeneration would
have shipped silently.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Bump to 0.1.1 and update the changelog

**Files:**

- Modify: `package.json` (`version`)
- Modify: `package-lock.json` (two `version` fields)
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md` (document the `icon` command)

- [ ] **Step 1: Bump the version in `package.json`**

Change `"version": "0.1.0"` to `"version": "0.1.1"`.

- [ ] **Step 2: Bump the version in `package-lock.json`**

Change both `"version": "0.1.0"` occurrences to `"version": "0.1.1"`. The first is the root package
entry; the second is under `packages[""]`.

- [ ] **Step 3: Add the changelog entry**

Insert a new section above the `## 0.1.0 — 2026-11-17` heading in `CHANGELOG.md`:

```md
## 0.1.1 — 2026-11-17

- 重新设计插件图标：以额度仪表盘替代通用柱状图，并改用超采样渲染。
- 打包前校验图标尺寸，避免尺寸错误的资源静默发布。
```

- [ ] **Step 4: Document the `icon` command in `CLAUDE.md`**

In the `## Commands` block of `CLAUDE.md`, add a line after `npm run watch`:

```bash
npm run icon            # regenerate media/icon.png from scripts/make-icon.mjs
```

Also add a line to the `## Gotchas` section recording that the icon is a generated asset:

```md
- **The marketplace icon is generated.** `media/icon.png` comes from `npm run icon`; never
  hand-edit the PNG. The generator is deterministic, so a regeneration that shows a diff means the
  geometry changed.
```

- [ ] **Step 5: Verify the version bump is consistent**

Run: `node -e "const p=require('./package.json');const l=require('./package-lock.json');if(p.version!=='0.1.1'||l.version!=='0.1.1'||l.packages[''].version!=='0.1.1'){console.error('version mismatch');process.exit(1)}console.log('version OK:',p.version)"`

Expected: `version OK: 0.1.1`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md CLAUDE.md
git commit -m "build: release v0.1.1

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Verify the release

**Files:** none — verification only

- [ ] **Step 1: Run the full verification chain**

Run: `npm run typecheck && npm test && npm run check:locales && npm run guard:fixtures && node scripts/release-gate.mjs`

Expected: typecheck clean; vitest reports 39 test files and 263 tests passed; locale keys OK;
fixture guard OK; release gate OK.

- [ ] **Step 2: Package the extension**

Run: `npm run package`

Expected: `Package guard OK: 7 files scanned, 9 entries shipped.` and a `quota-deck-0.1.1.vsix`
produced at the repository root.

- [ ] **Step 3: Confirm the package ships the new icon and no dev files**

Run: `npx vsce ls`

Expected: exactly these entries — `CHANGELOG.md`, `LICENSE`, `README.md`, `dist/extension.js`,
`dist/webview.js`, `media/icon.png`, `package.json`, `package.nls.json`,
`package.nls.zh-cn.json`. `CLAUDE.md` and `scripts/**` must be absent.

- [ ] **Step 4: Confirm the packaged icon is the new one**

Run: `npx vsce ls` output aside, verify `media/icon.png` on disk differs from the v0.1.0 asset by
inspecting the file size — the new asset is a 128 × 128 RGBA PNG with an antialiased gradient and
will not match the previous file's byte length.

- [ ] **Step 5: Commit the changelog-adjacent release artefact if the build produced one**

The `.vsix` is gitignored (`.gitignore` contains `*.vsix`), so there is nothing to commit. Confirm
with `git status --short` that only expected changes remain.

---

### Task 7: Push

**Files:** none — remote operation

- [ ] **Step 1: Confirm the branch and the commits that will be pushed**

Run: `git log --oneline origin/main..HEAD`

Expected: the icon commits, the release commit, and the earlier `docs: add the icon redesign spec`
and `chore: ignore the brainstorming session artifacts` commits.

- [ ] **Step 2: Push**

Run: `git push origin main`

Expected: `main -> main`.

- [ ] **Step 3: Confirm the remote caught up**

Run: `git status -sb`

Expected: `## main...origin/main` with no ahead/behind counts.
