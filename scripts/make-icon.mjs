import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const width = 128;
const height = 128;
const pixels = Buffer.alloc(width * height * 4);

function setPixel(x, y, r, g, b, a = 255) {
  const index = (y * width + x) * 4;
  pixels[index] = r;
  pixels[index + 1] = g;
  pixels[index + 2] = b;
  pixels[index + 3] = a;
}

function roundedRect(x0, y0, x1, y1, radius, color) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const dx = x < x0 + radius ? x0 + radius - x : x >= x1 - radius ? x - (x1 - radius - 1) : 0;
      const dy = y < y0 + radius ? y0 + radius - y : y >= y1 - radius ? y - (y1 - radius - 1) : 0;
      if (dx * dx + dy * dy <= radius * radius) setPixel(x, y, ...color);
    }
  }
}

roundedRect(4, 4, 124, 124, 24, [18, 30, 44, 255]);
roundedRect(11, 11, 117, 117, 19, [24, 42, 61, 255]);
const bars = [
  { x: 30, y: 47, h: 44, color: [27, 175, 122, 255] },
  { x: 53, y: 33, h: 58, color: [42, 120, 214, 255] },
  { x: 76, y: 56, h: 35, color: [235, 104, 52, 255] },
];
for (const bar of bars) roundedRect(bar.x, bar.y, bar.x + 16, 96, 5, bar.color);
roundedRect(24, 96, 104, 102, 3, [219, 231, 242, 255]);

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
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
mkdirSync(resolve(root, 'media'), { recursive: true });
writeFileSync(resolve(root, 'media', 'icon.png'), png);
console.log(`Wrote media/icon.png (${width}x${height})`);
