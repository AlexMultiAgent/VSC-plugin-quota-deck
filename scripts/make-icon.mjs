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
        pixels[index] = Math.round(accR / accA);
        pixels[index + 1] = Math.round(accG / accA);
        pixels[index + 2] = Math.round(accB / accA);
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
