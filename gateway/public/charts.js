// Tiny SVG charts for the dashboards — no dependencies.
// Rules (dataviz skill): one axis, thin bars with 4px rounded data-ends, recessive grid,
// a hover/focus tooltip on every mark, labels via textContent, table views alongside.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

let tip;
function showTip(evt, title, rows) {
  if (!tip) { tip = document.createElement('div'); tip.className = 'viz-tip'; document.body.appendChild(tip); }
  tip.replaceChildren();
  for (const r of rows) {
    const line = document.createElement('div');
    const b = document.createElement('b'); b.textContent = r.value; line.appendChild(b);
    const lab = document.createElement('div'); lab.className = 'row';
    if (r.color) { const k = document.createElement('span'); k.className = 'key'; k.style.background = r.color; lab.appendChild(k); }
    const t = document.createElement('span'); t.textContent = r.label || title; t.style.color = 'var(--muted)'; lab.appendChild(t);
    line.appendChild(lab); tip.appendChild(line);
  }
  if (rows.length > 1 || rows[0]?.label) { const h = document.createElement('div'); h.textContent = title; h.style.cssText = 'color:var(--muted);margin-top:4px'; tip.appendChild(h); }
  tip.style.display = 'block';
  const r = (evt.target.getBoundingClientRect ? evt.target.getBoundingClientRect() : { left: evt.clientX, top: evt.clientY, width: 0 });
  const x = evt.clientX ?? r.left + r.width / 2, y = evt.clientY ?? r.top;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2))}px`;
  tip.style.top = `${Math.max(8, y - h - 12)}px`;
}
const hideTip = () => { if (tip) tip.style.display = 'none'; };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/**
 * Vertical bars, one or more series (grouped). series: [{name, color, values[]}], labels[] on X.
 * Bars read left→right in time even on RTL pages.
 */
export function bars(container, { labels, series, format = String, height = 220, tickEvery }) {
  container.replaceChildren();
  container.classList.add('chart');
  const W = Math.max(320, container.clientWidth || 640), H = height, padL = 46, padB = 24, padT = 8, padR = 4;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', direction: 'ltr' }, container);
  svg.style.direction = 'ltr';
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - padL - padR, plotH = H - padT - padB;
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (plotH * i) / 4;
    el('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: i ? 'grid' : 'base' }, svg);
    const t = el('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end', class: 'tick' }, svg); t.textContent = format((max * i) / 4, true);
  }
  const n = labels.length || 1, slot = plotW / n, gap = 2;
  const bw = Math.max(2, Math.min(28, (slot - gap * (series.length + 1)) / series.length));
  const every = tickEvery || Math.ceil(n / Math.max(2, Math.floor(plotW / 70)));
  labels.forEach((lab, i) => {
    const x0 = padL + i * slot + (slot - bw * series.length - gap * (series.length - 1)) / 2;
    series.forEach((s, j) => {
      const v = s.values[i] || 0, h = (plotH * v) / max, x = x0 + j * (bw + gap), y = padT + plotH - h;
      const hit = el('rect', { x: padL + i * slot, y: padT, width: slot, height: plotH, class: 'hit', tabindex: j === 0 ? 0 : -1 }, svg);
      if (h > 0) {
        const r = Math.min(4, bw / 2, h);
        el('path', { class: 'mark', fill: s.color, d: `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z` }, svg);
      }
      const rows = series.map((ss) => ({ value: format(ss.values[i] || 0), label: series.length > 1 ? ss.name : '', color: series.length > 1 ? ss.color : null }));
      const on = (e) => showTip(e, lab, rows);
      hit.addEventListener('pointermove', on); hit.addEventListener('focus', on);
      hit.addEventListener('pointerleave', hideTip); hit.addEventListener('blur', hideTip);
      if (j > 0) hit.remove(); // one hit target per slot
    });
    if (i % every === 0) { const t = el('text', { x: padL + i * slot + slot / 2, y: H - 6, 'text-anchor': 'middle', class: 'tick' }, svg); t.textContent = lab; }
  });
}

/** 7×24 heatmap (sequential blue). cells: [{dow, hour, requests}] */
export function heatmap(container, { cells, dayNames, format = String }) {
  container.replaceChildren();
  const grid = document.createElement('div');
  grid.className = 'heat'; grid.style.gridTemplateColumns = `44px repeat(24, minmax(0, 1fr))`; grid.style.direction = 'ltr';
  const max = Math.max(1, ...cells.map((c) => c.requests));
  const steps = ['--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600', '--seq-700'];
  grid.appendChild(document.createElement('div'));
  for (let h = 0; h < 24; h++) { const l = document.createElement('div'); l.className = 'lbl'; l.textContent = h % 3 === 0 ? String(h) : ''; grid.appendChild(l); }
  const order = [6, 0, 1, 2, 3, 4, 5]; // week starts Saturday
  for (const d of order) {
    const l = document.createElement('div'); l.className = 'lbl'; l.style.justifyContent = 'flex-end'; l.style.paddingRight = '6px'; l.textContent = dayNames[d]; grid.appendChild(l);
    for (let h = 0; h < 24; h++) {
      const c = cells.find((x) => x.dow === d && x.hour === h);
      const v = c?.requests || 0;
      const cell = document.createElement('div'); cell.className = 'cell'; cell.tabIndex = 0;
      if (v) cell.style.background = `var(${steps[Math.min(6, Math.floor((v / max) * 6.999))]})`;
      const on = (e) => showTip(e, `${dayNames[d]} ${String(h).padStart(2, '0')}:00`, [{ value: format(v) }]);
      cell.addEventListener('pointermove', on); cell.addEventListener('focus', on);
      cell.addEventListener('pointerleave', hideTip); cell.addEventListener('blur', hideTip);
      grid.appendChild(cell);
    }
  }
  container.appendChild(grid);
}

export function legend(container, series) {
  container.replaceChildren();
  container.className = 'legend';
  for (const s of series) { const sp = document.createElement('span'); const i = document.createElement('i'); i.style.background = s.color; sp.appendChild(i); sp.appendChild(document.createTextNode(s.name)); container.appendChild(sp); }
}

/** Fill the missing days/hours of a time series so gaps show as zero bars. */
export function fillSeries(rows, from, to, tzMin, bucket) {
  const out = [], step = bucket === 'hour' ? 3600 : 86400, shift = tzMin * 60;
  const key = (ts) => { const d = new Date((ts + shift) * 1000).toISOString(); return bucket === 'hour' ? `${d.slice(0, 10)} ${d.slice(11, 13)}:00` : d.slice(0, 10); };
  const map = new Map(rows.map((r) => [r.t, r]));
  const start = Math.floor((from + shift) / step) * step - shift;
  for (let t = start; t < to; t += step) { const k = key(t); out.push({ t: k, ...(map.get(k) || {}) }); }
  return out;
}

export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
