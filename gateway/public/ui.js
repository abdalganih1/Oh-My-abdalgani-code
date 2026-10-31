// Shell enhancements shared by both dashboards: icons, theme, mobile drawer,
// page title, command palette (Ctrl/⌘+K) and keyboard shortcuts.
// Pure progressive enhancement — every feature degrades to the plain page.
import { $, $$, esc, store } from '/common.js';

// Lucide-style 24px stroke icons (MIT paths, trimmed).
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3"/><path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 12h-4a2 2 0 0 0 0 4h4z"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/>',
  terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V8"/><path d="M17 16v-9"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  plug: '<path d="M12 22v-5"/><path d="M9 8V2M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  ticket: '<path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  sparkles: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/><path d="M19 3v4M17 5h4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  arrow: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
};
export const icon = (name, size = 18) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
export function hydrateIcons(root = document) {
  $$('i[data-i]', root).forEach((el) => { el.outerHTML = icon(el.dataset.i, +(el.dataset.s || 18)); });
}

// ── theme: system → light → dark ──
const THEMES = ['system', 'light', 'dark'];
const THEME_ICON = { system: 'monitor', light: 'sun', dark: 'moon' };
const THEME_NAME = { system: 'حسب الجهاز', light: 'فاتح', dark: 'داكن' };
function applyTheme(t) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const b = $('#themeBtn');
  if (b) { b.innerHTML = icon(THEME_ICON[t]); b.title = `المظهر: ${THEME_NAME[t]}`; b.setAttribute('aria-label', b.title); }
  // charts read CSS variables at draw time — let pages redraw
  window.dispatchEvent(new Event('resize'));
}
applyTheme(store.get('abd:theme') || 'system');

function navButtons() {
  const seen = new Set();
  return $$('aside nav.tabs button[data-tab], nav.tabs.side-nav button[data-tab]').filter((b) => !seen.has(b.dataset.tab) && seen.add(b.dataset.tab));
}
const labelOf = (b) => (b.querySelector('.lbl')?.textContent || b.textContent).trim();

// ── page title follows the active tab ──
function syncTitle() {
  const b = navButtons().find((x) => x.classList.contains('active'));
  if (!b) return;
  const t = $('#pageTitle'); if (t) t.textContent = labelOf(b);
  const s = $('#pageSub'); if (s) s.textContent = b.dataset.sub || '';
}

// ── command palette ──
let pal, palItems = [], palIdx = 0;
const extraActions = [];
export function addAction(label, run, hint = '') { extraActions.push({ label, run, hint }); }
function buildPalette() {
  pal = document.createElement('dialog');
  pal.className = 'palette';
  pal.innerHTML = `<div class="pal-in">${icon('search')}<input id="palQ" placeholder="روح لـ… (اكتب اسم صفحة أو أمر)" autocomplete="off"><kbd>Esc</kbd></div><div id="palList" role="listbox"></div>`;
  document.body.appendChild(pal);
  pal.addEventListener('click', (e) => { if (e.target === pal) pal.close(); const it = e.target.closest('[data-k]'); if (it) runPal(+it.dataset.k); });
  $('#palQ', pal).addEventListener('input', renderPal);
  $('#palQ', pal).addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { palIdx = Math.min(palItems.length - 1, palIdx + 1); paint(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { palIdx = Math.max(0, palIdx - 1); paint(); e.preventDefault(); }
    if (e.key === 'Enter') { runPal(palIdx); e.preventDefault(); }
  });
}
function renderPal() {
  const q = $('#palQ', pal).value.trim().toLowerCase();
  const pages = navButtons().map((b, i) => ({ label: labelOf(b), hint: i < 9 ? `${i + 1}` : '', ic: b.querySelector('svg')?.outerHTML || '', run: () => b.click() }));
  const acts = extraActions.map((a) => ({ ...a, ic: icon('zap') }));
  palItems = [...pages, ...acts].filter((x) => !q || x.label.toLowerCase().includes(q));
  palIdx = 0; paint();
}
function paint() {
  $('#palList', pal).innerHTML = palItems.map((x, i) => `<div class="pal-item ${i === palIdx ? 'on' : ''}" data-k="${i}" role="option">${x.ic}<span>${esc(x.label)}</span>${x.hint ? `<kbd>${esc(x.hint)}</kbd>` : ''}</div>`).join('') || '<div class="pal-empty">ما في نتائج</div>';
  $('#palList .on', pal)?.scrollIntoView({ block: 'nearest' });
}
function runPal(i) { const it = palItems[i]; if (!it) return; pal.close(); closeNav(); it.run(); }
export function openPalette() { if (!pal) buildPalette(); $('#palQ', pal).value = ''; renderPal(); pal.showModal(); $('#palQ', pal).focus(); }

// ── mobile drawer ──
const closeNav = () => document.body.classList.remove('nav-open');

export function initShell() {
  hydrateIcons();
  applyTheme(store.get('abd:theme') || 'system');
  $('#themeBtn')?.addEventListener('click', () => {
    const cur = store.get('abd:theme') || 'system';
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    store.set('abd:theme', next); applyTheme(next);
  });
  $('#menuBtn')?.addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('#scrim')?.addEventListener('click', closeNav);
  $('#palBtn')?.addEventListener('click', openPalette);
  $$('nav.tabs button[data-tab]').forEach((b) => b.addEventListener('click', () => { closeNav(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
  const nav = $('aside nav.tabs') || $('nav.tabs');
  if (nav) new MutationObserver(syncTitle).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  syncTitle();

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if ($('#app') && !$('#app').classList.contains('hidden')) openPalette(); return; }
    if (e.key === 'Escape') closeNav();
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]');
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if ($('#app')?.classList.contains('hidden')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) { const b = navButtons()[n - 1]; if (b) b.click(); }
    if (e.key === '/') { const s = $('[data-panel]:not(.hidden) input[type="search"], [data-panel]:not(.hidden) input[placeholder*="بحث"]'); if (s) { e.preventDefault(); s.focus(); } }
  });

  // copy buttons inside code blocks (any <pre data-copyable>)
  $$('pre[data-copyable]').forEach((pre) => {
    const wrap = document.createElement('div'); wrap.className = 'code';
    wrap.innerHTML = `<div class="code-bar"><span class="dots"><i></i><i></i><i></i></span><span class="code-title">${esc(pre.dataset.title || '')}</span><button type="button" class="ghost small code-copy">${icon('copy', 15)}<span>نسخ</span></button></div>`;
    pre.replaceWith(wrap); wrap.appendChild(pre);
    $('.code-copy', wrap).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try { await navigator.clipboard.writeText(pre.textContent); btn.classList.add('done'); btn.lastChild.textContent = 'تم'; setTimeout(() => { btn.classList.remove('done'); btn.lastChild.textContent = 'نسخ'; }, 1600); } catch { /* ignore */ }
    });
  });
}

// Animate a number counting up (respects reduced motion). fmt(v) formats each frame.
export function countUp(el, to, fmt, ms = 700) {
  if (!el) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Number.isFinite(to)) { el.textContent = fmt(to); return; }
  const from = Number(el.dataset.v || 0), t0 = performance.now();
  el.dataset.v = to;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── responsive tables: on phones `table.stack` rows become cards; every cell gets its column
// name as data-label (CSS shows it above the value). Re-labels whenever a table re-renders.
function labelTable(t) {
  const head = t.rows[0]; if (!head || !head.querySelector('th')) return;
  const names = [...head.cells].map((c) => c.textContent.trim());
  for (let r = 1; r < t.rows.length; r++) {
    let col = 0;
    for (const td of t.rows[r].cells) {
      if (td.colSpan > 1) { td.classList.add('span'); col += td.colSpan; continue; }
      const n = names[col++] || '';
      if (td.dataset.label !== n) td.dataset.label = n;
    }
  }
}
let labelQueued = false;
function labelAll() { labelQueued = false; $$('table.stack').forEach(labelTable); }
new MutationObserver((muts) => {
  if (labelQueued || !muts.some((m) => m.target.closest?.('table.stack') || [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.('table.stack') || n.querySelector?.('table.stack'))))) return;
  labelQueued = true; requestAnimationFrame(labelAll);
}).observe(document.documentElement, { childList: true, subtree: true });
