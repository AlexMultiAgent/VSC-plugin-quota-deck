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
