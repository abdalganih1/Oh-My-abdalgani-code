import { $, $$, esc, store, makeApi, toast, usd, usdPrecise, tokens, date, day, STATUS_BADGE, priceLabel, tabs, copy } from '/common.js';
import { bars, fillSeries, css } from '/charts.js';
import { initShell, countUp, icon, addAction } from '/ui.js';

const KEY = 'abd:userKey';
const api = makeApi(KEY, () => { store.del(KEY); showLogin(); });
let me = null, catalog = { models: [], groups: [] }, rep = null, limits = null, myMetric = 'cost';
const TZ = -new Date().getTimezoneOffset();

const TOOLS = ['OpenCode', 'Hermes', 'ClaudeCode', 'CodexCLI', 'KiloCLI', 'PiCode', 'QwenCode', 'Goose', 'Aider', 'OpenClaw', 'KimiCode', 'EHCode'];

function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); initAuth(); }
const isSession = () => (store.get(KEY) || '').startsWith('abd_ses_');

let authInit = false, turnstileToken = '';
async function initAuth() {
  if (authInit) return; authInit = true;
  $('#authTabs').addEventListener('click', (e) => {
    const a = e.target.dataset?.a; if (!a) return;
    $$('#authTabs button').forEach((b) => b.classList.toggle('on', b.dataset.a === a));
    $$('#login form').forEach((f) => f.classList.toggle('hidden', f.dataset.a !== a));
    const T = { login: ['أهلاً فيك 👋', 'سجّل دخولك لتشوف رصيدك ونماذجك.'], register: ['خلّينا نبلّش ✨', 'حساب مجاني بدقيقة، وبعدها بتشحنه بكود التفعيل.'], key: ['دخول بمفتاح', 'الصق مفتاح API تبعك.'] }[a];
    $('#authTitle').textContent = T[0]; $('#authHint').textContent = T[1];
    $(`#login form[data-a="${a}"] input`)?.focus();
  });
  playTerminal();
  try {
    const cfg = await (await fetch('/api/auth/config')).json();
    if (cfg.signup_mode === 'closed') $('[data-a="register"]').classList.add('hidden');
    if (cfg.turnstile_site_key) {
      window.onTurnstile = (t) => { turnstileToken = t; };
      $('#turnstile').innerHTML = `<div class="cf-turnstile" data-sitekey="${esc(cfg.turnstile_site_key)}" data-callback="onTurnstile"></div>`;
      const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; sc.async = true; document.head.appendChild(sc);
    }
  } catch { /* offline */ }
}
async function authPost(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}
const fd = (f) => Object.fromEntries(new FormData(f).entries());
// Show a spinner on the form's submit button while fn runs (prevents double submits).
async function busy(form, fn) {
  const b = form.querySelector('button.primary, button:not([type="button"])');
  if (b?.classList.contains('loading')) return;
  b?.classList.add('loading');
  try { await fn(); } finally { b?.classList.remove('loading'); }
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await busy(e.target, async () => { try { const r = await authPost('/api/auth/login', fd(e.target)); store.set(KEY, r.session); await load(); } catch (err) { toast(err.message, true); } });
});
$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await busy(e.target, async () => { try {
    const r = await authPost('/api/auth/register', { ...fd(e.target), turnstile: turnstileToken });
    if (r.pending) { toast('تم التسجيل ✅ حسابك بانتظار موافقة المدرّس'); return; }
    store.set(KEY, r.session); await load();
    toast('أهلاً! اتّبع الخطوات بأول الصفحة 👆');
  } catch (err) { toast(err.message, true); } });
});
$('#keyForm0').addEventListener('submit', async (e) => {
  e.preventDefault(); store.set(KEY, $('#keyInput').value.trim());
  try { await load(); } catch (err) { toast(err.message, true); }
});
$('#logout').addEventListener('click', async () => {
  if (isSession()) { try { await api('POST', '/api/auth/logout'); } catch { /* ignore */ } }
  store.del(KEY); store.del('abd:lastApiKey'); location.reload();
});

async function load() {
  [me, catalog, rep, limits] = await Promise.all([api('GET', '/api/me'), api('GET', '/api/me/models'), api('GET', `/api/me/report?tz=${TZ}`), api('GET', '/api/me/limits')]);
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#who').textContent = me.user.name;
  $('#whoEmail').textContent = me.user.email || '';
  $('#avatar').textContent = (me.user.name || '?').trim().charAt(0).toUpperCase();
  renderOnboarding();
  renderOverview(); renderLimits(); renderModels(); renderAliases(); renderSetup(); renderKeys();
  if (!$('[data-panel="usage"]').classList.contains('hidden')) renderUsage().catch((e) => toast(e.message, true));
}

const groupName = (id) => (id ? (catalog.groups.find((g) => g.id === id)?.name || id) : 'كل النماذج');
const fmtAmount = (kind, v) => (kind === 'usd' ? usd(v) : `${tokens(v)} توكن`);

function renderOverview() {
  const active = me.subscriptions.filter((s) => s.active);
  const usdLeft = active.filter((s) => s.kind === 'usd').reduce((a, s) => a + s.remaining, 0);
  const tokLeft = active.filter((s) => s.kind === 'tokens').reduce((a, s) => a + s.remaining, 0);
  const avail = catalog.models.filter((m) => m.available).length;
  // ── hero: the balance in one plain sentence ──
  const usdTotal = active.filter((s) => s.kind === 'usd').reduce((a, s) => a + s.total, 0);
  const tokTotal = active.filter((s) => s.kind === 'tokens').reduce((a, s) => a + s.total, 0);
  const b = rep.burn;
  const soonest = active.filter((s) => s.expires_at).sort((x, y) => x.expires_at - y.expires_at)[0];
  const daysTo = soonest ? Math.max(0, Math.ceil((soonest.expires_at * 1000 - Date.now()) / 86400000)) : null;
  if (!active.length) {
    $('#heroValue').textContent = 'ما عندك رصيد';
    $('#heroRing').style.setProperty('--p', 0); $('#ringPct').textContent = '0%';
    $('#heroSub').textContent = 'اطلب كوبون من المدرّس وفعّله تحت — بدون رصيد ما بتشتغل الأدوات.';
    $('#heroTokens').textContent = '';
  } else {
    const main = usdTotal ? usd(usdLeft) : `${tokens(tokLeft)} توكن`;
    const usedPct = usdTotal ? (1 - usdLeft / usdTotal) : (1 - tokLeft / tokTotal);
    if (usdTotal) countUp($('#heroValue'), usdLeft, (v) => usd(v)); else $('#heroValue').textContent = main;
    const leftPct = Math.max(0, Math.round((1 - usedPct) * 100));
    $('#heroRing').style.setProperty('--p', leftPct); $('#ringPct').textContent = `${leftPct}%`;
    const left = usdTotal ? b.usd_days_left : b.tokens_days_left;
    const parts = [`استهلكت ${Math.round(usedPct * 100)}% من ${usdTotal ? usd(usdTotal) : tokens(tokTotal) + ' توكن'}`];
    if (left != null) parts.push(`بمعدل استهلاكك آخر أسبوع بيكفيك تقريباً ${left > 365 ? 'أكثر من سنة' : left + ' يوم'}`);
    else parts.push('ما استخدمت شي آخر أسبوع');
    if (daysTo != null) parts.push(`أقرب اشتراك بينتهي بعد ${daysTo} يوم (${day(soonest.expires_at)})`);
    $('#heroSub').textContent = parts.join(' · ');
    $('#heroTokens').textContent = usdTotal && tokTotal ? `وعندك كمان ${tokens(tokLeft)} توكن مخصصة${b.tokens_days_left != null ? ` (تكفي تقريباً ${b.tokens_days_left} يوم)` : ''}.` : '';
  }
  const t = rep.totals;
  $('#stats').innerHTML = [
    ['activity', 'طلبات آخر 30 يوم', t.requests.toLocaleString('en'), `≈ ${b.per_day_requests} طلب باليوم آخر أسبوع`],
    ['layers', 'توكنات آخر 30 يوم', tokens(t.tokens), `دخل ${tokens(t.prompt_tokens)} · خرج ${tokens(t.completion_tokens)}`],
    ['wallet', 'صرفت آخر 30 يوم', usdPrecise(t.cost), `متوسط الطلب ${usdPrecise(t.avg_cost)}`],
    ['cpu', 'نماذج متاحة لك', `${avail} / ${catalog.models.filter((m) => m.status !== 'archived').length}`, 'حسب فئات اشتراكاتك'],
  ].map(([ic, l, v, s]) => `<div class="stat"><div class="label row" style="gap:6px">${icon(ic, 15)}${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('');
  drawMine();
  const totalCost = rep.by_model.reduce((a, x) => a + x.cost, 0), totalReq = rep.by_model.reduce((a, x) => a + x.requests, 0);
  const key = totalCost ? 'cost' : 'requests', max = Math.max(0, ...rep.by_model.map((x) => x[key]));
  $('#byModel').innerHTML = '<tr><th>النموذج</th><th style="width:35%"></th><th class="num">طلبات</th><th class="num">توكنات</th><th class="num">الكلفة</th><th class="num">النسبة</th></tr>' + (rep.by_model.map((x) =>
    `<tr><td><strong>${esc(x.name || x.model_id)}</strong></td><td><div class="inbar-wrap"><div class="inbar" style="width:${max ? Math.max(1, (x[key] / max) * 100) : 0}%"></div></div></td>
     <td class="num">${x.requests}</td><td class="num">${tokens(x.prompt_tokens + x.completion_tokens)}</td><td class="num">${usdPrecise(x.cost)}</td>
     <td class="num">${(key === 'cost' ? totalCost : totalReq) ? Math.round((x[key] / (key === 'cost' ? totalCost : totalReq)) * 100) + '%' : '—'}</td></tr>`).join('') || `<tr><td colspan="6"><div class="empty">${icon('chart', 40)}<div>ما في استخدام آخر 30 يوم — أول طلب من أداتك رح يبيّن هون.</div></div></td></tr>`);
  $('#avgLine').textContent = t.requests ? `الطلب الواحد عندك بالمتوسط ≈ ${tokens(t.avg_tokens)} توكن ويكلّف ${usdPrecise(t.avg_cost)}.` : '';

  const nowS = Date.now() / 1000;
  const fresh = catalog.models.filter((m) => m.status === 'new');
  const gone = catalog.models.filter((m) => m.status === 'archived' && m.archived_at && nowS - m.archived_at < 14 * 86400);
  $('#newsCard').classList.toggle('hidden', !fresh.length && !gone.length);
  $('#news').innerHTML = [
    ...fresh.map((m) => `<div class="row small" style="margin-bottom:6px">${STATUS_BADGE.new}<strong>${esc(m.name)}</strong><span class="mono ltr muted">${esc(m.id)}</span><span class="muted">· أُضيف ${day(m.created_at)}</span>${m.available ? `<button class="small" data-use="${esc(m.id)}">جرّبه كـ abd-main</button>` : '<span class="badge">🔒 خارج اشتراكك</span>'}</div>`),
    ...gone.map((m) => `<div class="row small" style="margin-bottom:6px">${STATUS_BADGE.archived}<span>${esc(m.name)}</span><span class="muted">· توقف ${day(m.archived_at)}</span></div>`),
  ].join('');

  $('#realTable').innerHTML = '<tr><th>الاسم بأدواتك</th><th>النموذج الحقيقي</th><th>المزوّد · المعرّف عنده</th></tr>' + me.aliases.map((a) => {
    const t = catalog.models.find((m) => m.id === a.model_id);
    const was = a.fallback ? catalog.models.find((m) => m.id === a.archived_model_id) : null;
    return `<tr><td class="mono ltr">${esc(a.alias)}</td><td><strong>${esc(t?.name || a.model_name)}</strong> <span class="muted mono small ltr">${esc(a.model_id)}</span> ${t ? STATUS_BADGE[t.status] || '' : ''}${t && !t.available && t.status !== 'archived' ? ' <span class="badge bad">🔒 خارج اشتراكك</span>' : ''}
      ${was ? `<div class="small" style="color:var(--warn)">بدلاً من ${esc(was.name)} (مؤرشف)</div>` : ''}</td>
      <td class="small muted ltr" style="text-align:start">${esc(a.served_by || '—')}</td></tr>`;
  }).join('');

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
    : `<tr><td><div class="empty">${icon('ticket', 40)}<div>ما عندك اشتراكات بعد. اطلب كود تفعيل من المدرّس وفعّله فوق.</div></div></td></tr>`;
}

$('#redeemForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await busy(e.target, async () => { try {
    const r = await api('POST', '/api/me/redeem', { code: $('#couponInput').value });
    toast(`✅ تم تفعيل ${fmtAmount(r.kind, r.amount)} — ${groupName(r.group_id)}`);
    $('#couponInput').value = '';
    await load();
  } catch (err) { toast(err.message, true); } });
});

function renderLimits() {
  const l = limits;
  const pct = Math.min(100, Math.round((l.spent_today / l.daily_cap) * 100));
  $('#capToday').textContent = `صرفت اليوم ${usdPrecise(l.spent_today)} من سقفك ${usd(l.daily_cap)} (${pct}%) · بيتصفّر الساعة ${new Date(l.resets_at * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${l.monthly_cap ? ` · هالشهر ${usd(l.spent_month)} من ${usd(l.monthly_cap)}` : ''}`;
  $('#capBar').style.width = `${pct}%`;
  $('#capBar').style.background = pct >= 90 ? 'var(--bad)' : pct >= 70 ? 'var(--warn)' : '';
  const f = $('#capForm');
  f.elements.daily.value = (l.daily_cap / 1e6).toFixed(2);
  f.elements.daily.max = (l.max_cap / 1e6).toFixed(2);
  f.elements.monthly.value = l.monthly_cap ? (l.monthly_cap / 1e6).toFixed(2) : '';
  $('#capForm .f').title = `الحد الأعلى المسموح $${(l.max_cap / 1e6).toFixed(2)}`;
}
$('#capForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('PUT', '/api/me/limits', { daily_cap: Math.round(+d.daily * 1e6), monthly_cap: d.monthly ? Math.round(+d.monthly * 1e6) : null });
    toast('تم حفظ حدودك'); limits = await api('GET', '/api/me/limits'); renderLimits();
  } catch (err) { toast(err.message, true); }
});
$('#pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('POST', '/api/me/password', Object.fromEntries(new FormData(e.target).entries())); toast('تم — سجّل الدخول من جديد'); store.del(KEY); setTimeout(() => location.reload(), 1200); }
  catch (err) { toast(err.message, true); }
});

function drawMine() {
  const r = rep.range;
  const rows = fillSeries(rep.series, r.from, r.to, TZ, 'day');
  $$('#myMetric button').forEach((x) => x.classList.toggle('on', x.dataset.m === myMetric));
  const fmt = myMetric === 'cost' ? (v, axis) => (axis ? usd(v, v < 1e6 ? 2 : 0) : usdPrecise(v)) : myMetric === 'tokens' ? (v) => tokens(v) : (v) => Number(v).toLocaleString('en');
  const names = { cost: 'الكلفة', requests: 'الطلبات', tokens: 'التوكنات' };
  $('#myTsTitle').textContent = `${names[myMetric]} آخر 30 يوم`;
  bars($('#myChart'), { labels: rows.map((x) => x.t.slice(5)), series: [{ name: names[myMetric], color: css('--series-1'), values: rows.map((x) => x[myMetric] || 0) }], format: fmt, height: 200 });
}
$('#myMetric').addEventListener('click', (e) => { const m = e.target.dataset?.m; if (m && rep) { myMetric = m; drawMine(); } });

function renderModels() {
  const sel = $('#fGroup');
  if (sel.options.length === 1) catalog.groups.forEach((g) => sel.insertAdjacentHTML('beforeend', `<option value="${esc(g.id)}">${esc(g.name)}</option>`));
  const st = $('#fStatus').value, gr = $('#fGroup').value, av = $('#fAvail').checked, q = $('#fSearch').value.toLowerCase();
  const list = catalog.models.filter((m) => (st ? m.status === st : m.status !== 'archived') && (!gr || m.group_id === gr) && (!av || m.available)
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
      ${m.status === 'archived' ? `<div class="small" style="color:var(--bad)">توقف ${day(m.archived_at)}</div>` : ''}
      ${m.available ? `<button class="small" data-use="${esc(m.id)}">اجعله abd-main</button>` : ''}
    </div>`).join('') || `<div class="empty" style="grid-column:1/-1">${icon('search', 40)}<div>ما في نماذج بهالفلتر</div></div>`;
}
['#fStatus', '#fGroup', '#fAvail'].forEach((s) => $(s).addEventListener('change', renderModels));
$('#news').addEventListener('click', async (e) => { const id = e.target.dataset?.use; if (id) await setAlias('abd-main', id); });
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
  return catalog.models.filter((m) => m.available && m.status !== 'archived').map((m) =>
    `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)} (${esc(m.id)})${m.status === 'legacy' ? ' — قديم' : m.status === 'new' ? ' — جديد' : ''}</option>`).join('');
}

function renderAliases() {
  $('#aliasTable').innerHTML = `<tr><th>الاسم الثابت (بالأدوات)</th><th>يشير إلى</th><th></th></tr>` + me.aliases.map((a) => {
    const target = catalog.models.find((m) => m.id === a.model_id);
    const locked = target && !target.available;
    return `<tr><td class="mono ltr">${esc(a.alias)}<div class="small muted" style="direction:rtl">= ${esc(a.model_name)}</div></td>
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
  if (![...sel.options].some((o) => o.text)) sel.innerHTML = TOOLS.map((t) => `<option>${t}</option>`).join('');
  const key = isSession() ? (store.get('abd:lastApiKey') || 'sk-abd-…(اعمل مفتاح من تبويب المفاتيح)') : store.get(KEY);
  const base = me.base_url;
  const tool = sel.value, win = $('#osSel').value === 'win';
  $('#installCmd').textContent = win
    ? `$env:ABDALGANI_API_KEY="${key}"; irm ${base}/install.ps1 | iex; abdalgani-setup --tool ${tool}`
    : `curl -fsSL ${base}/install.sh | bash -s -- --tool ${tool} --api-key ${key}`;
  $('#oaSnippet').textContent = `Base URL : ${base}/v1\nAPI Key  : ${key}\nModel    : abd-main   (or any id from the Models tab)\n\ncurl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\\n  -d '{"model":"abd-main","messages":[{"role":"user","content":"hello"}]}'`;
 $('#helperCmds').textContent = `abdalgani-setup --status     # رصيدك + النموذج الحقيقي ورا كل اسم\nabdalgani-setup --sync       # حدّث أسماء النماذج داخل أدواتك بعد التبديل\nabdalgani-setup              # إضافة أداة جديدة`;
  $('#anSnippet').textContent = `export ANTHROPIC_BASE_URL=${base}\nexport ANTHROPIC_AUTH_TOKEN=${key}\nexport ANTHROPIC_MODEL=abd-main\nexport ANTHROPIC_DEFAULT_HAIKU_MODEL=abd-fast\nclaude`;
}
$('#toolSel').addEventListener('change', renderSetup);
$('#osSel').addEventListener('change', renderSetup);
$('#osSeg').addEventListener('click', (e) => {
  const os = e.target.closest('[data-os]')?.dataset.os; if (!os) return;
  $$('#osSeg button').forEach((b) => b.classList.toggle('on', b.dataset.os === os));
  $('#osSel').value = os; renderSetup();
});
document.addEventListener('click', (e) => { const id = e.target.dataset?.copy; if (id) copy($(`#${id}`).textContent); });

async function renderUsage() {
  const rows = await api('GET', '/api/me/usage?limit=200');
  $('#usageTable').innerHTML = `<tr><th>الوقت</th><th>النموذج</th><th class="num">دخل</th><th class="num">خرج</th><th class="num">الكلفة</th><th class="num">مُخصوم</th><th>الحالة</th></tr>` +
    rows.map((r) => {
      const sub = me.subscriptions.find((s) => s.id === r.subscription_id);
      const charged = sub ? fmtAmount(sub.kind, r.charged) : r.charged;
      const alias = r.requested_model && r.requested_model.replace(/^(abdalgani|abd)\//, '') !== r.model_id ? `${esc(r.requested_model)} → ` : '';
      return `<tr><td class="small">${date(r.created_at)}</td><td class="mono ltr small">${alias}<strong>${esc(r.model_id)}</strong>${r.upstream_model && r.upstream_model !== r.model_id ? `<div class="muted">${esc(r.upstream_model)}</div>` : ''}</td><td class="num">${tokens(r.prompt_tokens)}</td>
        <td class="num">${tokens(r.completion_tokens)}</td><td class="num">${usdPrecise(r.cost)}</td><td class="num">${charged}</td>
        <td>${r.status < 400 ? '<span class="badge ok">' + r.status + '</span>' : '<span class="badge bad">' + r.status + '</span>'}</td></tr>`;
    }).join('') + (rows.length ? '' : `<tr><td colspan="7"><div class="empty">${icon('list', 40)}<div>ما في طلبات بعد. أول ما تستخدم أداة مربوطة بمفتاحك، كل طلب رح يظهر هون مع كلفته.</div></div></td></tr>`);
}

async function renderDevices() {
  const list = await api('GET', '/api/me/devices');
  const ST = { active: '<span class="badge ok">مسموح</span>', pending: '<span class="badge warn">بانتظار موافقة المدرّس</span>', blocked: '<span class="badge bad">محظور</span>' };
  $('#devTable').innerHTML = '<tr><th>الجهاز</th><th>الحالة</th><th>آخر استخدام</th><th>آخر عنوان</th></tr>' + (list.map((d) =>
    `<tr><td>${esc(d.name || '—')}</td><td>${ST[d.status] || ''}</td><td class="small">${date(d.last_seen)}</td><td class="mono ltr small">${esc(d.last_ip || '')}</td></tr>`).join('') || '<tr><td class="muted">لا أجهزة مسجّلة بعد</td></tr>');
}

function renderKeys() {
  renderDevices().catch(() => {});
  $('#keysTable').innerHTML = `<tr><th>الاسم</th><th>البادئة</th><th>آخر استخدام</th><th></th></tr>` + me.keys.map((k) =>
    `<tr><td>${esc(k.name)}</td><td class="mono ltr">${esc(k.prefix)}…</td><td class="small">${date(k.last_used_at)}</td>
     <td>${k.id === me.current_key_id ? '<span class="badge accent">الحالي</span>' : `<button class="small danger" data-revoke="${k.id}">إلغاء</button>`}</td></tr>`).join('') || `<tr><td colspan="4"><div class="empty">${icon('key', 40)}<div>ما عندك مفاتيح — اعمل واحد تحت لتربط أدواتك</div></div></td></tr>`;
  $('#pwCard').classList.toggle('hidden', !me.user.has_password);
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
    $('#newKey').innerHTML = `<div style="direction:rtl;text-align:start;margin-bottom:8px">🔐 احفظه هلق — ما رح يظهر مرة تانية (وصار جاهز بأوامر "التثبيت والاستخدام"):</div><div class="row" style="justify-content:space-between"><strong>${esc(r.api_key)}</strong><button type="button" class="small" id="copyNewKey">${icon('copy', 14)}نسخ</button></div>`;
    $('#copyNewKey').addEventListener('click', () => copy(r.api_key));
    store.set('abd:lastApiKey', r.api_key);
    await load();
  } catch (err) { toast(err.message, true); }
});

initShell();
addAction('انسخ أمر التثبيت', () => { $('[data-tab="setup"]').click(); copy($('#installCmd').textContent); });
addAction('اعمل مفتاح API جديد', () => { $('[data-tab="keys"]').click(); $('#keyName').focus(); });
addAction('فعّل كود تفعيل', () => { $('[data-tab="overview"]').click(); $('#couponInput').focus(); });
tabs(document, (t) => { if (t === 'usage' && me) renderUsage().catch((e) => toast(e.message, true)); if (t === 'overview' && rep) drawMine(); });
let rT; window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => rep && drawMine(), 200); });

// ── onboarding: the four steps from empty account to first request ──
function renderOnboarding() {
  const steps = [
    { done: true, t: 'أنشئ حسابك', d: 'تمام، صار عندك حساب ✓' },
    { done: me.keys.length > 0, t: 'اعمل مفتاح API', d: 'من "المفاتيح والأمان" — مفتاح لكل جهاز', go: () => { $('[data-tab="keys"]').click(); $('#keyName').focus(); } },
    { done: me.subscriptions.length > 0, t: 'فعّل كود التفعيل', d: 'خده من المدرّس وحطه بخانة الرصيد', go: () => { $('#couponInput').focus(); $('#couponInput').scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
    { done: (rep?.totals?.requests || 0) > 0, t: 'ثبّت أداتك وابعت أول طلب', d: 'أمر واحد من "التثبيت والاستخدام"', go: () => $('[data-tab="setup"]').click() },
  ];
  const n = steps.filter((s) => s.done).length, next = steps.findIndex((s) => !s.done);
  $('#onboardCard').classList.toggle('hidden', n === steps.length);
  $('#obText').textContent = `${n} من ${steps.length}`;
  $('#obBar').style.width = `${(n / steps.length) * 100}%`;
  $('#onboard').innerHTML = steps.map((s, i) => `<button type="button" class="ob-step ${s.done ? 'done' : i === next ? 'next' : ''}" data-ob="${i}">
    <span class="n">${s.done ? icon('check', 16) : i + 1}</span><div><b>${s.t}</b><span>${s.d}</span></div></button>`).join('');
  $('#onboard').onclick = (e) => { const i = e.target.closest('[data-ob]')?.dataset.ob; if (i != null) steps[i].go?.(); };
}

// ── landing: typing terminal + tool marquee ──
const TERM = [
  ['p', '$ ', 'curl -fsSL https://api.abdalgani.com/install.sh | bash -s -- --tool OpenCode'],
  ['dim', '', '→ installing OpenCode v2 … done'],
  ['ok', '✓ ', 'connected to abdalgani gateway'],
  ['ok', '✓ ', 'models synced: abd-main · abd-fast · abd-think'],
  ['ok', '✓ ', 'Arabic pack: /ar /en'],
  ['p', '$ ', 'abdalgani-setup --status'],
  ['hl', '', 'abd-main → glm-5.2   balance $9.84   cap $5/day'],
];
let termPlayed = false;
function playTerminal() {
  const el = $('#termBody'); if (!el || termPlayed) return; termPlayed = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const line = (cls, pre, txt) => `<div><span class="${cls}">${esc(pre)}</span>${cls === 'p' ? esc(txt) : `<span class="${cls}">${esc(txt)}</span>`}</div>`;
  if (reduce) { el.innerHTML = TERM.map((l) => line(...l)).join(''); return; }
  let i = 0, c = 0, html = '';
  const tick = () => {
    if ($('#login').classList.contains('hidden')) return; // stop when not visible
    const [cls, pre, txt] = TERM[i];
    if (cls === 'p' && c < txt.length) { c += 2; el.innerHTML = html + `<div><span class="p">${esc(pre)}</span>${esc(txt.slice(0, c))}<span class="caret"></span></div>`; return setTimeout(tick, 28); }
    html += line(cls, pre, txt); el.innerHTML = html + '<span class="caret"></span>'; i++; c = 0;
    if (i < TERM.length) setTimeout(tick, cls === 'p' ? 380 : 260);
    else setTimeout(() => { if (!$('#login').classList.contains('hidden')) { termPlayed = false; html = ''; playTerminal(); } }, 5200);
  };
  tick();
}
{
  const tools = ['OpenCode', 'Hermes', 'pi', 'Claude Code', 'Codex', 'Kilo', 'Qwen Code', 'Goose', 'Aider', 'OpenClaw', 'Kimi', 'EH Code', 'GLM', 'OpenRouter', 'NVIDIA', 'Anthropic', 'OpenAI'];
  const row = tools.map((t) => `<span>${esc(t)}</span>`).join('');
  const m = $('#marquee'); if (m) m.innerHTML = row + row;
}

if (store.get(KEY)) load().catch(() => showLogin()); else showLogin();
