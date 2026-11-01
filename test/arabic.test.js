// Arabic pack + auto-sync, against a throwaway HOME (Linux paths; Windows uses .cmd shims).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
  assert.equal(mod.default.id, 'abdalgani-arabic-display');
  assert.equal(typeof mod.default.tui, 'function');
  assert.ok(fs.readFileSync(file, 'utf8').includes('function fixRow'));
  // inside our WezTerm (it does bidi itself) the plugin stands down
  assert.match(ar.WEZTERM_LUA, /ABDALGANI_ARABIC_DISPLAY = '0'/);
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
