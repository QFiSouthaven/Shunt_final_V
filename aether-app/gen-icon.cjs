/* Placeholder tray icon generator.
 *
 * Writes a 32x32 PNG (deep-blue square with a brighter border) if tray-icon.png
 * is missing. Swap with real artwork before shipping a polished build.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const out = path.join(__dirname, 'tray-icon.png');
if (fs.existsSync(out)) {
  process.exit(0);
}

const W = 32, H = 32;
const BORDER = '#58a6ff';
const FILL = '#1f3a5e';

function hex(c) {
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return [r, g, b, 255];
}

const fill = hex(FILL);
const border = hex(BORDER);

// raw image data: scanlines prepended with filter byte (0 = None)
const raw = Buffer.alloc((W * 4 + 1) * H);
let off = 0;
for (let y = 0; y < H; y++) {
  raw[off++] = 0;
  for (let x = 0; x < W; x++) {
    const isBorder = (x < 2 || x >= W - 2 || y < 2 || y >= H - 2);
    const [r, g, b, a] = isBorder ? border : fill;
    raw[off++] = r; raw[off++] = g; raw[off++] = b; raw[off++] = a;
  }
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, c]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const idat = zlib.deflateSync(raw);
const iend = Buffer.alloc(0);

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', iend)
]);

fs.writeFileSync(out, png);
console.log('Generated placeholder tray-icon.png');
