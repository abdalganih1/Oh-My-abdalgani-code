// Formatting. Money is integer micro-USD (µ$) everywhere in the API.
// Latin runs inside RTL text get their digits reordered — wrap them in LRI…PDI isolates.
export const M = 1e6;
const iso = (s) => `⁦${s}⁩`;

export const usd = (micro, digits = 2) => iso(`$${(Number(micro || 0) / M).toFixed(digits)}`);
export const usdPrecise = (micro) => {
  const v = Number(micro || 0) / M;
  return iso(`$${v < 0.01 && v > 0 ? v.toFixed(6) : v.toFixed(v < 1 ? 4 : 2)}`);
};
export const signedUsd = (micro) => `${micro < 0 ? '−' : ''}${usd(Math.abs(micro))}`;
export function tokens(n) {
  n = Number(n || 0);
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
export const int = (n) => Number(n || 0).toLocaleString('en');
export const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : '—');
export const ms = (v) => (v == null ? '—' : v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(v < 10000 ? 2 : 1)}s`);

export const date = (ts) => (ts ? iso(new Date(ts * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })) : '—');
export const day = (ts) => (ts ? iso(new Date(ts * 1000).toLocaleDateString('en-GB', { dateStyle: 'medium' })) : '—');
export const time = (ts) => iso(new Date(ts * 1000).toLocaleTimeString('en-GB'));
const REL = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
export function ago(ts) {
  if (!ts) return '—';
  const s = ts - Date.now() / 1000, a = Math.abs(s);
  if (a < 60) return REL.format(Math.round(s), 'second');
  if (a < 3600) return REL.format(Math.round(s / 60), 'minute');
  if (a < 86400) return REL.format(Math.round(s / 3600), 'hour');
  if (a < 30 * 86400) return REL.format(Math.round(s / 86400), 'day');
  return day(ts);
}

/** Browser-local timezone offset in minutes (east positive) — the reports API buckets by it. */
export const TZ = -new Date().getTimezoneOffset();
export const dateInput = (ts) => new Date((ts + TZ * 60) * 1000).toISOString().slice(0, 10);
export const fromDateInput = (v, end = false) => Math.floor(Date.parse(`${v}T00:00:00Z`) / 1000) - TZ * 60 + (end ? 86400 : 0);
export const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function priceLabel(m) {
  if (m.pricing_mode === 'request') return m.price_request ? `${usdPrecise(m.price_request)} لكل طلب` : 'غير مسعّر';
  if (m.pricing_mode === 'auto') {
    if (!m.price_in && !m.price_out) return 'السعر عم ينحسب…';
    const varies = m.price_varies ?? (m.routes ? new Set(m.routes.filter((r) => r.enabled && r.price_in != null).map((r) => `${r.price_in}|${r.price_out}`)).size > 1 : false);
    return `${varies ? 'حسب النموذج اللي بيرد · حتى ' : ''}${usdPrecise(m.price_in)} دخل · ${usdPrecise(m.price_out)} خرج — لكل مليون توكن`;
  }
  const base = m.pricing_mode === 'provider' ? 'حسب المزوّد' : '';
  if (!m.price_in && !m.price_out) return base || 'غير مسعّر';
  return `${base ? base + ' · ' : ''}${usdPrecise(m.price_in)} دخل · ${usdPrecise(m.price_out)} خرج — لكل مليون توكن`;
}

export const STATUS = {
  new: { label: 'جديد', tone: 'new' },
  active: { label: 'متاح', tone: 'ok' },
  legacy: { label: 'قديم', tone: 'warn' },
  hidden: { label: 'مخفي', tone: 'neutral' },
  archived: { label: 'مؤرشف', tone: 'bad' },
};
