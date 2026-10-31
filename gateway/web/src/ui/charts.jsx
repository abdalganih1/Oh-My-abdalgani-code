// SVG charts (no chart library). Dataviz rules kept from v2: one value axis, thin bars with
// rounded data-ends, recessive grid, a tooltip on every mark (hover + keyboard focus),
// left→right time even on RTL pages, colors from validated CSS variables.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { cn } from './core.jsx';

function useWidth(fallback = 640) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// one shared floating tooltip
function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e, title, rows) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX ?? r.left + r.width / 2, y = e.clientY ?? r.top;
    setTip({ x, y, title, rows });
  };
  const hide = () => setTip(null);
  const node = tip && createPortal(
    <div className="pointer-events-none fixed z-[120] min-w-[120px] -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl border border-line-strong bg-solid/95 px-3 py-2 text-xs shadow-[var(--shadow-pop)] backdrop-blur"
      style={{ left: Math.min(window.innerWidth - 80, Math.max(80, tip.x)), top: Math.max(70, tip.y) }}>
      {tip.rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          {r.color && <i className="size-2.5 rounded-[3px]" style={{ background: r.color }} />}
          <b className="num text-[13px] text-fg">{r.value}</b>{r.label && <span className="text-muted">{r.label}</span>}
        </div>
      ))}
      <div className="mt-0.5 text-muted">{tip.title}</div>
    </div>, document.body);
  return { show, hide, node };
}

/** Grouped vertical bars. series: [{ name, color, values[] }], labels[] on X. */
export function BarChart({ labels, series, format = String, height = 230, className }) {
  const [ref, W] = useWidth();
  const tip = useTip();
  const H = height, padL = 50, padB = 26, padT = 10, padR = 6;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = labels.length || 1, slot = plotW / n, gap = 2;
  const bw = Math.max(2, Math.min(26, (slot - gap * (series.length + 1)) / series.length));
  const every = Math.ceil(n / Math.max(2, Math.floor(plotW / 72)));
  return (
    <div ref={ref} className={cn('viz w-full ltr', className)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" className="block overflow-visible">
        <defs>
          {series.map((s, j) => (
            <linearGradient key={j} id={`bar-g-${j}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color} /><stop offset="1" stopColor={s.color} stopOpacity=".55" />
            </linearGradient>
          ))}
        </defs>
        {[0, 1, 2, 3, 4].map((i) => {
          const y = padT + plotH - (plotH * i) / 4;
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} className={i ? 'grid' : 'base'} strokeDasharray={i ? '3 4' : undefined} />
              <text x={padL - 8} y={y + 4} textAnchor="end">{format((max * i) / 4, true)}</text>
            </g>
          );
        })}
        {labels.map((lab, i) => {
          const x0 = padL + i * slot + (slot - bw * series.length - gap * (series.length - 1)) / 2;
          const rows = series.map((s) => ({ value: format(s.values[i] || 0), label: series.length > 1 ? s.name : '', color: series.length > 1 ? s.color : null }));
          return (
            <g key={i}>
              {series.map((s, j) => {
                const v = s.values[i] || 0, h = (plotH * v) / max; if (h <= 0) return null;
                const x = x0 + j * (bw + gap), y = padT + plotH - h, r = Math.min(4, bw / 2, h);
                return (
                  <motion.path key={j} fill={`url(#bar-g-${j})`} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} style={{ originY: 1, transformBox: 'fill-box' }}
                    transition={{ duration: 0.6, delay: Math.min(0.4, i * 0.012), ease: [0.16, 1, 0.3, 1] }}
                    d={`M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z`} />
                );
              })}
              <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" tabIndex={0} className="outline-none hover:fill-[var(--accent-2)] focus:fill-[var(--accent-2)]"
                onPointerMove={(e) => tip.show(e, lab, rows)} onFocus={(e) => tip.show(e, lab, rows)} onPointerLeave={tip.hide} onBlur={tip.hide} />
              {i % every === 0 && <text x={padL + i * slot + slot / 2} y={H - 7} textAnchor="middle">{lab}</text>}
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

/** 7×24 heatmap (sequential ramp). cells: [{ dow, hour, requests }] */
export function Heatmap({ cells, dayNames, format = String }) {
  const tip = useTip();
  const max = Math.max(1, ...cells.map((c) => c.requests));
  const steps = ['--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600', '--seq-700'];
  const order = [6, 0, 1, 2, 3, 4, 5]; // week starts Saturday
  return (
    <div className="ltr overflow-x-auto">
      <div className="grid min-w-[560px] gap-[3px]" style={{ gridTemplateColumns: '52px repeat(24, minmax(0, 1fr))' }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-center text-[10px] text-muted">{h % 3 === 0 ? h : ''}</div>)}
        {order.map((d) => <Fragment key={d}>{row(d)}</Fragment>)}
      </div>
      {tip.node}
    </div>
  );
  function row(d) {
    return (
      <>
        <div className="flex items-center justify-end pe-2 text-[11px] text-muted">{dayNames[d]}</div>
        {Array.from({ length: 24 }, (_, h) => {
          const v = cells.find((x) => x.dow === d && x.hour === h)?.requests || 0;
          const title = `${dayNames[d]} ${String(h).padStart(2, '0')}:00`;
          return (
            <div key={h} tabIndex={0} className="aspect-square min-h-3 rounded-[4px] border border-line/60 transition-transform hover:scale-125 hover:border-accent focus:scale-125 focus:outline-none"
              style={{ background: v ? `var(${steps[Math.min(6, Math.floor((v / max) * 6.999))]})` : 'var(--panel-2)' }}
              onPointerMove={(e) => tip.show(e, title, [{ value: format(v) }])} onFocus={(e) => tip.show(e, title, [{ value: format(v) }])} onPointerLeave={tip.hide} onBlur={tip.hide} />
          );
        })}
      </>
    );
  }
}

export function Legend({ series, className }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted', className)}>
      {series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px]" style={{ background: s.color }} />{s.name}</span>)}
    </div>
  );
}

/** Tiny inline trend line. */
export function Sparkline({ values, width = 110, height = 32, color = 'var(--accent)', className }) {
  const max = Math.max(1, ...values), n = values.length;
  const pts = values.map((v, i) => [n > 1 ? (i / (n - 1)) * width : width / 2, height - 2 - (v / max) * (height - 4)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const id = useRef(`sp${Math.random().toString(36).slice(2, 7)}`).current;
  return (
    <svg width={width} height={height} className={cn('overflow-visible ltr', className)}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".3" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {n > 1 && <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#${id})`} />}
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
    </svg>
  );
}

/** Fill missing days/hours so gaps show as zero bars (same contract as the reports API). */
export function fillSeries(rows, from, to, tzMin, bucket) {
  const out = [], step = bucket === 'hour' ? 3600 : 86400, shift = tzMin * 60;
  const key = (ts) => { const d = new Date((ts + shift) * 1000).toISOString(); return bucket === 'hour' ? `${d.slice(0, 10)} ${d.slice(11, 13)}:00` : d.slice(0, 10); };
  const map = new Map(rows.map((r) => [r.t, r]));
  const start = Math.floor((from + shift) / step) * step - shift;
  for (let t = start; t < to; t += step) { const k = key(t); out.push({ t: k, ...(map.get(k) || {}) }); }
  return out;
}

export function useCssVar(name) {
  const [v, setV] = useState(() => getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  useEffect(() => {
    const mo = new MutationObserver(() => setV(getComputedStyle(document.documentElement).getPropertyValue(name).trim()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, [name]);
  return v;
}
