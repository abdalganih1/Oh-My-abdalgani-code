// Admin control plane — /api/admin/* (Bearer ADMIN_TOKEN).
import { authAdmin } from '../auth.js';
import {
  json, readJson, HttpError, now, toInt, sha256Hex, newApiKey, newCouponCode,
  encryptSecret, decryptSecret,
} from '../util.js';
import { upstreamHeaders } from '../routing.js';

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
    return json({ users: users.n, provider_keys: keys, day, month, providers: providers.results, top_models: topModels.results });
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
      if (p.extra_headers) { try { JSON.parse(p.extra_headers); } catch { throw new HttpError(400, 'extra_headers must be a JSON object'); } }
      await db.prepare(
        `INSERT INTO providers (id, name, openai_base_url, anthropic_base_url, auth_style, extra_headers, enabled) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, openai_base_url=excluded.openai_base_url, anthropic_base_url=excluded.anthropic_base_url,
           auth_style=excluded.auth_style, extra_headers=excluded.extra_headers, enabled=excluded.enabled`
      ).bind(p.id, p.name || p.id, p.openai_base_url || null, p.anthropic_base_url || null, p.auth_style === 'x-api-key' ? 'x-api-key' : 'bearer', p.extra_headers || null, p.enabled === false || p.enabled === 0 ? 0 : 1).run();
      return json({ ok: true });
    }
    if (b && !c && method === 'DELETE') {
      await db.prepare('DELETE FROM providers WHERE id = ?').bind(b).run();
      return json({ ok: true });
    }
    if (b && c === 'keys' && method === 'POST') {
      const k = await readJson(request);
      need(typeof k.key === 'string' && k.key.trim().length >= 8, 'key is required');
      const key = k.key.trim();
      await db.prepare('INSERT INTO provider_keys (provider_id, label, key_enc, key_hint, weight) VALUES (?,?,?,?,?)')
        .bind(b, k.label || 'key', await encryptSecret(key, env.ENCRYPTION_KEY), key.slice(-4), Math.max(1, toInt(k.weight, 1))).run();
      return json({ ok: true });
    }
    if (b && c === 'discover' && method === 'POST') {
      // List the upstream catalog with the first working key (helps adding models).
      const provider = await db.prepare('SELECT * FROM providers WHERE id = ?').bind(b).first();
      need(provider?.openai_base_url, 'provider has no OpenAI-compatible base URL');
      const key = await db.prepare('SELECT * FROM provider_keys WHERE provider_id = ? AND enabled = 1 ORDER BY id LIMIT 1').bind(b).first();
      need(key, 'add a key to this provider first');
      const secret = await decryptSecret(key.key_enc, env.ENCRYPTION_KEY);
      const res = await fetch(`${provider.openai_base_url.replace(/\/$/, '')}/models`, { headers: upstreamHeaders(provider, secret, 'openai') });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(502, `upstream ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      const list = (body.data || []).map((m) => ({
        id: m.id,
        name: m.name || m.display_name || m.id,
        context_length: m.context_length || m.top_provider?.context_length || null,
        max_output: m.top_provider?.max_completion_tokens || null,
        // OpenRouter pricing is USD per token (string) → micro-USD per 1M tokens
        price_in: m.pricing?.prompt != null ? Math.round(Number(m.pricing.prompt) * 1e12) : null,
        price_out: m.pricing?.completion != null ? Math.round(Number(m.pricing.completion) * 1e12) : null,
        price_cache_read: m.pricing?.input_cache_read != null ? Math.round(Number(m.pricing.input_cache_read) * 1e12) : null,
      }));
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
      let res;
      if (row.openai_base_url) {
        res = await fetch(`${row.openai_base_url.replace(/\/$/, '')}/models`, { headers: upstreamHeaders(row, secret, 'openai') });
      } else {
        res = await fetch(`${row.anthropic_base_url.replace(/\/$/, '')}/v1/models`, { headers: upstreamHeaders(row, secret, 'anthropic') });
      }
      const text = await res.text();
      if (res.ok) await db.prepare('UPDATE provider_keys SET last_error = NULL, cooldown_until = 0, fail_count = 0 WHERE id = ?').bind(id).run();
      else await db.prepare('UPDATE provider_keys SET last_error = ? WHERE id = ?').bind(`test ${res.status}: ${text.slice(0, 200)}`, id).run();
      return json({ ok: res.ok, status: res.status, latency_ms: Date.now() - started, sample: text.slice(0, 300) });
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
  if (a === 'models') {
    if (method === 'GET') {
      const { results: models } = await db.prepare('SELECT * FROM models ORDER BY sort, id').all();
      const { results: routes } = await db.prepare('SELECT * FROM model_routes ORDER BY model_id, priority, id').all();
      return json(models.map((m) => ({ ...m, routes: routes.filter((r) => r.model_id === m.id) })));
    }
    if (method === 'POST') {
      const m = await readJson(request);
      need(ID_RE.test(m.id || ''), 'invalid model id');
      need(['token', 'request', 'provider'].includes(m.pricing_mode || 'token'), 'pricing_mode must be token|request|provider');
      need(['new', 'active', 'legacy', 'hidden'].includes(m.status || 'active'), 'status must be new|active|legacy|hidden');
      const stmts = [db.prepare(
        `INSERT INTO models (id, name, group_id, context_length, max_output, reasoning, pricing_mode, price_in, price_out, price_cache_read, price_request, markup_pct, status, description, sort)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, group_id=excluded.group_id, context_length=excluded.context_length, max_output=excluded.max_output,
           reasoning=excluded.reasoning, pricing_mode=excluded.pricing_mode, price_in=excluded.price_in, price_out=excluded.price_out,
           price_cache_read=excluded.price_cache_read, price_request=excluded.price_request, markup_pct=excluded.markup_pct,
           status=excluded.status, description=excluded.description, sort=excluded.sort`
      ).bind(m.id, m.name || m.id, m.group_id || null, toInt(m.context_length, 128000), toInt(m.max_output, 8192), m.reasoning ? 1 : 0,
        m.pricing_mode || 'token', toInt(m.price_in), toInt(m.price_out), toInt(m.price_cache_read), toInt(m.price_request), toInt(m.markup_pct),
        m.status || 'active', m.description || null, toInt(m.sort, 100))];
      if (Array.isArray(m.routes)) {
        stmts.push(db.prepare('DELETE FROM model_routes WHERE model_id = ?').bind(m.id));
        m.routes.forEach((r, i) => {
          need(r.provider_id && r.upstream_model, 'each route needs provider_id + upstream_model');
          stmts.push(db.prepare('INSERT INTO model_routes (model_id, provider_id, upstream_model, priority, enabled) VALUES (?,?,?,?,?)')
            .bind(m.id, r.provider_id, r.upstream_model, toInt(r.priority, i), r.enabled === false || r.enabled === 0 ? 0 : 1));
        });
      }
      await db.batch(stmts);
      return json({ ok: true });
    }
    if (method === 'DELETE' && b) { await db.prepare('DELETE FROM models WHERE id = ?').bind(seg.slice(1).join('/')).run(); return json({ ok: true }); }
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
         FROM users u ORDER BY u.id DESC`
      ).bind(t, t).all();
      return json(results);
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
      return json({ user, subscriptions: subs.results, keys: keys.results, aliases: aliases.results, usage: usage.results });
    }
    if (b && !c && method === 'PATCH') {
      const u = await readJson(request);
      const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
      need(row, 'user not found');
      await db.prepare('UPDATE users SET name=?, email=?, note=?, disabled=? WHERE id=?')
        .bind(u.name ?? row.name, u.email ?? row.email, u.note ?? row.note, u.disabled == null ? row.disabled : (u.disabled ? 1 : 0), uid).run();
      return json({ ok: true });
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
      await db.prepare('INSERT INTO subscriptions (user_id, kind, group_id, total, source, expires_at) VALUES (?,?,?,?,?,?)')
        .bind(uid, s.kind, s.group_id || null, toInt(s.amount), 'admin', days > 0 ? now() + days * 86400 : null).run();
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
        'INSERT INTO coupons (code, kind, amount, group_id, valid_days, max_uses, expires_at, note) VALUES (?,?,?,?,?,?,?,?)'
      ).bind(code, cpn.kind, toInt(cpn.amount), cpn.group_id || null, toInt(cpn.valid_days, 30), Math.max(1, toInt(cpn.max_uses, 1)), expiresAt, cpn.note || null)));
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
