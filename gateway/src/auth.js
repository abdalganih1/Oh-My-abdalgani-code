import { bearer, sha256Hex, safeEqual, now, HttpError } from './util.js';

/**
 * Resolve a gateway API key (sk-abd-...) — or, for the dashboard only, a login session
 * (abd_ses_...) — to {user, keyId}. Throws 401.
 */
export async function authUser(request, env, ctx, { allowSession = false } = {}) {
  const token = bearer(request);
  if (!token) throw new HttpError(401, 'Missing API key (Authorization: Bearer sk-abd-...)', 'authentication_error');
  if (token.startsWith('abd_ses_')) {
    if (!allowSession) throw new HttpError(401, 'Dashboard sessions cannot call the model API — create an API key in the dashboard.', 'authentication_error');
    const s = await env.DB.prepare('SELECT s.id AS sid, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(await sha256Hex(token)).first();
    if (!s || s.expires_at < now()) throw new HttpError(401, 'Session expired — log in again', 'authentication_error');
    if (s.disabled) throw new HttpError(403, 'This account is disabled — contact the administrator', 'permission_error');
    const { sid, expires_at, ...user } = s;
    return { user, keyId: null, sessionId: sid };
  }
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT k.id AS key_id, k.revoked, k.last_used_at, u.* FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ?`
  ).bind(hash).first();
  if (!row || row.revoked) throw new HttpError(401, 'Invalid or revoked API key', 'authentication_error');
  if (row.disabled) throw new HttpError(403, 'This account is disabled — contact the administrator', 'permission_error');
  if (row.approved === 0) throw new HttpError(403, 'This account is waiting for the administrator\'s approval', 'permission_error');
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
