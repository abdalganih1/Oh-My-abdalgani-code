// OpenRouter-style routing: public model → ordered routes → weighted key pool with cooldowns.
import { decryptSecret, now, HttpError } from './util.js';

export const MODEL_PREFIXES = ['abdalgani/', 'abd/'];

export async function getGlobalAliases(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'aliases'").first();
  try { return row ? JSON.parse(row.value) : {}; } catch { return {}; }
}

/** Resolve requested model name (alias / prefixed / id) → models row. */
export async function resolveModel(db, userId, requested) {
  if (!requested || typeof requested !== 'string') throw new HttpError(400, '`model` is required');
  let name = requested.trim();
  for (const p of MODEL_PREFIXES) if (name.startsWith(p)) name = name.slice(p.length);
  const alias = await db.prepare('SELECT model_id FROM user_aliases WHERE user_id = ? AND alias = ?').bind(userId, name).first();
  if (alias) name = alias.model_id;
  else {
    const globals = await getGlobalAliases(db);
    if (globals[name]) name = globals[name];
  }
  const model = await db.prepare("SELECT * FROM models WHERE id = ? AND status != 'hidden'").bind(name).first();
  if (!model) throw new HttpError(404, `Model "${requested}" does not exist. See GET /v1/models`, 'not_found_error');
  return model;
}

export async function loadRoutes(db, modelId) {
  const { results } = await db.prepare(
    `SELECT r.id AS route_id, r.upstream_model, r.priority, p.*
       FROM model_routes r JOIN providers p ON p.id = r.provider_id
      WHERE r.model_id = ? AND r.enabled = 1 AND p.enabled = 1
      ORDER BY r.priority ASC, r.id ASC`
  ).bind(modelId).all();
  return results || [];
}

export async function loadKeys(db, providerId) {
  const { results } = await db.prepare(
    'SELECT * FROM provider_keys WHERE provider_id = ? AND enabled = 1 AND cooldown_until <= ?'
  ).bind(providerId, now()).all();
  return results || [];
}

/** Weighted shuffle: heavier keys first on average, every key eventually tried. */
export function weightedOrder(keys, rnd = Math.random) {
  const pool = keys.map((k) => ({ k, s: Math.pow(rnd(), 1 / Math.max(1, k.weight || 1)) }));
  return pool.sort((a, b) => b.s - a.s).map((x) => x.k);
}

/** Async generator of {route, key, secret} attempts in failover order. */
export async function* attempts(env, routes, { maxKeysPerRoute = 3 } = {}) {
  for (const route of routes) {
    const keys = weightedOrder(await loadKeys(env.DB, route.id)).slice(0, maxKeysPerRoute);
    for (const key of keys) {
      let secret;
      try { secret = await decryptSecret(key.key_enc, env.ENCRYPTION_KEY); }
      catch { await markKeyFailure(env.DB, key.id, 0, 'cannot decrypt (ENCRYPTION_KEY changed?)'); continue; }
      yield { route, key, secret };
    }
  }
}

/** Should we fail over to the next key/route for this upstream status? */
export const isRetryable = (status) => status === 401 || status === 402 || status === 403 || status === 408 || status === 429 || status >= 500;

export function cooldownFor(status) {
  if (status === 401 || status === 403) return 3600; // bad / revoked key → park for an hour
  if (status === 402) return 3600;                    // provider out of credit
  if (status === 429) return 60;
  return 20;                                          // 5xx / network
}

export async function markKeyFailure(db, keyId, status, message) {
  await db.prepare(
    'UPDATE provider_keys SET fail_count = fail_count + 1, cooldown_until = ?, last_error = ? WHERE id = ?'
  ).bind(now() + cooldownFor(status), `${status || 'ERR'} ${String(message || '').slice(0, 300)}`, keyId).run();
}

export async function markKeySuccess(db, keyId) {
  await db.prepare('UPDATE provider_keys SET used_count = used_count + 1, fail_count = 0 WHERE id = ?').bind(keyId).run();
}

export const USER_AGENT = 'abdalgani-gateway/2.1 (+https://api.abdalgani.com)';

export function upstreamHeaders(provider, secret, format, incoming) {
  // upstreams like OpenCode ask clients to identify themselves instead of a generic SDK UA
  const h = { 'content-type': 'application/json', 'user-agent': USER_AGENT };
  if (format === 'anthropic') {
    if (provider.auth_style === 'x-api-key') h['x-api-key'] = secret;
    else h['authorization'] = `Bearer ${secret}`;
    h['anthropic-version'] = incoming?.get('anthropic-version') || '2023-06-01';
    const beta = incoming?.get('anthropic-beta');
    if (beta && provider.auth_style === 'x-api-key') h['anthropic-beta'] = beta;
  } else {
    h['authorization'] = `Bearer ${secret}`;
  }
  if (provider.extra_headers) {
    try { Object.assign(h, JSON.parse(provider.extra_headers)); } catch { /* ignore bad JSON */ }
  }
  return h;
}

export function upstreamUrl(provider, format) {
  if (format === 'anthropic') return provider.anthropic_base_url ? `${provider.anthropic_base_url.replace(/\/$/, '')}/v1/messages` : null;
  return provider.openai_base_url ? `${provider.openai_base_url.replace(/\/$/, '')}/chat/completions` : null;
}

export function parseCompat(provider) {
  if (!provider?.compat) return {};
  try { return JSON.parse(provider.compat) || {}; } catch { return {}; }
}

const EFFORT_LADDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** Map a requested effort onto what the upstream accepts. null = drop the parameter. */
export function mapEffort(requested, allowed) {
  if (requested == null) return requested;
  let r = String(requested).toLowerCase();
  if (r === 'ultra') r = 'max';
  if (!Array.isArray(allowed) || !allowed.length) return r;
  if (allowed.includes(r)) return r;
  if (r === 'none') return null;
  const idx = EFFORT_LADDER.indexOf(r);
  if (idx < 0) return null;
  let best = null, dist = Infinity;
  for (const a of allowed) {
    const i = EFFORT_LADDER.indexOf(a);
    if (i <= 0) continue; // never silently turn reasoning off
    const d = Math.abs(i - idx) + (i > idx ? 0.5 : 0); // tie → prefer the lower level
    if (d < dist) { dist = d; best = a; }
  }
  return best;
}

/** Apply per-provider quirks to an OpenAI chat-completions body (mutates + returns it). */
export function applyCompat(body, provider) {
  const c = parseCompat(provider);
  if (c.max_tokens_field === 'max_tokens' && body.max_completion_tokens != null) {
    body.max_tokens ??= body.max_completion_tokens; delete body.max_completion_tokens;
  } else if (c.max_tokens_field === 'max_completion_tokens' && body.max_tokens != null) {
    body.max_completion_tokens ??= body.max_tokens; delete body.max_tokens;
  }
  if (c.developer_role === false && Array.isArray(body.messages)) {
    body.messages = body.messages.map((m) => (m.role === 'developer' ? { ...m, role: 'system' } : m));
  }
  if (body.reasoning_effort != null) {
    const e = mapEffort(body.reasoning_effort, c.efforts);
    if (e == null) delete body.reasoning_effort; else body.reasoning_effort = e;
  }
  if (Array.isArray(c.strip)) for (const k of c.strip) delete body[k];
  return body;
}
