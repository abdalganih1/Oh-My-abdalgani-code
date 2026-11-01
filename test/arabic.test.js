// Arabic pack + auto-sync, against a throwaway HOME (Linux paths; Windows uses .cmd shims).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'abd-home-'));
process.env.HOME = home; process.env.USERPROFILE = home;
const ar = await import('../cli/arabic.js');
const { withCronLines } = await import('../cli/schedule.js');

test('WezTerm config: written fresh with bidi + shaping fonts; a user config is never overwritten', () => {
  const r = ar.writeWezTermConfig();
  assert.equal(r.file, path.join(home, '.wezterm.lua'));
  const lua = fs.readFileSync(r.file, 'utf8');
  assert.match(lua, /bidi_enabled = true/);
  assert.match(lua, /bidi_direction = 'AutoLeftToRight'/);
  assert.match(lua, /Noto Sans Arabic/);
  ar.writeWezTermConfig(); // ours → refreshed in place
  fs.writeFileSync(r.file, 'return { font_size = 20 }\n'); // now it's the user's own
  const r2 = ar.writeWezTermConfig();
  assert.equal(r2.merged, true);
  assert.equal(fs.readFileSync(r.file, 'utf8'), 'return { font_size = 20 }\n');
  assert.ok(fs.existsSync(path.join(home, '.config', 'wezterm', 'abdalgani-arabic.lua')));
});

test('launchers: <tool>-ar + abd-ar run the tool inside WezTerm from the current dir', () => {
  const made = ar.writeLaunchers(['opencode', 'pi', 'opencode'], ['/opt/wez term/wezterm']);
  assert.deepEqual(made, ['opencode-ar', 'pi-ar', 'abd-ar']);
  const sh = fs.readFileSync(path.join(home, '.local', 'bin', 'opencode-ar'), 'utf8');
  assert.match(sh, /exec "\/opt\/wez term\/wezterm" start --cwd "\$PWD" -- opencode "\$@"/);
  assert.ok(fs.statSync(path.join(home, '.local', 'bin', 'pi-ar')).mode & 0o100, 'executable');
});

test('pi /ar and /en prompt templates', () => {
  ar.writePiArabicPrompts();
  const t = fs.readFileSync(path.join(home, '.pi', 'agent', 'prompts', 'ar.md'), 'utf8');
  assert.match(t, /^---\ndescription: /);
  assert.match(t, /العربية/);
  assert.match(t, /\$\{@:-\}/);
  assert.ok(fs.existsSync(path.join(home, '.pi', 'agent', 'prompts', 'en.md')));
});

test('crontab lines: idempotent add, keeps the user\'s jobs, clean removal', () => {
  const cmd = ['/usr/bin/node', '/x/setup.js', '--sync', '--quiet'];
  const once = withCronLines('0 1 * * * backup.sh\n', true, cmd);
  const twice = withCronLines(once, true, cmd);
  assert.equal(once, twice);
  assert.match(once, /^0 1 \* \* \* backup\.sh$/m);
  assert.match(once, /23 \*\/6 \* \* \* "\/usr\/bin\/node" "\/x\/setup\.js" "--sync" "--quiet" .*# abdalgani-sync/);
  assert.match(once, /@reboot/);
  assert.equal(withCronLines(once, false, cmd), '0 1 * * * backup.sh\n');
  assert.equal(withCronLines('', false, cmd), '');
});

test('systemd fallback units (distros without cron)', async () => {
  const { systemdUnits } = await import('../cli/schedule.js');
  const u = systemdUnits(['/usr/bin/node', '/home/a b/setup.js', '--sync', '--quiet']);
  assert.match(u.service, /ExecStart=\/usr\/bin\/node "\/home\/a b\/setup\.js" --sync --quiet/);
  assert.match(u.timer, /OnUnitActiveSec=6h/);
  assert.match(u.timer, /WantedBy=timers\.target/);
});

test('bidi: Arabic rows are reordered + joined; English words and numbers keep their order', async () => {
  const { displayLine, fixRow } = await import('../cli/bidi.js');
  assert.equal(displayLine('مرحبا'), 'ﺎﺒﺣﺮﻣ');
  assert.equal(displayLine('استخدم git الآن'), 'ﻥﺂﻟﺍ git ﻡﺪﺨﺘﺳﺍ');
  assert.equal(displayLine('العدد 123 هنا'), 'ﺎﻨﻫ 123 ﺩﺪﻌﻟﺍ');
  assert.equal(displayLine('(تجربة)'), '(ﺔﺑﺮﺠﺗ)'); // brackets mirrored
  assert.equal(displayLine('run npm install ثم شغل'), 'run npm install ﻞﻐﺷ ﻢﺛ'); // English sentence: only the Arabic run flips
  assert.equal(displayLine('│ مرحبا بك   │ sidebar'), '│ ﻚﺑ ﺎﺒﺣﺮﻣ   │ sidebar'); // UI frames + column gaps stay put
  assert.equal(fixRow(Array.from('plain english', (c) => c.codePointAt(0))), null);
});

test('OpenCode Arabic display plugin: written + registered in tui.json, keeps other plugins, loads as a TUI module', async () => {
  const { installArabicDisplayPlugin } = await import('../cli/tools/opencode.js');
  const dir = path.join(home, '.config', 'opencode');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tui.json'), JSON.stringify({ theme: 'nord', plugin: ['some-plugin'] }));
  const file = installArabicDisplayPlugin(dir);
  installArabicDisplayPlugin(dir); // idempotent
  const tui = JSON.parse(fs.readFileSync(path.join(dir, 'tui.json'), 'utf8'));
  assert.equal(tui.theme, 'nord');
  assert.equal(tui.plugin.length, 2);
  assert.equal(tui.plugin[0], 'some-plugin');
  assert.match(tui.plugin[1], /^file:\/\/.*abdalgani-arabic-display\.js$/);
  const mod = await import(`${tui.plugin[1]}?t=${Date.now()}`);
  assert.equal(mod.default.id, 'abdalgani.arabic-display');
  assert.equal(typeof mod.default.tui, 'function');
  assert.equal(typeof mod.default.setup, 'function'); // V2 shape too
  assert.ok(fs.readFileSync(file, 'utf8').includes('function fixRow'));
  // inside our WezTerm (it does bidi itself) the plugin stands down
  assert.match(ar.WEZTERM_LUA, /ABDALGANI_ARABIC_DISPLAY = '0'/);
});

test('OpenCode V2: plugin folder discovered under plugins/, stale tui.json/cli.json entries removed, setup hooks the renderer', async () => {
  const { installArabicDisplayPlugin, V2_PLUGIN_DIR } = await import('../cli/tools/opencode.js');
  const dir = path.join(home, '.config', 'opencode-v2');
  fs.mkdirSync(dir, { recursive: true });
  const old = 'file:///x/abdalgani/abdalgani-arabic-display.js';
  fs.writeFileSync(path.join(dir, 'tui.json'), JSON.stringify({ theme: 'nord', plugin: ['keep-me', old] }));
  fs.writeFileSync(path.join(dir, 'cli.json'), JSON.stringify({ theme: { name: 'nord' }, plugins: ['keep-me', old] }));
  const file = installArabicDisplayPlugin(dir, { v2: true });
  assert.equal(file, path.join(V2_PLUGIN_DIR(dir), 'tui.js'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'tui.json'), 'utf8')).plugin, ['keep-me']);
  const cli = JSON.parse(fs.readFileSync(path.join(dir, 'cli.json'), 'utf8'));
  assert.deepEqual(cli.plugins, ['keep-me']);
  assert.equal(cli.theme.name, 'nord');
  const server = await import(`${pathToFileURL(path.join(V2_PLUGIN_DIR(dir), 'index.js')).href}?t=${Date.now()}`);
  assert.equal(server.default.id, 'abdalgani.arabic-display');
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  // fake V2 context: setup adds a post-process hook + /rtl, and its cleanup removes them
  class RGBA { constructor(b) { this.buffer = new Uint16Array(b); } }
  const fns = [], layers = [];
  const renderer = { addPostProcessFn: (f) => fns.push(f), removePostProcessFn: (f) => fns.splice(fns.indexOf(f), 1), setCursorPosition() {} };
  const stop = mod.default.setup({
    renderer, theme: { text: { base: new RGBA([1, 2, 3, 4]) } },
    storage: { store: () => [{ on: true }, () => {}] }, keymap: { layer: (f) => layers.push(f()) }, ui: { toast: { show() {} } },
  });
  assert.equal(fns.length, 1);
  assert.equal(layers[0].commands[0].slash.name, 'rtl');
  stop();
  assert.equal(fns.length, 0);
  assert.equal(Object.hasOwn(renderer, 'setCursorPosition'), true); // the original is put back
  // switching back to V1 removes the V2 folder
  installArabicDisplayPlugin(dir);
  assert.equal(fs.existsSync(V2_PLUGIN_DIR(dir)), false);
});

test('OpenCode V2 frame: a line with an emoji is reordered as one sentence (the emoji moves as a 2-cell unit)', async () => {
  const { installArabicDisplayPlugin } = await import('../cli/tools/opencode.js');
  const dir = path.join(home, '.config', 'opencode-v2b');
  const file = installArabicDisplayPlugin(dir, { v2: true });
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  class RGBA { constructor(b) { this.buffer = new Uint16Array(b); } }
  const fns = [];
  mod.default.setup({ renderer: { addPostProcessFn: (f) => fns.push(f), removePostProcessFn() {}, setCursorPosition() {} }, theme: { t: new RGBA([0, 0, 0, 0]) }, storage: { store: () => [{ on: true }, () => {}] }, keymap: { layer() {} }, ui: { toast: { show() {} } } });
  // one row: "أنا 👋 بخير" + padding; the emoji takes 2 cells (second one is a continuation)
  const w = 20, cells = [];
  for (const g of new Intl.Segmenter().segment('أنا 👋 بخير')) { cells.push(g.segment); if (g.segment === '👋') cells.push(''); }
  while (cells.length < w) cells.push(' ');
  const screen = [...cells];
  const enc = new TextEncoder();
  const buf = {
    width: w, height: 1,
    buffers: {
      char: Uint32Array.from(cells, (c) => (c === '' ? 0xC0000000 : c.codePointAt(0) > 127 ? 0x80000001 : c.codePointAt(0))),
      fg: new Uint16Array(w * 4), bg: new Uint16Array(w * 4), attributes: new Uint32Array(w),
    },
    withResolvedChars(_o, cb) { const parts = cells.map((c) => enc.encode(c)); const lens = Uint8Array.from(parts, (p) => p.length); const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; } return cb(bytes, null, lens); },
    setCell(x, _y, s) { screen[x] = s; },
    drawText(s, x) { screen[x] = s; screen[x + 1] = ''; },
  };
  fns[0](buf);
  assert.equal(screen.join('').trimEnd(), '         ﺮﻴﺨﺑ 👋 ﺎﻧﺃ'); // right-aligned; visual: بخير on the left, then 👋, then أنا on the right
  // V1 has no per-cell text, only the whole frame text: same result
  screen.splice(0, w, ...cells);
  const v1 = { ...buf, withResolvedChars: undefined, getRealCharBytes: () => enc.encode(cells.join('')) };
  fns[0](v1);
  assert.equal(screen.join('').trimEnd(), '         ﺮﻴﺨﺑ 👋 ﺎﻧﺃ');
});

test('bidi: Arabic paragraphs align right inside their box; the cursor follows the visual order', async () => {
  const { fixRow, cursorColumn, displayLine } = await import('../cli/bidi.js');
  const box = '┃  مرحبا كيفك            │';
  const cells = Array.from(box, (c) => c.codePointAt(0));
  const r = fixRow(cells, { bg: cells.map(() => 1) });
  assert.equal(String.fromCodePoint(...r.chars), '┃            ﻚﻔﻴﻛ ﺎﺒﺣﺮﻣ  │'); // same 2-cell margin on the right
  assert.equal(cursorColumn(r, 13), 12); // end of text → left of the last letter typed
  assert.equal(cursorColumn(r, 3), 22); // start of text → on the first (rightmost) letter
  assert.equal(cursorColumn(r, 8), 17); // between the words
  // an English sentence with an Arabic word stays left-aligned
  assert.equal(displayLine('use مرحبا here      ', { bg: Array(20).fill(0) }), 'use ﺎﺒﺣﺮﻣ here      ');
});
