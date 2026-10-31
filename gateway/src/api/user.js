// Student dashboard API — /api/me/* (Bearer sk-abd-...).
// Students cannot sign up, buy, or trial anything: credit only comes from admin coupons.
import { authUser } from '../auth.js';
import { isSubUsable, loadSubscriptions } from '../billing.js';
import { getGlobalAliases } from '../routing.js';
import { json, readJson, HttpError, now, toInt, sha256Hex, newApiKey } from '../util.js';

const ALIAS_RE = /^[a-z0-9][a-z0-9._-]{0,40}$/;

export async function handleMe(request, env, ctx, path) {
  const { user, keyId } = await authUser(request, env, ctx);
  const db = env.DB;
  const method = request.method;
  const [a, b, c] = path.replace(/^\/api\/me\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

  const allModels = async () => (await db.prepare("SELECT * FROM models WHERE status != 'hidden' ORDER BY sort, id").all()).results;

  if (!a && method === 'GET') {
    const t = now();
    const [subs, keys, globals, mine, stats] = await Promise.all([
      loadSubscriptions(db, user.id),
      db.prepare('SELECT id, name, prefix, revoked, last_used_at, created_at FROM api_keys WHERE user_id = ? AND revoked = 0 ORDER BY id').bind(user.id).all(),
      getGlobalAliases(db),
      db.prepare('SELECT alias, model_id FROM user_aliases WHERE user_id = ?').bind(user.id).all(),
      db.prepare('SELECT COUNT(*) req, COALESCE(SUM(cost),0) cost, COALESCE(SUM(prompt_tokens+completion_tokens),0) tokens FROM usage_logs WHERE user_id = ? AND created_at > ?').bind(user.id, t - 30 * 86400).first(),
    ]);
    const aliases = Object.entries(globals).map(([alias, model_id]) => ({ alias, model_id, default_model_id: model_id, custom: false }));
    for (const m of mine.results) {
      const ex = aliases.find((x) => x.alias === m.alias);
      if (ex) { ex.model_id = m.model_id; ex.custom = true; } else aliases.push({ alias: m.alias, model_id: m.model_id, default_model_id: null, custom: true });
    }
    // the real model + where it is served from, so the student always knows what abd-main really is
    const { results: mods } = await db.prepare("SELECT id, name, status FROM models WHERE status != 'hidden'").all();
    // mirror resolveModel's fallback so the table shows what will really answer
    const live = (id) => { const m = mods.find((x) => x.id === id); return m && m.status !== 'archived' ? m : null; };
    for (const a of aliases) {
      if (live(a.model_id)) continue;
      const alt = (a.custom && a.default_model_id && live(a.default_model_id)) ? a.default_model_id : (a.alias !== 'abd-main' && live(globals['abd-main']) ? globals['abd-main'] : null);
      if (alt) { a.archived_model_id = a.model_id; a.model_id = alt; a.fallback = true; }
    }
    const { results: routes } = await db.prepare(
      `SELECT r.model_id, r.upstream_model, p.name AS provider FROM model_routes r JOIN providers p ON p.id = r.provider_id
       WHERE r.enabled = 1 AND p.enabled = 1 AND EXISTS (SELECT 1 FROM provider_keys k WHERE k.provider_id = p.id AND k.enabled = 1)
       ORDER BY r.priority, r.id`
    ).all();
    for (const a of aliases) {
      a.model_name = mods.find((x) => x.id === a.model_id)?.name || a.model_id;
      const r = routes.find((x) => x.model_id === a.model_id);
      a.served_by = r ? `${r.provider} · ${r.upstream_model}` : null;
    }
    return json({
      user: { id: user.id, name: user.name, email: user.email },
      current_key_id: keyId,
      subscriptions: subs.sort((x, y) => y.id - x.id).map((s) => ({
        ...s, remaining: Math.max(0, s.total - s.used),
        active: !s.disabled && (s.expires_at == null || s.expires_at > t) && s.used < s.total,
      })),
      keys: keys.results,
      aliases,
      stats_30d: stats,
      base_url: new URL(request.url).origin,
    });
  }

  if (a === 'models' && method === 'GET') {
    const subs = await loadSubscriptions(db, user.id);
    const groups = (await db.prepare('SELECT * FROM model_groups').all()).results;
    const models = (await allModels()).map((m) => ({
      id: m.id, name: m.name, group_id: m.group_id, status: m.status, description: m.description,
      context_length: m.context_length, max_output: m.max_output, reasoning: !!m.reasoning, vision: !!m.vision,
      pricing_mode: m.pricing_mode, price_in: m.price_in, price_out: m.price_out, price_request: m.price_request, markup_pct: m.markup_pct,
      created_at: m.created_at, archived_at: m.archived_at, archived_reason: m.archived_reason,
      available: m.status !== 'archived' && subs.some((s) => isSubUsable(s, m)),
    }));
    return json({ models, groups });
  }

  if (a === 'redeem' && method === 'POST') {
    const { code } = await readJson(request);
    const c0 = String(code || '').trim().toUpperCase();
    if (!c0) throw new HttpError(400, 'Coupon code is required');
    const t = now();
    const cpn = await db.prepare('SELECT * FROM coupons WHERE code = ?').bind(c0).first();
    if (!cpn || cpn.disabled) throw new HttpError(404, 'Invalid coupon code');
    if (cpn.expires_at && cpn.expires_at <= t) throw new HttpError(410, 'This coupon has expired');
    if (cpn.used_count >= cpn.max_uses) throw new HttpError(409, 'This coupon has already been used');
    const dup = await db.prepare('SELECT 1 FROM coupon_redemptions WHERE coupon_code = ? AND user_id = ?').bind(c0, user.id).first();
    if (dup) throw new HttpError(409, 'You have already redeemed this coupon');
    // atomic claim of one use
    const claim = await db.prepare(
      'UPDATE coupons SET used_count = used_count + 1 WHERE code = ? AND used_count < max_uses AND disabled = 0 AND (expires_at IS NULL OR expires_at > ?)'
    ).bind(c0, t).run();
    if (!claim.meta?.changes) throw new HttpError(409, 'This coupon has already been used');
    try {
      await db.batch([
        db.prepare('INSERT INTO coupon_redemptions (coupon_code, user_id) VALUES (?, ?)').bind(c0, user.id),
        db.prepare('INSERT INTO subscriptions (user_id, kind, group_id, total, source, expires_at) VALUES (?,?,?,?,?,?)')
          .bind(user.id, cpn.kind, cpn.group_id, cpn.amount, `coupon:${c0}`, cpn.valid_days > 0 ? t + cpn.valid_days * 86400 : null),
      ]);
    } catch (e) {
      await db.prepare('UPDATE coupons SET used_count = used_count - 1 WHERE code = ?').bind(c0).run();
      throw new HttpError(409, 'Could not redeem coupon (already redeemed?)');
    }
    return json({ ok: true, kind: cpn.kind, amount: cpn.amount, group_id: cpn.group_id, valid_days: cpn.valid_days });
  }

  if (a === 'aliases') {
    if (method === 'PUT') {
      const { alias, model_id } = await readJson(request);
      if (!ALIAS_RE.test(alias || '')) throw new HttpError(400, 'Alias must be lowercase letters/digits/.-_ (max 41 chars)');
      const model = await db.prepare("SELECT * FROM models WHERE id = ? AND status != 'hidden'").bind(model_id).first();
      if (!model) throw new HttpError(404, 'Unknown model');
    if (model.status === 'archived') throw new HttpError(410, 'This model is archived');
      if (await db.prepare('SELECT 1 FROM models WHERE id = ?').bind(alias).first()) throw new HttpError(400, 'Alias cannot be the name of an existing model');
      const subs = await loadSubscriptions(db, user.id);
      if (!subs.some((s) => isSubUsable(s, model))) throw new HttpError(402, 'Your subscriptions do not cover this model', 'insufficient_quota');
      await db.prepare('INSERT INTO user_aliases (user_id, alias, model_id) VALUES (?,?,?) ON CONFLICT(user_id, alias) DO UPDATE SET model_id = excluded.model_id')
        .bind(user.id, alias, model_id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE' && b) {
      await db.prepare('DELETE FROM user_aliases WHERE user_id = ? AND alias = ?').bind(user.id, b).run();
      return json({ ok: true });
    }
  }

  if (a === 'usage' && method === 'GET') {
    const limit = Math.min(500, toInt(new URL(request.url).searchParams.get('limit'), 100));
    const { results } = await db.prepare(
      'SELECT id, model_id, requested_model, upstream_model, endpoint, status, prompt_tokens, completion_tokens, cached_tokens, cost, subscription_id, charged, latency_ms, created_at FROM usage_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?'
    ).bind(user.id, limit).all();
    return json(results);
  }

  if (a === 'keys') {
    if (!b && method === 'POST') {
      const body = await readJson(request).catch(() => ({}));
      const n = await db.prepare('SELECT COUNT(*) n FROM api_keys WHERE user_id = ? AND revoked = 0').bind(user.id).first();
      if (n.n >= 5) throw new HttpError(400, 'Maximum 5 active keys');
      const key = newApiKey();
      await db.prepare('INSERT INTO api_keys (user_id, name, key_hash, prefix) VALUES (?,?,?,?)')
        .bind(user.id, String(body.name || 'key').slice(0, 40), await sha256Hex(key), key.slice(0, 12)).run();
      return json({ api_key: key });
    }
    if (b && c === 'revoke' && method === 'POST') {
      if (toInt(b) === keyId) throw new HttpError(400, 'You cannot revoke the key you are logged in with');
      await db.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ? AND user_id = ?').bind(toInt(b), user.id).run();
      return json({ ok: true });
    }
  }

  throw new HttpError(404, `Unknown route ${method} ${path}`, 'not_found_error');
}
