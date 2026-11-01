// OpenCode TUI plugin source: fixes Arabic on screen inside OpenCode itself — any terminal, no
// WezTerm, no prompt sent to the model. It hooks the renderer's last step (after OpenCode drew the
// frame, before it reaches the terminal) and reorders + joins Arabic on every row with cli/bidi.js.
// What you type and what the model receives are untouched; only the picture changes.
import fs from 'node:fs';

export const PLUGIN_FILE = 'abdalgani-arabic-display.js';

const WRAPPER = String.raw`
const FLAGS = 0xC0000000, CONT = 0xC0000000;
const FRAME = 0x2502; // stands in for cells that must never move (wide chars and their continuation)
const decoder = new TextDecoder();
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null;
const graphemes = (s) => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));

// OpenTUI keeps non-ASCII text (Arabic included) as ids into a grapheme pool, so the real text is
// read once per frame with getRealCharBytes, and changed cells are written back with setCell —
// the native side then keeps the pool's reference counts right.
function fixFrame(buf, RGBA, cursor) {
  const w = buf.width, h = buf.height, B = buf.buffers;
  if (!w || !h) return;
  const ch = B.char, fg = B.fg, bg = B.bg, at = B.attributes;
  const sf = fg.length / (w * h), sb = bg.length / (w * h), sa = at.length / (w * h);
  const rows = [];
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) { const c = ch[o + x]; if (((c & FLAGS) && (c & FLAGS) !== CONT) || isRtl(c)) { rows.push(y); break; } }
  }
  if (!rows.length) return;
  const lines = decoder.decode(buf.getRealCharBytes(true)).split('\n');
  for (const y of rows) {
    const o = y * w, gs = graphemes(lines[y] || '');
    const cps = new Array(w), extra = new Array(w), str = new Array(w);
    let gi = 0, rtl = false;
    for (let x = 0; x < w; x++) {
      const c = ch[o + x];
      if ((c & FLAGS) === CONT) { cps[x] = FRAME; continue; }
      const g = gs[gi++];
      if (g === undefined) { gi = -1; break; }
      str[x] = g;
      const cp = g.codePointAt(0), len = cp > 0xFFFF ? 2 : 1;
      const wide = x + 1 < w && (ch[o + x + 1] & FLAGS) === CONT;
      if (isRtl(cp)) { cps[x] = cp; extra[x] = g.slice(len); rtl = true; } // letter (+ its harakat)
      else cps[x] = wide || g.length > len ? FRAME : cp;
    }
    if (!rtl || gi !== gs.length) continue; // nothing to do, or the text didn't line up with the cells
    const bgKey = new Array(w);
    for (let x = 0; x < w; x++) { const i = (o + x) * sb; bgKey[x] = bg[i] + ',' + bg[i + 1] + ',' + bg[i + 2] + ',' + bg[i + 3]; }
    const r = fixRow(cps, { bg: bgKey });
    if (!r) continue;
    if (cursor && cursor.y === y) cursor.x = cursorColumn(r, cursor.x);
    const F = fg.slice(o * sf, (o + w) * sf), G = bg.slice(o * sb, (o + w) * sb), A = at.slice(o * sa, (o + w) * sa);
    for (let x = 0; x < w; x++) {
      const s = r.map[x];
      if (cps[s] === FRAME && s === x) continue;
      const out = cps[s] === FRAME ? str[s] : String.fromCodePoint(r.chars[x]) + (extra[s] || '');
      if (s === x && out === str[x]) continue;
      buf.setCell(x, y, out, new RGBA(F.subarray(s * sf, s * sf + 4)), new RGBA(G.subarray(s * sb, s * sb + 4)), A[s * sa]);
    }
  }
}

// The renderer hook, shared by both OpenCode generations. Returns its cleanup.
function start(renderer, RGBA, isOn) {
  // The text box puts the terminal cursor at its LOGICAL column while drawing (before our hook);
  // remember that, and after reordering move the cursor to where that spot now is on screen.
  // V1 sets it from JS (caught by the wrapper below); V2 may set it natively, so the renderer's
  // cursor state is read too — anything that isn't the position we applied ourselves is fresh.
  const own = Object.prototype.hasOwnProperty.call(renderer, 'setCursorPosition');
  const prev = renderer.setCursorPosition;
  const setCursor = prev.bind(renderer);
  let logical = null, applied = null;
  renderer.setCursorPosition = (x, y, visible = true) => { logical = { x, y, visible }; applied = null; setCursor(x, y, visible); };
  const readCursor = () => {
    let st = null;
    try { st = renderer.getCursorState?.(); } catch {}
    if (st && typeof st.x === 'number' && !(applied && st.x === applied.x && st.y === applied.y)) { logical = { x: st.x, y: st.y, visible: !!st.visible }; applied = null; }
  };
  const restore = () => { if (applied && logical) { setCursor(logical.x, logical.y, logical.visible); applied = null; } };
  const fn = (buf) => {
    if (!isOn()) { restore(); return; }
    readCursor();
    const cur = logical && logical.visible ? { x: logical.x - 1, y: logical.y - 1 } : null; // 1-based → cells
    try { fixFrame(buf, RGBA, cur); } catch { if (cur) cur.x = logical.x - 1; }
    if (!cur) return;
    const want = cur.x + 1;
    if (want === logical.x) restore();
    else if (!applied || applied.x !== want || applied.y !== logical.y) { setCursor(want, logical.y, true); applied = { x: want, y: logical.y }; }
  };
  renderer.addPostProcessFn(fn);
  return () => {
    renderer.removePostProcessFn(fn);
    if (own) renderer.setCursorPosition = prev; else delete renderer.setCursorPosition;
    renderer.requestRender?.();
  };
}

const off = () => process.env.ABDALGANI_ARABIC_DISPLAY === '0';
const TOGGLE = (on) => (on ? 'عرض العربي مفعّل' : 'Arabic display off');

// The colour class (OpenTUI RGBA) is taken from any theme colour, so the plugin needs no imports.
function findRGBA(theme, depth = 0) {
  if (!theme || typeof theme !== 'object' || depth > 3) return null;
  if (theme.buffer instanceof Uint16Array || theme.buffer instanceof Float32Array) return theme.constructor;
  for (const v of Object.values(theme)) { const c = findRGBA(v, depth + 1); if (c) return c; }
  return null;
}

// OpenCode V1: { id, tui(api) }, loaded from tui.json
const tui = async (api) => {
  if (off()) return;
  let on = api.kv.get('abdalgani.arabic_display', true);
  const stop = start(api.renderer, api.theme.current.text.constructor, () => on);
  api.lifecycle.onDispose(stop);
  // /rtl toggles it (in case a screen looks odd), remembered between runs
  api.command?.register(() => [{
    title: on ? 'Arabic display: off (عرض العربي: إيقاف)' : 'Arabic display: on (عرض العربي: تشغيل)',
    value: 'abdalgani.rtl', category: 'abdalgani', slash: { name: 'rtl' },
    onSelect: (dialog) => {
      on = !on; api.kv.set('abdalgani.arabic_display', on); dialog?.clear?.();
      api.ui.toast({ variant: 'info', message: TOGGLE(on) });
      api.renderer.requestRender?.();
    },
  }]);
};

// OpenCode V2: { id, setup(context) } in <config>/plugins/<name>/tui.js, discovered automatically
const setup = (ctx) => {
  if (off()) return;
  const RGBA = findRGBA(ctx.theme);
  if (!RGBA) return;
  let on = true, save = null;
  try {
    const [state, update] = ctx.storage.store('display', { initial: { on: true } });
    on = state?.on !== false;
    save = (v) => update((d) => { d.on = v; });
  } catch {}
  const stop = start(ctx.renderer, RGBA, () => on);
  try {
    ctx.keymap.layer(() => ({
      mode: 'global',
      commands: [{
        id: 'abdalgani.rtl', title: 'Arabic display on/off (عرض العربي)', group: 'abdalgani', palette: true, slash: { name: 'rtl' },
        run: () => {
          on = !on;
          try { save?.(on); } catch {}
          try { ctx.ui.toast.show({ message: TOGGLE(on), variant: 'info' }); } catch {}
          ctx.renderer.requestRender?.();
        },
      }],
    }));
  } catch {}
  return stop;
};

export default { id: 'abdalgani.arabic-display', tui, setup };
`;

/** The plugin file's text: bidi.js (exports dropped) + the renderer hook. */
export function pluginSource() {
  const bidi = fs.readFileSync(new URL('./bidi.js', import.meta.url), 'utf8').replace(/^export /gm, '');
  return `// abdalgani-setup: Arabic display for OpenCode (generated — re-run abdalgani-setup to update)\n${bidi}\n${WRAPPER}`;
}
