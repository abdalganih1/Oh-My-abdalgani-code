import { bearer, sha256Hex, safeEqual, now, HttpError } from './util.js';

/** Resolve a gateway API key (sk-abd-...) to {user, key}. Throws 401. */
export async function authUser(request, env, ctx) {
  const token = bearer(request);
  if (!token) throw new HttpError(401, 'Missing API key (Authorization: Bearer sk-abd-...)', 'authentication_error');
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT k.id AS key_id, k.revoked, k.last_used_at, u.* FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ?`
  ).bind(hash).first();
  if (!row || row.revoked) throw new HttpError(401, 'Invalid or revoked API key', 'authentication_error');
  if (row.disabled) throw new HttpError(403, 'This account is disabled — contact the administrator', 'permission_error');
  const t = now();
  if (!row.last_used_at || t - row.last_used_at > 300) {
    const p = env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(t, row.key_id).run();
    ctx?.waitUntil ? ctx.waitUntil(p) : await p;
  }
  const { key_id, revoked, last_used_at, ...user } = row;
  return { user, keyId: key_id };
}

/** Admin = holder of the ADMIN_TOKEN secret. */
export function authAdmin(request, env) {
  const token = bearer(request);
  if (!env.ADMIN_TOKEN) throw new HttpError(500, 'ADMIN_TOKEN secret is not configured', 'server_error');
  if (!token || !safeEqual(token, env.ADMIN_TOKEN)) throw new HttpError(401, 'Admin token required', 'authentication_error');
  return true;
}
