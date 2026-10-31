import { $, $$, esc, store, makeApi, toast, usd, usdPrecise, tokens, date, day, STATUS_BADGE, priceLabel, tabs, copy } from '/common.js';

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

// ── overview ──
async function loadOverview() {
  const s = await api('GET', '/api/admin/stats');
  $('#stats').innerHTML = [
    ['الطلاب', s.users, ''],
    ['مفاتيح المزوّدين', `${s.provider_keys.enabled || 0} / ${s.provider_keys.n}`, 'مفعّل / الكل'],
    ['طلبات 24 ساعة', s.day.req, `${s.day.errors || 0} خطأ · ${tokens(s.day.tokens)} توكن`],
    ['إيراد محسوب 24 ساعة', usd(s.day.cost), ''],
    ['طلبات 30 يوم', s.month.req, `${tokens(s.month.tokens)} توكن`],
    ['إيراد محسوب 30 يوم', usd(s.month.cost), ''],
  ].map(([l, v, sub]) => `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${sub}</div></div>`).join('');
  $('#provStats').innerHTML = '<tr><th>المزوّد</th><th class="num">طلبات</th><th class="num">أخطاء</th><th class="num">الكلفة</th></tr>' +
    s.providers.map((p) => `<tr><td>${esc(p.provider_id || '— (لم يصل)')}</td><td class="num">${p.req}</td><td class="num">${p.errors || 0}</td><td class="num">${usd(p.cost)}</td></tr>`).join('');
  $('#topModels').innerHTML = '<tr><th>النموذج</th><th class="num">طلبات</th><th class="num">الكلفة</th></tr>' +
    s.top_models.map((m) => `<tr><td class="mono ltr">${esc(m.model_id)}</td><td class="num">${m.req}</td><td class="num">${usd(m.cost)}</td></tr>`).join('');
}

// ── providers & keys ──
async function loadProviders() {
  S.providers = await api('GET', '/api/admin/providers');
  $('#providerList').innerHTML = S.providers.map((p) => `
    <div class="card">
      <div class="row"><h2 style="margin:0">${esc(p.name)} <span class="muted mono small ltr">${esc(p.id)}</span></h2>
        ${p.enabled ? '<span class="badge ok">مفعّل</span>' : '<span class="badge bad">موقوف</span>'}
        <span class="spacer"></span>
        <button class="small" data-act="discover" data-p="${esc(p.id)}">📥 استعراض نماذج المزوّد</button>
        <button class="small" data-act="edit-provider" data-p="${esc(p.id)}">تعديل</button>
        <button class="small" data-act="toggle-provider" data-p="${esc(p.id)}">${p.enabled ? 'إيقاف' : 'تفعيل'}</button>
      </div>
      <div class="small muted ltr" style="text-align:start">OpenAI: ${esc(p.openai_base_url || '—')} · Anthropic: ${esc(p.anthropic_base_url || '—')} · auth: ${esc(p.auth_style)}</div>
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
  } else if (act === 'toggle-provider') {
    await api('POST', '/api/admin/providers', { ...prov, enabled: !prov.enabled }); await loadProviders();
  } else if (act === 'edit-provider') {
    const f = $('#providerForm');
    for (const n of ['id', 'name', 'openai_base_url', 'anthropic_base_url', 'auth_style', 'extra_headers']) f.elements[n].value = prov[n] || (n === 'auth_style' ? 'bearer' : '');
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
      status: 'new', routes: [{ provider_id: providerId, upstream_model: m.id }],
    }, true);
  });
  $('#discoverDlg').showModal();
}

$('#providerForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  const d = formData(e.target);
  const prev = S.providers.find((p) => p.id === d.id);
  await api('POST', '/api/admin/providers', { ...d, enabled: prev ? !!prev.enabled : true });
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
      <td class="small ltr" style="text-align:start">${m.routes.map((r, i) => `${i + 1}. ${esc(r.provider_id)} → ${esc(r.upstream_model)}${r.enabled ? '' : ' (off)'}`).join('<br>') || '<span class="badge bad">لا مسار</span>'}</td>
      <td class="num">${tokens(m.context_length)}</td>
      <td class="row" style="flex-wrap:nowrap"><button class="small" data-edit="${esc(m.id)}">تعديل</button><button class="small danger" data-del="${esc(m.id)}">حذف</button></td></tr>`).join('');
}
$('#modelTable').addEventListener('click', guard(async (e) => {
  const { edit, del } = e.target.dataset || {};
  if (edit) openModel(S.models.find((m) => m.id === edit));
  if (del && confirm(`حذف ${del}؟ (الأفضل تحويله لـ "قديم" أو "مخفي")`)) { await api('DELETE', `/api/admin/models/${encodeURIComponent(del)}`); await loadModels(); }
}));
$('#newModel').addEventListener('click', () => openModel({ status: 'new', pricing_mode: 'token', context_length: 128000, max_output: 16384, sort: 100, routes: [] }, true));

function routeRow(r = {}) {
  const div = document.createElement('div');
  div.className = 'row'; div.style.marginBottom = '6px';
  div.innerHTML = `<select name="rp">${S.providers.map((p) => `<option value="${esc(p.id)}" ${p.id === r.provider_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <input name="rm" class="ltr" placeholder="upstream model id" value="${esc(r.upstream_model || '')}" style="flex:1;min-width:160px">
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
    if (!el.name || ['rp', 'rm', 're'].includes(el.name)) continue;
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
    ...d, reasoning: f.elements.reasoning.checked,
    price_in: Math.round((+d.price_in || 0) * M), price_out: Math.round((+d.price_out || 0) * M),
    price_cache_read: Math.round((+d.price_cache_read || 0) * M), price_request: Math.round((+d.price_request || 0) * M),
    routes: $$('#routeRows > div').map((row, i) => ({
      provider_id: row.querySelector('[name=rp]').value, upstream_model: row.querySelector('[name=rm]').value.trim(),
      enabled: row.querySelector('[name=re]').checked, priority: i,
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
    await api('POST', `/api/admin/users/${id}/subscriptions`, { ...g, amount: Math.round(+g.amount * M) });
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
        <td>${c.kind === 'usd' ? usd(c.amount) : tokens(c.amount) + ' tok'}</td><td>${esc(groupName(c.group_id))}</td>
        <td class="small">${c.valid_days ? c.valid_days + ' يوم' : 'دائم'}</td><td class="num">${c.used_count}/${c.max_uses}</td><td>${st}</td>
        <td class="small muted">${esc(c.note || '')}</td>
        <td class="row" style="flex-wrap:nowrap"><button class="small" data-cdis="${esc(c.code)}" data-v="${c.disabled}">${c.disabled ? 'تفعيل' : 'إيقاف'}</button><button class="small danger" data-cdel="${esc(c.code)}">حذف</button></td></tr>`;
    }).join('');
}
$('#couponForm').addEventListener('submit', guard(async (e) => {
  e.preventDefault();
  const d = formData(e.target);
  const r = await api('POST', '/api/admin/coupons', { ...d, amount: Math.round(+d.amount * M) });
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
    rows.map((r) => `<tr><td class="small">${date(r.created_at)}</td><td>${esc(r.user_name || r.user_id)}</td><td class="mono ltr small">${esc(r.model_id)}</td>
      <td class="small">${esc(r.provider_id || '—')}</td><td class="num">${tokens(r.prompt_tokens)}</td><td class="num">${tokens(r.completion_tokens)}</td>
      <td class="num">${usdPrecise(r.cost)}</td><td class="num">${r.latency_ms ?? ''}</td>
      <td title="${esc(r.error || '')}">${r.status < 400 ? `<span class="badge ok">${r.status}</span>` : `<span class="badge bad">${r.status}</span>`}</td></tr>`).join('');
}

const LOADERS = { overview: loadOverview, providers: loadProviders, models: loadModels, users: loadUsers, coupons: loadCoupons, usage: loadUsage, settings: loadSettings };

if (store.get(KEY)) boot().catch(() => showLogin()); else showLogin();
