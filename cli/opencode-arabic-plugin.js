// OpenCode TUI plugin source: fixes Arabic on screen inside OpenCode itself — any terminal, no
// WezTerm, no prompt sent to the model. It hooks the renderer's last step (after OpenCode drew the
// frame, before it reaches the terminal) and reorders + joins Arabic on every row with cli/bidi.js.
// What you type and what the model receives are untouched; only the picture changes.
import fs from 'node:fs';

export const PLUGIN_FILE = 'abdalgani-arabic-display.js';

const WRAPPER = String.raw`
// top 2 bits of a cell: 2 = grapheme id (non-ASCII text), 3 = second half of a wide char. (>>> keeps it
// unsigned — a plain & gives a negative number that never equals 0xC0000000.)
const isCont = (c) => (c >>> 30) === 3;
const isGrapheme = (c) => (c >>> 30) === 2;
const FRAME = 0x2502; // stands in for cells that must never move (wide chars and their continuation)
const decoder = new TextDecoder();
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null;
const graphemes = (s) => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));

const OBJ = 0xFFFC; // stands in for a wide/composite neutral (emoji…): it moves with the sentence as one unit

// Per-cell text of the frame. V2 hands it over exactly (resolved chars + byte length per cell);
// V1 only has the whole text with line breaks, split into graphemes and matched to the cells.
function cellTexts(buf, w, h, ch) {
  if (typeof buf.withResolvedChars === 'function') {
    return buf.withResolvedChars({ addLineBreaks: false, cellLengths: true }, (bytes, _b, lens) => {
      const out = new Array(w * h);
      for (let i = 0, off = 0; i < w * h; i++) { const n = lens[i]; out[i] = n ? decoder.decode(bytes.subarray(off, off + n)) : ''; off += n; }
      return out;
    });
  }
  const lines = decoder.decode(buf.getRealCharBytes(true)).split('\n');
  const out = new Array(w * h).fill('');
  for (let y = 0; y < h; y++) {
    const gs = graphemes(lines[y] || ''), o = y * w;
    let gi = 0;
    for (let x = 0; x < w; x++) {
      if (isCont(ch[o + x])) continue;
      if (gi >= gs.length) { out[o] = null; break; } // didn't line up: leave the row alone
      out[o + x] = gs[gi++];
    }
    if (gi !== gs.length) out[o] = null;
  }
  return out;
}

// OpenTUI keeps non-ASCII text (Arabic included) as ids into a grapheme pool, so the real text is
// read once per frame, and changed cells are written back with setCell / drawText — the native
// side then keeps the pool's reference counts right.
// A wide cell (emoji, CJK) is one unit of two cells: rows are reordered unit by unit, then laid
// back out cell by cell, so an emoji travels with its sentence instead of splitting it.
function fixFrame(buf, RGBA, cursor) {
  const w = buf.width, h = buf.height, B = buf.buffers;
  if (!w || !h) return;
  const ch = B.char, fg = B.fg, bg = B.bg, at = B.attributes;
  const sf = fg.length / (w * h), sb = bg.length / (w * h), sa = at.length / (w * h);
  const rows = [];
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) { const c = ch[o + x]; if (isGrapheme(c) || isRtl(c)) { rows.push(y); break; } }
  }
  if (!rows.length) return;
  const text = cellTexts(buf, w, h, ch);
  for (const y of rows) {
    const o = y * w;
    if (text[o] === null) continue;
    const units = [], unitOf = new Array(w);
    let rtl = false;
    for (let x = 0; x < w; x++) {
      if (isCont(ch[o + x])) { unitOf[x] = units.length - 1; if (units.length) units[units.length - 1].width++; continue; }
      const g = text[o + x] || ' ', cp = g.codePointAt(0), len = cp > 0xFFFF ? 2 : 1;
      unitOf[x] = units.length;
      if (isRtl(cp)) { rtl = true; units.push({ x, width: 1, cp, str: g, extra: g.slice(len) }); continue; }
      const glued = g.length > len && !isFrame(cp);
      units.push({ x, width: 1, cp: glued ? (isLtr(cp) ? 0x41 : OBJ) : cp, str: g, keep: glued });
    }
    if (!rtl) continue;
    for (const u of units) if (u.width > 1 && !isFrame(u.cp)) { u.keep = true; if (u.cp !== 0x41) u.cp = isLtr(u.cp) ? 0x41 : OBJ; }
    const n = units.length, cps = units.map((u) => u.cp);
    const bgKey = units.map((u) => { const i = (o + u.x) * sb; return bg[i] + ',' + bg[i + 1] + ',' + bg[i + 2] + ',' + bg[i + 3]; });
    const r = fixRow(cps, { bg: bgKey });
    if (!r) continue;
    const startAt = new Array(n); // visual unit index → its first cell
    for (let v = 0, X = 0; v < n; v++) { startAt[v] = X; X += units[r.map[v]].width; }
    if (cursor && cursor.y === y) {
      const cx = cursor.x;
      const ui = cx < w ? unitOf[cx] : n + (cx - w);
      const vu = cursorColumn(r, ui);
      cursor.x = vu < n ? startAt[vu] : w + (vu - n);
    }
    const F = fg.slice(o * sf, (o + w) * sf), G = bg.slice(o * sb, (o + w) * sb), A = at.slice(o * sa, (o + w) * sa);
    for (let v = 0; v < n; v++) {
      const u = units[r.map[v]], X = startAt[v], sx = u.x;
      const out = u.keep || isFrame(u.cp) || u.cp === FRAME ? u.str : String.fromCodePoint(r.chars[v]) + (u.extra || '');
      if (X === sx && out === (text[o + sx] || ' ')) continue;
      const f = new RGBA(F.subarray(sx * sf, sx * sf + 4)), b = new RGBA(G.subarray(sx * sb, sx * sb + 4)), m = A[sx * sa];
      if (u.width > 1 && typeof buf.drawText === 'function') buf.drawText(out, X, y, f, b, m);
      else buf.setCell(X, y, out, f, b, m);
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
