// Admin control plane — /api/admin/* (Bearer ADMIN_TOKEN).
import { authAdmin } from '../auth.js';
import {
  json, readJson, HttpError, now, toInt, sha256Hex, newApiKey, newCouponCode,
  encryptSecret, decryptSecret,
} from '../util.js';
import { upstreamHeaders } from '../routing.js';
import { runMaintenance, restoreProvider, restoreModel, normalizeUpstreamModel } from '../lifecycle.js';
import { adminReport, exportCsv } from '../reports.js';
import { getSecurity, resetSecurityCache } from '../security.js';

const ID_RE = /^[a-z0-9][a-z0-9._:/-]{0,80}$/i;
const need = (cond, msg) => { if (!cond) throw new HttpError(400, msg); };

async function createUserKey(db, userId, name = 'default') {
  const key = newApiKey();
  await db.prepare('INSERT INTO api_keys (user_id, name, key_hash, prefix) VALUES (?,?,?,?)')
    .bind(userId, name, await sha256Hex(key), key.slice(0, 12)).run();
  return key;
}

function maskKeyRow(k) {
  const { key_enc, ...rest } = k;
  return { ...rest, cooling: k.cooldown_until > now() };
}

export async function handleAdmin(request, env, ctx, path) {
  authAdmin(request, env);
  const db = env.DB;
  const method = request.method;
  const seg = path.replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c, d] = seg;

  // ── overview ──
  if (a === 'stats' && method === 'GET') {
    const t = now();
    const q = (sql, ...args) => db.prepare(sql).bind(...args).first();
    const [users, keys, day, month, providers] = await Promise.all([
      q('SELECT COUNT(*) n FROM users'),
      q('SELECT COUNT(*) n, SUM(enabled) enabled FROM provider_keys'),
      q('SELECT COUNT(*) req, COALESCE(SUM(cost),0) cost, COALESCE(SUM(prompt_tokens+completion_tokens),0) tokens, SUM(status>=400) errors FROM usage_logs WHERE created_at > ?', t - 86400),
      q('SELECT COUNT(*) req, COALESCE(SUM(cost),0) cost, COALESCE(SUM(prompt_tokens+completion_tokens),0) tokens FROM usage_logs WHERE created_at > ?', t - 30 * 86400),
      db.prepare('SELECT provider_id, COUNT(*) req, COALESCE(SUM(cost),0) cost, SUM(status>=400) errors FROM usage_logs WHERE created_at > ? GROUP BY provider_id').bind(t - 86400).all(),
    ]);
    const topModels = await db.prepare('SELECT model_id, COUNT(*) req, COALESCE(SUM(cost),0) cost FROM usage_logs WHERE created_at > ? GROUP BY model_id ORDER BY req DESC LIMIT 10').bind(t - 7 * 86400).all();
    const unread = await q('SELECT COUNT(*) n FROM events WHERE read = 0');
    const openAlerts = await q('SELECT COUNT(*) n FROM alerts WHERE resolved = 0');
    const pendingUsers = await q('SELECT COUNT(*) n FROM users WHERE approved = 0');
    return json({ users: users.n, provider_keys: keys, day, month, providers: providers.results, top_models: topModels.results, unread_events: unread.n, open_alerts: openAlerts.n, pending_users: pendingUsers.n });
  }

  // ── providers & keys ──
  if (a === 'providers') {
    if (!b && method === 'GET') {
      const { results: providers } = await db.prepare('SELECT * FROM providers ORDER BY id').all();
      const { results: keys } = await db.prepare('SELECT * FROM provider_keys ORDER BY provider_id, id').all();
      return json(providers.map((p) => ({ ...p, keys: keys.filter((k) => k.provider_id === p.id).map(maskKeyRow) })));
    }
    if (!b && method === 'POST') {
      const p = await readJson(request);
      need(ID_RE.test(p.id || ''), 'invalid provider id');
      need(p.openai_base_url || p.anthropic_base_url, 'at least one base URL is required');
      for (const f of ['openai_base_url', 'anthropic_base_url']) {
        if (!p[f]) continue;
        p[f] = String(p[f]).trim().replace(/\/+$/, '');
        let u; try { u = new URL(p[f]); } catch { throw new HttpError(400, `${f} is not a valid URL`); }
        // keys are sent to this URL — only over TLS, never with embedded credentials
        need(u.protocol === 'https:' && !u.username && !u.password, `${f} must be an https:// URL`);
      }
      for (const f of ['extra_headers', 'compat', 'auto']) {
        if (p[f]) { try { const v = JSON.parse(p[f]); need(v && typeof v === 'object' && !Array.isArray(v), `${f} must be a JSON object`); } catch (e) { throw e instanceof HttpError ? e : new HttpError(400, `${f} must be a JSON object`); } }
      }
      await db.prepare(
        `INSERT INTO providers (id, name, openai_base_url, anthropic_base_url, auth_style, extra_headers, compat, auto, enabled, billing, monthly_fee) VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, openai_base_url=excluded.openai_base_url, anthropic_base_url=excluded.anthropic_base_url,
           auth_style=excluded.auth_style, extra_headers=excluded.extra_headers, compat=excluded.compat, auto=excluded.auto, enabled=excluded.enabled,
           billing=excluded.billing, monthly_fee=excluded.monthly_fee`
      ).bind(p.id, p.name || p.id, p.openai_base_url || null, p.anthropic_base_url || null, p.auth_style === 'x-api-key' ? 'x-api-key' : 'bearer', p.extra_headers || null, p.compat || null, p.auto || null, p.enabled === false || p.enabled === 0 ? 0 : 1,
        p.billing === 'subscription' ? 'subscription' : 'usage', toInt(p.monthly_fee, 0)).run();
      return json({ ok: true });
    }
    if (b && !c && method === 'DELETE') {
      await db.prepare('DELETE FROM providers WHERE id = ?').bind(b).run();
      return json({ ok: true });
    }
    if (b && c === 'restore' && method === 'POST') return json({ ok: await restoreProvider(db, b, 'admin') });
    if (b && c === 'archive' && method === 'POST') {
      await db.prepare("UPDATE providers SET archived_at = ?, archived_reason = 'admin' WHERE id = ?").bind(now(), b).run();
      return json({ ok: true });
    }
    if (b && c === 'keys' && method === 'POST') {
      const k = await readJson(request);
      need(typeof k.key === 'string' && k.key.trim().length >= 8, 'key is required');
      const key = k.key.trim();
      await db.prepare('INSERT INTO provider_keys (provider_id, label, key_enc, key_hint, weight) VALUES (?,?,?,?,?)')
        .bind(b, k.label || 'key', await encryptSecret(key, env.ENCRYPTION_KEY), key.slice(-4), Math.max(1, toInt(k.weight, 1))).run();
      const restored = await restoreProvider(db, b, 'new key added');
      return json({ ok: true, restored });
    }
    if (b && c === 'discover' && method === 'POST') {
      // List the upstream catalog with the first working key (helps adding models).
      const provider = await db.prepare('SELECT * FROM providers WHERE id = ?').bind(b).first();
      need(provider?.openai_base_url || provider?.anthropic_base_url, 'provider has no base URL');
      const key = await db.prepare('SELECT * FROM provider_keys WHERE provider_id = ? AND enabled = 1 ORDER BY id LIMIT 1').bind(b).first();
      need(key, 'add a key to this provider first');
      const secret = await decryptSecret(key.key_enc, env.ENCRYPTION_KEY);
      const native = provider.auth_style === 'x-api-key' && provider.anthropic_base_url;
      const res = native || !provider.openai_base_url
        ? await fetch(`${provider.anthropic_base_url.replace(/\/$/, '')}/v1/models?limit=1000`, { headers: upstreamHeaders(provider, secret, 'anthropic') })
        : await fetch(`${provider.openai_base_url.replace(/\/$/, '')}/models`, { headers: upstreamHeaders(provider, secret, 'openai') });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(502, `upstream ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      const list = (body.data || []).filter((m) => m && m.id).map((m) => {
        const n = normalizeUpstreamModel(m);
        return { id: n.upstream_id, name: n.name, context_length: n.context_length, max_output: n.max_output, price_in: n.price_in, price_out: n.price_out, price_cache_read: n.price_cache_read, vision: n.vision, reasoning: n.reasoning, free: !!n.free };
      });
      return json(list);
    }
  }

  if (a === 'keys' && b) {
    const id = toInt(b);
    if (!c && method === 'PATCH') {
      const k = await readJson(request);
      const row = await db.prepare('SELECT * FROM provider_keys WHERE id = ?').bind(id).first();
      need(row, 'key not found');
      let enc = row.key_enc, hint = row.key_hint;
      if (typeof k.key === 'string' && k.key.trim()) { enc = await encryptSecret(k.key.trim(), env.ENCRYPTION_KEY); hint = k.key.trim().slice(-4); }
      await db.prepare(
        `UPDATE provider_keys SET label=?, enabled=?, weight=?, key_enc=?, key_hint=?,
           cooldown_until = CASE WHEN ? THEN 0 ELSE cooldown_until END,
           last_error = CASE WHEN ? THEN NULL ELSE last_error END,
           fail_count = CASE WHEN ? THEN 0 ELSE fail_count END
         WHERE id=?`
      ).bind(k.label ?? row.label, k.enabled == null ? row.enabled : (k.enabled ? 1 : 0), Math.max(1, toInt(k.weight ?? row.weight, 1)), enc, hint,
        k.reset ? 1 : 0, k.reset || k.key ? 1 : 0, k.reset || k.key ? 1 : 0, id).run();
      return json({ ok: true });
    }
    if (!c && method === 'DELETE') {
      await db.prepare('DELETE FROM provider_keys WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (c === 'test' && method === 'POST') {
      const row = await db.prepare('SELECT k.*, p.openai_base_url, p.anthropic_base_url, p.auth_style, p.extra_headers FROM provider_keys k JOIN providers p ON p.id = k.provider_id WHERE k.id = ?').bind(id).first();
      need(row, 'key not found');
      const secret = await decryptSecret(row.key_enc, env.ENCRYPTION_KEY);
      const started = Date.now();
      // Many /models lists are public (OpenRouter, NVIDIA, Nous), so listing proves nothing about the key.
      // Send a real 1-token request to a model this provider serves for us: it checks auth AND balance/plan.
      const native = !row.openai_base_url || (row.auth_style === 'x-api-key' && row.anthropic_base_url);
      const route = await db.prepare('SELECT upstream_model FROM model_routes WHERE provider_id = ? AND enabled = 1 AND archived_at IS NULL ORDER BY priority, id LIMIT 1').bind(row.provider_id).first();
      const model = route?.upstream_model || '__abd_auth_probe__';
      const msg = { model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] };
      const res = native
        ? await fetch(`${row.anthropic_base_url.replace(/\/$/, '')}/v1/messages`, { method: 'POST', headers: upstreamHeaders(row, secret, 'anthropic'), body: JSON.stringify(msg) })
        : await fetch(`${row.openai_base_url.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: upstreamHeaders(row, secret, 'openai'), body: JSON.stringify(msg) });
      const text = await res.text();
      const low = text.toLowerCase();
      let verdict, ok;
      if (res.ok) { ok = true; verdict = 'works'; }
      else if (res.status === 401 || res.status === 403) { ok = false; verdict = 'bad_key'; }
      else if (res.status === 402 || /insufficient|balance|credit|quota|recharge|resource package|payment|"1113"/.test(low)) { ok = false; verdict = 'no_balance'; }
      else if (res.status === 429) { ok = true; verdict = 'rate_limited'; }
      else if ([400, 404, 422].includes(res.status)) { ok = true; verdict = route ? 'key_ok_model_rejected' : 'key_ok'; }
      else { ok = false; verdict = 'error'; }
      if (ok) {
        await db.prepare('UPDATE provider_keys SET last_error = NULL, cooldown_until = 0, fail_count = 0 WHERE id = ?').bind(id).run();
        await restoreProvider(db, row.provider_id, 'key test passed');
      } else await db.prepare('UPDATE provider_keys SET last_error = ? WHERE id = ?').bind(`test ${res.status}: ${text.slice(0, 200)}`, id).run();
      return json({ ok, verdict, status: res.status, model: route ? model : null, latency_ms: Date.now() - started, sample: text.slice(0, 300) });
    }
  }

  // ── groups ──
  if (a === 'groups') {
    if (method === 'GET') return json((await db.prepare('SELECT * FROM model_groups ORDER BY id').all()).results);
    if (method === 'POST') {
      const g = await readJson(request);
      need(ID_RE.test(g.id || ''), 'invalid group id');
      await db.prepare('INSERT INTO model_groups (id, name, description) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description')
        .bind(g.id, g.name || g.id, g.description || null).run();
      return json({ ok: true });
    }
    if (method === 'DELETE' && b) { await db.prepare('DELETE FROM model_groups WHERE id = ?').bind(b).run(); return json({ ok: true }); }
  }

  // ── models + routes ──
  // ── playground: an internal account the admin chats through, on the real gateway path ──
  if (a === 'playground' && b === 'key' && method === 'POST') {
    let u = await db.prepare('SELECT id FROM users WHERE internal = 1 ORDER BY id LIMIT 1').first();
    if (!u) {
      u = await db.prepare("INSERT INTO users (name, note, internal, approved, daily_cap) VALUES ('🧪 Playground (المدير)', 'internal: admin playground', 1, 1, 50000000) RETURNING id").first();
    }
    // one live key at a time: every new playground session revokes the previous key
    await db.prepare('UPDATE api_keys SET revoked = 1 WHERE user_id = ? AND revoked = 0').bind(u.id).run();
    const key = await createUserKey(db, u.id, 'playground');
    const t = now();
    const bal = await db.prepare("SELECT COALESCE(SUM(total - used), 0) n FROM subscriptions WHERE user_id = ? AND kind = 'usd' AND disabled = 0 AND (expires_at IS NULL OR expires_at > ?)").bind(u.id, t).first();
    if (bal.n < 5_000_000) {
      await db.prepare("INSERT INTO subscriptions (user_id, kind, group_id, total, source, expires_at, sale_price) VALUES (?, 'usd', NULL, 20000000, 'playground', ?, 0)").bind(u.id, t + 365 * 86400).run();
    }
    return json({ api_key: key, user_id: u.id });
  }

  // ── pricing: copy OpenRouter's public per-token prices onto our models ──
  if (a === 'pricing' && b === 'openrouter' && method === 'GET') {
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { accept: 'application/json', 'user-agent': 'abdalgani-gateway' } });
    if (!res.ok) throw new HttpError(502, `openrouter ${res.status}`);
    const catalog = ((await res.json()).data || []).filter((m) => m?.id && m.pricing).map((m) => {
      const n = normalizeUpstreamModel(m);
      return { id: n.upstream_id, name: n.name, price_in: n.price_in ?? 0, price_out: n.price_out ?? 0, price_cache_read: n.price_cache_read ?? 0, free: n.free };
    }).filter((m) => m.price_in >= 0 && m.price_out >= 0); // OpenRouter uses -1 for "variable" (routers)
    const byId = new Map(catalog.map((m) => [m.id.toLowerCase(), m]));
    const tail = (x) => String(x || '').toLowerCase().split('/').pop().replace(/:(free|thinking|beta|extended|nitro|floor)$/, '');
    const byTail = new Map();
    for (const m of catalog) { const t = tail(m.id); const prev = byTail.get(t); if (!prev || (prev.free && !m.free)) byTail.set(t, m); }
    const { results: models } = await db.prepare("SELECT id, name, pricing_mode, price_in, price_out, price_cache_read, price_request, markup_pct, status FROM models WHERE status != 'archived' ORDER BY sort, id").all();
    const { results: routes } = await db.prepare('SELECT model_id, provider_id, upstream_model FROM model_routes ORDER BY priority, id').all();
    const out = models.map((m) => {
      const rs = routes.filter((r) => r.model_id === m.id);
      let hit = null, how = null;
      const orRoute = rs.find((r) => r.provider_id === 'openrouter' && byId.has(r.upstream_model.toLowerCase()));
      if (orRoute) { hit = byId.get(orRoute.upstream_model.toLowerCase()); how = 'route'; }
      for (const cand of [m.id, ...rs.map((r) => r.upstream_model)]) { if (hit) break; const h = byTail.get(tail(cand)); if (h) { hit = h; how = 'name'; } }
      return { ...m, match: hit ? { ...hit, how } : null };
    });
    return json({ models: out, catalog: catalog.map(({ id, name, price_in, price_out, price_cache_read }) => ({ id, name, price_in, price_out, price_cache_read })) });
  }
  if (a === 'pricing' && b === 'apply' && method === 'POST') {
    const body = await readJson(request);
    need(Array.isArray(body.items) && body.items.length && body.items.length <= 500, 'items required');
    const markup = body.markup_pct === undefined || body.markup_pct === null || body.markup_pct === '' ? null : Math.max(0, Math.min(1000, toInt(body.markup_pct)));
    const stmts = body.items.map((it) => {
      need(ID_RE.test(it.id || ''), 'invalid model id');
      const [pi, po, pc] = [it.price_in, it.price_out, it.price_cache_read ?? 0].map((v) => Math.max(0, toInt(v)));
      return db.prepare("UPDATE models SET pricing_mode = 'token', price_in = ?, price_out = ?, price_cache_read = ?, markup_pct = COALESCE(?, markup_pct) WHERE id = ?").bind(pi, po, pc, markup, it.id);
    });
    await db.batch(stmts);
    return json({ ok: true, updated: stmts.length });
  }

  if (a === 'models') {
    if (method === 'POST' && b && seg.at(-1) === 'restore') return json({ ok: await restoreModel(db, seg.slice(1, -1).join('/')) });
    if (method === 'GET') {
      const { results: models } = await db.prepare('SELECT * FROM models ORDER BY sort, id').all();
      const { results: routes } = await db.prepare('SELECT * FROM model_routes ORDER BY model_id, priority, id').all();
      return json(models.map((m) => ({ ...m, routes: routes.filter((r) => r.model_id === m.id) })));
    }
    if (method === 'POST') {
      const m = await readJson(request);
      need(ID_RE.test(m.id || ''), 'invalid model id');
      need(['token', 'request', 'provider'].includes(m.pricing_mode || 'token'), 'pricing_mode must be token|request|provider');
      need(['new', 'active', 'legacy', 'hidden', 'archived'].includes(m.status || 'active'), 'status must be new|active|legacy|hidden|archived');
      // a model the admin adds shows as "new" to students for the first days (the cron expires it)
      if (!(await db.prepare('SELECT 1 FROM models WHERE id = ?').bind(m.id).first()) && (!m.status || m.status === 'active')) m.status = 'new';
      const stmts = [db.prepare(
        `INSERT INTO models (id, name, group_id, context_length, max_output, reasoning, pricing_mode, price_in, price_out, price_cache_read, price_request, markup_pct, status, description, sort, vision)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, group_id=excluded.group_id, context_length=excluded.context_length, max_output=excluded.max_output,
           reasoning=excluded.reasoning, vision=excluded.vision, pricing_mode=excluded.pricing_mode, price_in=excluded.price_in, price_out=excluded.price_out,
           price_cache_read=excluded.price_cache_read, price_request=excluded.price_request, markup_pct=excluded.markup_pct,
           status=excluded.status, description=excluded.description, sort=excluded.sort`
      ).bind(m.id, m.name || m.id, m.group_id || null, toInt(m.context_length, 128000), toInt(m.max_output, 8192), m.reasoning ? 1 : 0,
        m.pricing_mode || 'token', toInt(m.price_in), toInt(m.price_out), toInt(m.price_cache_read), toInt(m.price_request), toInt(m.markup_pct),
        m.status || 'active', m.description || null, toInt(m.sort, 100), m.vision ? 1 : 0)];
      if (Array.isArray(m.routes)) {
        stmts.push(db.prepare('DELETE FROM model_routes WHERE model_id = ?').bind(m.id));
        m.routes.forEach((r, i) => {
          need(r.provider_id && r.upstream_model, 'each route needs provider_id + upstream_model');
          const opt = (v) => (v === undefined || v === null || v === '' ? null : toInt(v));
          stmts.push(db.prepare('INSERT INTO model_routes (model_id, provider_id, upstream_model, priority, enabled, cost_in, cost_out) VALUES (?,?,?,?,?,?,?)')
            .bind(m.id, r.provider_id, r.upstream_model, toInt(r.priority, i), r.enabled === false || r.enabled === 0 ? 0 : 1, opt(r.cost_in), opt(r.cost_out)));
        });
      }
      await db.batch(stmts);
      return json({ ok: true });
    }
    if (method === 'DELETE' && b) { await db.prepare('DELETE FROM models WHERE id = ?').bind(seg.slice(1).join('/')).run(); return json({ ok: true }); }
  }

  // ── reports & money ──
  if (a === 'reports' && !b && method === 'GET') return json(await adminReport(db, new URL(request.url)));
  if (a === 'reports' && b === 'export' && method === 'GET') return exportCsv(db, new URL(request.url));
  if (a === 'expenses') {
    if (method === 'GET') return json((await db.prepare('SELECT e.*, p.name AS provider_name FROM expenses e LEFT JOIN providers p ON p.id = e.provider_id ORDER BY spent_at DESC LIMIT 300').all()).results);
    if (method === 'POST') {
      const e = await readJson(request);
      need(toInt(e.amount) > 0, 'amount (µ$) must be > 0');
      await db.prepare('INSERT INTO expenses (provider_id, amount, note, spent_at) VALUES (?,?,?,?)').bind(e.provider_id || null, toInt(e.amount), e.note || null, toInt(e.spent_at) || now()).run();
      return json({ ok: true });
    }
    if (method === 'DELETE' && b) { await db.prepare('DELETE FROM expenses WHERE id = ?').bind(toInt(b)).run(); return json({ ok: true }); }
  }

  // ── security: settings, blocklist, devices ──
  if (a === 'security') {
    if (method === 'GET') {
      const [cfg, blocks, devices, events, unpriced] = await Promise.all([
        getSecurity(db, true),
        db.prepare('SELECT * FROM blocks WHERE expires_at IS NULL OR expires_at > ? ORDER BY created_at DESC').bind(now()).all(),
        db.prepare(`SELECT d.*, u.name AS user_name,
            (SELECT COUNT(*) FROM usage_logs l WHERE l.device_id = d.device_id AND l.user_id = d.user_id) AS requests
          FROM devices d LEFT JOIN users u ON u.id = d.user_id ORDER BY d.status = 'pending' DESC, d.last_seen DESC LIMIT 500`).all(),
        db.prepare("SELECT * FROM events WHERE kind IN ('security_block','device_new','device_rejected') ORDER BY id DESC LIMIT 100").all(),
        db.prepare(`SELECT id, name, pricing_mode FROM models WHERE status IN ('new','active','legacy')
            AND ((pricing_mode = 'request' AND price_request = 0) OR (pricing_mode != 'request' AND price_in = 0 AND price_out = 0))
            AND COALESCE(description, '') NOT LIKE 'مجاني%'`).all(),
      ]);
      const topIps = await db.prepare(`SELECT ip, COUNT(*) requests, COUNT(DISTINCT user_id) users, SUM(status >= 400) errors, MAX(created_at) last
          FROM usage_logs WHERE created_at > ? AND ip IS NOT NULL GROUP BY ip ORDER BY requests DESC LIMIT 20`).bind(now() - 86400).all();
      return json({ settings: cfg, blocks: blocks.results, devices: devices.results, events: events.results, unpriced_models: unpriced.results, top_ips: topIps.results });
    }
    if (method === 'PUT') {
      const body = await readJson(request);
      need(['off', 'track', 'enforce'].includes(body.device_policy), 'device_policy must be off|track|enforce');
      need(!body.signup_mode || ['open', 'approval', 'closed'].includes(body.signup_mode), 'signup_mode must be open|approval|closed');
      const clean = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, ['device_policy', 'signup_mode'].includes(k) ? v : Number(v)]));
      await db.prepare("INSERT INTO settings (key, value) VALUES ('security', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(clean)).run();
      resetSecurityCache();
      return json({ ok: true });
    }
  }
  if (a === 'blocks') {
    if (method === 'POST') {
      const body = await readJson(request);
      need(['ip', 'device'].includes(body.kind), 'kind must be ip|device');
      need(typeof body.value === 'string' && body.value.trim().length >= 3 && body.value.length <= 100, 'value is required');
      const mins = toInt(body.minutes, 0);
      await db.prepare(`INSERT INTO blocks (kind, value, reason, auto, expires_at) VALUES (?,?,?,0,?)
          ON CONFLICT(kind, value) DO UPDATE SET reason = excluded.reason, auto = 0, expires_at = excluded.expires_at`)
        .bind(body.kind, body.value.trim(), body.reason || 'admin', mins > 0 ? now() + mins * 60 : null).run();
      if (body.kind === 'device') await db.prepare("UPDATE devices SET status = 'blocked' WHERE device_id = ?").bind(body.value.trim()).run();
      return json({ ok: true });
    }
    if (method === 'DELETE' && b) {
      const row = await db.prepare('SELECT * FROM blocks WHERE id = ?').bind(toInt(b)).first();
      await db.prepare('DELETE FROM blocks WHERE id = ?').bind(toInt(b)).run();
      if (row?.kind === 'device') await db.prepare("UPDATE devices SET status = 'active' WHERE device_id = ? AND status = 'blocked'").bind(row.value).run();
      return json({ ok: true });
    }
  }
  if (a === 'devices' && b) {
    if (method === 'PATCH') {
      const body = await readJson(request);
      need(['active', 'pending', 'blocked'].includes(body.status), 'status must be active|pending|blocked');
      await db.prepare('UPDATE devices SET status = ? WHERE id = ?').bind(body.status, toInt(b)).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') { await db.prepare('DELETE FROM devices WHERE id = ?').bind(toInt(b)).run(); return json({ ok: true }); }
  }

  // ── live log (polled every few seconds by the panel: cheap PK range scan, capped rows) ──
  if (a === 'live' && method === 'GET') {
    const url = new URL(request.url);
    const after = toInt(url.searchParams.get('after'), 0);
    const limit = Math.min(200, Math.max(1, toInt(url.searchParams.get('limit'), 100)));
    const where = ['l.id > ?']; const args = [after];
    if (url.searchParams.get('user_id')) { where.push('l.user_id = ?'); args.push(toInt(url.searchParams.get('user_id'))); }
    if (url.searchParams.get('model')) { where.push('l.model_id = ?'); args.push(url.searchParams.get('model')); }
    if (url.searchParams.get('errors') === '1') where.push('l.status >= 400');
    // first load (after=0): newest rows; then only rows newer than the last one seen
    const order = after ? 'ASC' : 'DESC';
    const { results } = await db.prepare(`SELECT l.id, l.created_at, l.user_id, u.name AS user_name, l.requested_model, l.model_id, l.provider_id, l.upstream_model,
        l.endpoint, l.status, l.prompt_tokens, l.completion_tokens, l.cached_tokens, l.cost, l.upstream_cost, l.latency_ms, l.ip, l.device_id, l.error
      FROM usage_logs l LEFT JOIN users u ON u.id = l.user_id WHERE ${where.join(' AND ')} ORDER BY l.id ${order} LIMIT ?`).bind(...args, limit).all();
    return json({ rows: after ? results : results.reverse(), server_time: now() });
  }

  // ── abuse alerts ──
  if (a === 'alerts') {
    if (method === 'GET') {
      const all = new URL(request.url).searchParams.get('all') === '1';
      const { results } = await db.prepare(`SELECT a.*, u.name AS user_name FROM alerts a LEFT JOIN users u ON u.id = a.user_id
          ${all ? '' : 'WHERE a.resolved = 0'} ORDER BY a.resolved, a.created_at DESC LIMIT 300`).all();
      return json(results);
    }
    if (method === 'POST' && b && c === 'resolve') { await db.prepare('UPDATE alerts SET resolved = 1 WHERE id = ?').bind(toInt(b)).run(); return json({ ok: true }); }
    if (method === 'POST' && b === 'scan') {
      const { runDetectors } = await import('../detect.js');
      return json({ found: await runDetectors(env, await getSecurity(db, true)) });
    }
  }
  if (a === 'pauses' && method === 'DELETE' && b) {
    await db.prepare("DELETE FROM blocks WHERE kind = 'user' AND value = ?").bind(String(toInt(b))).run();
    return json({ ok: true });
  }

  // ── lifecycle: update feed, upstream catalogs, run-now ──
  if (a === 'events') {
    if (method === 'GET') {
      const limit = Math.min(500, toInt(new URL(request.url).searchParams.get('limit'), 200));
      return json((await db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').bind(limit).all()).results);
    }
    if (method === 'POST' && b === 'read') { await db.prepare('UPDATE events SET read = 1 WHERE read = 0').run(); return json({ ok: true }); }
  }
  if (a === 'catalog' && method === 'GET') {
    const url = new URL(request.url);
    const pid = url.searchParams.get('provider');
    const onlyPending = url.searchParams.get('pending') === '1';
    const { results } = await db.prepare(
      `SELECT pm.*, p.name AS provider_name,
         (SELECT GROUP_CONCAT(r.model_id) FROM model_routes r WHERE r.provider_id = pm.provider_id AND r.upstream_model = pm.upstream_id) AS published_as
       FROM provider_models pm JOIN providers p ON p.id = pm.provider_id
       WHERE (? IS NULL OR pm.provider_id = ?) ORDER BY pm.first_seen DESC, pm.upstream_id LIMIT 2000`
    ).bind(pid, pid).all();
    return json(onlyPending ? results.filter((r) => !r.published_as && !r.baseline && !r.dismissed && r.missing_since == null) : results);
  }
  if (a === 'catalog' && b === 'dismiss' && method === 'POST') {
    const body = await readJson(request);
    await db.prepare('UPDATE provider_models SET dismissed = 1 WHERE provider_id = ? AND upstream_id = ?').bind(body.provider_id, body.upstream_id).run();
    return json({ ok: true });
  }
  if (a === 'maintenance' && method === 'POST') return json(await runMaintenance(env));
  if (a === 'lifecycle') {
    if (method === 'GET') { const r = await db.prepare("SELECT value FROM settings WHERE key='lifecycle'").first(); return json(r ? JSON.parse(r.value) : {}); }
    if (method === 'PUT') {
      const body = await readJson(request);
      await db.prepare("INSERT INTO settings (key, value) VALUES ('lifecycle', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(body)).run();
      return json({ ok: true });
    }
  }

  // ── users ──
  if (a === 'users') {
    if (!b && method === 'GET') {
      const t = now();
      const { results } = await db.prepare(
        `SELECT u.*,
           (SELECT COUNT(*) FROM api_keys k WHERE k.user_id = u.id AND k.revoked = 0) AS keys,
           (SELECT COALESCE(SUM(total-used),0) FROM subscriptions s WHERE s.user_id=u.id AND s.kind='usd' AND s.disabled=0 AND (s.expires_at IS NULL OR s.expires_at > ?)) AS usd_left,
           (SELECT COALESCE(SUM(total-used),0) FROM subscriptions s WHERE s.user_id=u.id AND s.kind='tokens' AND s.disabled=0 AND (s.expires_at IS NULL OR s.expires_at > ?)) AS tokens_left,
           (SELECT MAX(created_at) FROM usage_logs l WHERE l.user_id = u.id) AS last_request
         FROM users u WHERE u.internal = 0 ORDER BY u.id DESC`
      ).bind(t, t).all();
      return json(results.map(({ password_hash, ...u }) => ({ ...u, has_password: !!password_hash })));
    }
    if (!b && method === 'POST') {
      const u = await readJson(request);
      need(u.name, 'name is required');
      const r = await db.prepare('INSERT INTO users (name, email, note) VALUES (?,?,?) RETURNING id').bind(u.name, u.email || null, u.note || null).first();
      const key = await createUserKey(db, r.id);
      return json({ id: r.id, api_key: key });
    }
    const uid = toInt(b);
    if (b && !c && method === 'GET') {
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
      need(user, 'user not found');
      const [subs, keys, aliases, usage] = await Promise.all([
        db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC').bind(uid).all(),
        db.prepare('SELECT id, name, prefix, revoked, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY id DESC').bind(uid).all(),
        db.prepare('SELECT * FROM user_aliases WHERE user_id = ?').bind(uid).all(),
        db.prepare('SELECT * FROM usage_logs WHERE user_id = ? ORDER BY id DESC LIMIT 100').bind(uid).all(),
      ]);
      const { password_hash, ...safeUser } = user;
      return json({ user: { ...safeUser, has_password: !!password_hash }, subscriptions: subs.results, keys: keys.results, aliases: aliases.results, usage: usage.results });
    }
    if (b && !c && method === 'PATCH') {
      const u = await readJson(request);
      const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
      need(row, 'user not found');
      await db.prepare('UPDATE users SET name=?, email=?, note=?, disabled=?, approved=?, daily_cap=?, monthly_cap=? WHERE id=?')
        .bind(u.name ?? row.name, u.email ?? row.email, u.note ?? row.note, u.disabled == null ? row.disabled : (u.disabled ? 1 : 0),
          u.approved == null ? row.approved : (u.approved ? 1 : 0), u.daily_cap == null ? row.daily_cap : Math.max(100_000, toInt(u.daily_cap)),
          u.monthly_cap === undefined ? row.monthly_cap : (u.monthly_cap ? toInt(u.monthly_cap) : null), uid).run();
      if (u.disabled) await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid).run();
      let temp = null;
      if (u.reset_password) {
        const { hashPassword } = await import('../accounts.js');
        temp = `abd-${crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 10)}`;
        await db.batch([db.prepare('UPDATE users SET password_hash = ?, login_fail = 0, locked_until = NULL WHERE id = ?').bind(await hashPassword(temp), uid),
          db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid)]);
      }
      return json({ ok: true, temp_password: temp });
    }
    if (b && !c && method === 'DELETE') { await db.prepare('DELETE FROM users WHERE id = ?').bind(uid).run(); return json({ ok: true }); }
    if (c === 'keys' && !d && method === 'POST') {
      const body = await readJson(request).catch(() => ({}));
      return json({ api_key: await createUserKey(db, uid, body.name || 'key') });
    }
    if (c === 'keys' && d && method === 'DELETE') {
      await db.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?').bind(toInt(d), uid).run();
      return json({ ok: true });
    }
    if (c === 'subscriptions' && method === 'POST') {
      const s = await readJson(request);
      need(['usd', 'tokens'].includes(s.kind), 'kind must be usd|tokens');
      need(toInt(s.amount) > 0, 'amount (micro-USD or tokens) must be > 0');
      const days = toInt(s.valid_days, 30);
      await db.prepare('INSERT INTO subscriptions (user_id, kind, group_id, total, source, expires_at, sale_price) VALUES (?,?,?,?,?,?,?)')
        .bind(uid, s.kind, s.group_id || null, toInt(s.amount), 'admin', days > 0 ? now() + days * 86400 : null, toInt(s.sale_price, 0)).run();
      return json({ ok: true });
    }
  }

  if (a === 'subscriptions' && b && method === 'PATCH') {
    const s = await readJson(request);
    const row = await db.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(toInt(b)).first();
    need(row, 'subscription not found');
    await db.prepare('UPDATE subscriptions SET total=?, disabled=?, expires_at=? WHERE id=?')
      .bind(s.total == null ? row.total : toInt(s.total), s.disabled == null ? row.disabled : (s.disabled ? 1 : 0),
        s.expires_at === undefined ? row.expires_at : s.expires_at, row.id).run();
    return json({ ok: true });
  }

  // ── coupons ──
  if (a === 'coupons') {
    if (method === 'GET') return json((await db.prepare('SELECT * FROM coupons ORDER BY created_at DESC LIMIT 500').all()).results);
    if (method === 'POST') {
      const cpn = await readJson(request);
      need(['usd', 'tokens'].includes(cpn.kind), 'kind must be usd|tokens');
      need(toInt(cpn.amount) > 0, 'amount must be > 0');
      const count = Math.min(200, Math.max(1, toInt(cpn.count, 1)));
      const expiresAt = toInt(cpn.expires_in_days) > 0 ? now() + toInt(cpn.expires_in_days) * 86400 : null;
      const codes = Array.from({ length: count }, () => (cpn.code && count === 1 ? String(cpn.code).toUpperCase() : newCouponCode()));
      await db.batch(codes.map((code) => db.prepare(
        'INSERT INTO coupons (code, kind, amount, group_id, valid_days, max_uses, expires_at, note, sale_price) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(code, cpn.kind, toInt(cpn.amount), cpn.group_id || null, toInt(cpn.valid_days, 30), Math.max(1, toInt(cpn.max_uses, 1)), expiresAt, cpn.note || null,
        cpn.sale_price === undefined || cpn.sale_price === '' || cpn.sale_price === null ? null : toInt(cpn.sale_price))));
      return json({ codes });
    }
    if (method === 'PATCH' && b) {
      const body = await readJson(request);
      await db.prepare('UPDATE coupons SET disabled = ? WHERE code = ?').bind(body.disabled ? 1 : 0, b).run();
      return json({ ok: true });
    }
    if (method === 'DELETE' && b) { await db.prepare('DELETE FROM coupons WHERE code = ?').bind(b).run(); return json({ ok: true }); }
  }

  // ── usage log ──
  if (a === 'usage' && method === 'GET') {
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    const limit = Math.min(1000, toInt(url.searchParams.get('limit'), 200));
    const stmt = userId
      ? db.prepare('SELECT l.*, u.name AS user_name FROM usage_logs l LEFT JOIN users u ON u.id = l.user_id WHERE l.user_id = ? ORDER BY l.id DESC LIMIT ?').bind(toInt(userId), limit)
      : db.prepare('SELECT l.*, u.name AS user_name FROM usage_logs l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT ?').bind(limit);
    return json((await stmt.all()).results);
  }

  // ── global aliases (abd-main / abd-fast / ...) ──
  if (a === 'aliases') {
    if (method === 'GET') {
      const row = await db.prepare("SELECT value FROM settings WHERE key='aliases'").first();
      return json(row ? JSON.parse(row.value) : {});
    }
    if (method === 'PUT') {
      const body = await readJson(request);
      need(body && typeof body === 'object' && !Array.isArray(body), 'body must be an object {alias: model_id}');
      await db.prepare("INSERT INTO settings (key, value) VALUES ('aliases', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(body)).run();
      return json({ ok: true });
    }
  }

  throw new HttpError(404, `Unknown admin route ${method} ${path}`, 'not_found_error');
}
