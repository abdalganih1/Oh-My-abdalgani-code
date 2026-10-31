import { $, $$, esc, store, makeApi, toast, usd, usdPrecise, tokens, date, day, STATUS_BADGE, priceLabel, tabs, copy } from '/common.js';
import { bars, heatmap, legend, fillSeries, css } from '/charts.js';

const KEY = 'abd:adminToken';
const api = makeApi(KEY, () => { store.del(KEY); showLogin(); });
const S = { providers: [], models: [], groups: [], users: [] };
const M = 1e6;

function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); store.set(KEY, $('#tokenInput').value.trim());
  try { await boot(); } catch (err) { toast(err.message, true); }
});
$('#logout').addEventListener('click', () => { store.del(KEY); location.reload(); });

const formData = (form) => Object.fromEntries(new FormData(form).entries());
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (err) { toast(err.message, true); } };
const groupName = (id) => (id ? S.groups.find((g) => g.id === id)?.name || id : 'كل النماذج');

async function boot() {
  await api('GET', '/api/admin/stats');
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  await loadGroups();
  if (!booted) { booted = true; tabs(document, (t) => guard(LOADERS[t])()); }
}
let booted = false;

// ── reports ──
const TZ = -new Date().getTimezoneOffset();
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
let R = null, rangeKey = store.get('abd:range') || '30', tsMetric = 'requests';
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : '—');
const signed = (micro) => `${micro < 0 ? '−' : ''}${usd(Math.abs(micro))}`;
const dateInput = (ts) => new Date((ts + TZ * 60) * 1000).toISOString().slice(0, 10);
const fromInput = (v, end = false) => Math.floor(Date.parse(`${v}T00:00:00Z`) / 1000) - TZ * 60 + (end ? 86400 : 0);

function rangeFor(key) {
  const now = Math.floor(Date.now() / 1000);
  const local = new Date(Date.now() + TZ * 60000);
  const midnight = Math.floor(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) / 1000) - TZ * 60;
  const monthStart = (y, m) => Math.floor(Date.UTC(y, m, 1) / 1000) - TZ * 60;
  if (key === 'today') return { from: midnight, to: now + 1 };
  if (key === 'month') return { from: monthStart(local.getUTCFullYear(), local.getUTCMonth()), to: now + 1 };
  if (key === 'lastmonth') return { from: monthStart(local.getUTCFullYear(), local.getUTCMonth() - 1), to: monthStart(local.getUTCFullYear(), local.getUTCMonth()) };
  if (key === 'custom') return { from: fromInput($('#rFrom').value), to: fromInput($('#rTo').value, true) };
  return { from: midnight - (Number(key) - 1) * 86400, to: now + 1 };
}

async function loadOverview() {
  const { from, to } = rangeFor(rangeKey);
  $$('#range button').forEach((b) => b.classList.toggle('on', b.dataset.r === rangeKey));
  R = await api('GET', `/api/admin/reports?from=${from}&to=${to}&tz=${TZ}`);
  $('#rFrom').value = dateInput(from); $('#rTo').value = dateInput(to - 1);
  $('#rangeLabel').textContent = `من ${day(from)} إلى ${day(to - 1)} — بتوقيتك (UTC${TZ >= 0 ? '+' : '−'}${Math.abs(TZ / 60)})`;
  const t = R.totals, m = R.money;
  const tile = (label, value, sub = '', cls = '') => `<div class="stat"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
  $('#kpiUse').innerHTML = [
    tile('الطلبات', t.requests.toLocaleString('en'), `${t.errors} فشل (${pct(t.errors, t.requests)})`),
    tile('التوكنات الإجمالية', tokens(t.tokens), `دخل ${tokens(t.prompt_tokens)} · خرج ${tokens(t.completion_tokens)}${t.cached_tokens ? ` · كاش ${tokens(t.cached_tokens)}` : ''}`),
    tile('طلاب نشطين', t.active_users, 'أرسلوا طلب واحد على الأقل'),
    tile('متوسط زمن الرد', t.avg_latency ? `${(t.avg_latency / 1000).toFixed(1)} ث` : '—', 'للطلبات الناجحة'),
  ].join('');
  $('#kpiMoney').innerHTML = [
    tile('أخذت من الطلاب', usd(m.revenue), `${m.subscriptions} اشتراك · ${m.coupons_redeemed} كوبون مفعّل`),
    tile('دفعت للمزوّدين', usd(m.paid), `استخدام ${usd(m.upstream_usage)} · اشتراكات ${usd(m.fixed_fees)} · مصاريف ${usd(m.expenses)}`),
    tile('صافي الربح', signed(m.profit), m.revenue ? `هامش ${pct(m.profit, m.revenue)}` : 'لا إيراد بالفترة', m.profit >= 0 ? 'kpi-good' : 'kpi-bad'),
    tile('رصيد مستهلك من الطلاب', usd(m.consumed), `قيمة ما استخدموه من رصيد الدولار`),
    tile('رصيد لسا بذمتك', usd(m.outstanding_usd), `${tokens(m.outstanding_tokens)} توكن غير مستهلكة (كل الاشتراكات الفعّالة)`),
  ].join('');
  drawSeries(); drawTops(); drawHeat(); drawMoney(); drawProviders();
  setUnread((await api('GET', '/api/admin/stats')).unread_events);
  loadExpenses();
}

const METRIC = {
  requests: { title: 'الطلبات', fmt: (v, axis) => (axis ? tokens(v) : Number(v).toLocaleString('en')) },
  tokens: { title: 'التوكنات', fmt: (v) => tokens(v) },
  consumed: { title: 'المستهلك من رصيد الطلاب', fmt: (v, axis) => (axis ? usd(v, v < 1e6 ? 2 : 0) : usdPrecise(v)) },
  upstream_cost: { title: 'كلفة المزوّدين علينا (استخدام)', fmt: (v, axis) => (axis ? usd(v, v < 1e6 ? 2 : 0) : usdPrecise(v)) },
};
function drawSeries() {
  const rows = fillSeries(R.series, R.range.from, R.range.to, TZ, R.range.bucket);
  const M = METRIC[tsMetric];
  $$('#tsMetric button').forEach((b) => b.classList.toggle('on', b.dataset.m === tsMetric));
  $('#tsTitle').textContent = `${M.title} ${R.range.bucket === 'hour' ? 'بالساعة' : 'باليوم'}`;
  bars($('#tsChart'), { labels: rows.map((r) => (R.range.bucket === 'hour' ? r.t.slice(11) : r.t.slice(5))), series: [{ name: M.title, color: css('--series-1'), values: rows.map((r) => r[tsMetric] || 0) }], format: M.fmt });
}
function inbar(v, max) { return `<div class="inbar-wrap"><div class="inbar" style="width:${max ? Math.max(1, (v / max) * 100) : 0}%"></div></div>`; }
function drawTops() {
  const ms = $('#modelSort').value, us = $('#userSort').value;
  const mv = (x) => (ms === 'tokens' ? x.prompt_tokens + x.completion_tokens : x[ms]);
  const models = [...R.models].sort((a, b) => mv(b) - mv(a));
  const mmax = Math.max(0, ...models.map(mv)), total = models.reduce((a, x) => a + mv(x), 0);
  const fmtM = (v) => (ms === 'requests' ? v.toLocaleString('en') : ms === 'tokens' ? tokens(v) : usdPrecise(v));
  $('#topModels').innerHTML = '<tr><th>النموذج</th><th style="width:30%"></th><th class="num">القيمة</th><th class="num">النسبة</th><th class="num">طلاب</th></tr>' + (models.map((x) =>
    `<tr><td><strong>${esc(x.name || x.model_id)}</strong><div class="mono ltr small muted" style="text-align:start">${esc(x.model_id)}</div></td><td>${inbar(mv(x), mmax)}</td>
     <td class="num">${fmtM(mv(x))}</td><td class="num">${pct(mv(x), total)}</td><td class="num">${x.users}</td></tr>`).join('') || '<tr><td class="muted">لا طلبات بالفترة</td></tr>');
  const users = [...R.users].sort((a, b) => b[us] - a[us]);
  const umax = Math.max(0, ...users.map((x) => x[us]));
  const fmtU = (v) => (us === 'requests' ? v.toLocaleString('en') : us === 'tokens' ? tokens(v) : usdPrecise(v));
  $('#topUsers').innerHTML = '<tr><th>الطالب</th><th style="width:30%"></th><th class="num">القيمة</th><th>نموذجه المفضّل</th><th>آخر طلب</th></tr>' + (users.map((x) =>
    `<tr><td><strong>${esc(x.name || '#' + x.user_id)}</strong></td><td>${inbar(x[us], umax)}</td><td class="num">${fmtU(x[us])}</td>
     <td class="mono ltr small">${esc(x.top_model || '')}</td><td class="small">${date(x.last_request)}</td></tr>`).join('') || '<tr><td class="muted">لا طلبات بالفترة</td></tr>');
}
function drawHeat() {
  heatmap($('#heat'), { cells: R.heat, dayNames: DAYS, format: (v) => `${v.toLocaleString('en')} طلب` });
  const top = [...R.heat].sort((a, b) => b.requests - a.requests)[0];
  const byHour = Array.from({ length: 24 }, (_, h) => R.heat.filter((c) => c.hour === h).reduce((a, c) => a + c.requests, 0));
  const peakHour = byHour.indexOf(Math.max(...byHour));
  $('#peakText').textContent = top ? `أعلى ضغط: ${DAYS[top.dow]} الساعة ${String(top.hour).padStart(2, '0')}:00 · الساعة الأكثر عموماً: ${String(peakHour).padStart(2, '0')}:00` : '';
}
function drawMoney() {
  const months = R.months;
  const S2 = [{ name: 'أخذت من الطلاب', color: css('--series-1') }, { name: 'دفعت للمزوّدين', color: css('--series-2') }];
  legend($('#moneyLegend'), S2);
  bars($('#moneyChart'), { labels: months.map((x) => x.month), series: [{ ...S2[0], values: months.map((x) => x.revenue) }, { ...S2[1], values: months.map((x) => x.paid) }], format: (v, axis) => usd(v, axis ? 0 : 2), height: 200, tickEvery: 1 });
  $('#moneyTable').innerHTML = '<tr><th>الشهر</th><th class="num">أخذت من الطلاب</th><th class="num">دفعت للمزوّدين</th><th class="num">الربح</th><th class="num">مستهلك من الأرصدة</th></tr>' +
    (months.map((x) => `<tr><td>${x.month}</td><td class="num">${usd(x.revenue)}</td><td class="num">${usd(x.paid)}</td><td class="num ${x.profit >= 0 ? 'kpi-good' : 'kpi-bad'}">${signed(x.profit)}</td><td class="num">${usd(x.consumed)}</td></tr>`).join('') || '<tr><td class="muted">لا بيانات</td></tr>');
  const m = R.money;
  $('#paidTable').innerHTML = '<tr><th>البند</th><th class="num">المبلغ</th></tr>' +
    R.providers.filter((p) => p.upstream_cost > 0).map((p) => `<tr><td>استخدام · ${esc(p.name || p.provider_id)}</td><td class="num">${usdPrecise(p.upstream_cost)}</td></tr>`).join('') +
    m.fixed_plans.map((p) => `<tr><td>اشتراك ثابت · ${esc(p.name)} <span class="muted small">(${usd(p.monthly_fee)}/شهر، محسوب نسبياً)</span></td><td class="num">${usd(Math.round(p.monthly_fee * (R.range.to - R.range.from) / (30.4375 * 86400)))}</td></tr>`).join('') +
    (m.expenses ? `<tr><td>مصاريف يدوية</td><td class="num">${usd(m.expenses)}</td></tr>` : '') +
    `<tr><td><strong>المجموع</strong></td><td class="num"><strong>${usd(m.paid)}</strong></td></tr>`;
}
function drawProviders() {
  $('#provReport').innerHTML = '<tr><th>المزوّد</th><th>الدفع</th><th class="num">طلبات</th><th class="num">فشل</th><th class="num">توكنات</th><th class="num">كلفتنا</th><th class="num">زمن الرد</th></tr>' +
    (R.providers.map((p) => `<tr><td>${esc(p.name || p.provider_id || '— (لم يصل لمزوّد)')}</td><td class="small">${p.billing === 'subscription' ? 'اشتراك ثابت' : p.billing ? 'حسب الاستخدام' : ''}</td><td class="num">${p.requests}</td>
      <td class="num">${p.errors} <span class="muted small">(${pct(p.errors, p.requests)})</span></td><td class="num">${tokens(p.tokens)}</td><td class="num">${usdPrecise(p.upstream_cost)}</td><td class="num">${p.avg_latency ? (p.avg_latency / 1000).toFixed(1) + ' ث' : '—'}</td></tr>`).join('') || '<tr><td class="muted">لا طلبات</td></tr>');
}
async function loadExpenses() {
  if (!S.providers.length) S.providers = await api('GET', '/api/admin/providers');
  const sel = $('#expProvider');
  if (sel.options.length <= 1) sel.innerHTML = '<option value="">— عام —</option>' + S.providers.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  const list = await api('GET', '/api/admin/expenses');
  $('#expenseTable').innerHTML = list.map((e) => `<tr><td class="small">${day(e.spent_at)}</td><td>${esc(e.provider_name || 'عام')}</td><td class="small muted">${esc(e.note || '')}</td><td class="num">${usd(e.amount)}</td><td><button class="small danger" data-delexp="${e.id}">✕</button></td></tr>`).join('') || '<tr><td class="muted small">لا مصاريف</td></tr>';
}
$('#range').addEventListener('click', guard(async (e) => { const r = e.target.dataset?.r; if (!r) return; rangeKey = r; store.set('abd:range', r); await loadOverview(); }));
['#rFrom', '#rTo'].forEach((id) => $(id).addEventListener('change', guard(async () => { if ($('#rFrom').value && $('#rTo').value) { rangeKey = 'custom'; await loadOverview(); } })));
$('#tsMetric').addEventListener('click', (e) => { const m = e.target.dataset?.m; if (m && R) { tsMetric = m; drawSeries(); } });
$('#modelSort').addEventListener('change', () => R && drawTops());
$('#userSort').addEventListener('change', () => R && drawTops());
$('#csvBtn').addEventListener('click', guard(async () => {
  const { from, to } = rangeFor(rangeKey);
  const res = await fetch(`/api/admin/reports/export?from=${from}&to=${to}`, { headers: { authorization: `Bearer ${store.get(KEY)}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob());
  a.download = (res.headers.get('content-disposition') || '').match(/filename="(.+)"/)?.[1] || 'usage.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}));
$('#expenseForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault(); const d = formData(e.target);
  await api('POST', '/api/admin/expenses', { amount: Math.round(+d.amount * M), provider_id: d.provider_id || null, note: d.note, spent_at: d.spent_at ? fromInput(d.spent_at) + 43200 : undefined });
  e.target.reset(); toast('أُضيف'); await loadOverview();
}));
$('#expenseTable').addEventListener('click', guard(async (e) => { const id = e.target.dataset?.delexp; if (id && confirm('حذف المصروف؟')) { await api('DELETE', `/api/admin/expenses/${id}`); await loadOverview(); } }));
let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (R && !$('[data-panel="overview"]').classList.contains('hidden')) { drawSeries(); drawMoney(); } }, 200); });

// ── updates (lifecycle) ──
function setUnread(n) { const b = $('#unreadBadge'); b.textContent = n || ''; b.classList.toggle('hidden', !n); }
const EVENT_ICON = { model_discovered: '🆕', model_published: '✅', model_archived: '📦', model_restored: '♻️', provider_archived: '⛔', provider_restored: '♻️', sync_error: '⚠️' };
let pendingList = [];
async function loadUpdates() {
  const [ev, pending, lc] = await Promise.all([api('GET', '/api/admin/events?limit=300'), api('GET', '/api/admin/catalog?pending=1'), api('GET', '/api/admin/lifecycle')]);
  if (!S.providers.length) S.providers = await api('GET', '/api/admin/providers');
  if (!S.models.length) S.models = await api('GET', '/api/admin/models');
  pendingList = pending;
  setUnread(ev.filter((e) => !e.read).length);
  $('#eventTable').innerHTML = '<tr><th>الوقت</th><th></th><th>الحدث</th></tr>' + (ev.map((e) =>
    `<tr style="${e.read ? '' : 'font-weight:600'}"><td class="small" style="white-space:nowrap">${date(e.created_at)}</td><td>${EVENT_ICON[e.kind] || '•'}</td><td>${esc(e.message)}</td></tr>`).join('') || '<tr><td class="muted">لا أحداث بعد — اضغط "افحص الآن"</td></tr>');
  $('#pendingTable').innerHTML = '<tr><th>المزوّد</th><th>المعرّف</th><th class="num">سياق</th><th>السعر</th><th>ظهر</th><th></th></tr>' + (pending.map((m, i) =>
    `<tr><td>${esc(m.provider_name)}</td><td><span class="mono ltr small">${esc(m.upstream_id)}</span> ${m.free ? '<span class="badge ok">مجاني</span>' : ''}</td><td class="num">${m.context_length ? tokens(m.context_length) : '—'}</td>
     <td class="small">${m.price_in != null ? `$${(m.price_in / M).toFixed(3)} / $${(m.price_out / M).toFixed(3)}` : '—'}</td><td class="small">${date(m.first_seen)}</td>
     <td class="row" style="flex-wrap:nowrap"><button class="small primary" data-pub="${i}">نشر</button><button class="small" data-dis="${i}">تجاهل</button></td></tr>`).join('') || '<tr><td class="muted">لا شيء معلّق</td></tr>');
  const f = $('#lifecycleForm'); for (const k of ['archive_after_hours', 'new_days', 'missing_hours']) f.elements[k].value = lc[k] ?? '';
}
$('#runNow').addEventListener('click', guard(async (e) => {
  e.target.disabled = true;
  try {
    const r = await api('POST', '/api/admin/maintenance');
    const found = r.sync.reduce((a, x) => a + (x.discovered || 0), 0);
    toast(`تم الفحص: ${r.sync.filter((x) => x.models).length} مزوّد · ${found} نموذج جديد · ${r.models.archived.length} أُرشف · ${r.models.promoted} انتهت شارة جديد`);
  } finally { e.target.disabled = false; }
  await loadUpdates();
}));
$('#markRead').addEventListener('click', guard(async () => { await api('POST', '/api/admin/events/read'); await loadUpdates(); }));
$('#pendingTable').addEventListener('click', guard(async (e) => {
  const { pub, dis } = e.target.dataset || {};
  if (dis != null) { const m = pendingList[+dis]; await api('POST', '/api/admin/catalog/dismiss', { provider_id: m.provider_id, upstream_id: m.upstream_id }); await loadUpdates(); }
  if (pub != null) {
    const m = pendingList[+pub];
    openModel({ id: m.upstream_id.split('/').pop().replace(/[:]/g, '-').toLowerCase(), name: m.name, context_length: m.context_length || 128000, max_output: m.max_output || 16384,
      pricing_mode: m.free ? 'token' : m.provider_id === 'openrouter' ? 'provider' : 'token', price_in: m.free ? 0 : m.price_in || 0, price_out: m.free ? 0 : m.price_out || 0,
      reasoning: m.reasoning ?? 1, vision: !!m.vision, status: 'new', routes: [{ provider_id: m.provider_id, upstream_model: m.upstream_id }] }, true);
  }
}));
$('#lifecycleForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault(); const d = formData(e.target);
  await api('PUT', '/api/admin/lifecycle', Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v)]))); toast('تم الحفظ');
}));

// ── providers & keys ──
async function loadProviders() {
  S.providers = await api('GET', '/api/admin/providers');
  $('#providerList').innerHTML = S.providers.map((p) => `
    <div class="card">
      <div class="row"><h2 style="margin:0">${esc(p.name)} <span class="muted mono small ltr">${esc(p.id)}</span></h2>
        ${p.archived_at ? `<span class="badge bad" title="${esc(p.archived_reason || '')}">مؤرشف</span>` : p.enabled ? '<span class="badge ok">مفعّل</span>' : '<span class="badge bad">موقوف</span>'}
        <span class="spacer"></span>
        ${p.archived_at ? `<button class="small primary" data-act="restore-provider" data-p="${esc(p.id)}">♻️ استعادة</button>` : `<button class="small" data-act="archive-provider" data-p="${esc(p.id)}">📦 أرشفة</button>`}
        <button class="small" data-act="discover" data-p="${esc(p.id)}">📥 استعراض نماذج المزوّد</button>
        <button class="small" data-act="edit-provider" data-p="${esc(p.id)}">تعديل</button>
        <button class="small" data-act="toggle-provider" data-p="${esc(p.id)}">${p.enabled ? 'إيقاف' : 'تفعيل'}</button>
      </div>
      <div class="small muted ltr" style="text-align:start">OpenAI: ${esc(p.openai_base_url || '—')} · Anthropic: ${esc(p.anthropic_base_url || '—')} · auth: ${esc(p.auth_style)} · ${p.billing === 'subscription' ? `اشتراك ثابت ${usd(p.monthly_fee)}/شهر` : 'حسب الاستخدام'}${p.compat ? ` · compat: ${esc(p.compat)}` : ''}${p.auto ? ` · auto: ${esc(p.auto)}` : ''}</div>
      <div class="small muted">${p.last_sync_at ? `آخر مزامنة للنماذج: ${date(p.last_sync_at)}` : 'لم تتم مزامنة النماذج بعد'}${p.sync_error ? ` · <span style="color:var(--bad)">${esc(p.sync_error)}</span>` : ''}${p.archived_reason ? ` · ${esc(p.archived_reason)}` : ''}${p.first_fail_at && !p.archived_at ? ` · <span style="color:var(--warn)">يفشل منذ ${date(p.first_fail_at)}</span>` : ''}</div>
      <div class="table-wrap"><table>
        <tr><th>الاسم</th><th>المفتاح</th><th class="num">الوزن</th><th class="num">استخدام</th><th>الحالة</th><th>آخر خطأ</th><th></th></tr>
        ${p.keys.map((k) => `<tr>
          <td>${esc(k.label)}</td><td class="mono ltr">••••${esc(k.key_hint)}</td><td class="num">${k.weight}</td><td class="num">${k.used_count}</td>
          <td>${!k.enabled ? '<span class="badge">موقوف</span>' : k.cooling ? `<span class="badge warn">تبريد حتى ${new Date(k.cooldown_until * 1000).toLocaleTimeString()}</span>` : '<span class="badge ok">جاهز</span>'}</td>
          <td class="small muted err-cell">${esc(k.last_error || '')}</td>
          <td class="row" style="flex-wrap:nowrap">
            <button class="small" data-act="test-key" data-k="${k.id}">اختبار</button>
            <button class="small" data-act="rotate-key" data-k="${k.id}">تبديل</button>
            <button class="small" data-act="toggle-key" data-k="${k.id}" data-en="${k.enabled}">${k.enabled ? 'إيقاف' : 'تفعيل'}</button>
            ${k.cooling || k.last_error ? `<button class="small" data-act="reset-key" data-k="${k.id}">تصفير</button>` : ''}
            <button class="small danger" data-act="del-key" data-k="${k.id}">حذف</button>
          </td></tr>`).join('') || '<tr><td colspan="7" class="muted">لا مفاتيح — أضف واحد تحت</td></tr>'}
      </table></div>
      <form class="row" data-addkey="${esc(p.id)}" style="margin-top:10px">
        <input name="label" placeholder="اسم (حساب 1)" style="max-width:160px">
        <input name="key" type="password" class="ltr" placeholder="API key" required style="flex:1;min-width:200px">
        <input name="weight" type="number" value="1" min="1" style="max-width:80px" title="الوزن">
        <button class="primary">➕ إضافة مفتاح</button>
      </form>
    </div>`).join('');
}

$('#providerList').addEventListener('submit', guard(async (e) => {
  const pid = e.target.dataset.addkey; if (!pid) return;
  e.preventDefault();
  await api('POST', `/api/admin/providers/${pid}/keys`, formData(e.target));
  toast('تمت إضافة المفتاح (مشفّر)'); await loadProviders();
}));

$('#providerList').addEventListener('click', guard(async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const { act, k, p } = b.dataset;
  const prov = S.providers.find((x) => x.id === p);
  if (act === 'test-key') {
    b.disabled = true; b.textContent = '...';
    const r = await api('POST', `/api/admin/keys/${k}/test`);
    toast(r.ok ? `✅ يعمل (${r.latency_ms}ms)` : `❌ ${r.status}: ${r.sample}`, !r.ok);
    await loadProviders();
  } else if (act === 'rotate-key') {
    const key = prompt('المفتاح الجديد (سيستبدل القديم بنفس الإعدادات):'); if (!key) return;
    await api('PATCH', `/api/admin/keys/${k}`, { key }); toast('تم التبديل'); await loadProviders();
  } else if (act === 'toggle-key') {
    await api('PATCH', `/api/admin/keys/${k}`, { enabled: b.dataset.en !== '1' }); await loadProviders();
  } else if (act === 'reset-key') {
    await api('PATCH', `/api/admin/keys/${k}`, { reset: true }); await loadProviders();
  } else if (act === 'del-key') {
    if (!confirm('حذف المفتاح نهائياً؟')) return;
    await api('DELETE', `/api/admin/keys/${k}`); await loadProviders();
  } else if (act === 'restore-provider') {
    await api('POST', `/api/admin/providers/${p}/restore`); toast('رجع للخدمة'); await loadProviders();
  } else if (act === 'archive-provider') {
    if (!confirm('أرشفة المزوّد؟ مساراته رح تتوقف (والنماذج اللي ما إلها غيره رح تتأرشف بالفحص الجاي).')) return;
    await api('POST', `/api/admin/providers/${p}/archive`); await loadProviders();
  } else if (act === 'toggle-provider') {
    await api('POST', '/api/admin/providers', { ...prov, enabled: !prov.enabled }); await loadProviders();
  } else if (act === 'edit-provider') {
    const f = $('#providerForm');
    for (const n of ['id', 'name', 'openai_base_url', 'anthropic_base_url', 'auth_style', 'extra_headers', 'compat', 'auto']) f.elements[n].value = prov[n] || (n === 'auth_style' ? 'bearer' : '');
    f.elements.billing.value = prov.billing || 'usage';
    f.elements.monthly_fee.value = prov.monthly_fee ? prov.monthly_fee / M : '';
    f.scrollIntoView({ behavior: 'smooth' });
  } else if (act === 'discover') {
    b.disabled = true;
    const list = await api('POST', `/api/admin/providers/${p}/discover`).finally(() => { b.disabled = false; });
    showDiscover(p, list);
  }
}));

function showDiscover(providerId, list) {
  const existing = new Set(S.models.flatMap((m) => (m.routes || []).filter((r) => r.provider_id === providerId).map((r) => r.upstream_model)));
  $('#discoverBody').innerHTML = `<h2>نماذج ${esc(providerId)} (${list.length})</h2>
    <input id="discFilter" placeholder="فلترة..." style="width:100%;margin-bottom:8px">
    <div class="table-wrap" style="max-height:60vh;overflow:auto"><table id="discTable">
    <tr><th>upstream id</th><th class="num">سياق</th><th class="num">$ دخل/1M</th><th class="num">$ خرج/1M</th><th></th></tr>
    ${list.map((m, i) => `<tr data-q="${esc(m.id.toLowerCase())}"><td class="mono ltr small">${esc(m.id)}</td><td class="num">${m.context_length ? tokens(m.context_length) : '—'}</td>
      <td class="num">${m.price_in != null ? (m.price_in / M).toFixed(3) : '—'}</td><td class="num">${m.price_out != null ? (m.price_out / M).toFixed(3) : '—'}</td>
      <td>${existing.has(m.id) ? '<span class="badge ok">مضاف</span>' : `<button class="small" data-import="${i}">إضافة</button>`}</td></tr>`).join('')}
    </table></div>`;
  $('#discFilter').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('#discTable tr[data-q]').forEach((tr) => tr.classList.toggle('hidden', !tr.dataset.q.includes(q))); });
  $('#discTable').addEventListener('click', (e) => {
    const i = e.target.dataset?.import; if (i == null) return;
    const m = list[+i];
    $('#discoverDlg').close();
    openModel({
      id: m.id.split('/').pop().replace(/[:]/g, '-'), name: m.name, context_length: m.context_length || 128000, max_output: m.max_output || 16384,
      pricing_mode: providerId === 'openrouter' ? 'provider' : 'token', price_in: m.price_in || 0, price_out: m.price_out || 0, price_cache_read: m.price_cache_read || 0,
      status: 'new', reasoning: m.reasoning ?? true, vision: !!m.vision, routes: [{ provider_id: providerId, upstream_model: m.id }],
    }, true);
  });
  $('#discoverDlg').showModal();
}

$('#providerForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  const d = formData(e.target);
  const prev = S.providers.find((p) => p.id === d.id);
  await api('POST', '/api/admin/providers', { ...d, monthly_fee: Math.round((+d.monthly_fee || 0) * M), enabled: prev ? !!prev.enabled : true });
  e.target.reset(); toast('تم الحفظ'); await loadProviders();
}));

// ── groups ──
async function loadGroups() {
  S.groups = await api('GET', '/api/admin/groups');
  $$('.groupSel').forEach((sel) => { sel.innerHTML = '<option value="">— كل النماذج —</option>' + S.groups.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join(''); });
}
async function loadSettings() {
  await loadGroups();
  $('#groupTable').innerHTML = '<tr><th>المعرّف</th><th>الاسم</th><th>الوصف</th><th></th></tr>' + S.groups.map((g) =>
    `<tr><td class="mono ltr">${esc(g.id)}</td><td>${esc(g.name)}</td><td class="small muted">${esc(g.description || '')}</td><td><button class="small danger" data-delgroup="${esc(g.id)}">حذف</button></td></tr>`).join('');
  $('#aliasesJson').value = JSON.stringify(await api('GET', '/api/admin/aliases'), null, 2);
}
$('#groupForm').addEventListener('submit', guard(async (e) => { e.preventDefault(); await api('POST', '/api/admin/groups', formData(e.target)); e.target.reset(); await loadSettings(); }));
$('#groupTable').addEventListener('click', guard(async (e) => {
  const g = e.target.dataset?.delgroup; if (!g || !confirm(`حذف الفئة ${g}؟`)) return;
  await api('DELETE', `/api/admin/groups/${encodeURIComponent(g)}`); await loadSettings();
}));
$('#saveAliases').addEventListener('click', guard(async () => {
  let obj; try { obj = JSON.parse($('#aliasesJson').value); } catch { throw new Error('JSON غير صالح'); }
  await api('PUT', '/api/admin/aliases', obj); toast('تم الحفظ');
}));

// ── models ──
async function loadModels() {
  [S.models, S.providers] = await Promise.all([api('GET', '/api/admin/models'), api('GET', '/api/admin/providers')]);
  $('#modelTable').innerHTML = '<tr><th>النموذج</th><th>الفئة</th><th>الحالة</th><th>السعر</th><th>المسارات</th><th class="num">سياق</th><th></th></tr>' +
    S.models.map((m) => `<tr>
      <td><strong>${esc(m.name)}</strong><div class="mono ltr small muted">${esc(m.id)}</div></td>
      <td>${esc(groupName(m.group_id))}</td><td>${STATUS_BADGE[m.status] || esc(m.status)}</td>
      <td class="small">${esc(priceLabel(m))}${m.markup_pct ? ` +${m.markup_pct}%` : ''}${(m.pricing_mode === 'request' ? !m.price_request : !m.price_in && !m.price_out && m.pricing_mode !== 'provider') ? ' <span class="badge warn">مجاني!</span>' : ''}</td>
      <td class="small ltr" style="text-align:start">${m.routes.map((r, i) => `${i + 1}. ${esc(r.provider_id)} → ${esc(r.upstream_model)}${r.enabled ? '' : ' (off)'}${r.archived_at ? ` <span class="badge bad" title="${esc(r.archived_reason || '')}">archived</span>` : r.first_fail_at ? ' <span class="badge warn">failing</span>' : ''}`).join('<br>') || '<span class="badge bad">لا مسار</span>'}${m.auto_source ? '<div class="muted">auto</div>' : ''}</td>
      <td class="num">${tokens(m.context_length)}</td>
      <td class="row" style="flex-wrap:nowrap">${m.status === 'archived' || m.routes.some((r) => r.archived_at) ? `<button class="small primary" data-restore="${esc(m.id)}" title="${esc(m.archived_reason || '')}">♻️</button>` : ''}<button class="small" data-edit="${esc(m.id)}">تعديل</button><button class="small danger" data-del="${esc(m.id)}">حذف</button></td></tr>`).join('');
}
$('#modelTable').addEventListener('click', guard(async (e) => {
  const { edit, del, restore } = e.target.dataset || {};
  if (restore) { await api('POST', `/api/admin/models/${encodeURIComponent(restore)}/restore`); toast('رجع للخدمة'); await loadModels(); }
  if (edit) openModel(S.models.find((m) => m.id === edit));
  if (del && confirm(`حذف ${del}؟ (الأفضل تحويله لـ "قديم" أو "مخفي")`)) { await api('DELETE', `/api/admin/models/${encodeURIComponent(del)}`); await loadModels(); }
}));
$('#newModel').addEventListener('click', () => openModel({ status: 'new', pricing_mode: 'token', context_length: 128000, max_output: 16384, sort: 100, routes: [] }, true));

function routeRow(r = {}) {
  const div = document.createElement('div');
  div.className = 'row'; div.style.marginBottom = '6px';
  div.innerHTML = `<select name="rp">${S.providers.map((p) => `<option value="${esc(p.id)}" ${p.id === r.provider_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <input name="rm" class="ltr" placeholder="upstream model id" value="${esc(r.upstream_model || '')}" style="flex:1;min-width:160px">
    <input name="rci" type="number" step="any" min="0" placeholder="كلفتنا دخل $/1M" title="اختياري: كلفة المزوّد علينا لكل مليون توكن دخل (للمزوّدين حسب الاستخدام)" value="${r.cost_in != null ? r.cost_in / M : ''}" style="max-width:130px">
    <input name="rco" type="number" step="any" min="0" placeholder="خرج $/1M" value="${r.cost_out != null ? r.cost_out / M : ''}" style="max-width:100px">
    <label class="small row"><input type="checkbox" name="re" ${r.enabled === 0 ? '' : 'checked'}> مفعّل</label>
    <button type="button" class="small" data-up>↑</button><button type="button" class="small danger" data-rm>✕</button>`;
  div.querySelector('[data-rm]').onclick = () => div.remove();
  div.querySelector('[data-up]').onclick = () => div.previousElementSibling && div.parentNode.insertBefore(div, div.previousElementSibling);
  return div;
}
$('#addRoute').addEventListener('click', () => $('#routeRows').appendChild(routeRow()));
$('#modelCancel').addEventListener('click', () => $('#modelDlg').close());

function openModel(m, isNew = false) {
  const f = $('#modelForm');
  f.reset();
  $('#modelDlgTitle').textContent = isNew ? 'نموذج جديد' : `تعديل ${m.id}`;
  f.elements.id.readOnly = !isNew && !!m.id;
  const usdFields = ['price_in', 'price_out', 'price_cache_read', 'price_request'];
  for (const el of f.elements) {
    if (!el.name || ['rp', 'rm', 're', 'rci', 'rco'].includes(el.name)) continue;
    const v = m[el.name];
    if (el.type === 'checkbox') el.checked = !!v;
    else if (usdFields.includes(el.name)) el.value = v ? +(v / M).toFixed(6) : '';
    else el.value = v ?? '';
  }
  $('#routeRows').innerHTML = '';
  (m.routes || []).forEach((r) => $('#routeRows').appendChild(routeRow(r)));
  if (!(m.routes || []).length) $('#routeRows').appendChild(routeRow());
  $('#modelDlg').showModal();
}

$('#modelForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  const f = e.target, d = formData(f);
  const body = {
    ...d, reasoning: f.elements.reasoning.checked, vision: f.elements.vision.checked,
    price_in: Math.round((+d.price_in || 0) * M), price_out: Math.round((+d.price_out || 0) * M),
    price_cache_read: Math.round((+d.price_cache_read || 0) * M), price_request: Math.round((+d.price_request || 0) * M),
    routes: $$('#routeRows > div').map((row, i) => ({
      provider_id: row.querySelector('[name=rp]').value, upstream_model: row.querySelector('[name=rm]').value.trim(),
      enabled: row.querySelector('[name=re]').checked, priority: i,
      cost_in: row.querySelector('[name=rci]').value === '' ? null : Math.round(+row.querySelector('[name=rci]').value * M),
      cost_out: row.querySelector('[name=rco]').value === '' ? null : Math.round(+row.querySelector('[name=rco]').value * M),
    })).filter((r) => r.upstream_model),
  };
  await api('POST', '/api/admin/models', body);
  $('#modelDlg').close(); toast('تم الحفظ'); await loadModels();
}));

// ── users ──
async function loadUsers() {
  S.users = await api('GET', '/api/admin/users');
  renderUsers();
}
function renderUsers() {
  const q = $('#userSearch').value.toLowerCase();
  $('#userTable').innerHTML = '<tr><th>#</th><th>الاسم</th><th class="num">رصيد $</th><th class="num">توكنات</th><th>مفاتيح</th><th>آخر طلب</th><th>الحالة</th><th></th></tr>' +
    S.users.filter((u) => !q || `${u.name} ${u.email || ''}`.toLowerCase().includes(q)).map((u) => `<tr>
      <td class="muted">${u.id}</td><td><strong>${esc(u.name)}</strong><div class="small muted ltr" style="text-align:start">${esc(u.email || '')}</div></td>
      <td class="num">${usd(u.usd_left)}</td><td class="num">${tokens(u.tokens_left)}</td><td>${u.keys}</td><td class="small">${date(u.last_request)}</td>
      <td>${u.disabled ? '<span class="badge bad">موقوف</span>' : '<span class="badge ok">فعّال</span>'}</td>
      <td><button class="small" data-user="${u.id}">إدارة</button></td></tr>`).join('');
}
$('#userSearch').addEventListener('input', renderUsers);
$('#userForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  const r = await api('POST', '/api/admin/users', formData(e.target));
  e.target.reset();
  showSecret('#userSecret', r.api_key, 'مفتاح الطالب — أرسله له الآن (لن يظهر مرة ثانية):');
  await loadUsers();
}));
function showSecret(sel, key, label) {
  const el = $(sel); el.classList.remove('hidden');
  el.innerHTML = `${esc(label)}<br><strong>${esc(key)}</strong> <button class="small" type="button">نسخ</button>`;
  el.querySelector('button').onclick = () => copy(key);
}
$('#userTable').addEventListener('click', guard(async (e) => { const id = e.target.dataset?.user; if (id) await openUser(+id); }));

async function openUser(id) {
  const d = await api('GET', `/api/admin/users/${id}`);
  const u = d.user;
  const fmt = (kind, v) => (kind === 'usd' ? usd(v) : `${tokens(v)} tok`);
  $('#userDlgBody').innerHTML = `
    <div class="row"><h2 style="margin:0">${esc(u.name)}</h2><span class="spacer"></span>
      <button class="small" data-uact="toggle">${u.disabled ? 'تفعيل الحساب' : 'إيقاف الحساب'}</button>
      <button class="small" data-uact="newkey">مفتاح جديد</button>
      <button class="small danger" data-uact="delete">حذف</button></div>
    <div id="uSecret" class="secret hidden" style="margin-top:8px"></div>
    <h3>منح اشتراك مباشر</h3>
    <form id="grantForm" class="form">
      <label class="f">النوع<select name="kind"><option value="usd">دولار</option><option value="tokens">توكنات</option></select></label>
      <label class="f">القيمة ($ أو مليون توكن)<input name="amount" type="number" step="0.01" required></label>
      <label class="f">الفئة<select name="group_id"><option value="">كل النماذج</option>${S.groups.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></label>
      <label class="f">أيام (0=دائم)<input name="valid_days" type="number" value="30"></label>
      <label class="f">دفع الطالب ($)<input name="sale_price" type="number" step="0.01" min="0" value="0"></label>
      <button class="primary">منح</button>
    </form>
    <h3>الاشتراكات</h3>
    <div class="table-wrap"><table><tr><th>النوع</th><th>الفئة</th><th class="num">مستخدم / الكل</th><th>ينتهي</th><th>المصدر</th><th></th></tr>
      ${d.subscriptions.map((s) => `<tr><td>${s.kind}</td><td>${esc(groupName(s.group_id))}</td><td class="num">${fmt(s.kind, s.used)} / ${fmt(s.kind, s.total)}</td>
        <td class="small">${day(s.expires_at)}</td><td class="small ltr">${esc(s.source || '')}</td>
        <td><button class="small" data-sub="${s.id}" data-dis="${s.disabled}">${s.disabled ? 'تفعيل' : 'إيقاف'}</button></td></tr>`).join('') || '<tr><td class="muted">لا يوجد</td></tr>'}
    </table></div>
    <h3>المفاتيح</h3>
    <table>${d.keys.map((k) => `<tr><td>${esc(k.name)}</td><td class="mono ltr">${esc(k.prefix)}…</td><td class="small">${date(k.last_used_at)}</td>
      <td>${k.revoked ? '<span class="badge bad">ملغى</span>' : `<button class="small danger" data-revoke="${k.id}">إلغاء</button>`}</td></tr>`).join('')}</table>
    <h3>آخر الطلبات</h3>
    <div class="table-wrap" style="max-height:240px;overflow:auto"><table><tr><th>الوقت</th><th>النموذج</th><th class="num">توكن</th><th class="num">كلفة</th><th>حالة</th></tr>
      ${d.usage.map((l) => `<tr><td class="small">${date(l.created_at)}</td><td class="mono ltr small">${esc(l.model_id)}</td><td class="num">${tokens(l.prompt_tokens + l.completion_tokens)}</td><td class="num">${usdPrecise(l.cost)}</td><td>${l.status}</td></tr>`).join('')}
    </table></div>`;
  const body = $('#userDlgBody');
  body.onclick = guard(async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.uact === 'toggle') { await api('PATCH', `/api/admin/users/${id}`, { disabled: !u.disabled }); await openUser(id); await loadUsers(); }
    if (b.dataset.uact === 'newkey') { const r = await api('POST', `/api/admin/users/${id}/keys`, { name: 'admin-issued' }); await openUser(id); showSecret('#uSecret', r.api_key, 'المفتاح الجديد:'); }
    if (b.dataset.uact === 'delete' && confirm('حذف الطالب وكل بياناته؟')) { await api('DELETE', `/api/admin/users/${id}`); $('#userDlg').close(); await loadUsers(); }
    if (b.dataset.sub) { await api('PATCH', `/api/admin/subscriptions/${b.dataset.sub}`, { disabled: b.dataset.dis !== '1' }); await openUser(id); }
    if (b.dataset.revoke && confirm('إلغاء المفتاح؟')) { await api('DELETE', `/api/admin/users/${id}/keys/${b.dataset.revoke}`); await openUser(id); }
  });
  $('#grantForm').onsubmit = guard(async (e) => {
    e.preventDefault();
    const g = formData(e.target);
    await api('POST', `/api/admin/users/${id}/subscriptions`, { ...g, amount: Math.round(+g.amount * M), sale_price: Math.round((+g.sale_price || 0) * M) });
    toast('تم المنح'); await openUser(id); await loadUsers();
  });
  if (!$('#userDlg').open) $('#userDlg').showModal();
}

// ── coupons ──
async function loadCoupons() {
  await loadGroups();
  const list = await api('GET', '/api/admin/coupons');
  const now = Date.now() / 1000;
  $('#couponTable').innerHTML = '<tr><th>الكود</th><th>القيمة</th><th>الفئة</th><th>صلاحية</th><th class="num">استخدام</th><th>الحالة</th><th>ملاحظة</th><th></th></tr>' +
    list.map((c) => {
      const st = c.disabled ? '<span class="badge">موقوف</span>' : c.used_count >= c.max_uses ? '<span class="badge accent">مستخدم</span>' : c.expires_at && c.expires_at < now ? '<span class="badge bad">منتهي</span>' : '<span class="badge ok">متاح</span>';
      return `<tr><td class="mono ltr">${esc(c.code)} <button class="small" data-copy-code="${esc(c.code)}">⧉</button></td>
        <td>${c.kind === 'usd' ? usd(c.amount) : tokens(c.amount) + ' tok'}<div class="small muted">بيع: ${usd(c.sale_price ?? (c.kind === 'usd' ? c.amount : 0))}</div></td><td>${esc(groupName(c.group_id))}</td>
        <td class="small">${c.valid_days ? c.valid_days + ' يوم' : 'دائم'}</td><td class="num">${c.used_count}/${c.max_uses}</td><td>${st}</td>
        <td class="small muted">${esc(c.note || '')}</td>
        <td class="row" style="flex-wrap:nowrap"><button class="small" data-cdis="${esc(c.code)}" data-v="${c.disabled}">${c.disabled ? 'تفعيل' : 'إيقاف'}</button><button class="small danger" data-cdel="${esc(c.code)}">حذف</button></td></tr>`;
    }).join('');
}
$('#couponForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  const d = formData(e.target);
  const r = await api('POST', '/api/admin/coupons', { ...d, amount: Math.round(+d.amount * M), sale_price: d.sale_price === '' ? undefined : Math.round(+d.sale_price * M) });
  $('#newCoupons').classList.remove('hidden'); $('#newCoupons').textContent = r.codes.join('\n');
  copy(r.codes.join('\n'));
  await loadCoupons();
}));
$('#couponTable').addEventListener('click', guard(async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.copyCode) copy(b.dataset.copyCode);
  if (b.dataset.cdis) { await api('PATCH', `/api/admin/coupons/${encodeURIComponent(b.dataset.cdis)}`, { disabled: b.dataset.v !== '1' }); await loadCoupons(); }
  if (b.dataset.cdel && confirm('حذف الكوبون؟')) { await api('DELETE', `/api/admin/coupons/${encodeURIComponent(b.dataset.cdel)}`); await loadCoupons(); }
}));

// ── usage ──
async function loadUsage() {
  const rows = await api('GET', '/api/admin/usage?limit=300');
  $('#usageTable').innerHTML = '<tr><th>الوقت</th><th>الطالب</th><th>النموذج</th><th>المزوّد</th><th class="num">دخل</th><th class="num">خرج</th><th class="num">كلفة</th><th class="num">ms</th><th>حالة</th></tr>' +
    rows.map((r) => `<tr><td class="small">${date(r.created_at)}</td><td>${esc(r.user_name || r.user_id)}</td><td class="mono ltr small">${r.requested_model && r.requested_model !== r.model_id ? esc(r.requested_model) + ' → ' : ''}${esc(r.model_id)}${r.upstream_model ? `<div class="muted">${esc(r.upstream_model)}</div>` : ''}</td>
      <td class="small">${esc(r.provider_id || '—')}</td><td class="num">${tokens(r.prompt_tokens)}</td><td class="num">${tokens(r.completion_tokens)}</td>
      <td class="num">${usdPrecise(r.cost)}</td><td class="num">${r.latency_ms ?? ''}</td>
      <td title="${esc(r.error || '')}">${r.status < 400 ? `<span class="badge ok">${r.status}</span>` : `<span class="badge bad">${r.status}</span>`}</td></tr>`).join('');
}

// ── security ──
let SEC = null;
async function loadSecurity() {
  SEC = await api('GET', '/api/admin/security');
  const f = $('#secForm');
  for (const [k, v] of Object.entries(SEC.settings)) if (f.elements[k]) f.elements[k].value = v;
  const up = SEC.unpriced_models;
  $('#unpricedCard').classList.toggle('hidden', !up.length);
  $('#unpricedList').textContent = up.map((m) => m.id).join(', ');
  const pend = SEC.devices.filter((d) => d.status === 'pending').length;
  $('#secBadge').textContent = pend || ''; $('#secBadge').classList.toggle('hidden', !pend);
  $('#blockTable').innerHTML = '<tr><th>النوع</th><th>القيمة</th><th>السبب</th><th>ينتهي</th><th></th></tr>' + (SEC.blocks.map((b) =>
    `<tr><td>${b.kind === 'ip' ? 'IP' : 'جهاز'}${b.auto ? ' <span class="badge warn">تلقائي</span>' : ''}</td><td class="mono ltr small">${esc(b.value)}</td><td class="small">${esc(b.reason || '')}</td>
     <td class="small">${b.expires_at ? date(b.expires_at) : 'دائم'}</td><td><button class="small" data-unblock="${b.id}">فك الحظر</button></td></tr>`).join('') || '<tr><td class="muted">لا يوجد</td></tr>');
  const ST = { active: '<span class="badge ok">مسموح</span>', pending: '<span class="badge warn">بانتظارك</span>', blocked: '<span class="badge bad">محظور</span>' };
  $('#deviceTable').innerHTML = '<tr><th>الطالب</th><th>الجهاز</th><th>الحالة</th><th>آخر IP</th><th>آخر استخدام</th><th class="num">طلبات</th><th></th></tr>' + (SEC.devices.map((d) =>
    `<tr><td>${esc(d.user_name || d.user_id)}</td><td>${esc(d.name || '—')}<div class="mono ltr small muted" style="text-align:start">${esc(d.device_id.slice(0, 12))}…</div></td><td>${ST[d.status] || esc(d.status)}</td>
     <td class="mono ltr small">${esc(d.last_ip || '')}</td><td class="small">${date(d.last_seen)}</td><td class="num">${d.requests}</td>
     <td class="row" style="flex-wrap:nowrap">${d.status !== 'active' ? `<button class="small primary" data-dev="${d.id}" data-st="active">سماح</button>` : ''}
       ${d.status !== 'blocked' ? `<button class="small danger" data-dev="${d.id}" data-st="blocked">حظر</button>` : ''}
       <button class="small" data-devdel="${d.id}" title="حذف من القائمة (يحرر مكان للطالب)">✕</button>
       ${d.last_ip ? `<button class="small danger" data-blockip="${esc(d.last_ip)}" title="حظر هذا العنوان">IP⛔</button>` : ''}</td></tr>`).join('') || '<tr><td class="muted">لا أجهزة بعد — بتظهر لما الطلاب يستخدموا الأدوات المثبتة عبر abdalgani-setup</td></tr>');
  $('#ipTable').innerHTML = '<tr><th>العنوان</th><th class="num">طلبات</th><th class="num">طلاب</th><th class="num">أخطاء</th><th></th></tr>' + (SEC.top_ips.map((x) =>
    `<tr><td class="mono ltr small">${esc(x.ip)}</td><td class="num">${x.requests}</td><td class="num">${x.users}${x.users > 1 ? ' ⚠️' : ''}</td><td class="num">${x.errors}</td>
     <td><button class="small danger" data-blockip="${esc(x.ip)}">حظر</button></td></tr>`).join('') || '<tr><td class="muted">لا بيانات</td></tr>');
  $('#secEvents').innerHTML = SEC.events.map((e) => `<tr><td class="small" style="white-space:nowrap">${date(e.created_at)}</td><td>${esc(e.message)}</td></tr>`).join('') || '<tr><td class="muted">لا أحداث</td></tr>';
}
$('#secForm').addEventListener('submit', guard(async (e) => { e.preventDefault(); await api('PUT', '/api/admin/security', formData(e.target)); toast('تم الحفظ'); await loadSecurity(); }));
$('#blockForm').addEventListener('submit', guard(async (e) => { e.preventDefault(); await api('POST', '/api/admin/blocks', formData(e.target)); e.target.reset(); toast('تم الحظر'); await loadSecurity(); }));
document.querySelector('[data-panel="security"]').addEventListener('click', guard(async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const { unblock, dev, st, devdel, blockip } = b.dataset;
  if (unblock) await api('DELETE', `/api/admin/blocks/${unblock}`);
  else if (dev) await api('PATCH', `/api/admin/devices/${dev}`, { status: st });
  else if (devdel) { if (!confirm('حذف الجهاز من القائمة؟ (إذا رجع بيتسجّل من جديد حسب الحد)')) return; await api('DELETE', `/api/admin/devices/${devdel}`); }
  else if (blockip) { const reason = prompt(`حظر ${blockip}؟ السبب:`, 'abuse'); if (reason === null) return; await api('POST', '/api/admin/blocks', { kind: 'ip', value: blockip, reason }); }
  else return;
  toast('تم'); await loadSecurity();
}));

const LOADERS = { security: loadSecurity, updates: loadUpdates, overview: loadOverview, providers: loadProviders, models: loadModels, users: loadUsers, coupons: loadCoupons, usage: loadUsage, settings: loadSettings };

if (store.get(KEY)) boot().catch(() => showLogin()); else showLogin();

// dialogs: close buttons (no inline handlers — the CSP forbids them)
document.addEventListener('click', (e) => { if (e.target.closest('.dlg-close')) e.target.closest('dialog')?.close(); });
