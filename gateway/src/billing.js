// Billing: cost calculation + choosing which subscription (wallet) pays.
import { MICRO, now } from './util.js';

/**
 * @param {object} model   row from `models`
 * @param {{prompt:number, completion:number, cached:number}} usage
 * @param {number|null} providerCostUsd  cost reported by upstream (OpenRouter usage.cost), USD
 * @returns {number} micro-USD
 */
export function computeCost(model, usage, providerCostUsd = null, route = null) {
  // auto: the price of the route that actually answered (its OpenRouter price), else the model's table
  if (model.pricing_mode === 'auto' && route && route.price_in != null) {
    model = { ...model, price_in: route.price_in, price_out: route.price_out ?? 0, price_cache_read: route.price_cache_read ?? 0, price_cache_write: route.price_cache_write ?? 0 };
  }
  const p = Math.max(0, usage.prompt || 0);
  const c = Math.max(0, usage.completion || 0);
  const cached = Math.min(p, Math.max(0, usage.cached || 0));
  const written = Math.min(p - cached, Math.max(0, usage.cacheWrite || 0));
  let cost;
  if (model.pricing_mode === 'request') {
    cost = model.price_request || 0;
  } else if (model.pricing_mode === 'provider' && typeof providerCostUsd === 'number' && providerCostUsd >= 0) {
    cost = providerCostUsd * MICRO;
  } else {
    const cacheRate = model.price_cache_read || model.price_in || 0;
    const writeRate = model.price_cache_write || model.price_in || 0; // Anthropic: ~1.25× input
    cost = ((p - cached - written) * (model.price_in || 0) + cached * cacheRate + written * writeRate + c * (model.price_out || 0)) / MICRO;
  }
  cost = cost * (1 + (model.markup_pct || 0) / 100);
  return Math.ceil(Math.round(cost * 1000) / 1000); // round away float noise, then never under-charge
}

/** What the request cost US upstream (µ$). Fixed-fee plans → 0 (their monthly fee is reported separately). */
export function computeUpstreamCost(model, route, usage, providerCostUsd = null) {
  if (!route || route.billing === 'subscription') return 0;
  if (typeof providerCostUsd === 'number' && providerCostUsd >= 0) return Math.ceil(providerCostUsd * MICRO);
  const p = Math.max(0, usage.prompt || 0), c = Math.max(0, usage.completion || 0);
  const cached = Math.min(p, Math.max(0, usage.cached || 0));
  const written = Math.min(p - cached, Math.max(0, usage.cacheWrite || 0));
  const inRate = route.cost_in ?? model.price_in ?? 0, outRate = route.cost_out ?? model.price_out ?? 0;
  // cache reads are discounted upstream and writes may cost extra; use the model's cache prices when known
  const cacheRate = route.cost_in != null ? inRate : (model.price_cache_read || inRate);
  const writeRate = route.cost_in != null ? inRate : (model.price_cache_write || inRate);
  return Math.ceil(((p - cached - written) * inRate + cached * cacheRate + written * writeRate + c * outRate) / MICRO);
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
export function orderedSubscriptions(subs, model, t = now()) {
  const usable = subs.filter((s) => isSubUsable(s, model, t));
  const rank = (s) => (s.kind === 'tokens' ? 0 : 2) + (s.group_id ? 0 : 1);
  return usable.sort((a, b) => rank(a) - rank(b) || (a.expires_at ?? Infinity) - (b.expires_at ?? Infinity) || a.id - b.id);
}
export const pickSubscription = (subs, model, t = now()) => orderedSubscriptions(subs, model, t)[0] || null;

/** Rough token count of a request body (≈ 3.5 chars / token) — only used to size reservations. */
export function estimatePromptTokens(body) {
  const parts = [body.system, body.instructions, body.messages, body.input, body.tools];
  return Math.ceil(JSON.stringify(parts).length / 3.5);
}

/**
 * How much to hold on a wallet before calling upstream: `full` = worst case for this request,
 * `min` = what the wallet must at least have (prompt + a small answer).
 */
export function estimateReservation(model, body, sub, minOutput = 1024) {
  const prompt = estimatePromptTokens(body);
  const asked = Number(body.max_tokens || body.max_completion_tokens || body.max_output_tokens || 0) || model.max_output || 8192;
  const out = Math.min(asked, model.max_output || asked);
  const minOut = Math.min(out, minOutput);
  if (sub.kind === 'tokens') return { full: prompt + out, min: prompt + minOut };
  return { full: computeCost(model, { prompt, completion: out }), min: computeCost(model, { prompt, completion: minOut }) };
}

/**
 * Atomically hold credit (used += amount only if it still fits) so parallel requests can't
 * spend the same balance twice. Returns the held amount, or null if the wallet can't cover `min`.
 */
export async function reserve(db, sub, { full, min }) {
  const remaining = sub.total - sub.used;
  if (remaining < min) return null;
  const amount = Math.max(0, Math.min(full, remaining));
  if (amount === 0) return 0;
  const r = await db.prepare('UPDATE subscriptions SET used = used + ? WHERE id = ? AND used + ? <= total AND disabled = 0').bind(amount, sub.id, amount).run();
  return r.meta?.changes ? amount : null;
}

export async function loadSubscriptions(db, userId) {
  const { results } = await db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(userId).all();
  return results || [];
}

/** Record usage + charge wallet atomically (single D1 batch). */
export async function settle(db, { user, keyId, model, routeInfo, endpoint, status, usage, providerCostUsd, latency, error, subscriptionId, requestedModel, reserved = 0, ip = null, deviceId = null }) {
  const cost = status < 400 ? computeCost(model, usage, providerCostUsd, routeInfo) : 0;
  const upstreamCost = status < 400 ? computeUpstreamCost(model, routeInfo, usage, providerCostUsd) : 0;
  let charged = 0;
  let subId = subscriptionId ?? null;
  const stmts = [];
  if (subId) {
    const sub = await db.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(subId).first();
    if (sub) {
      charged = status < 400 ? unitsFor(sub, usage, cost) : 0;
      // replace the reservation with the real charge (refund on failure)
      const delta = charged - (reserved || 0);
      if (delta !== 0) stmts.push(db.prepare('UPDATE subscriptions SET used = MAX(0, used + ?) WHERE id = ?').bind(delta, subId));
    }
  }
  stmts.push(db.prepare(
    `INSERT INTO usage_logs (user_id, api_key_id, model_id, provider_id, provider_key_id, endpoint, status,
       prompt_tokens, completion_tokens, cached_tokens, cost, subscription_id, charged, latency_ms, error, requested_model, upstream_model, upstream_cost, ip, device_id, cache_write_tokens)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(user.id, keyId ?? null, model.id, routeInfo?.provider_id ?? null, routeInfo?.key_id ?? null, endpoint, status,
    usage.prompt || 0, usage.completion || 0, usage.cached || 0, cost, subId, charged, latency ?? null,
    error ? String(error).slice(0, 500) : null, requestedModel ? String(requestedModel).slice(0, 120) : null, routeInfo?.upstream_model ?? null, upstreamCost, ip, deviceId, usage.cacheWrite || 0));
  await db.batch(stmts);
  return { cost, charged, upstreamCost };
}
