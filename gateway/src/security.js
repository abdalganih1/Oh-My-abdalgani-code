// Abuse protection for the gateway:
//  • IP / device blocklist (manual from the admin panel, or automatic after repeated bad keys)
//  • per-key and per-IP rate limits (Cloudflare Rate Limiting bindings, when configured)
//  • device binding: each key works from at most N registered devices (random per-install ID)
//  • daily spend cap per student + a global daily upstream budget (kill switch)
//  • request size limit
import { HttpError, now } from './util.js';

const DEFAULTS = {
  device_policy: 'track', // off | track | enforce
  max_devices: 2,
  auth_fail_limit: 10,
  auth_fail_window_min: 10,
  auto_block_min: 60,
  user_daily_tokens: 15000000,
  user_cap_default_usd: 5,
  user_cap_max_usd: 50,
  signup_mode: 'open',
  signup_per_ip_day: 3,
  alert_daily_requests: 1500,
  alert_spike_factor: 4,
  alert_ips_per_user: 4,
  alert_users_per_ip: 4,
  alert_error_rate: 0.5,
  loop_guard_repeats: 25,
  loop_guard_window_s: 120,
  loop_guard_pause_min: 10,
  global_daily_upstream_usd: 20,
  max_body_mb: 20,
  min_reserve_output_tokens: 1024,
};

let cache = { at: 0, cfg: null };
export async function getSecurity(db, fresh = false) {
  if (!fresh && cache.cfg && Date.now() - cache.at < 30_000) return cache.cfg;
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'security'").first();
  let cfg = { ...DEFAULTS };
  try { cfg = { ...DEFAULTS, ...(row ? JSON.parse(row.value) : {}) }; } catch { /* keep defaults */ }
  cache = { at: Date.now(), cfg };
  return cfg;
}
export const resetSecurityCache = () => { cache = { at: 0, cfg: null }; };

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

const DEVICE_RE = /^[A-Za-z0-9_-]{16,80}$/;
export function deviceFrom(request) {
  const id = (request.headers.get('x-abd-device') || '').trim();
  if (!id) return null;
  if (!DEVICE_RE.test(id)) throw new HttpError(400, 'Malformed X-Abd-Device header', 'invalid_request_error');
  const name = (request.headers.get('x-abd-device-name') || '').replace(/[^\p{L}\p{N} ._()@-]/gu, '').slice(0, 80) || null;
  return { id, name };
}

async function blocked(db, kind, value) {
  if (!value) return null;
  const row = await db.prepare('SELECT * FROM blocks WHERE kind = ? AND value = ? AND (expires_at IS NULL OR expires_at > ?)').bind(kind, value, now()).first();
  return row;
}

/** Runs before any authentication on /v1 and /api. */
export async function preflight(request, env) {
  const db = env.DB;
  const cfg = await getSecurity(db);
  const ip = clientIp(request);
  const b = await blocked(db, 'ip', ip);
  if (b) throw new HttpError(403, `Access from this network is blocked${b.expires_at ? ' temporarily' : ''}. Contact the administrator.`, 'permission_error');
  const len = Number(request.headers.get('content-length') || 0);
  if (len > cfg.max_body_mb * 1024 * 1024) throw new HttpError(413, `Request too large (max ${cfg.max_body_mb} MB)`, 'invalid_request_error');
  if (env.RL_IP) {
    const { success } = await env.RL_IP.limit({ key: ip });
    if (!success) throw new HttpError(429, 'Too many requests from this network — slow down.', 'rate_limit_error');
  }
  return { ip, cfg };
}

/** Count a failed key/admin-token attempt; block the IP after too many in the window. */
export async function authFailure(env, ip, what = 'key') {
  if (!ip || ip === 'unknown') return;
  const db = env.DB;
  const cfg = await getSecurity(db);
  const t = now(), win = cfg.auth_fail_window_min * 60;
  await db.prepare(`INSERT INTO auth_failures (ip, count, first_at, last_at) VALUES (?, 1, ?, ?)
    ON CONFLICT(ip) DO UPDATE SET count = CASE WHEN auth_failures.first_at < ? THEN 1 ELSE auth_failures.count + 1 END,
      first_at = CASE WHEN auth_failures.first_at < ? THEN excluded.first_at ELSE auth_failures.first_at END, last_at = excluded.last_at`)
    .bind(ip, t, t, t - win, t - win).run();
  const row = await db.prepare('SELECT count FROM auth_failures WHERE ip = ?').bind(ip).first();
  if (row && row.count >= cfg.auth_fail_limit) {
    const until = t + cfg.auto_block_min * 60;
    await db.batch([
      db.prepare(`INSERT INTO blocks (kind, value, reason, auto, expires_at) VALUES ('ip', ?, ?, 1, ?)
        ON CONFLICT(kind, value) DO UPDATE SET reason = excluded.reason, expires_at = MAX(COALESCE(blocks.expires_at, 0), excluded.expires_at)`)
        .bind(ip, `auto: ${row.count} failed ${what} attempts in ${cfg.auth_fail_window_min} min`, until),
      db.prepare('DELETE FROM auth_failures WHERE ip = ?').bind(ip),
      db.prepare('INSERT INTO events (kind, message, data) VALUES (?, ?, ?)')
        .bind('security_block', `🛡️ حُظر العنوان ${ip} تلقائياً لمدة ${cfg.auto_block_min} دقيقة: ${row.count} محاولة ${what === 'admin' ? 'دخول للوحة المدير' : 'بمفتاح'} خاطئ`, JSON.stringify({ ip, what })),
    ]);
  }
}

/** After a key authenticated: per-key rate limit, device binding, daily cap. */
export async function afterAuth(request, env, ctx, { user, keyId, ip, cfg }) {
  const db = env.DB;
  if (env.RL_USER) {
    const { success } = await env.RL_USER.limit({ key: `k${keyId}` });
    if (!success) throw new HttpError(429, 'Too many requests for this key — slow down.', 'rate_limit_error');
  }
  const paused = await blocked(db, 'user', String(user.id));
  if (paused) throw new HttpError(429, `Your keys are paused until ${new Date(paused.expires_at * 1000).toISOString().slice(11, 16)} UTC: ${paused.reason.replace(/^auto: /, '')}. Check your tool isn't stuck in a loop.`, 'loop_guard');
  const dev = deviceFrom(request);
  if (user.internal) return { device: dev }; // admin playground: no device binding
  if (dev && await blocked(db, 'device', dev.id)) throw new HttpError(403, 'This device is blocked. Contact the administrator.', 'permission_error');
  if (cfg.device_policy === 'off') return { device: dev };
  if (!dev) {
    if (cfg.device_policy === 'enforce') throw new HttpError(403, 'Unregistered client: set up your tools with abdalgani-setup (it adds the X-Abd-Device header).', 'permission_error');
    return { device: null };
  }
  const t = now();
  let row = await db.prepare('SELECT * FROM devices WHERE user_id = ? AND device_id = ?').bind(user.id, dev.id).first();
  if (!row) {
    const { n } = await db.prepare("SELECT COUNT(*) n FROM devices WHERE user_id = ? AND status = 'active'").bind(user.id).first();
    const status = n < cfg.max_devices ? 'active' : 'pending';
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO devices (user_id, device_id, name, status, last_seen, last_ip) VALUES (?,?,?,?,?,?)').bind(user.id, dev.id, dev.name, status, t, ip),
      db.prepare('INSERT INTO events (kind, message, data) VALUES (?,?,?)').bind(status === 'active' ? 'device_new' : 'device_rejected',
        status === 'active' ? `📱 جهاز جديد للطالب ${user.name}: ${dev.name || dev.id.slice(0, 8)} (${ip})`
          : `⛔ الطالب ${user.name} حاول من جهاز ثالث ${dev.name || dev.id.slice(0, 8)} (${ip}) — بانتظار موافقتك`, JSON.stringify({ user_id: user.id, device: dev.id, ip })),
    ]);
    row = { status };
  } else if (!row.last_seen || t - row.last_seen > 300 || row.last_ip !== ip) {
    ctx.waitUntil(db.prepare('UPDATE devices SET last_seen = ?, last_ip = ?, name = COALESCE(?, name) WHERE id = ?').bind(t, ip, dev.name, row.id).run());
  }
  if (row.status === 'blocked') throw new HttpError(403, 'This device is blocked for your account. Contact the administrator.', 'permission_error');
  if (row.status === 'pending' && cfg.device_policy === 'enforce') {
    throw new HttpError(403, `Device limit reached (${cfg.max_devices}). The administrator must approve this device.`, 'permission_error');
  }
  return { device: dev };
}

let budgetCache = { at: 0, day: '', spent: 0 };
/** Count spend in this isolate right away, so the budget check doesn't wait for the cache refresh. */
export function noteSpend(micro) { if (micro > 0) budgetCache.spent += micro; }
/** Daily caps, checked before any upstream call. */
export async function checkSpendCaps(env, user, cfg) {
  const db = env.DB;
  const dayStart = Math.floor(now() / 86400) * 86400; // UTC day
  {
    // the student's own caps (daily is mandatory, clamped to the admin maximum)
    const maxCap = Math.round((cfg.user_cap_max_usd || 50) * 1e6);
    const daily = Math.min(user.daily_cap > 0 ? user.daily_cap : Math.round((cfg.user_cap_default_usd || 5) * 1e6), maxCap);
    const r = await db.prepare('SELECT COALESCE(SUM(cost), 0) c, COALESCE(SUM(prompt_tokens + completion_tokens), 0) t FROM usage_logs WHERE user_id = ? AND created_at >= ?').bind(user.id, dayStart).first();
    if (r.c >= daily) throw new HttpError(429, `Daily spending cap reached ($${(daily / 1e6).toFixed(2)}). It resets at 00:00 UTC — you can change your cap in the dashboard.`, 'daily_limit');
    if (user.monthly_cap > 0) {
      const d = new Date(now() * 1000); const monthStart = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
      const m = await db.prepare('SELECT COALESCE(SUM(cost), 0) c FROM usage_logs WHERE user_id = ? AND created_at >= ?').bind(user.id, monthStart).first();
      if (m.c >= user.monthly_cap) throw new HttpError(429, `Monthly spending cap reached ($${(user.monthly_cap / 1e6).toFixed(2)}) — change it in the dashboard.`, 'monthly_limit');
    }
    // token cap also protects zero-priced models, which never move the dollar counter
    if (cfg.user_daily_tokens > 0 && r.t >= cfg.user_daily_tokens) throw new HttpError(429, `Daily token limit reached (${(cfg.user_daily_tokens / 1e6).toFixed(1)}M). It resets at 00:00 UTC.`, 'daily_limit');
  }
  if (cfg.global_daily_upstream_usd > 0) {
    const day = String(dayStart);
    if (budgetCache.day !== day || Date.now() - budgetCache.at > 60_000) {
      const r = await db.prepare('SELECT COALESCE(SUM(upstream_cost), 0) c FROM usage_logs WHERE created_at >= ?').bind(dayStart).first();
      budgetCache = { at: Date.now(), day, spent: r.c };
    }
    if (budgetCache.spent >= cfg.global_daily_upstream_usd * 1e6) {
      throw new HttpError(503, 'The service paused for today (daily budget reached). Please try again tomorrow.', 'budget_exhausted');
    }
  }
}

/** Hide upstream details (account names, partial keys, org ids) from students. */
export function scrub(text) {
  return String(text || '')
    .replace(/\b(sk|rk|pk|key|nvapi|or)-[A-Za-z0-9_\-]{6,}/gi, '[redacted]')
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, '[redacted]')
    .replace(/(org|organization|account|project)[-_ ]?id["':= ]+[^\s",}]+/gi, '$1 [redacted]')
    .slice(0, 600);
}

export async function cleanupSecurity(db, t = now()) {
  await db.batch([
    db.prepare('DELETE FROM blocks WHERE expires_at IS NOT NULL AND expires_at < ?').bind(t),
    db.prepare('DELETE FROM auth_failures WHERE last_at < ?').bind(t - 86400),
  ]);
}
