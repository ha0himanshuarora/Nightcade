#!/usr/bin/env node
/* Nightcade build: node build.js
 * Produces dist/chromium (Chrome, Edge, Brave, Opera, Vivaldi, Arc) and dist/firefox, plus .zip packages. No dependencies. */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const SRC = path.join(__dirname, 'src'), DIST = path.join(__dirname, 'dist');
const VERSION = require('./package.json').version;

const base = {
  manifest_version: 3,
  name: 'Nightcade',
  short_name: 'Nightcade',
  version: VERSION,
  description: 'Retro-arcade dark mode for every website. Smart color mapping that keeps your photos real. Per-site control, 26 themes plus your own custom colors.',
  icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  action: { default_title: 'Nightcade', default_popup: 'popup/popup.html', default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png' } },
  permissions: ['storage'],
  host_permissions: ['<all_urls>'],
  content_scripts: [{
    matches: ['<all_urls>'],
    js: ['shared/themes.js', 'shared/defaults.js', 'content/color.js', 'content/engine.js'],
    run_at: 'document_start', all_frames: true, match_about_blank: true
  }],
  commands: {
    'toggle-site': { suggested_key: { default: 'Alt+Shift+D', mac: 'MacCtrl+Shift+D' }, description: 'Toggle Nightcade on the current site' },
    'toggle-global': { suggested_key: { default: 'Alt+Shift+G', mac: 'MacCtrl+Shift+G' }, description: 'Switch Nightcade on or off everywhere' }
  }
};
const targets = {
  chromium: () => ({ ...base, minimum_chrome_version: '111', background: { service_worker: 'background.js' } }),
  firefox: () => ({
    ...base,
    background: { scripts: ['shared/defaults.js', 'background.js'] },
    browser_specific_settings: { gecko: { id: '{1cbd687b-78cb-46bc-a1d4-7b50d6572be3}', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } },
      gecko_android: { strict_min_version: '142.0' } }
  })
};

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    e.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}
function listFiles(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? listFiles(path.join(dir, e.name), rel + e.name + '/') : [rel + e.name]);
}
/* minimal zip writer (deflate) */
function zip(dir, out) {
  const files = listFiles(dir).sort(), chunks = [], central = []; let offset = 0;
  const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = buf => { let c = ~0; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };
  for (const f of files) {
    const data = fs.readFileSync(path.join(dir, f)), comp = zlib.deflateRawSync(data), name = Buffer.from(f), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
    chunks.push(h, name, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name); offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(out, Buffer.concat([...chunks, cd, end]));
}

fs.rmSync(DIST, { recursive: true, force: true });
for (const [name, mk] of Object.entries(targets)) {
  const out = path.join(DIST, name);
  copyDir(SRC, out);
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(mk(), null, 2));
  zip(out, path.join(DIST, `nightcade-${name}-${VERSION}.zip`));
  console.log('built', path.relative(__dirname, out));
}
