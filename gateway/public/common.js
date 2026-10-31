// Shared helpers for both dashboards (no build step, no framework).
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export function makeApi(tokenKey, onAuthFail) {
  return async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${store.get(tokenKey) || ''}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { onAuthFail?.(); }
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data;
  };
}

let toastTimer;
export function toast(msg, err = false) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.toggle('err', err); el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), err ? 6000 : 2600);
}

export const usd = (micro, digits = 2) => `$${(Number(micro || 0) / 1e6).toFixed(digits)}`;
export const usdPrecise = (micro) => {
  const v = Number(micro || 0) / 1e6;
  return `$${v < 0.01 && v > 0 ? v.toFixed(6) : v.toFixed(v < 1 ? 4 : 2)}`;
};
export function tokens(n) {
  n = Number(n || 0);
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
export const date = (ts) => (ts ? new Date(ts * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const day = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : '—');

export const STATUS_BADGE = {
  new: '<span class="badge new">جديد</span>',
  active: '<span class="badge ok">متاح</span>',
  legacy: '<span class="badge warn">قديم</span>',
  hidden: '<span class="badge">مخفي</span>',
};

export function priceLabel(m) {
  if (m.pricing_mode === 'request') return m.price_request ? `${usdPrecise(m.price_request)} / طلب` : 'غير مسعّر';
  const base = m.pricing_mode === 'provider' ? 'حسب المزوّد' : '';
  if (!m.price_in && !m.price_out) return base || 'غير مسعّر';
  return `${base ? base + ' · ' : ''}${usdPrecise(m.price_in)} دخل · ${usdPrecise(m.price_out)} خرج /1M`;
}

export function tabs(root, onChange) {
  const btns = $$('nav.tabs button', root);
  const show = (name) => {
    btns.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('[data-panel]', root).forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
    store.set(`${location.pathname}:tab`, name);
    onChange?.(name);
  };
  btns.forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  const saved = store.get(`${location.pathname}:tab`);
  show(btns.some((b) => b.dataset.tab === saved) ? saved : btns[0].dataset.tab);
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('تم النسخ'); } catch { toast('انسخ يدوياً', true); }
}
