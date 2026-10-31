// Billing: cost calculation + choosing which subscription (wallet) pays.
import { MICRO, now } from './util.js';

/**
 * @param {object} model   row from `models`
 * @param {{prompt:number, completion:number, cached:number}} usage
 * @param {number|null} providerCostUsd  cost reported by upstream (OpenRouter usage.cost), USD
 * @returns {number} micro-USD
 */
export function computeCost(model, usage, providerCostUsd = null) {
  const p = Math.max(0, usage.prompt || 0);
  const c = Math.max(0, usage.completion || 0);
  const cached = Math.min(p, Math.max(0, usage.cached || 0));
  let cost;
  if (model.pricing_mode === 'request') {
    cost = model.price_request || 0;
  } else if (model.pricing_mode === 'provider' && typeof providerCostUsd === 'number' && providerCostUsd >= 0) {
    cost = providerCostUsd * MICRO;
  } else {
    const cacheRate = model.price_cache_read || model.price_in || 0;
    cost = ((p - cached) * (model.price_in || 0) + cached * cacheRate + c * (model.price_out || 0)) / MICRO;
  }
  cost = cost * (1 + (model.markup_pct || 0) / 100);
  return Math.ceil(Math.round(cost * 1000) / 1000); // round away float noise, then never under-charge
}

/** What the request cost US upstream (µ$). Fixed-fee plans → 0 (their monthly fee is reported separately). */
export function computeUpstreamCost(model, route, usage, providerCostUsd = null) {
  if (!route || route.billing === 'subscription') return 0;
  if (typeof providerCostUsd === 'number' && providerCostUsd >= 0) return Math.ceil(providerCostUsd * MICRO);
  const p = Math.max(0, usage.prompt || 0), c = Math.max(0, usage.completion || 0);
  const inRate = route.cost_in ?? model.price_in ?? 0, outRate = route.cost_out ?? model.price_out ?? 0;
  return Math.ceil((p * inRate + c * outRate) / MICRO);
}

/** Units a subscription is charged: tokens for token wallets, micro-USD for USD wallets. */
export function unitsFor(sub, usage, costMicro) {
  return sub.kind === 'tokens' ? (usage.prompt || 0) + (usage.completion || 0) : costMicro;
}

export function isSubUsable(sub, model, t = now()) {
  return !sub.disabled
    && sub.starts_at <= t
    && (sub.expires_at == null || sub.expires_at > t)
    && sub.used < sub.total
    && (sub.group_id == null || sub.group_id === model.group_id);
}

/**
 * Order: dedicated token wallet → general token wallet → dedicated USD → general USD,
 * then the one expiring soonest (so credit isn't wasted).
 */
export function pickSubscription(subs, model, t = now()) {
  const usable = subs.filter((s) => isSubUsable(s, model, t));
  const rank = (s) => (s.kind === 'tokens' ? 0 : 2) + (s.group_id ? 0 : 1);
  usable.sort((a, b) => rank(a) - rank(b) || (a.expires_at ?? Infinity) - (b.expires_at ?? Infinity) || a.id - b.id);
  return usable[0] || null;
}

export async function loadSubscriptions(db, userId) {
  const { results } = await db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(userId).all();
  return results || [];
}

/** Record usage + charge wallet atomically (single D1 batch). */
export async function settle(db, { user, keyId, model, routeInfo, endpoint, status, usage, providerCostUsd, latency, error, subscriptionId, requestedModel }) {
  const cost = status < 400 ? computeCost(model, usage, providerCostUsd) : 0;
  const upstreamCost = status < 400 ? computeUpstreamCost(model, routeInfo, usage, providerCostUsd) : 0;
  let charged = 0;
  let subId = subscriptionId ?? null;
  const stmts = [];
  if (status < 400 && subId) {
    const sub = await db.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(subId).first();
    if (sub) {
      charged = unitsFor(sub, usage, cost);
      if (charged > 0) stmts.push(db.prepare('UPDATE subscriptions SET used = used + ? WHERE id = ?').bind(charged, subId));
    }
  }
  stmts.push(db.prepare(
    `INSERT INTO usage_logs (user_id, api_key_id, model_id, provider_id, provider_key_id, endpoint, status,
       prompt_tokens, completion_tokens, cached_tokens, cost, subscription_id, charged, latency_ms, error, requested_model, upstream_model, upstream_cost)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(user.id, keyId ?? null, model.id, routeInfo?.provider_id ?? null, routeInfo?.key_id ?? null, endpoint, status,
    usage.prompt || 0, usage.completion || 0, usage.cached || 0, cost, subId, charged, latency ?? null,
    error ? String(error).slice(0, 500) : null, requestedModel ? String(requestedModel).slice(0, 120) : null, routeInfo?.upstream_model ?? null, upstreamCost));
  await db.batch(stmts);
  return { cost, charged, upstreamCost };
}
