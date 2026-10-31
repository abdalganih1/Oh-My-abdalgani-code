// Fetch wrapper shared by both dashboards: JSON in/out, bearer token from localStorage,
// gateway error shape {error:{message}} → thrown Error with that message, 401 → onAuthFail.
import { store } from './store.js';

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

export function makeApi(tokenKey, { onAuthFail } = {}) {
  async function api(method, path, body, opts = {}) {
    const res = await fetch(path, {
      method,
      signal: opts.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${store.get(tokenKey) || ''}`, ...(opts.headers || {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (opts.raw) return res;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !opts.noAuthFail) onAuthFail?.();
    if (!res.ok) throw new ApiError(data?.error?.message || `HTTP ${res.status}`, res.status, data);
    return data;
  }
  api.get = (p, o) => api('GET', p, undefined, o);
  api.post = (p, b, o) => api('POST', p, b, o);
  api.put = (p, b, o) => api('PUT', p, b, o);
  api.patch = (p, b, o) => api('PATCH', p, b, o);
  api.del = (p, o) => api('DELETE', p, undefined, o);
  /** Download a file response (CSV export…) with the bearer token. */
  api.download = async (path, fallbackName) => {
    const res = await fetch(path, { headers: { authorization: `Bearer ${store.get(tokenKey) || ''}` } });
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
    const name = (res.headers.get('content-disposition') || '').match(/filename="(.+)"/)?.[1] || fallbackName;
    saveBlob(await res.blob(), name);
  };
  return api;
}

export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function csvBlob(cols, rows, pick = (r, c) => r[c]) {
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.join(',')].concat(rows.map((r) => cols.map((c) => cell(pick(r, c))).join(',')));
  return new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
}
