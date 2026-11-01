// Automatic model lifecycle (runs from the Cron Trigger, and on demand from the admin panel):
//   1. catalog sync   — diff every provider's /models: new models → event (+ auto-publish as
//                       "new"), models gone for N hours → route archived, back again → restored
//   2. health         — a provider / route that keeps failing for ≥ 6h with zero successes in
//                       between is archived (a 5-hour rate-limit window never trips it)
//   3. "new" badge    — models stay "new" for 7 days, then become "active"
//   4. orphan models  — a model with no live route is archived; restored when a route returns
//   5. notifications  — new events are pushed to NOTIFY_WEBHOOK (Discord / Slack / Telegram)
import { decryptSecret, now as nowSec } from './util.js';
import { upstreamHeaders } from './routing.js';
import { runDetectors } from './detect.js';
import { getSecurity } from './security.js';

const DEFAULTS = { archive_after_hours: 6, new_days: 7, missing_hours: 6 };

export async function getLifecycle(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'lifecycle'").first();
  try { return { ...DEFAULTS, ...(row ? JSON.parse(row.value) : {}) }; } catch { return { ...DEFAULTS }; }
}

const parseJson = (s, d = {}) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
const perM = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 1e12)); // USD/token → µ$/1M

/** Normalize one entry of an upstream /models list (OpenAI, OpenRouter, NVIDIA, Zen, z.ai...). */
export function normalizeUpstreamModel(m) {
  const priceIn = perM(m.pricing?.prompt), priceOut = perM(m.pricing?.completion);
  const id = String(m.id);
  return {
    upstream_id: id,
    name: m.name || m.display_name || id,
    context_length: m.context_length || m.context_window || m.top_provider?.context_length || null,
    max_output: m.top_provider?.max_completion_tokens || m.max_output_tokens || null,
    price_in: priceIn,
    price_out: priceOut,
    price_cache_read: perM(m.pricing?.input_cache_read),
    price_cache_write: perM(m.pricing?.input_cache_write),
    free: (priceIn === 0 && priceOut === 0) || /(^|[:/-])free($|[:/-])/i.test(id) ? 1 : 0,
    vision: Array.isArray(m.architecture?.input_modalities) ? (m.architecture.input_modalities.includes('image') ? 1 : 0) : null,
    reasoning: Array.isArray(m.supported_parameters) ? (m.supported_parameters.some((p) => p === 'reasoning' || p === 'include_reasoning' || p === 'reasoning_effort') ? 1 : 0) : null,
  };
}

/** Failing continuously for `hours` (first → last failure) with no success since the first failure. */
export function shouldArchive(h, hours) {
  if (!h?.first_fail_at || !h.last_fail_at) return false;
  if (h.last_ok_at && h.last_ok_at >= h.first_fail_at) return false;
  return h.last_fail_at - h.first_fail_at >= hours * 3600;
}

// ── request-time health signals (called from the proxy, cheap & idempotent) ──
export async function recordOk(db, providerId, routeId, t = nowSec()) {
  const cond = 'AND (last_ok_at IS NULL OR last_ok_at < ? OR first_fail_at IS NOT NULL)';
  await db.batch([
    db.prepare(`UPDATE providers SET last_ok_at = ?, first_fail_at = NULL, last_fail_error = NULL WHERE id = ? ${cond}`).bind(t, providerId, t - 300),
    db.prepare(`UPDATE model_routes SET last_ok_at = ?, first_fail_at = NULL, last_fail_error = NULL WHERE id = ? ${cond}`).bind(t, routeId, t - 300),
  ]);
}

export async function recordFail(db, providerId, routeId, status, message, t = nowSec()) {
  const err = `${status || 'ERR'} ${String(message || '').slice(0, 200)}`;
  const stmts = [db.prepare('UPDATE providers SET first_fail_at = COALESCE(first_fail_at, ?), last_fail_at = ?, last_fail_error = ? WHERE id = ?').bind(t, t, err, providerId)];
  if (routeId != null) stmts.push(db.prepare('UPDATE model_routes SET first_fail_at = COALESCE(first_fail_at, ?), last_fail_at = ?, last_fail_error = ? WHERE id = ?').bind(t, t, err, routeId));
  await db.batch(stmts);
}

/** Statuses that say something about the provider/route (not the client's request). */
export const countsAsFailure = (status) => status === 0 || status === 401 || status === 402 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500;

const event = (db, kind, message, { provider_id = null, model_id = null, data = null } = {}, t = nowSec()) =>
  db.prepare('INSERT INTO events (kind, provider_id, model_id, message, data, created_at) VALUES (?,?,?,?,?,?)')
    .bind(kind, provider_id, model_id, message, data ? JSON.stringify(data) : null, t);

async function chunkedBatch(db, stmts, size = 50) {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}

async function fetchUpstreamList(env, provider) {
  const key = await env.DB.prepare('SELECT * FROM provider_keys WHERE provider_id = ? AND enabled = 1 ORDER BY cooldown_until ASC, id ASC LIMIT 1').bind(provider.id).first();
  if (!key) return { ok: false, status: 0, error: 'no enabled key', skip: true };
  let secret;
  try { secret = await decryptSecret(key.key_enc, env.ENCRYPTION_KEY); } catch { return { ok: false, status: 0, error: 'cannot decrypt key' }; }
  try {
    // Anthropic-style providers list models on their native endpoint (x-api-key + anthropic-version)
    const native = provider.auth_style === 'x-api-key' && provider.anthropic_base_url;
    const res = native || !provider.openai_base_url
      ? await fetch(`${provider.anthropic_base_url.replace(/\/$/, '')}/v1/models?limit=1000`, { headers: upstreamHeaders(provider, secret, 'anthropic') })
      : await fetch(`${provider.openai_base_url.replace(/\/$/, '')}/models`, { headers: upstreamHeaders(provider, secret, 'openai') });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 200) };
    const body = JSON.parse(text);
    const list = Array.isArray(body) ? body : body.data || body.models || [];
    return { ok: true, list: list.filter((m) => m && m.id).map(normalizeUpstreamModel) };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

const slug = (s) => String(s).split('/').pop().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

async function autoPublish(env, provider, pm, policy, t) {
  const db = env.DB;
  const used = await db.prepare('SELECT 1 FROM model_routes WHERE provider_id = ? AND upstream_model = ?').bind(provider.id, pm.upstream_id).first();
  if (used) return null;
  let id = slug(pm.upstream_id);
  if (await db.prepare('SELECT 1 FROM models WHERE id = ?').bind(id).first()) id = `${id}-${provider.id}`;
  if (await db.prepare('SELECT 1 FROM models WHERE id = ?').bind(id).first()) return null;
  const group = policy.group && (await db.prepare('SELECT 1 FROM model_groups WHERE id = ?').bind(policy.group).first()) ? policy.group : null;
  // prices follow OpenRouter automatically, unless the provider policy sets a real price of its own
  let mode = policy.pricing_mode === 'provider' || (policy.pricing_mode === 'request' && policy.price_request > 0) ? policy.pricing_mode : 'auto';
  if (pm.free) mode = 'token';
  const priceIn = pm.free ? 0 : pm.price_in || 0, priceOut = pm.free ? 0 : pm.price_out || 0;
  await db.batch([
    db.prepare(`INSERT INTO models (id, name, group_id, context_length, max_output, reasoning, vision, pricing_mode, price_in, price_out, price_cache_read, price_request, markup_pct, status, description, auto_source, created_at, price_cache_write)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?)`).bind(
      id, pm.name, group, pm.context_length || 128000, pm.max_output || 16384, pm.reasoning ?? 1, pm.vision ?? 0, mode,
      priceIn, priceOut, pm.free ? 0 : pm.price_cache_read || 0, pm.free ? 0 : policy.price_request || 0, pm.free ? 0 : policy.markup_pct || 0,
      `${pm.free ? 'مجاني · ' : ''}أُضيف تلقائياً من ${provider.name}`, provider.id, t, pm.free ? 0 : pm.price_cache_write || 0),
    db.prepare('INSERT INTO model_routes (model_id, provider_id, upstream_model, priority) VALUES (?,?,?,0)').bind(id, provider.id, pm.upstream_id),
  ]);
  return id;
}

async function syncProvider(env, provider, cfg, t) {
  const db = env.DB;
  const r = await fetchUpstreamList(env, provider);
  if (!r.ok) {
    if (r.skip) return { provider: provider.id, skipped: r.error };
    const msg = `${r.status || ''} ${r.error}`.trim();
    const stmts = [db.prepare('UPDATE providers SET sync_error = ? WHERE id = ?').bind(msg, provider.id)];
    if (provider.sync_error !== msg) stmts.push(event(db, 'sync_error', `تعذّر جلب نماذج ${provider.name}: ${msg}`, { provider_id: provider.id }, t));
    await db.batch(stmts);
    // an auth/billing refusal on /models is a provider-level signal (e.g. cancelled subscription)
    if ([401, 402, 403].includes(r.status)) await recordFail(db, provider.id, null, r.status, `catalog: ${r.error}`, t);
    return { provider: provider.id, error: msg };
  }

  const baseline = provider.last_sync_at == null;
  const policy = parseJson(provider.auto, {});
  const { results: rows } = await db.prepare('SELECT * FROM provider_models WHERE provider_id = ?').bind(provider.id).all();
  const known = new Map(rows.map((x) => [x.upstream_id, x]));
  const seen = new Set();
  const stmts = [];
  const discovered = [];

  for (const pm of r.list) {
    if (seen.has(pm.upstream_id)) continue;
    seen.add(pm.upstream_id);
    const ex = known.get(pm.upstream_id);
    if (!ex) {
      stmts.push(db.prepare(`INSERT INTO provider_models (provider_id, upstream_id, name, context_length, max_output, price_in, price_out, price_cache_read, free, vision, reasoning, first_seen, last_seen, baseline, price_cache_write)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(provider.id, pm.upstream_id, pm.name, pm.context_length, pm.max_output, pm.price_in, pm.price_out, pm.price_cache_read, pm.free, pm.vision, pm.reasoning, t, t, baseline ? 1 : 0, pm.price_cache_write));
      if (!baseline) discovered.push(pm);
    } else if (ex.missing_since != null || t - ex.last_seen > 86400 || ex.free !== pm.free || ex.price_in !== pm.price_in || ex.price_out !== pm.price_out) {
      stmts.push(db.prepare('UPDATE provider_models SET last_seen = ?, missing_since = NULL, name = ?, context_length = COALESCE(?, context_length), price_in = ?, price_out = ?, free = ? WHERE provider_id = ? AND upstream_id = ?')
        .bind(t, pm.name, pm.context_length, pm.price_in, pm.price_out, pm.free, provider.id, pm.upstream_id));
      if (ex.missing_since != null) {
        stmts.push(db.prepare("UPDATE model_routes SET archived_at = NULL, archived_reason = NULL, first_fail_at = NULL WHERE provider_id = ? AND upstream_model = ? AND archived_reason LIKE 'catalog%'").bind(provider.id, pm.upstream_id));
      }
    }
  }

  // gone from the provider's list
  const archivedRoutes = [];
  for (const ex of rows) {
    if (seen.has(ex.upstream_id)) continue;
    if (ex.missing_since == null) {
      stmts.push(db.prepare('UPDATE provider_models SET missing_since = ? WHERE provider_id = ? AND upstream_id = ?').bind(t, provider.id, ex.upstream_id));
    } else if (t - ex.missing_since >= cfg.missing_hours * 3600) {
      archivedRoutes.push(ex.upstream_id);
    }
  }
  stmts.push(db.prepare('UPDATE providers SET last_sync_at = ?, sync_error = NULL WHERE id = ?').bind(t, provider.id));
  await chunkedBatch(db, stmts);

  for (const up of archivedRoutes) {
    const { results: routes } = await db.prepare('SELECT * FROM model_routes WHERE provider_id = ? AND upstream_model = ? AND archived_at IS NULL').bind(provider.id, up).all();
    for (const route of routes) {
      await db.batch([
        db.prepare("UPDATE model_routes SET archived_at = ?, archived_reason = 'catalog: removed by provider' WHERE id = ?").bind(t, route.id),
        event(db, 'model_archived', `${provider.name} أوقف النموذج ${up} — أُرشف مساره لـ ${route.model_id}`, { provider_id: provider.id, model_id: route.model_id }, t),
      ]);
    }
  }

  const published = [];
  for (const pm of discovered) {
    const eligible = policy.publish && (!policy.free_only || pm.free) && (!policy.match || new RegExp(policy.match, 'i').test(pm.upstream_id));
    const id = eligible ? await autoPublish(env, provider, pm, policy, t) : null;
    if (id) published.push(id);
    await event(db, id ? 'model_published' : 'model_discovered',
      id ? `نموذج جديد من ${provider.name}: ${pm.name} — نُشر للطلاب باسم ${id} (جديد لمدة ${cfg.new_days} أيام)${pm.free ? ' · مجاني' : ''}`
        : `نموذج جديد عند ${provider.name}: ${pm.upstream_id}${pm.free ? ' (مجاني)' : ''} — بانتظار نشرك`,
      { provider_id: provider.id, model_id: id, data: { upstream_id: pm.upstream_id, free: !!pm.free } }, t).run();
  }
  return { provider: provider.id, models: r.list.length, baseline, discovered: discovered.length, published, archived_routes: archivedRoutes.length };
}

async function checkHealth(env, cfg, t) {
  const db = env.DB;
  const out = { providers: [], routes: [] };
  const { results: providers } = await db.prepare('SELECT * FROM providers WHERE archived_at IS NULL AND enabled = 1').all();
  for (const p of providers) {
    if (!shouldArchive(p, cfg.archive_after_hours)) continue;
    const hours = Math.round((p.last_fail_at - p.first_fail_at) / 3600);
    await db.batch([
      db.prepare("UPDATE providers SET archived_at = ?, archived_reason = ? WHERE id = ?").bind(t, `auto: no successful response for ${hours}h (${p.last_fail_error || ''})`.slice(0, 300), p.id),
      event(db, 'provider_archived', `أُرشف المزوّد ${p.name}: ما رد بنجاح ${hours} ساعة (${p.last_fail_error || '—'})`, { provider_id: p.id }, t),
    ]);
    out.providers.push(p.id);
  }
  // a route is only blamed when its provider kept working for other models meanwhile
  const { results: routes } = await db.prepare(
    `SELECT r.*, p.name AS provider_name, p.last_ok_at AS p_ok FROM model_routes r JOIN providers p ON p.id = r.provider_id
      WHERE r.archived_at IS NULL AND p.archived_at IS NULL AND r.first_fail_at IS NOT NULL`
  ).all();
  for (const r of routes) {
    if (!shouldArchive(r, cfg.archive_after_hours) || !(r.p_ok && r.p_ok > r.first_fail_at)) continue;
    await db.batch([
      db.prepare('UPDATE model_routes SET archived_at = ?, archived_reason = ? WHERE id = ?').bind(t, `health: ${r.last_fail_error || ''}`.slice(0, 300), r.id),
      event(db, 'model_archived', `أُرشف مسار ${r.model_id} عبر ${r.provider_name} (${r.upstream_model}): يفشل منذ ${Math.round((r.last_fail_at - r.first_fail_at) / 3600)} ساعة`, { provider_id: r.provider_id, model_id: r.model_id }, t),
    ]);
    out.routes.push(r.id);
  }
  return out;
}

const LIVE_ROUTE = `SELECT 1 FROM model_routes r JOIN providers p ON p.id = r.provider_id
  WHERE r.model_id = m.id AND r.enabled = 1 AND r.archived_at IS NULL AND p.enabled = 1 AND p.archived_at IS NULL`;

async function reconcileModels(env, cfg, t) {
  const db = env.DB;
  const { results: dead } = await db.prepare(`SELECT m.* FROM models m WHERE m.status IN ('new','active','legacy') AND NOT EXISTS (${LIVE_ROUTE})
    AND EXISTS (SELECT 1 FROM model_routes r WHERE r.model_id = m.id)`).all();
  const aliasRow = await db.prepare("SELECT value FROM settings WHERE key = 'aliases'").first();
  const globals = parseJson(aliasRow?.value, {});
  for (const m of dead) {
    const pointing = Object.entries(globals).filter(([, v]) => v === m.id).map(([k]) => k);
    await db.batch([
      db.prepare("UPDATE models SET status = 'archived', archived_at = ?, archived_reason = ? WHERE id = ?").bind(t, `auto: no live route (was ${m.status})`, m.id),
      event(db, 'model_archived', `النموذج ${m.name} (${m.id}) صار مؤرشفاً: ما بقي إله أي مزوّد شغّال${pointing.length ? ` — ⚠️ الاسم ${pointing.join('، ')} كان يشير إليه، مؤقتاً يُحوَّل إلى abd-main؛ حدّث الأسماء الثابتة` : ''}`, { model_id: m.id }, t),
    ]);
  }
  const { results: back } = await db.prepare(`SELECT m.* FROM models m WHERE m.status = 'archived' AND m.archived_reason LIKE 'auto:%' AND EXISTS (${LIVE_ROUTE})`).all();
  for (const m of back) {
    const prev = /was (new|active|legacy)/.exec(m.archived_reason || '')?.[1] || 'active';
    await db.batch([
      db.prepare('UPDATE models SET status = ?, archived_at = NULL, archived_reason = NULL WHERE id = ?').bind(prev, m.id),
      event(db, 'model_restored', `رجع النموذج ${m.name} (${m.id}) للخدمة`, { model_id: m.id }, t),
    ]);
  }
  const promoted = await db.prepare("UPDATE models SET status = 'active' WHERE status = 'new' AND created_at < ?").bind(t - cfg.new_days * 86400).run();
  return { archived: dead.map((m) => m.id), restored: back.map((m) => m.id), promoted: promoted.meta?.changes || 0 };
}

export async function notifyPending(env) {
  const { results } = await env.DB.prepare('SELECT * FROM events WHERE notified = 0 ORDER BY id LIMIT 30').all();
  if (!results.length) return 0;
  if (env.NOTIFY_WEBHOOK) {
    const text = `⚡ abdalgani gateway\n${results.map((e) => `• ${e.message}`).join('\n')}`;
    try {
      // `content` = Discord, `text` = Slack / Telegram (put ?chat_id=… in the Telegram bot URL)
      await fetch(env.NOTIFY_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1900), text }) });
    } catch { /* retry next run */ return 0; }
  }
  await env.DB.prepare(`UPDATE events SET notified = 1 WHERE id IN (${results.map(() => '?').join(',')})`).bind(...results.map((e) => e.id)).run();
  return results.length;
}

/** One full maintenance pass. `now` is injectable for tests. */
export async function runMaintenance(env, { now = nowSec(), sync = true } = {}) {
  const cfg = await getLifecycle(env.DB);
  const summary = { at: now, sync: [], health: null, models: null, notified: 0 };
  if (sync) {
    const { results: providers } = await env.DB.prepare('SELECT * FROM providers WHERE enabled = 1 AND archived_at IS NULL AND openai_base_url IS NOT NULL').all();
    for (const p of providers) {
      try { summary.sync.push(await syncProvider(env, p, cfg, now)); } catch (e) { summary.sync.push({ provider: p.id, error: e.message }); }
    }
  }
  summary.health = await checkHealth(env, cfg, now);
  summary.models = await reconcileModels(env, cfg, now);
  try { const { refreshAutoPrices } = await import('./prices.js'); summary.prices = await refreshAutoPrices(env.DB); } catch (e) { summary.prices = { error: e.message }; }
  try { summary.alerts = await runDetectors(env, await getSecurity(env.DB, true), now); } catch (e) { summary.alerts = { error: e.message }; }
  await env.DB.prepare('DELETE FROM events WHERE created_at < ?').bind(now - 90 * 86400).run();
  summary.notified = await notifyPending(env);
  return summary;
}

/** Bring an archived provider back (admin button, or a key that just passed its test). */
export async function restoreProvider(db, providerId, why, t = nowSec()) {
  const p = await db.prepare('SELECT * FROM providers WHERE id = ?').bind(providerId).first();
  if (!p?.archived_at) return false;
  await db.batch([
    db.prepare('UPDATE providers SET archived_at = NULL, archived_reason = NULL, first_fail_at = NULL, last_fail_at = NULL WHERE id = ?').bind(providerId),
    event(db, 'provider_restored', `رجع المزوّد ${p.name} للخدمة (${why})`, { provider_id: providerId }, t),
  ]);
  return true;
}

export async function restoreModel(db, modelId, t = nowSec()) {
  const m = await db.prepare('SELECT * FROM models WHERE id = ?').bind(modelId).first();
  if (!m) return false;
  await db.batch([
    db.prepare("UPDATE models SET status = CASE WHEN status = 'archived' THEN 'active' ELSE status END, archived_at = NULL, archived_reason = NULL WHERE id = ?").bind(modelId),
    db.prepare('UPDATE model_routes SET archived_at = NULL, archived_reason = NULL, first_fail_at = NULL, last_fail_at = NULL WHERE model_id = ?').bind(modelId),
    event(db, 'model_restored', `أعاد المدير النموذج ${m.name} (${m.id}) للخدمة`, { model_id: modelId }, t),
  ]);
  return true;
}
