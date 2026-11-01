// OpenRouter's public price list, and "auto" pricing: a model whose routes may serve DIFFERENT
// upstream models (e.g. `fast` → glm-5.3-flash on z.ai, deepseek-flash on Nous…) is billed at the
// OpenRouter price of whichever upstream model actually answered.
import { normalizeUpstreamModel } from './lifecycle.js';

const PRICE_KEYS = ['price_in', 'price_out', 'price_cache_read', 'price_cache_write'];

export async function fetchOpenRouterCatalog() {
  const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { accept: 'application/json', 'user-agent': 'abdalgani-gateway' } });
  if (!res.ok) throw new Error(`openrouter ${res.status}`);
  return ((await res.json()).data || []).filter((m) => m?.id && m.pricing).map((m) => {
    const n = normalizeUpstreamModel(m);
    return { id: n.upstream_id, name: n.name, price_in: n.price_in ?? 0, price_out: n.price_out ?? 0, price_cache_read: n.price_cache_read ?? 0, price_cache_write: n.price_cache_write ?? 0, free: n.free };
  }).filter((m) => m.price_in >= 0 && m.price_out >= 0); // OpenRouter uses -1 for "variable" (routers)
}

/** "anthropic/claude-sonnet-5.5:thinking" → "claude-sonnet-5-5" (so z.ai, NVIDIA, Nous, Anthropic ids line up). */
export const modelKey = (x) => String(x || '').toLowerCase().split('/').pop().replace(/^~/, '')
  .replace(/:(free|thinking|beta|extended|nitro|floor)$/, '').replace(/[._:\s]+/g, '-');

/** Build a lookup over the catalog: exact OpenRouter id first, then the normalized tail. Paid entries win over :free. */
export function catalogMatcher(catalog) {
  const byId = new Map(catalog.map((m) => [m.id.toLowerCase(), m]));
  const byKey = new Map();
  // the plain id beats variants (:nitro, :thinking…), and any paid entry beats :free
  const rank = (m) => (m.free ? 2 : m.id.includes(':') ? 1 : 0);
  for (const m of catalog) { const k = modelKey(m.id); const prev = byKey.get(k); if (!prev || rank(m) < rank(prev)) byKey.set(k, m); }
  return {
    exact: (id) => byId.get(String(id || '').toLowerCase()) || null,
    /** route → { hit, how } ; how = 'route' (an OpenRouter route) | 'name' */
    route(r) {
      if (r.provider_id === 'openrouter') { const h = byId.get(String(r.upstream_model).toLowerCase()); if (h) return { hit: h, how: 'route' }; }
      const h = byKey.get(modelKey(r.upstream_model));
      return h ? { hit: h, how: 'name' } : null;
    },
    name: (x) => byKey.get(modelKey(x)) || null,
  };
}

/**
 * Re-price every `auto` model: each route gets the OpenRouter price of its upstream model
 * (routes the admin priced by hand — price_ref = 'manual' — are kept), and the model's own
 * price becomes the most expensive route (what students see as "up to", and what reservations hold).
 * @returns {{models:number, routes:number, unmatched:string[]}}
 */
export async function refreshAutoPrices(db, { catalog = null, modelId = null } = {}) {
  const q = modelId ? db.prepare("SELECT id FROM models WHERE pricing_mode = 'auto' AND id = ?").bind(modelId) : db.prepare("SELECT id FROM models WHERE pricing_mode = 'auto'");
  const { results: models } = await q.all();
  if (!models.length) return { models: 0, routes: 0, unmatched: [] };
  catalog ||= await fetchOpenRouterCatalog();
  const match = catalogMatcher(catalog);
  const stmts = [], unmatched = [];
  let nRoutes = 0;
  for (const { id } of models) {
    const { results: routes } = await db.prepare('SELECT * FROM model_routes WHERE model_id = ?').bind(id).all();
    const top = Object.fromEntries(PRICE_KEYS.map((k) => [k, 0]));
    for (const r of routes) {
      let p = r;
      if (r.price_ref !== 'manual') {
        const m = match.route(r);
        if (m) {
          p = m.hit;
          stmts.push(db.prepare('UPDATE model_routes SET price_in = ?, price_out = ?, price_cache_read = ?, price_cache_write = ?, price_ref = ? WHERE id = ?')
            .bind(p.price_in, p.price_out, p.price_cache_read, p.price_cache_write, m.hit.id, r.id));
          nRoutes++;
        } else {
          unmatched.push(`${id} ← ${r.provider_id}/${r.upstream_model}`);
          stmts.push(db.prepare('UPDATE model_routes SET price_in = NULL, price_out = NULL, price_cache_read = NULL, price_cache_write = NULL, price_ref = NULL WHERE id = ?').bind(r.id));
          continue;
        }
      }
      if (!r.enabled || r.archived_at) continue;
      for (const k of PRICE_KEYS) top[k] = Math.max(top[k], p[k] || 0);
    }
    stmts.push(db.prepare('UPDATE models SET price_in = ?, price_out = ?, price_cache_read = ?, price_cache_write = ? WHERE id = ?')
      .bind(top.price_in, top.price_out, top.price_cache_read, top.price_cache_write, id));
  }
  if (stmts.length) await db.batch(stmts);
  return { models: models.length, routes: nRoutes, unmatched };
}
