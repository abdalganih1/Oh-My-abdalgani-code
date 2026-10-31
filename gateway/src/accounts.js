// Self-service student accounts: register → login (session) → create own API keys → redeem codes.
// Passwords: PBKDF2-SHA256 (WebCrypto), per-user salt. Sessions: random token, only its hash stored.
import { json, readJson, HttpError, now, sha256Hex, randomToken } from './util.js';
import { getSecurity, authFailure } from './security.js';

const ITER = 100_000; // Workers' WebCrypto PBKDF2 cap
const SESSION_DAYS = 14;
const enc = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITER))}`;
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const got = await pbkdf2(password, unb64(salt), Number(iter));
  const want = unb64(hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.max(got.length, want.length); i++) diff |= (got[i] ?? 0) ^ (want[i] ?? 0);
  return diff === 0;
}

export const isSessionToken = (t) => typeof t === 'string' && t.startsWith('abd_ses_');

async function newSession(db, userId, request, ip) {
  const token = `abd_ses_${randomToken(40)}`;
  await db.prepare('INSERT INTO sessions (user_id, token_hash, ip, ua, expires_at) VALUES (?,?,?,?,?)')
    .bind(userId, await sha256Hex(token), ip, (request.headers.get('user-agent') || '').slice(0, 200), now() + SESSION_DAYS * 86400).run();
  return token;
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // optional: enable by setting the secret + site key
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
  });
  const data = await res.json().catch(() => ({}));
  return !!data.success;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export async function handleAuth(request, env, ctx, path, sec = {}) {
  const db = env.DB;
  const action = path.replace(/^\/api\/auth\/?/, '');
  const ip = sec.ip || 'unknown';

  if (action === 'config' && request.method === 'GET') {
    const cfg = await getSecurity(db);
    return json({ signup_mode: cfg.signup_mode, turnstile_site_key: env.TURNSTILE_SITE_KEY || null });
  }

  if (action === 'register' && request.method === 'POST') {
    const cfg = await getSecurity(db);
    if (cfg.signup_mode === 'closed') throw new HttpError(403, 'التسجيل مغلق حالياً — تواصل مع المدرّس.', 'permission_error');
    const b = await readJson(request);
    const name = String(b.name || '').trim().slice(0, 60);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (name.length < 2) throw new HttpError(400, 'الاسم مطلوب');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'إيميل غير صالح');
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'كلمة السر لازم تكون 8 أحرف على الأقل');
    if (!(await verifyTurnstile(env, b.turnstile, ip))) throw new HttpError(400, 'فشل التحقق من أنك إنسان — أعد المحاولة');
    const t = now();
    const { n } = await db.prepare('SELECT COUNT(*) n FROM users WHERE created_ip = ? AND created_at > ?').bind(ip, t - 86400).first();
    if (n >= cfg.signup_per_ip_day) {
      ctx.waitUntil(db.prepare('INSERT INTO events (kind, message, data) VALUES (?,?,?)')
        .bind('security_block', `🛡️ محاولة إنشاء حسابات كثيرة من ${ip} (${n} اليوم) — رُفضت`, JSON.stringify({ ip })).run());
      throw new HttpError(429, 'تم إنشاء حسابات كثيرة من هذه الشبكة اليوم — حاول غداً أو تواصل مع المدرّس.', 'rate_limit_error');
    }
    if (await db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').bind(email).first()) throw new HttpError(409, 'هذا الإيميل مسجّل — سجّل الدخول');
    const approved = cfg.signup_mode === 'approval' ? 0 : 1;
    const capDefault = Math.round((cfg.user_cap_default_usd || 5) * 1e6);
    const row = await db.prepare(`INSERT INTO users (name, email, password_hash, self_signup, approved, created_ip, daily_cap)
        VALUES (?,?,?,1,?,?,?) RETURNING id`).bind(name, email, await hashPassword(password), approved, ip, capDefault).first();
    ctx.waitUntil(db.prepare('INSERT INTO events (kind, message, data) VALUES (?,?,?)')
      .bind('user_signup', `👤 حساب جديد: ${name} <${email}> من ${ip}${approved ? '' : ' — بانتظار موافقتك'}`, JSON.stringify({ user_id: row.id, ip })).run());
    if (!approved) return json({ ok: true, pending: true });
    return json({ ok: true, session: await newSession(db, row.id, request, ip) });
  }

  if (action === 'login' && request.method === 'POST') {
    const b = await readJson(request);
    const email = String(b.email || '').trim().toLowerCase();
    const user = await db.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(email).first();
    const t = now();
    if (user?.locked_until && user.locked_until > t) {
      throw new HttpError(429, `الحساب مقفول مؤقتاً بسبب محاولات خاطئة — حاول بعد ${Math.ceil((user.locked_until - t) / 60)} دقيقة.`, 'rate_limit_error');
    }
    const ok = user && await verifyPassword(String(b.password || ''), user.password_hash);
    if (!ok) {
      ctx.waitUntil(authFailure(env, ip, 'login'));
      if (user) {
        const fails = user.login_fail + 1;
        await db.prepare('UPDATE users SET login_fail = ?, locked_until = ? WHERE id = ?').bind(fails >= 5 ? 0 : fails, fails >= 5 ? t + 15 * 60 : null, user.id).run();
      }
      throw new HttpError(401, 'الإيميل أو كلمة السر غير صحيحة', 'authentication_error');
    }
    if (user.disabled) throw new HttpError(403, 'الحساب موقوف — تواصل مع المدرّس.', 'permission_error');
    if (!user.approved) throw new HttpError(403, 'حسابك بانتظار موافقة المدرّس.', 'permission_error');
    await db.prepare('UPDATE users SET login_fail = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').bind(t, user.id).run();
    return json({ ok: true, session: await newSession(db, user.id, request, ip) });
  }

  if (action === 'logout' && request.method === 'POST') {
    const token = (request.headers.get('authorization') || '').replace(/^bearer\s+/i, '');
    if (isSessionToken(token)) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
    return json({ ok: true });
  }

  throw new HttpError(404, 'Unknown auth route', 'not_found_error');
}

export async function changePassword(db, user, body) {
  const full = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
  if (full.password_hash && !(await verifyPassword(String(body.current || ''), full.password_hash))) throw new HttpError(400, 'كلمة السر الحالية غير صحيحة');
  const next = String(body.password || '');
  if (next.length < 8 || next.length > 200) throw new HttpError(400, 'كلمة السر الجديدة لازم تكون 8 أحرف على الأقل');
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(next), user.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id), // log out everywhere
  ]);
}
