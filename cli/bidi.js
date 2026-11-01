// Arabic display fix for terminal UIs that draw cell-by-cell (OpenCode's TUI): terminals put
// characters left-to-right in the order they were typed, with no letter joining, so "مرحبا" shows
// as "ا ب ح ر م". This works on ONE screen row of cells (already wrapped by the UI) and:
//   1. shapes Arabic letters into their joined forms (isolated / initial / medial / final),
//   2. reorders the row with a simplified Unicode bidi algorithm (RTL runs reversed, English words
//      and numbers inside Arabic keep their order, brackets mirrored).
// Only the picture changes: the text the user types and the model receives stay untouched.
//
// Self-contained on purpose (no imports): this file's source is copied into the OpenCode plugin.

// [isolated, final, initial, medial] presentation forms. 2 forms = joins only to the previous letter.
const FORMS = {
  0x0621: [0xFE80], 0x0622: [0xFE81, 0xFE82], 0x0623: [0xFE83, 0xFE84], 0x0624: [0xFE85, 0xFE86],
  0x0625: [0xFE87, 0xFE88], 0x0626: [0xFE89, 0xFE8A, 0xFE8B, 0xFE8C], 0x0627: [0xFE8D, 0xFE8E],
  0x0628: [0xFE8F, 0xFE90, 0xFE91, 0xFE92], 0x0629: [0xFE93, 0xFE94], 0x062A: [0xFE95, 0xFE96, 0xFE97, 0xFE98],
  0x062B: [0xFE99, 0xFE9A, 0xFE9B, 0xFE9C], 0x062C: [0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0], 0x062D: [0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4],
  0x062E: [0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8], 0x062F: [0xFEA9, 0xFEAA], 0x0630: [0xFEAB, 0xFEAC],
  0x0631: [0xFEAD, 0xFEAE], 0x0632: [0xFEAF, 0xFEB0], 0x0633: [0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4],
  0x0634: [0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8], 0x0635: [0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC], 0x0636: [0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0],
  0x0637: [0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4], 0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8], 0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC],
  0x063A: [0xFECD, 0xFECE, 0xFECF, 0xFED0], 0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4], 0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8],
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC], 0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0], 0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4],
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8], 0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC], 0x0648: [0xFEED, 0xFEEE],
  0x0649: [0xFEEF, 0xFEF0], 0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4],
  // Persian / Urdu letters students may type
  0x067E: [0xFB56, 0xFB57, 0xFB58, 0xFB59], 0x0686: [0xFB7A, 0xFB7B, 0xFB7C, 0xFB7D], 0x0698: [0xFB8A, 0xFB8B],
  0x06A4: [0xFB6A, 0xFB6B, 0xFB6C, 0xFB6D], 0x06A9: [0xFB8E, 0xFB8F, 0xFB90, 0xFB91], 0x06AF: [0xFB92, 0xFB93, 0xFB94, 0xFB95],
  0x06CC: [0xFBFC, 0xFBFD, 0xFBFE, 0xFBFF],
};
const TATWEEL = 0x0640;
const MIRROR = { 0x28: 0x29, 0x29: 0x28, 0x5B: 0x5D, 0x5D: 0x5B, 0x7B: 0x7D, 0x7D: 0x7B, 0x3C: 0x3E, 0x3E: 0x3C, 0xAB: 0xBB, 0xBB: 0xAB };

/** Combining marks (harakat…): attach to the letter before them, never break joining. */
const isMark = (c) => (c >= 0x064B && c <= 0x065F) || c === 0x0670 || (c >= 0x06D6 && c <= 0x06ED);
export const isRtl = (c) => (c >= 0x0590 && c <= 0x08FF) || (c >= 0xFB1D && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF);
const isDigit = (c) => (c >= 0x30 && c <= 0x39) || (c >= 0x0660 && c <= 0x0669) || (c >= 0x06F0 && c <= 0x06F9);
/** Box drawing / blocks / private-use icons: UI frame, never part of a sentence. */
const isFrame = (c) => (c >= 0x2500 && c <= 0x259F) || (c >= 0xE000 && c <= 0xF8FF);
const isSpace = (c) => c === 0x20 || c === 0 || c === 0xA0;
const isLtr = (c) => !isRtl(c) && !isDigit(c) && ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || (c >= 0xC0 && c < 0x0590) || (c >= 0x0900 && c < 0x2000) || (c >= 0x3040 && c < 0xE000));

const joinsPrev = (c) => !!FORMS[c] && FORMS[c].length > 1 || c === TATWEEL;
const joinsNext = (c) => !!FORMS[c] && FORMS[c].length === 4 || c === TATWEEL;

/** Logical codepoints → joined presentation forms (same length, one cell per letter). */
export function shape(cps) {
  const out = cps.slice();
  const prevLetter = (i) => { for (let j = i - 1; j >= 0; j--) if (!isMark(cps[j])) return cps[j]; return 0; };
  const nextLetter = (i) => { for (let j = i + 1; j < cps.length; j++) if (!isMark(cps[j])) return cps[j]; return 0; };
  for (let i = 0; i < cps.length; i++) {
    const f = FORMS[cps[i]];
    if (!f) continue;
    const p = joinsNext(prevLetter(i)) && f.length > 1;
    const n = f.length === 4 && joinsPrev(nextLetter(i));
    out[i] = p && n ? f[3] : n ? f[2] : p ? f[1] : f[0];
  }
  return out;
}

/**
 * Visual order for one segment (indices into it). Base direction = first strong letter.
 * Weak types: digits stay LTR, spaces/punctuation take the direction around them.
 */
export function visualOrder(cps) {
  const n = cps.length;
  const t = cps.map((c) => (isRtl(c) ? 'R' : isLtr(c) ? 'L' : isDigit(c) ? 'D' : 'N'));
  const firstStrong = t.find((x) => x === 'R' || x === 'L');
  const base = firstStrong === 'R' ? 'R' : 'L';
  // resolve neutrals: between equal sides → that side (digits count as L), else the base direction
  const dir = t.map((x) => (x === 'D' ? 'L' : x));
  for (let i = 0; i < n; i++) {
    if (dir[i] !== 'N') continue;
    let j = i; while (j < n && dir[j] === 'N') j++;
    const before = i > 0 ? dir[i - 1] : base, after = j < n ? dir[j] : base;
    const d = before === after ? before : base;
    for (let k = i; k < j; k++) dir[k] = d;
    i = j - 1;
  }
  const idx = [...Array(n).keys()];
  const flip = (a, b) => { for (let x = a, y = b; x < y; x++, y--) [idx[x], idx[y]] = [idx[y], idx[x]]; };
  // rule L2 simplified to two levels: RTL base → reverse all, then re-reverse LTR runs; LTR base → reverse RTL runs
  const want = base === 'R' ? 'L' : 'R';
  if (base === 'R') flip(0, n - 1);
  const pos = idx.slice(); // logical position at each visual slot (before the run fix)
  for (let v = 0; v < n; v++) {
    if (dir[pos[v]] !== want) continue;
    let w = v; while (w + 1 < n && dir[pos[w + 1]] === want) w++;
    flip(v, w);
    v = w;
  }
  return { order: idx, dir, base };
}

/**
 * Fix one row. `cells` = codepoints of the row (0 = empty). Returns null when the row has no RTL text,
 * else { map, chars }: map[x] = the source column whose cell (colors included) belongs at column x,
 * chars[x] = the codepoint to draw there (shaped + mirrored).
 */
export function fixRow(cells) {
  let has = false;
  for (let i = 0; i < cells.length; i++) if (isRtl(cells[i])) { has = true; break; }
  if (!has) return null;
  const w = cells.length;
  const map = [...Array(w).keys()], chars = Array.from(cells);
  // segments: split at UI frame characters and at wide gaps (3+ spaces = separate columns of the UI)
  let s = 0;
  const flush = (a, b) => { // [a, b)
    while (a < b && isSpace(cells[a])) a++;
    while (b > a && isSpace(cells[b - 1])) b--;
    if (b - a < 2) return;
    let rtl = false; for (let i = a; i < b; i++) if (isRtl(cells[i])) { rtl = true; break; }
    if (!rtl) return;
    const seg = Array.from(cells.slice(a, b));
    const shaped = shape(seg);
    const { order, dir } = visualOrder(seg);
    for (let v = 0; v < order.length; v++) {
      const l = order[v], src = a + l;
      map[a + v] = src;
      let c = shaped[l];
      if (dir[l] === 'R' && MIRROR[c]) c = MIRROR[c];
      chars[a + v] = c;
    }
  };
  for (let i = 0; i <= w; i++) {
    if (i === w || isFrame(cells[i])) { flush(s, i); s = i + 1; continue; }
    if (isSpace(cells[i]) && i + 2 < w && isSpace(cells[i + 1]) && isSpace(cells[i + 2])) {
      flush(s, i);
      while (i < w && isSpace(cells[i])) i++;
      s = i; i--;
    }
  }
  return { map, chars };
}

/** Convenience for tests and plain strings: a whole line → what the screen should show. */
export function displayLine(text) {
  const cells = Array.from(text, (ch) => ch.codePointAt(0));
  const r = fixRow(cells);
  return r ? String.fromCodePoint(...r.chars) : text;
}
