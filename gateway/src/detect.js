// Abuse detection.
//  • loopGuard (inline, per request, in-memory): an agent stuck repeating the same request
//    burns money fast — pause that student's keys for a few minutes and raise an alert.
//  • runDetectors (cron every 30 min + "scan now"): bounded GROUP BY queries over the last
//    24h; each finding becomes ONE alert per (rule, subject, day) — never a flood.
import { now, sha256Hex } from './util.js';

const day = (t = now()) => new Date(t * 1000).toISOString().slice(0, 10);

export async function raiseAlert(db, { rule, user_id = null, ip = null, severity = 'warn', message, data = null, action = null }, t = now()) {
  const r = await db.prepare(`INSERT OR IGNORE INTO alerts (rule, user_id, ip, day, severity, message, data, action, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    // UNIQUE treats NULLs as distinct → store '' / 0 so the same alert really dedupes
    .bind(rule, user_id ?? 0, ip ?? '', day(t), severity, message, data ? JSON.stringify(data) : null, action, t).run();
  if (r.meta?.changes) {
    await db.prepare('INSERT INTO events (kind, message, data) VALUES (?,?,?)').bind('abuse_alert', `🚨 ${message}`, JSON.stringify({ rule, user_id, ip })).run();
    return true;
  }
  return false;
}

// ── inline loop guard ──
const recent = new Map(); // userId → { fp → [timestamps] } (per isolate; bounded below)

/** Fingerprint = model + the last message only (agents in a loop resend the same last turn). */
export async function fingerprint(body) {
  const msgs = body.messages || (Array.isArray(body.input) ? body.input : [body.input]);
  const last = Array.isArray(msgs) ? msgs[msgs.length - 1] : msgs;
  return (await sha256Hex(`${body.model}|${JSON.stringify(last ?? '')}`)).slice(0, 16);
}

/** Returns true when this request is the Nth identical one inside the window. */
export function noteRequest(userId, fp, cfg, t = Date.now()) {
  const win = (cfg.loop_guard_window_s || 120) * 1000;
  let u = recent.get(userId);
  if (!u) { u = new Map(); recent.set(userId, u); }
  const arr = (u.get(fp) || []).filter((x) => t - x < win);
  arr.push(t);
  u.set(fp, arr);
  if (u.size > 200) u.delete(u.keys().next().value);           // memory bounds
  if (recent.size > 5000) recent.delete(recent.keys().next().value);
  return arr.length >= (cfg.loop_guard_repeats || 25);
}

export async function pauseForLoop(db, user, cfg, fp, t = now()) {
  const mins = cfg.loop_guard_pause_min || 10;
  await db.prepare(`INSERT INTO blocks (kind, value, reason, auto, expires_at) VALUES ('user', ?, ?, 1, ?)
      ON CONFLICT(kind, value) DO UPDATE SET reason = excluded.reason, expires_at = excluded.expires_at`)
    .bind(String(user.id), `auto: agent loop (${cfg.loop_guard_repeats} identical requests in ${cfg.loop_guard_window_s}s)`, t + mins * 60).run();
  recent.delete(user.id);
  await raiseAlert(db, {
    rule: 'agent_loop', user_id: user.id, severity: 'high',
    message: `الطالب ${user.name}: أداة عالقة بحلقة — ${cfg.loop_guard_repeats} طلب متطابق خلال ${cfg.loop_guard_window_s} ثانية. أُوقفت مفاتيحه ${mins} دقائق تلقائياً.`,
    data: { fp }, action: `paused ${mins} min`,
  }, t);
}

// ── cron detectors ──
export async function runDetectors(env, cfg, t = now()) {
  const db = env.DB;
  const since = t - 86400, out = [];
  const users = new Map((await db.prepare('SELECT id, name FROM users').all()).results.map((u) => [u.id, u.name]));
  const nm = (id) => users.get(id) || `#${id}`;
  // Only real students count: the admin playground (internal user, hit from many networks by
  // design) and logs of deleted test accounts would otherwise raise false shared-IP/many-IP alerts.
  const q = (sql, ...a) => db.prepare(sql).bind(...a).all().then((r) => r.results);
  const REAL = 'user_id IN (SELECT id FROM users WHERE internal = 0)';

  // 1. heavy day + spike vs the student's own 7-day average
  const vol = await q(`SELECT user_id, COUNT(*) req, COALESCE(SUM(prompt_tokens + completion_tokens), 0) tok, COALESCE(SUM(cost), 0) cost
      FROM usage_logs WHERE created_at > ? AND ${REAL} GROUP BY user_id`, since);
  const base = new Map((await q(`SELECT user_id, COUNT(*) / 7.0 avg FROM usage_logs WHERE created_at > ? AND created_at <= ? AND ${REAL} GROUP BY user_id`, t - 8 * 86400, since)).map((r) => [r.user_id, r.avg]));
  for (const v of vol) {
    if (cfg.alert_daily_requests > 0 && v.req >= cfg.alert_daily_requests) {
      if (await raiseAlert(db, { rule: 'heavy_day', user_id: v.user_id, message: `الطالب ${nm(v.user_id)} أرسل ${v.req} طلب خلال 24 ساعة (${(v.tok / 1e6).toFixed(1)}M توكن، $${(v.cost / 1e6).toFixed(2)})`, data: v }, t)) out.push('heavy_day');
    }
    const avg = base.get(v.user_id) || 0;
    if (cfg.alert_spike_factor > 0 && avg >= 20 && v.req >= avg * cfg.alert_spike_factor) {
      if (await raiseAlert(db, { rule: 'spike', user_id: v.user_id, message: `قفزة مفاجئة عند ${nm(v.user_id)}: ${v.req} طلب اليوم مقابل معدل ${Math.round(avg)} باليوم`, data: { ...v, avg } }, t)) out.push('spike');
    }
  }

  // 2. one student's key from many networks (shared / leaked key)
  for (const r of await q(`SELECT user_id, COUNT(DISTINCT ip) ips, GROUP_CONCAT(DISTINCT ip) list FROM usage_logs WHERE created_at > ? AND ip IS NOT NULL AND ${REAL} GROUP BY user_id HAVING ips >= ?`, since, cfg.alert_ips_per_user || 4)) {
    if (await raiseAlert(db, { rule: 'many_ips', user_id: r.user_id, severity: 'high', message: `مفتاح ${nm(r.user_id)} استُخدم من ${r.ips} شبكات مختلفة خلال 24 ساعة — ممكن يكون مشارك أو مسرّب`, data: { ips: String(r.list).split(',').slice(0, 20) } }, t)) out.push('many_ips');
  }

  // 3. one network driving many accounts (account farming)
  for (const r of await q(`SELECT ip, COUNT(DISTINCT user_id) users FROM usage_logs WHERE created_at > ? AND ip IS NOT NULL AND ${REAL} GROUP BY ip HAVING users >= ?`, since, cfg.alert_users_per_ip || 4)) {
    if (await raiseAlert(db, { rule: 'shared_ip', ip: r.ip, severity: 'info', message: `${r.users} حسابات مختلفة من نفس الشبكة ${r.ip} (ممكن مختبر جامعة… أو حسابات وهمية)`, data: r }, t)) out.push('shared_ip');
  }

  // 4. mostly-failing traffic (probing models / limits) — last hour
  for (const r of await q(`SELECT user_id, COUNT(*) req, SUM(status >= 400) err FROM usage_logs WHERE created_at > ? AND ${REAL} GROUP BY user_id HAVING req >= 50`, t - 3600)) {
    if (r.err / r.req >= (cfg.alert_error_rate || 0.5)) {
      if (await raiseAlert(db, { rule: 'errors', user_id: r.user_id, message: `${nm(r.user_id)}: ${r.err} من ${r.req} طلب فشلت خلال ساعة — ممكن سكربت عم يجرّب`, data: r }, t)) out.push('errors');
    }
  }

  // 5. sustained repetition the in-memory guard may have missed (spread across isolates)
  for (const r of await q(`SELECT user_id, model_id, prompt_tokens, completion_tokens, COUNT(*) n FROM usage_logs WHERE created_at > ? AND ${REAL}
      GROUP BY user_id, model_id, prompt_tokens, completion_tokens HAVING n >= ?`, t - 1800, Math.max(30, (cfg.loop_guard_repeats || 25) * 2))) {
    if (await raiseAlert(db, { rule: 'repeat_pattern', user_id: r.user_id, message: `${nm(r.user_id)}: ${r.n} طلب بنفس الحجم بالضبط على ${r.model_id} خلال 30 دقيقة — غالباً أداة عالقة`, data: r }, t)) out.push('repeat_pattern');
  }

  // 6. mass sign-ups from one network
  for (const r of await q(`SELECT created_ip ip, COUNT(*) n FROM users WHERE self_signup = 1 AND created_at > ? AND created_ip IS NOT NULL GROUP BY created_ip HAVING n >= ?`, since, cfg.signup_per_ip_day || 3)) {
    if (await raiseAlert(db, { rule: 'signups', ip: r.ip, severity: 'warn', message: `${r.n} حسابات جديدة من ${r.ip} خلال 24 ساعة`, data: r }, t)) out.push('signups');
  }

  await db.prepare('DELETE FROM alerts WHERE created_at < ?').bind(t - 90 * 86400).run();
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t).run();
  return out;
}
