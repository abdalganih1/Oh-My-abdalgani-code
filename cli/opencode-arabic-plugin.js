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
function fixFrame(buf, RGBA) {
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
    const r = fixRow(cps);
    if (!r) continue;
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

const tui = async (api) => {
  if (process.env.ABDALGANI_ARABIC_DISPLAY === '0') return;
  const renderer = api.renderer;
  let on = api.kv.get('abdalgani.arabic_display', true);
  const RGBA = api.theme.current.text.constructor;
  const fn = (buf) => { if (on) { try { fixFrame(buf, RGBA); } catch {} } };
  renderer.addPostProcessFn(fn);
  api.lifecycle.onDispose(() => renderer.removePostProcessFn(fn));
  // /rtl toggles it (in case a screen looks odd), remembered between runs
  api.command?.register(() => [{
    title: on ? 'Arabic display: off (عرض العربي: إيقاف)' : 'Arabic display: on (عرض العربي: تشغيل)',
    value: 'abdalgani.rtl', category: 'abdalgani', slash: { name: 'rtl' },
    onSelect: (dialog) => {
      on = !on; api.kv.set('abdalgani.arabic_display', on); dialog?.clear?.();
      api.ui.toast({ variant: 'info', message: on ? 'عرض العربي مفعّل' : 'Arabic display off' });
      renderer.requestRender?.();
    },
  }]);
};

export default { id: 'abdalgani-arabic-display', tui };
`;

/** The plugin file's text: bidi.js (exports dropped) + the renderer hook. */
export function pluginSource() {
  const bidi = fs.readFileSync(new URL('./bidi.js', import.meta.url), 'utf8').replace(/^export /gm, '');
  return `// abdalgani-setup: Arabic display for OpenCode (generated — re-run abdalgani-setup to update)\n${bidi}\n${WRAPPER}`;
}
