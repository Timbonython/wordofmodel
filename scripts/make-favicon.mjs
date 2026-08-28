/**
 * Builds app/favicon.ico from the 32px icon route.
 *
 *   npm run favicon        (needs `npm run build` first, and the server running on :3111)
 *
 * WHY THIS EXISTS AT ALL. Every other icon on this site is generated at build time by an
 * ImageResponse route, so the mark lives in exactly one place - lib/brand.ts - and no binary
 * has to be kept in step by hand. `.ico` is the one format Next cannot emit, and `/favicon.ico`
 * is requested by browsers, bookmark tools and crawlers whether or not a <link> tag points at
 * it. Production was 404ing on that path once before; a committed file is what fixed it.
 *
 * So this is still a checked-in binary, but a REPRODUCIBLE one: it is the bytes of /icon,
 * wrapped in an ICO container. If the mark changes, run this again rather than opening a
 * favicon generator, which is what put three different marks in public in the first place.
 *
 * THE CONTAINER. An .ico may hold a PNG directly rather than a BMP, which every browser has
 * accepted since IE11 and which avoids hand-rolling a bitmap with an AND mask. Six-byte
 * ICONDIR, one sixteen-byte ICONDIRENTRY, then the PNG.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.ICON_URL ?? 'http://localhost:3111/icon';
const OUT = join(here, '../app/favicon.ico');
const SIZE = 32;

const res = await fetch(SRC);
if (!res.ok) {
  console.error(`make-favicon: ${SRC} returned ${res.status}.`);
  console.error('Run `npm run build && npx next start -p 3111` first, or set ICON_URL.');
  process.exit(1);
}
const png = Buffer.from(await res.arrayBuffer());
if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
  console.error('make-favicon: that URL did not return a PNG.');
  process.exit(1);
}

const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // 1 = icon
dir.writeUInt16LE(1, 4); // one image

const entry = Buffer.alloc(16);
entry.writeUInt8(SIZE === 256 ? 0 : SIZE, 0); // width, 0 means 256
entry.writeUInt8(SIZE === 256 ? 0 : SIZE, 1); // height
entry.writeUInt8(0, 2); // palette size, 0 for truecolour
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // colour planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(png.length, 8); // bytes of image data
entry.writeUInt32LE(dir.length + entry.length, 12); // offset to that data

writeFileSync(OUT, Buffer.concat([dir, entry, png]));
console.log(`make-favicon: wrote app/favicon.ico, ${SIZE}x${SIZE}, ${dir.length + entry.length + png.length} bytes, from ${SRC}`);
