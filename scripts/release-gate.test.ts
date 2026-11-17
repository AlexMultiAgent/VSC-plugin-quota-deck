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
