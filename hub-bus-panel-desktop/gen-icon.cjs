// gen-icon.cjs — generate a 32x32 placeholder tray-icon.png.
//
// Why this script exists:
//   We don't ship a binary PNG in source; instead we generate one at install
//   time so the source tree stays text-only. The package.json `postinstall`
//   hook runs this. You can also run `node gen-icon.cjs` manually.
//
// The image is a flat #1f3a5e square (the splicer's "to-pill" blue) with a
// 2px #58a6ff border. Swap with a real icon any time — this is intentionally
// trivial.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const W = 32, H = 32;
const FILL = [0x1f, 0x3a, 0x5e]; // splicer dark-blue
const EDGE = [0x58, 0xa6, 0xff]; // splicer blue2

// Build raw RGBA scanlines, each prefixed with a 0x00 filter byte.
const stride = 1 + W * 4;
const raw = Buffer.alloc(stride * H);
for (let y = 0; y < H; y++) {
  let off = y * stride;
  raw[off++] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    const onEdge = (x < 2 || x > W - 3 || y < 2 || y > H - 3);
    const c = onEdge ? EDGE : FILL;
    raw[off++] = c[0];
    raw[off++] = c[1];
    raw[off++] = c[2];
    raw[off++] = 0xff; // alpha
  }
}

const idatData = zlib.deflateSync(raw);

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcInput) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// CRC-32 (PNG flavor)
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr.writeUInt8(8, 8);   // bit depth
ihdr.writeUInt8(6, 9);   // color type RGBA
ihdr.writeUInt8(0, 10);  // compression
ihdr.writeUInt8(0, 11);  // filter
ihdr.writeUInt8(0, 12);  // interlace

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idatData),
  chunk('IEND', Buffer.alloc(0))
]);

const out = path.join(__dirname, 'tray-icon.png');
fs.writeFileSync(out, png);
console.log('[gen-icon] wrote', out, '(' + png.length + ' bytes)');
