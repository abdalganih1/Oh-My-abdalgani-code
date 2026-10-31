import { $, esc, store, makeApi, toast, usd, usdPrecise, tokens, date, day, STATUS_BADGE, priceLabel, tabs, copy } from '/common.js';

const KEY = 'abd:userKey';
const api = makeApi(KEY, () => { store.del(KEY); showLogin(); });
let me = null, catalog = { models: [], groups: [] };

const TOOLS = ['OpenCode', 'Hermes', 'ClaudeCode', 'CodexCLI', 'KiloCLI', 'PiCode', 'QwenCode', 'Goose', 'Aider', 'OpenClaw', 'KimiCode', 'EHCode'];

function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  store.set(KEY, $('#keyInput').value.trim());
  try { await load(); } catch (err) { toast(err.message, true); }
});
$('#logout').addEventListener('click', () => { store.del(KEY); location.reload(); });

async function load() {
  me = await api('GET', '/api/me');
  catalog = await api('GET', '/api/me/models');
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#who').textContent = me.user.name;
  renderOverview(); renderModels(); renderAliases(); renderSetup(); renderKeys();
  if (!$('[data-panel="usage"]').classList.contains('hidden')) renderUsage().catch((e) => toast(e.message, true));
}

const groupName = (id) => (id ? (catalog.groups.find((g) => g.id === id)?.name || id) : 'كل النماذج');
const fmtAmount = (kind, v) => (kind === 'usd' ? usd(v) : `${tokens(v)} توكن`);

function renderOverview() {
  const active = me.subscriptions.filter((s) => s.active);
  const usdLeft = active.filter((s) => s.kind === 'usd').reduce((a, s) => a + s.remaining, 0);
  const tokLeft = active.filter((s) => s.kind === 'tokens').reduce((a, s) => a + s.remaining, 0);
  const avail = catalog.models.filter((m) => m.available).length;
  $('#stats').innerHTML = [
    ['رصيد بالدولار', usd(usdLeft), `${active.filter((s) => s.kind === 'usd').length} اشتراك فعّال`],
    ['رصيد توكنات', tokens(tokLeft), `${active.filter((s) => s.kind === 'tokens').length} اشتراك فعّال`],
    ['نماذج متاحة لك', `${avail} / ${catalog.models.length}`, 'حسب فئات اشتراكاتك'],
    ['آخر 30 يوم', `${me.stats_30d.req} طلب`, `${tokens(me.stats_30d.tokens)} توكن · ${usd(me.stats_30d.cost)}`],
  ].map(([l, v, s]) => `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('');

  $('#subsTable').innerHTML = me.subscriptions.length
    ? `<tr><th>النوع</th><th>الفئة</th><th>المتبقي</th><th>الاستهلاك</th><th>ينتهي</th><th>الحالة</th><th>المصدر</th></tr>` +
      me.subscriptions.map((s) => {
        const pct = Math.min(100, Math.round((s.used / s.total) * 100));
        const expired = s.expires_at && s.expires_at * 1000 < Date.now();
        const st = s.active ? '<span class="badge ok">فعّال</span>' : expired ? '<span class="badge bad">منتهي</span>' : s.disabled ? '<span class="badge">موقوف</span>' : '<span class="badge warn">مستنفد</span>';
        return `<tr><td>${s.kind === 'usd' ? '💵 دولار' : '🔢 توكنات'}</td><td>${esc(groupName(s.group_id))}</td>
          <td class="num">${fmtAmount(s.kind, s.remaining)}</td>
          <td style="min-width:120px"><div class="small muted">${fmtAmount(s.kind, s.used)} من ${fmtAmount(s.kind, s.total)}</div><div class="bar"><i style="width:${pct}%"></i></div></td>
          <td>${day(s.expires_at)}</td><td>${st}</td><td class="small muted ltr">${esc(s.source || '')}</td></tr>`;
      }).join('')
    : '<tr><td class="muted">ما عندك اشتراكات. اطلب كوبون من المدير وفعّله فوق.</td></tr>';
}

$('#redeemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('POST', '/api/me/redeem', { code: $('#couponInput').value });
    toast(`✅ تم تفعيل ${fmtAmount(r.kind, r.amount)} — ${groupName(r.group_id)}`);
    $('#couponInput').value = '';
    await load();
  } catch (err) { toast(err.message, true); }
});

function renderModels() {
  const sel = $('#fGroup');
  if (sel.options.length === 1) catalog.groups.forEach((g) => sel.insertAdjacentHTML('beforeend', `<option value="${esc(g.id)}">${esc(g.name)}</option>`));
  const st = $('#fStatus').value, gr = $('#fGroup').value, av = $('#fAvail').checked, q = $('#fSearch').value.toLowerCase();
  const list = catalog.models.filter((m) => (!st || m.status === st) && (!gr || m.group_id === gr) && (!av || m.available)
    && (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)));
  $('#modelGrid').innerHTML = list.map((m) => `
    <div class="model-card ${m.available ? '' : 'locked'}">
      <div class="row"><strong>${esc(m.name)}</strong><span class="spacer"></span>${STATUS_BADGE[m.status] || ''}</div>
      <div class="id mono ltr">${esc(m.id)}</div>
      <div class="row small"><span class="badge accent">${esc(groupName(m.group_id))}</span>${m.reasoning ? '<span class="badge">تفكير</span>' : ''}
        ${m.available ? '<span class="badge ok">✓ مسموح</span>' : '<span class="badge">🔒 خارج اشتراكك</span>'}</div>
      <div class="small muted">سياق ${tokens(m.context_length)} · خرج ${tokens(m.max_output)}</div>
      <div class="small">${esc(priceLabel(m))}</div>
      ${m.description ? `<div class="small muted">${esc(m.description)}</div>` : ''}
      ${m.available ? `<button class="small" data-use="${esc(m.id)}">اجعله abd-main</button>` : ''}
    </div>`).join('') || '<p class="muted">لا نتائج</p>';
}
['#fStatus', '#fGroup', '#fAvail'].forEach((s) => $(s).addEventListener('change', renderModels));
$('#fSearch').addEventListener('input', renderModels);
$('#modelGrid').addEventListener('click', async (e) => {
  const id = e.target.dataset?.use; if (!id) return;
  await setAlias('abd-main', id);
});

async function setAlias(alias, model_id) {
  try { await api('PUT', '/api/me/aliases', { alias, model_id }); toast(`${alias} → ${model_id}`); await load(); }
  catch (err) { toast(err.message, true); }
}

function modelOptions(selected) {
  return catalog.models.filter((m) => m.available).map((m) =>
    `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)} (${esc(m.id)})${m.status === 'legacy' ? ' — قديم' : m.status === 'new' ? ' — جديد' : ''}</option>`).join('');
}

function renderAliases() {
  $('#aliasTable').innerHTML = `<tr><th>الاسم الثابت (بالأدوات)</th><th>يشير إلى</th><th></th></tr>` + me.aliases.map((a) => {
    const target = catalog.models.find((m) => m.id === a.model_id);
    const locked = target && !target.available;
    return `<tr><td class="mono ltr">${esc(a.alias)}</td>
      <td><select data-alias="${esc(a.alias)}">${locked ? `<option selected>${esc(a.model_id)} 🔒</option>` : ''}${modelOptions(a.model_id)}</select>
        ${locked ? '<div class="small" style="color:var(--bad)">النموذج الحالي خارج اشتراكك — اختر غيره</div>' : ''}</td>
      <td>${a.custom ? `<button class="small danger" data-reset="${esc(a.alias)}">${a.default_model_id ? 'رجوع للافتراضي' : 'حذف'}</button>` : '<span class="muted small">افتراضي</span>'}</td></tr>`;
  }).join('');
  $('#aliasModel').innerHTML = modelOptions();
}
$('#aliasTable').addEventListener('change', (e) => { const a = e.target.dataset?.alias; if (a) setAlias(a, e.target.value); });
$('#aliasTable').addEventListener('click', async (e) => {
  const a = e.target.dataset?.reset; if (!a) return;
  try { await api('DELETE', `/api/me/aliases/${encodeURIComponent(a)}`); await load(); } catch (err) { toast(err.message, true); }
});
$('#aliasForm').addEventListener('submit', (e) => { e.preventDefault(); setAlias($('#aliasName').value.trim().toLowerCase(), $('#aliasModel').value); });

function renderSetup() {
  const sel = $('#toolSel');
  if (!sel.options.length) sel.innerHTML = TOOLS.map((t) => `<option>${t}</option>`).join('');
  const key = store.get(KEY);
  const base = me.base_url;
  const tool = sel.value, win = $('#osSel').value === 'win';
  $('#installCmd').textContent = win
    ? `$env:ABDALGANI_API_KEY="${key}"; irm ${base}/install.ps1 | iex; abdalgani-setup --tool ${tool}`
    : `curl -fsSL ${base}/install.sh | bash -s -- --tool ${tool} --api-key ${key}`;
  $('#oaSnippet').textContent = `Base URL : ${base}/v1\nAPI Key  : ${key}\nModel    : abd-main   (or any id from the Models tab)\n\ncurl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\\n  -d '{"model":"abd-main","messages":[{"role":"user","content":"hello"}]}'`;
  $('#anSnippet').textContent = `export ANTHROPIC_BASE_URL=${base}\nexport ANTHROPIC_AUTH_TOKEN=${key}\nexport ANTHROPIC_MODEL=abd-main\nexport ANTHROPIC_DEFAULT_HAIKU_MODEL=abd-fast\nclaude`;
}
$('#toolSel').addEventListener('change', renderSetup);
$('#osSel').addEventListener('change', renderSetup);
document.addEventListener('click', (e) => { const id = e.target.dataset?.copy; if (id) copy($(`#${id}`).textContent); });

async function renderUsage() {
  const rows = await api('GET', '/api/me/usage?limit=200');
  $('#usageTable').innerHTML = `<tr><th>الوقت</th><th>النموذج</th><th class="num">دخل</th><th class="num">خرج</th><th class="num">الكلفة</th><th class="num">مُخصوم</th><th>الحالة</th></tr>` +
    rows.map((r) => {
      const sub = me.subscriptions.find((s) => s.id === r.subscription_id);
      const charged = sub ? fmtAmount(sub.kind, r.charged) : r.charged;
      return `<tr><td class="small">${date(r.created_at)}</td><td class="mono ltr">${esc(r.model_id)}</td><td class="num">${tokens(r.prompt_tokens)}</td>
        <td class="num">${tokens(r.completion_tokens)}</td><td class="num">${usdPrecise(r.cost)}</td><td class="num">${charged}</td>
        <td>${r.status < 400 ? '<span class="badge ok">' + r.status + '</span>' : '<span class="badge bad">' + r.status + '</span>'}</td></tr>`;
    }).join('');
}

function renderKeys() {
  $('#keysTable').innerHTML = `<tr><th>الاسم</th><th>البادئة</th><th>آخر استخدام</th><th></th></tr>` + me.keys.map((k) =>
    `<tr><td>${esc(k.name)}</td><td class="mono ltr">${esc(k.prefix)}…</td><td class="small">${date(k.last_used_at)}</td>
     <td>${k.id === me.current_key_id ? '<span class="badge accent">الحالي</span>' : `<button class="small danger" data-revoke="${k.id}">إلغاء</button>`}</td></tr>`).join('');
}
$('#keysTable').addEventListener('click', async (e) => {
  const id = e.target.dataset?.revoke; if (!id || !confirm('إلغاء هذا المفتاح نهائياً؟')) return;
  try { await api('POST', `/api/me/keys/${id}/revoke`); await load(); } catch (err) { toast(err.message, true); }
});
$('#keyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('POST', '/api/me/keys', { name: $('#keyName').value || 'key' });
    $('#newKey').classList.remove('hidden');
    $('#newKey').innerHTML = `احفظه الآن — لن يظهر مرة ثانية:<br><strong>${esc(r.api_key)}</strong>`;
    await load();
  } catch (err) { toast(err.message, true); }
});

tabs(document, (t) => { if (t === 'usage' && me) renderUsage().catch((e) => toast(e.message, true)); });
if (store.get(KEY)) load().catch(() => showLogin()); else showLogin();
