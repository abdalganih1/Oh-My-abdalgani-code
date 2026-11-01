// abdalgani gateway — Cloudflare Worker entry.
//   /v1/*        OpenAI (chat + responses) + Anthropic compatible data plane
//   /api/me/*    student dashboard API
//   /api/admin/* admin API
//   everything else → static dashboards in ./public (Workers Assets)
import { handleCompletion, handleModels, handleCountTokens } from './proxy.js';
import { handleAdmin } from './api/admin.js';
import { handleMe } from './api/user.js';
import { apiError, HttpError, json } from './util.js';
import { runMaintenance } from './lifecycle.js';
import { refreshAutoPrices } from './prices.js';
import { preflight, authFailure, clientIp, cleanupSecurity } from './security.js';
import { handleAuth } from './accounts.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,x-api-key,anthropic-version,anthropic-beta,http-referer,x-title',
  'access-control-max-age': '86400',
  'access-control-expose-headers': 'x-abdalgani-model,x-abdalgani-upstream,x-abdalgani-alias',
};

function withCors(res) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  h.set('x-content-type-options', 'nosniff');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export async function route(request, env, ctx) {
  const url = new URL(request.url);
  // tolerate base URLs with or without /v1 and the /api prefix some tools add
  let p = url.pathname.replace(/\/+$/, '') || '/';
  if (p.startsWith('/api/v1/')) p = p.slice(4);
  const m = request.method;

  if (m === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (p === '/health') return json({ ok: true, service: 'abdalgani-gateway' });
  const api = p.startsWith('/v1/') || p.startsWith('/api/') || p === '/chat/completions' || p === '/messages' || p === '/responses' || p === '/models';
  if (!api) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });

  // blocklist, size limit and per-IP rate limit before touching any credential
  const sec = await preflight(request, env);
  try {
    return await dispatch(request, env, ctx, p, m, sec);
  } catch (e) {
    // (login failures are counted inside handleAuth, together with the per-account lockout)
    if (e instanceof HttpError && e.status === 401 && !p.startsWith('/api/auth')) ctx.waitUntil(authFailure(env, sec.ip, p.startsWith('/api/admin') ? 'admin' : 'key'));
    throw e;
  }
}

async function dispatch(request, env, ctx, p, m, sec) {

  if (p === '/v1/chat/completions' || p === '/chat/completions') {
    if (m !== 'POST') throw new HttpError(405, 'Use POST');
    return handleCompletion(request, env, ctx, 'openai', sec);
  }
  if (p === '/v1/messages' || p === '/messages') {
    if (m !== 'POST') throw new HttpError(405, 'Use POST');
    return handleCompletion(request, env, ctx, 'anthropic', sec);
  }
  if (p === '/v1/responses' || p === '/responses') {
    if (m !== 'POST') throw new HttpError(405, 'Use POST');
    return handleCompletion(request, env, ctx, 'responses', sec);
  }
  if (p === '/v1/messages/count_tokens') return handleCountTokens(request, env, ctx);
  if ((p === '/v1/models' || p === '/models') && m === 'GET') return handleModels(request, env, ctx, sec);
  if (p.startsWith('/api/auth')) return handleAuth(request, env, ctx, p, sec);
  if (p.startsWith('/api/admin')) return handleAdmin(request, env, ctx, p);
  if (p.startsWith('/api/me')) return handleMe(request, env, ctx, p, sec);
  throw new HttpError(404, `Unknown endpoint ${m} ${p}`, 'not_found_error');
}

export default {
  async fetch(request, env, ctx) {
    try {
      return withCors(await route(request, env, ctx));
    } catch (e) {
      if (e instanceof HttpError) return withCors(apiError(e.status, e.message, e.type));
      console.error(e);
      return withCors(apiError(500, `Internal error: ${e.message}`, 'server_error'));
    }
  },

  // Cron Trigger (wrangler.toml [triggers]) — discovery, health archiving, "new" expiry, alerts.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMaintenance(env).then((s) => console.log('maintenance', JSON.stringify(s))).catch((e) => console.error('maintenance failed', e)));
    ctx.waitUntil(cleanupSecurity(env.DB).catch(() => {}));
    // auto-priced models follow OpenRouter's price list (cheap: one fetch, only when such models exist)
    ctx.waitUntil(refreshAutoPrices(env.DB).catch((e) => console.error('auto prices failed', e)));
  },
};
