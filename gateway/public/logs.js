// Admin request history: every past request by date range + filters, cursor pagination,
// range totals, a details dialog and CSV of what is loaded. Lazy-loaded by admin.js.
import { $, esc, store, makeApi, toast, usdPrecise, tokens, copy } from '/common.js';

const api = makeApi('abd:adminToken');
const TZ = -new Date().getTimezoneOffset();
const RANGES = { '1h': 3600, '24h': 86400, '7d': 7 * 86400, '30d': 30 * 86400, '90d': 90 * 86400 };
const L = { range: store.get('abd:lgRange') || '24h', from: 0, to: 0, rows: [], next: null, sum: null, busy: false, seq: 0, ready: false };
const EP = { '/v1/chat/completions': 'chat', '/v1/messages': 'messages', '/v1/responses': 'responses' };

const dayKey = (ts) => new Date((ts + TZ * 60) * 1000).toISOString().slice(0, 10);
const dateInput = dayKey;
const fromInput = (v, end = false) => Math.floor(Date.parse(`${v}T00:00:00Z`) / 1000) - TZ * 60 + (end ? 86400 - 1 : 0);
const time = (ts) => new Date(ts * 1000).toLocaleTimeString('en-GB');
const full = (ts) => new Date(ts * 1000).toLocaleString('en-GB');
const DAY_FMT = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : '0%');

function window_() {
  if (L.range === 'custom') return { from: L.from, to: L.to };
  const to = Math.floor(Date.now() / 1000);
  return { from: to - RANGES[L.range], to };
}
function params(extra = {}) {
  const { from, to } = window_();
  const q = new URLSearchParams({ from: String(from), to: String(to), limit: '100', ...extra });
  const set = (k, v) => { if (v) q.set(k, v); };
  set('user_id', $('#lgUser').value); set('model', $('#lgModel').value.trim()); set('provider', $('#lgProvider').value);
  set('endpoint', $('#lgEndpoint').value); set('status', $('#lgStatus').value); set('q', $('#lgQ').value.trim());
  return q;
}

async function fetchPage(reset) {
  if (L.busy && !reset) return;
  const seq = ++L.seq; L.busy = true;
  $('#lgMore').disabled = true;
  try {
    const r = await api('GET', `/api/admin/logs?${params(reset ? {} : { before: String(L.next) })}`);
    if (seq !== L.seq) return; // a newer filter change already started
    if (reset) { L.rows = r.rows; L.sum = r.summary; } else L.rows = L.rows.concat(r.rows);
    L.next = r.next;
    render();
  } finally { if (seq === L.seq) { L.busy = false; $('#lgMore').disabled = false; } }
}
const reload = () => fetchPage(true).catch((e) => toast(e.message, true));

function syncRangeUI() {
  document.querySelectorAll('#lgRange button').forEach((b) => b.classList.toggle('on', b.dataset.r === L.range));
  const { from, to } = window_();
  $('#lgFrom').value = dateInput(from); $('#lgTo').value = dateInput(to);
}

function renderSummary() {
  const s = L.sum; if (!s) return;
  const tile = (label, value, sub = '', cls = '') => `<div class="stat"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
  const margin = s.cost - s.upstream;
  $('#lgSum').innerHTML = [
    tile('الطلبات', s.n.toLocaleString('en'), `${s.err.toLocaleString('en')} فاشل (${pct(s.err, s.n)}) · ${s.users} طالب`, s.n && s.err / s.n > 0.2 ? 'kpi-bad' : ''),
    tile('التوكنات', tokens(s.pin + s.pout), `دخل ${tokens(s.pin)} · خرج ${tokens(s.pout)}${s.cached ? ` · كاش ${tokens(s.cached)}` : ''}`),
    tile('على الطلاب', usdPrecise(s.cost), `علينا للمزوّدين ${usdPrecise(s.upstream)}`),
    tile('الهامش', usdPrecise(margin), s.cost ? `${pct(margin, s.cost)} من الإيراد` : '—', margin < 0 ? 'kpi-bad' : ''),
    tile('متوسط الاستجابة', s.avg_ms ? `${(s.avg_ms / 1000).toFixed(s.avg_ms < 10000 ? 2 : 1)}ث` : '—', 'للطلبات الناجحة'),
  ].join('');
}

function statusBadge(st) {
  const cls = st < 400 ? 'ok' : st === 429 || st === 402 ? 'warn' : 'bad';
  return `<span class="badge ${cls}">${st}</span>`;
}

function render() {
  renderSummary();
  const head = '<tr><th>الوقت</th><th>الطالب</th><th>النموذج</th><th>المزوّد</th><th>الصيغة</th><th class="num">دخل</th><th class="num">خرج</th><th class="num">كلفة</th><th class="num">ms</th><th>حالة</th></tr>';
  if (!L.rows.length) {
    $('#lgTable').innerHTML = head + '<tr><td colspan="10" class="muted" style="text-align:center;padding:28px">ما في طلبات بهالفترة وهالفلاتر</td></tr>';
  } else {
    let last = '', html = head;
    for (const r of L.rows) {
      const d = dayKey(r.created_at);
      if (d !== last) { last = d; html += `<tr class="lg-day"><td colspan="10">${esc(DAY_FMT.format(new Date(r.created_at * 1000)))}</td></tr>`; }
      const aliased = r.requested_model && r.requested_model !== r.model_id;
      html += `<tr data-lg="${r.id}" class="${r.status >= 400 ? 'lg-err' : ''}" tabindex="0">
        <td class="mono small" style="white-space:nowrap">${time(r.created_at)}</td>
        <td>${esc(r.user_name || `#${r.user_id}`)}</td>
        <td class="mono ltr small lg-model">${aliased ? `<span class="muted">${esc(r.requested_model)} →</span> ` : ''}${esc(r.model_id)}</td>
        <td class="small">${esc(r.provider_id || '—')}</td>
        <td class="small muted">${esc(EP[r.endpoint] || r.endpoint || '')}</td>
        <td class="num">${tokens(r.prompt_tokens)}</td><td class="num">${tokens(r.completion_tokens)}</td>
        <td class="num">${usdPrecise(r.cost)}</td><td class="num">${r.latency_ms ?? ''}</td>
        <td title="${esc((r.error || '').slice(0, 200))}">${statusBadge(r.status)}</td></tr>`;
    }
    $('#lgTable').innerHTML = html;
  }
  const total = L.sum?.n ?? L.rows.length;
  $('#lgCount').textContent = L.rows.length ? `معروض ${L.rows.length.toLocaleString('en')} من ${total.toLocaleString('en')}` : '';
  $('#lgMore').classList.toggle('hidden', !L.next);
}

function kv(label, value) { return `<div class="lg-kv"><span>${label}</span><b>${value}</b></div>`; }
function openRow(id) {
  const r = L.rows.find((x) => String(x.id) === String(id)); if (!r) return;
  let err = r.error || '';
  try { if (err.trim().startsWith('{')) err = JSON.stringify(JSON.parse(err), null, 2); } catch { /* keep raw */ }
  $('#lgDlgBody').innerHTML = `<h2 style="margin-top:0">طلب #${r.id} ${statusBadge(r.status)}</h2>
    <div class="lg-kvs">
      ${kv('الوقت', esc(full(r.created_at)))}
      ${kv('الطالب', `${esc(r.user_name || '—')} <span class="muted">#${r.user_id}</span>`)}
      ${kv('النموذج المطلوب', `<span class="mono ltr">${esc(r.requested_model || r.model_id)}</span>`)}
      ${kv('النموذج الفعلي', `<span class="mono ltr">${esc(r.model_id)}</span>`)}
      ${kv('المزوّد', `${esc(r.provider_id || '—')} <span class="mono ltr muted">${esc(r.upstream_model || '')}</span>`)}
      ${kv('الصيغة', `<span class="mono ltr">${esc(r.endpoint || '')}</span>`)}
      ${kv('زمن الاستجابة', r.latency_ms != null ? `${r.latency_ms.toLocaleString('en')} ms` : '—')}
      ${kv('توكنات الدخل', `${(r.prompt_tokens || 0).toLocaleString('en')}${r.cached_tokens ? ` <span class="muted">(كاش ${r.cached_tokens.toLocaleString('en')})</span>` : ''}${r.cache_write_tokens ? ` <span class="muted">(كتابة كاش ${r.cache_write_tokens.toLocaleString('en')})</span>` : ''}`)}
      ${kv('توكنات الخرج', (r.completion_tokens || 0).toLocaleString('en'))}
      ${kv('كلفة على الطالب', `${usdPrecise(r.cost)}${r.charged === 0 && r.cost ? ' <span class="muted">(ما انخصمت)</span>' : ''}`)}
      ${kv('كلفة علينا', usdPrecise(r.upstream_cost))}
      ${kv('IP', `<span class="mono ltr">${esc(r.ip || '—')}</span>`)}
      ${kv('الجهاز', `<span class="mono ltr small">${esc(r.device_id || '—')}</span>`)}
    </div>
    ${err ? `<div class="row" style="margin-top:14px"><h3 style="margin:0">الخطأ</h3><span class="spacer"></span><button type="button" class="ghost small" id="lgCopyErr">نسخ</button></div>
      <pre class="ltr lg-err-pre">${esc(err)}</pre>` : ''}`;
  $('#lgCopyErr')?.addEventListener('click', () => copy(err));
  $('#lgDlgUser').dataset.uid = r.user_id;
  $('#lgDlg').showModal();
}

function csv() {
  if (!L.rows.length) return toast('ما في شي للتصدير', true);
  const cols = ['id', 'created_at', 'user_id', 'user_name', 'requested_model', 'model_id', 'provider_id', 'upstream_model', 'endpoint', 'status', 'prompt_tokens', 'cached_tokens', 'cache_write_tokens', 'completion_tokens', 'cost_usd', 'upstream_cost_usd', 'latency_ms', 'ip', 'device_id', 'error'];
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.join(',')].concat(L.rows.map((r) => cols.map((c) => cell(
    c === 'created_at' ? new Date(r.created_at * 1000).toISOString() : c === 'cost_usd' ? (r.cost || 0) / 1e6 : c === 'upstream_cost_usd' ? (r.upstream_cost || 0) / 1e6 : r[c],
  )).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
  const { from, to } = window_();
  a.download = `requests_${dateInput(from)}_${dateInput(to)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function bind() {
  $('#lgRange').addEventListener('click', (e) => {
    const r = e.target.closest('button')?.dataset.r; if (!r) return;
    L.range = r; store.set('abd:lgRange', r); syncRangeUI(); reload();
  });
  ['#lgFrom', '#lgTo'].forEach((id) => $(id).addEventListener('change', () => {
    if (!$('#lgFrom').value || !$('#lgTo').value) return;
    L.range = 'custom'; L.from = fromInput($('#lgFrom').value); L.to = fromInput($('#lgTo').value, true);
    if (L.from > L.to) [L.from, L.to] = [fromInput($('#lgTo').value), fromInput($('#lgFrom').value, true)];
    syncRangeUI(); reload();
  }));
  ['#lgUser', '#lgProvider', '#lgEndpoint', '#lgStatus'].forEach((id) => $(id).addEventListener('change', reload));
  let t; ['#lgModel', '#lgQ'].forEach((id) => $(id).addEventListener('input', () => { clearTimeout(t); t = setTimeout(reload, 500); }));
  $('#lgReset').addEventListener('click', () => {
    ['#lgUser', '#lgProvider', '#lgEndpoint', '#lgStatus', '#lgModel', '#lgQ'].forEach((id) => { $(id).value = ''; });
    reload();
  });
  $('#lgMore').addEventListener('click', () => fetchPage(false).catch((e) => toast(e.message, true)));
  $('#lgCsv').addEventListener('click', csv);
  $('#lgTable').addEventListener('click', (e) => { const id = e.target.closest('tr[data-lg]')?.dataset.lg; if (id) openRow(id); });
  $('#lgTable').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const id = e.target.closest('tr[data-lg]')?.dataset.lg; if (id) openRow(id); } });
  $('#lgDlgUser').addEventListener('click', () => { $('#lgUser').value = $('#lgDlgUser').dataset.uid; $('#lgDlg').close(); reload(); });
}

async function fillFilters() {
  const [users, providers, models] = await Promise.all([api('GET', '/api/admin/users'), api('GET', '/api/admin/providers'), api('GET', '/api/admin/models')]);
  $('#lgUser').innerHTML = '<option value="">كل الطلاب</option>' + users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  $('#lgProvider').innerHTML = '<option value="">كل المزوّدين</option>' + providers.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('#lgModels').innerHTML = models.map((m) => `<option value="${esc(m.id)}"></option>`).join('');
}

export async function load() {
  if (!L.ready) {
    L.ready = true; bind();
    if (!RANGES[L.range]) L.range = '24h';
    await fillFilters().catch(() => {});
  }
  syncRangeUI();
  await reload();
}
