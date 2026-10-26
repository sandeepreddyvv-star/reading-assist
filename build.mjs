// Bundles each entry point into dist/ and copies the static files Chrome needs.
// Content scripts cannot use `import`, so every entry is bundled into one plain script.
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const watch = process.argv.includes('--watch');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/fonts', { recursive: true });
mkdirSync('dist/icons', { recursive: true });

const copy = (from, to) => cpSync(from, `dist/${to}`);
copy('manifest.json', 'manifest.json');
copy('src/popup/popup.html', 'popup.html');
copy('src/popup/popup.css', 'popup.css');
copy('src/options/options.html', 'options.html');
copy('src/options/options.css', 'options.css');

// Fonts are bundled (not loaded from a CDN) because many sites' security policies block outside fonts.
const fontFiles = {
  'opendyslexic-400.woff': 'node_modules/open-dyslexic/woff/OpenDyslexic-Regular.woff',
  'opendyslexic-700.woff': 'node_modules/open-dyslexic/woff/OpenDyslexic-Bold.woff',
  'atkinson-400.woff2': 'node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2',
  'atkinson-700.woff2': 'node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2',
  'lexend-400.woff2': 'node_modules/@fontsource/lexend/files/lexend-latin-400-normal.woff2',
  'lexend-700.woff2': 'node_modules/@fontsource/lexend/files/lexend-latin-700-normal.woff2',
};
for (const [name, src] of Object.entries(fontFiles)) copy(src, `fonts/${name}`);

// --- Toolbar icons, drawn as plain pixels so the build needs no image tooling. ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function icon(size) {
  const rows = [];
  const r = size * 0.22;
  const bars = [[0.28, 0.72], [0.46, 0.72], [0.64, 0.5]]; // [y, right edge] of three "text lines"
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const cx = Math.min(Math.max(x + 0.5, r), size - r);
      const cy = Math.min(Math.max(y + 0.5, r), size - r);
      const inside = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
      const onBar = bars.some(([by, right]) =>
        Math.abs(y / size - by) < 0.055 && x / size > 0.26 && x / size < right);
      const px = 1 + x * 4;
      const [R, G, B] = onBar ? [255, 255, 255] : [52, 70, 184];
      row[px] = R; row[px + 1] = G; row[px + 2] = B; row[px + 3] = inside ? 255 : 0;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const size of [16, 48, 128]) writeFileSync(`dist/icons/icon${size}.png`, icon(size));

const options = {
  entryPoints: {
    content: 'src/content/index.ts',
    popup: 'src/popup/popup.ts',
    options: 'src/options/options.ts',
    'service-worker': 'src/background/service-worker.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes. Reload the extension at chrome://extensions after each rebuild.');
} else {
  await esbuild.build(options);
}
