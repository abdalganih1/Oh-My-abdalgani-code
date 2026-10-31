// Reports for the admin (any period) and for each student (their own usage, explained).
// All money in µ$. Times are bucketed in the viewer's timezone (tz = minutes east of UTC).
import { now, toInt } from './util.js';

const MONTH = 30.4375 * 86400;

export function parseRange(url, defDays = 30) {
  const t = now();
  let to = toInt(url.searchParams.get('to'), t + 1); // exclusive bound → include this second
  let from = toInt(url.searchParams.get('from'), to - defDays * 86400);
  if (from >= to) from = to - 86400;
  const tz = Math.max(-720, Math.min(840, toInt(url.searchParams.get('tz'), 0)));
  const bucket = url.searchParams.get('bucket') || (to - from <= 2 * 86400 ? 'hour' : 'day');
  return { from, to, tz, shift: tz * 60, bucket: bucket === 'hour' ? 'hour' : 'day' };
}

const bucketExpr = (bucket) => (bucket === 'hour' ? "strftime('%Y-%m-%d %H:00', created_at + ?, 'unixepoch')" : "date(created_at + ?, 'unixepoch')");

/** Fixed monthly fees prorated over [from, to). */
function proratedFees(providers, from, to) {
  return providers.reduce((a, p) => a + Math.round((p.monthly_fee || 0) * (to - from) / MONTH), 0);
}

export async function adminReport(db, url) {
  const r = parseRange(url);
  const { from, to, shift } = r;
  const all = (sql, ...args) => db.prepare(sql).bind(...args).all().then((x) => x.results);
  const one = (sql, ...args) => db.prepare(sql).bind(...args).first();
  const W = 'created_at >= ? AND created_at < ?';
  const WA = (a) => `${a}.created_at >= ? AND ${a}.created_at < ?`;

  const [totals, series, models, users, heat, providers, fixed, revenue, issued, expenses, liability, months] = await Promise.all([
    one(`SELECT COUNT(*) requests, COALESCE(SUM(status >= 400), 0) errors, COUNT(DISTINCT user_id) active_users,
           COALESCE(SUM(prompt_tokens), 0) prompt_tokens, COALESCE(SUM(completion_tokens), 0) completion_tokens, COALESCE(SUM(cached_tokens), 0) cached_tokens,
           COALESCE(SUM(cost), 0) consumed, COALESCE(SUM(upstream_cost), 0) upstream_cost, COALESCE(AVG(CASE WHEN status < 400 THEN latency_ms END), 0) avg_latency
         FROM usage_logs WHERE ${W}`, from, to),
    all(`SELECT ${bucketExpr(r.bucket)} AS t, COUNT(*) requests, COALESCE(SUM(prompt_tokens + completion_tokens), 0) tokens,
           COALESCE(SUM(cost), 0) consumed, COALESCE(SUM(upstream_cost), 0) upstream_cost, COALESCE(SUM(status >= 400), 0) errors
         FROM usage_logs WHERE ${W} GROUP BY t ORDER BY t`, shift, from, to),
    all(`SELECT l.model_id, m.name, COUNT(*) requests, COUNT(DISTINCT l.user_id) users, COALESCE(SUM(l.prompt_tokens), 0) prompt_tokens,
           COALESCE(SUM(l.completion_tokens), 0) completion_tokens, COALESCE(SUM(l.cost), 0) consumed, COALESCE(SUM(l.upstream_cost), 0) upstream_cost,
           COALESCE(SUM(l.status >= 400), 0) errors
         FROM usage_logs l LEFT JOIN models m ON m.id = l.model_id WHERE ${WA('l')} GROUP BY l.model_id ORDER BY requests DESC LIMIT 25`, from, to),
    all(`SELECT l.user_id, u.name, u.email, COUNT(*) requests, COALESCE(SUM(l.prompt_tokens + l.completion_tokens), 0) tokens,
           COALESCE(SUM(l.cost), 0) consumed, COALESCE(SUM(l.upstream_cost), 0) upstream_cost, MAX(l.created_at) last_request,
           (SELECT l2.model_id FROM usage_logs l2 WHERE l2.user_id = l.user_id AND ${WA('l2')} GROUP BY l2.model_id ORDER BY COUNT(*) DESC LIMIT 1) AS top_model
         FROM usage_logs l LEFT JOIN users u ON u.id = l.user_id WHERE ${WA('l')} GROUP BY l.user_id ORDER BY requests DESC LIMIT 25`, from, to, from, to),
    all(`SELECT CAST(strftime('%w', created_at + ?, 'unixepoch') AS INTEGER) dow, CAST(strftime('%H', created_at + ?, 'unixepoch') AS INTEGER) hour,
           COUNT(*) requests, COALESCE(SUM(prompt_tokens + completion_tokens), 0) tokens
         FROM usage_logs WHERE ${W} GROUP BY dow, hour`, shift, shift, from, to),
    all(`SELECT l.provider_id, p.name, p.billing, COUNT(*) requests, COALESCE(SUM(l.status >= 400), 0) errors,
           COALESCE(SUM(l.prompt_tokens + l.completion_tokens), 0) tokens, COALESCE(SUM(l.upstream_cost), 0) upstream_cost,
           COALESCE(AVG(CASE WHEN l.status < 400 THEN l.latency_ms END), 0) avg_latency
         FROM usage_logs l LEFT JOIN providers p ON p.id = l.provider_id WHERE ${WA('l')} GROUP BY l.provider_id ORDER BY requests DESC`, from, to),
    all("SELECT id, name, monthly_fee FROM providers WHERE billing = 'subscription' AND monthly_fee > 0 AND archived_at IS NULL"),
    one(`SELECT COALESCE(SUM(sale_price), 0) revenue, COUNT(*) subscriptions, COALESCE(SUM(source LIKE 'coupon:%'), 0) coupons_redeemed
         FROM subscriptions WHERE ${W} AND source != 'playground'`, from, to),
    one(`SELECT COALESCE(SUM(CASE WHEN kind = 'usd' THEN total END), 0) usd, COALESCE(SUM(CASE WHEN kind = 'tokens' THEN total END), 0) tokens FROM subscriptions WHERE ${W} AND source != 'playground'`, from, to),
    one('SELECT COALESCE(SUM(amount), 0) amount FROM expenses WHERE spent_at >= ? AND spent_at < ?', from, to),
    one(`SELECT COALESCE(SUM(CASE WHEN kind = 'usd' THEN total - used END), 0) usd, COALESCE(SUM(CASE WHEN kind = 'tokens' THEN total - used END), 0) tokens
         FROM subscriptions WHERE disabled = 0 AND used < total AND source != 'playground' AND (expires_at IS NULL OR expires_at > ?)`, now()),
    monthly(db, from, to, shift),
  ]);

  const fees = proratedFees(fixed, from, to);
  const paid = totals.upstream_cost + expenses.amount + fees;
  return {
    range: r,
    totals: { ...totals, tokens: totals.prompt_tokens + totals.completion_tokens },
    money: {
      revenue: revenue.revenue, subscriptions: revenue.subscriptions, coupons_redeemed: revenue.coupons_redeemed,
      credit_issued_usd: issued.usd, credit_issued_tokens: issued.tokens, consumed: totals.consumed,
      upstream_usage: totals.upstream_cost, fixed_fees: fees, fixed_plans: fixed, expenses: expenses.amount,
      paid, profit: revenue.revenue - paid,
      outstanding_usd: liability.usd, outstanding_tokens: liability.tokens,
    },
    series, models, users, heat, providers, months,
  };
}

async function monthly(db, from, to, shift) {
  const m = "strftime('%Y-%m', ts + ?, 'unixepoch')";
  const q = (sql, ...a) => db.prepare(sql).bind(...a).all().then((x) => x.results);
  const [rev, up, exp, fixed] = await Promise.all([
    q(`SELECT ${m.replace('ts', 'created_at')} month, COALESCE(SUM(sale_price), 0) v FROM subscriptions WHERE created_at >= ? AND created_at < ? GROUP BY month`, shift, from, to),
    q(`SELECT ${m.replace('ts', 'created_at')} month, COALESCE(SUM(upstream_cost), 0) v, COALESCE(SUM(cost), 0) consumed FROM usage_logs WHERE created_at >= ? AND created_at < ? GROUP BY month`, shift, from, to),
    q(`SELECT ${m.replace('ts', 'spent_at')} month, COALESCE(SUM(amount), 0) v FROM expenses WHERE spent_at >= ? AND spent_at < ? GROUP BY month`, shift, from, to),
    q("SELECT COALESCE(SUM(monthly_fee), 0) fee FROM providers WHERE billing = 'subscription' AND archived_at IS NULL"),
  ]);
  const months = [...new Set([...rev, ...up, ...exp].map((x) => x.month))].sort();
  const fee = fixed[0]?.fee || 0;
  return months.map((month) => {
    const revenue = rev.find((x) => x.month === month)?.v || 0;
    const u = up.find((x) => x.month === month);
    const paid = (u?.v || 0) + (exp.find((x) => x.month === month)?.v || 0) + fee;
    return { month, revenue, consumed: u?.consumed || 0, paid, profit: revenue - paid };
  });
}

const csvCell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export async function exportCsv(db, url) {
  const { from, to } = parseRange(url);
  const { results } = await db.prepare(
    `SELECT l.created_at, u.name AS user, l.requested_model, l.model_id, l.provider_id, l.upstream_model, l.endpoint, l.status,
       l.prompt_tokens, l.completion_tokens, l.cached_tokens, l.cost, l.upstream_cost, l.latency_ms
     FROM usage_logs l LEFT JOIN users u ON u.id = l.user_id WHERE l.created_at >= ? AND l.created_at < ? ORDER BY l.id LIMIT 100000`
  ).bind(from, to).all();
  const head = ['time_utc', 'user', 'requested_model', 'model', 'provider', 'upstream_model', 'endpoint', 'status', 'prompt_tokens', 'completion_tokens', 'cached_tokens', 'charged_usd', 'upstream_cost_usd', 'latency_ms'];
  const rows = results.map((x) => [new Date(x.created_at * 1000).toISOString(), x.user, x.requested_model, x.model_id, x.provider_id, x.upstream_model, x.endpoint, x.status,
    x.prompt_tokens, x.completion_tokens, x.cached_tokens, (x.cost / 1e6).toFixed(6), (x.upstream_cost / 1e6).toFixed(6), x.latency_ms]);
  const body = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'); // BOM → Excel opens Arabic names correctly
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="abdalgani-usage-${new Date(from * 1000).toISOString().slice(0, 10)}_${new Date(to * 1000).toISOString().slice(0, 10)}.csv"` } });
}

/** A student's own usage, in plain terms: daily trend, where the credit went, how long it lasts. */
export async function userReport(db, user, url) {
  const r = parseRange(url, 30);
  const { from, to, shift } = r;
  const W = 'user_id = ? AND created_at >= ? AND created_at < ?';
  const WL = 'l.user_id = ? AND l.created_at >= ? AND l.created_at < ?';
  const q = (sql, ...a) => db.prepare(sql).bind(...a).all().then((x) => x.results);
  const [series, byModel, totals, week, subs] = await Promise.all([
    q(`SELECT date(created_at + ?, 'unixepoch') t, COUNT(*) requests, COALESCE(SUM(prompt_tokens + completion_tokens), 0) tokens, COALESCE(SUM(cost), 0) cost
       FROM usage_logs WHERE ${W} AND status < 400 GROUP BY t ORDER BY t`, shift, user.id, from, to),
    q(`SELECT l.model_id, m.name, COUNT(*) requests, COALESCE(SUM(l.prompt_tokens), 0) prompt_tokens, COALESCE(SUM(l.completion_tokens), 0) completion_tokens, COALESCE(SUM(l.cost), 0) cost
       FROM usage_logs l LEFT JOIN models m ON m.id = l.model_id WHERE ${WL} AND l.status < 400 GROUP BY l.model_id ORDER BY cost DESC, requests DESC`, user.id, from, to),
    db.prepare(`SELECT COUNT(*) requests, COALESCE(SUM(prompt_tokens), 0) prompt_tokens, COALESCE(SUM(completion_tokens), 0) completion_tokens, COALESCE(SUM(cost), 0) cost
       FROM usage_logs WHERE ${W} AND status < 400`).bind(user.id, from, to).first(),
    db.prepare(`SELECT COALESCE(SUM(cost), 0) cost, COALESCE(SUM(prompt_tokens + completion_tokens), 0) tokens, COUNT(*) requests
       FROM usage_logs WHERE user_id = ? AND created_at >= ? AND status < 400`).bind(user.id, now() - 7 * 86400).first(),
    q('SELECT * FROM subscriptions WHERE user_id = ? AND disabled = 0 AND used < total AND (expires_at IS NULL OR expires_at > ?)', user.id, now()),
  ]);
  const usdLeft = subs.filter((s) => s.kind === 'usd').reduce((a, s) => a + s.total - s.used, 0);
  const tokLeft = subs.filter((s) => s.kind === 'tokens').reduce((a, s) => a + s.total - s.used, 0);
  const perDayCost = week.cost / 7, perDayTokens = week.tokens / 7;
  return {
    range: r, series, by_model: byModel,
    totals: { ...totals, tokens: totals.prompt_tokens + totals.completion_tokens, avg_cost: totals.requests ? Math.round(totals.cost / totals.requests) : 0,
      avg_tokens: totals.requests ? Math.round((totals.prompt_tokens + totals.completion_tokens) / totals.requests) : 0 },
    burn: {
      per_day_cost: Math.round(perDayCost), per_day_tokens: Math.round(perDayTokens), per_day_requests: +(week.requests / 7).toFixed(1),
      usd_days_left: perDayCost > 0 ? Math.floor(usdLeft / perDayCost) : null,
      tokens_days_left: perDayTokens > 0 ? Math.floor(tokLeft / perDayTokens) : null,
    },
  };
}
