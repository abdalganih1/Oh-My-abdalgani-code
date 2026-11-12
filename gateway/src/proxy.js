// The data plane: /v1/chat/completions, /v1/messages, /v1/models.
import { authUser } from './auth.js';
import { orderedSubscriptions, loadSubscriptions, settle, isSubUsable, estimateReservation, reserve } from './billing.js';
import { afterAuth, checkSpendCaps, scrub, noteSpend } from './security.js';
import {
  resolveModel, loadRoutes, attempts, isRetryable, markKeyFailure, markKeySuccess,
  upstreamHeaders, upstreamUrl, getGlobalAliases, applyCompat,
} from './routing.js';
import { anthropicToOpenAIRequest, openAIToAnthropicResponse, OpenAIToAnthropicStream, SSEParser } from './translate.js';
import { responsesToChatRequest, chatToResponsesResponse, ChatToResponsesStream } from './responses.js';
import { json, apiError, readJson, HttpError } from './util.js';
import { recordOk, recordFail, countsAsFailure } from './lifecycle.js';
import { fingerprint, noteRequest, pauseForLoop } from './detect.js';

// ── usage extraction ──
export function usageFromOpenAI(u) {
  if (!u) return null;
  return {
    prompt: u.prompt_tokens || 0,
    completion: u.completion_tokens || 0,
    cached: u.prompt_tokens_details?.cached_tokens || 0,
    cacheWrite: u.prompt_tokens_details?.cache_write_tokens || u.cache_creation_input_tokens || 0,
    providerCost: typeof u.cost === 'number' ? u.cost : null,
  };
}
export function usageFromAnthropic(u, prev = null) {
  if (!u && !prev) return null;
  u = u || {};
  const base = prev || { prompt: 0, completion: 0, cached: 0, cacheWrite: 0, providerCost: null };
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const prompt = u.input_tokens != null ? u.input_tokens + cacheRead + cacheWrite : base.prompt;
  return {
    prompt: Math.max(prompt, base.prompt),
    completion: Math.max(u.output_tokens || 0, base.completion),
    cached: Math.max(cacheRead, base.cached),
    cacheWrite: Math.max(cacheWrite, base.cacheWrite || 0),
    providerCost: typeof u.cost === 'number' ? u.cost : base.providerCost,
  };
}
const ZERO = { prompt: 0, completion: 0, cached: 0, cacheWrite: 0, providerCost: null };

function buildUpstreamBody(clientFormat, m, body, route, model) {
  let out;
  if (clientFormat === 'responses') out = responsesToChatRequest(body, route.upstream_model).chat;
  else if (m.mode === 'translate') out = anthropicToOpenAIRequest(body, route.upstream_model, { keepCache: keepsCacheControl(route) });
  else {
    out = { ...body, model: route.upstream_model };
    if (clientFormat === 'openai' && out.stream) out.stream_options = { ...(out.stream_options || {}), include_usage: true };
  }
  // OpenRouter returns the real cost in usage.cost when asked → enables pricing_mode "provider"
  if (m.format === 'openai' && route.id === 'openrouter') out.usage = { include: true };
  // tools send a reasoning effort to every model; non-reasoning upstreams reject it with 400
  if (!model.reasoning) { delete out.reasoning_effort; delete out.reasoning; if (m.format === 'anthropic') delete out.thinking; }
  if (m.format === 'openai') applyCompat(out, route);
  return out;
}

/** Does this upstream accept Anthropic-style `cache_control` parts in OpenAI format? (compat.cache_control overrides) */
function keepsCacheControl(route) {
  let c = null; try { c = route.compat ? JSON.parse(route.compat).cache_control : null; } catch { /* bad JSON */ }
  if (typeof c === 'boolean') return c;
  return route.id === 'openrouter' || /claude|anthropic|gemini/i.test(route.upstream_model || '');
}

/** Pick how to talk to a route for the client's format; null = route can't serve it. */
function modeFor(clientFormat, route) {
  if (clientFormat === 'responses') return route.openai_base_url ? { mode: 'translate', format: 'openai' } : null;
  if (clientFormat === 'anthropic') {
    if (route.anthropic_base_url) return { mode: 'native', format: 'anthropic' };
    if (route.openai_base_url) return { mode: 'translate', format: 'openai' };
    return null;
  }
  return route.openai_base_url ? { mode: 'native', format: 'openai' } : null;
}

// failover deadlines; the last option left gets longer ones (failing fast there helps nobody)
const UPSTREAM_FIRST_BYTE_S = 60, UPSTREAM_TOTAL_S = 100;
const UPSTREAM_FIRST_BYTE_LAST_S = 180, UPSTREAM_TOTAL_LAST_S = 300;
const RATE_LIMIT_RETRIES = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Delay before retrying a 429: honour a short Retry-After, else back off 1.5s, 3s. */
export function retryDelayMs(retryAfter, attempt) {
  const s = Number(retryAfter);
  if (Number.isFinite(s) && s > 0) return Math.min(s, 8) * 1000;
  return 1500 * (attempt + 1);
}

/** An SSE error event in the client's own format, sent when the upstream stream breaks. */
export function streamErrorEvent(clientFormat) {
  const message = 'The provider connection dropped mid-answer. Please retry.';
  if (clientFormat === 'anthropic') {
    return `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message } })}\n\n`;
  }
  if (clientFormat === 'responses') {
    return `event: error\ndata: ${JSON.stringify({ type: 'error', code: 'upstream_error', message, param: null })}\n\n`;
  }
  return `data: ${JSON.stringify({ error: { message, type: 'upstream_error', code: 'stream_interrupted' } })}\n\n`;
}

export async function handleCompletion(request, env, ctx, clientFormat, sec = {}) {
  const started = Date.now();
  const { user, keyId } = await authUser(request, env, ctx);
  const cfg = sec.cfg || {};
  const { device } = await afterAuth(request, env, ctx, { user, keyId, ip: sec.ip, cfg });
  await checkSpendCaps(env, user, cfg);
  const body = await readJson(request);
  // runaway-agent guard: the same last turn resent again and again → pause this student briefly
  if (cfg.loop_guard_repeats > 0 && noteRequest(user.id, await fingerprint(body), cfg)) {
    await pauseForLoop(env.DB, user, cfg, 'loop');
    throw new HttpError(429, `Your tool sent the same request ${cfg.loop_guard_repeats} times in ${cfg.loop_guard_window_s}s — keys paused ${cfg.loop_guard_pause_min} min to protect your balance. Check the agent isn't stuck.`, 'loop_guard');
  }
  const model = await resolveModel(env.DB, user.id, body.model);
  const requestedName = body.model;

  const candidates = orderedSubscriptions(await loadSubscriptions(env.DB, user.id), model);
  if (!candidates.length) {
    throw new HttpError(402,
      `No active subscription covers model "${model.id}"${model.group_id ? ` (group: ${model.group_id})` : ''}. ` +
      'Ask your administrator for a coupon and redeem it in the dashboard.', 'insufficient_quota');
  }
  // hold the estimated cost first: no request can spend more than the wallet really has,
  // and parallel requests can't spend the same balance twice
  let sub = null, reserved = 0;
  for (const c of candidates) {
    const held = await reserve(env.DB, c, estimateReservation(model, body, c, cfg.min_reserve_output_tokens || 1024));
    if (held !== null) { sub = c; reserved = held; break; }
  }
  if (!sub) throw new HttpError(402, 'Your remaining balance is too low for this request. Start a new (shorter) conversation or redeem a coupon.', 'insufficient_quota');

  let routes = await loadRoutes(env.DB, model.id);
  // admin playground can pin one route (to test a specific provider); ignored for students
  const pin = user.internal ? Number(request.headers.get('x-abd-route') || 0) : 0;
  if (pin) routes = routes.filter((r) => r.route_id === pin);
  if (!routes.length) throw new HttpError(503, `Model "${model.id}" has no active route`, 'service_unavailable');

  const endpoint = { anthropic: '/v1/messages', responses: '/v1/responses' }[clientFormat] || '/v1/chat/completions';
  const customTools = clientFormat === 'responses' ? responsesToChatRequest(body, '').customTools : null;
  const finish = (routeInfo, status, usage, error) => settle(env.DB, {
    user, keyId, model, routeInfo, endpoint, status, usage: usage || ZERO, requestedModel: requestedName,
    providerCostUsd: usage?.providerCost ?? null, latency: Date.now() - started, error, subscriptionId: sub.id,
    reserved, ip: sec.ip || null, deviceId: device?.id || null,
  }).then((r) => { noteSpend(r.upstreamCost); return r; });

  let lastStatus = 503, lastError = 'No provider key available for this model';
  const rateLimitRetries = new Map();
  let tried = 0;
  // same student → same key (provider prompt caches are per account), different students spread by weight
  const plan = [];
  for await (const a of attempts(env, routes, { seed: user.id })) if (modeFor(clientFormat, a.route)) plan.push(a);
  for (let i = 0; i < plan.length; i++) {
    const { route, key, secret } = plan[i];
    const m = modeFor(clientFormat, route);
    // nothing left to fail over to → be patient with a slow provider instead of cutting it off at 60s
    const isLast = i === plan.length - 1;
    const waitS = body.stream ? (isLast ? UPSTREAM_FIRST_BYTE_LAST_S : UPSTREAM_FIRST_BYTE_S) : (isLast ? UPSTREAM_TOTAL_LAST_S : UPSTREAM_TOTAL_S);
    tried++;
    const routeInfo = { provider_id: route.id, key_id: key.id, upstream_model: route.upstream_model, billing: route.billing, cost_in: route.cost_in, cost_out: route.cost_out,
      price_in: route.r_price_in, price_out: route.r_price_out, price_cache_read: route.r_price_cache_read, price_cache_write: route.r_price_cache_write };
    // tell the student which real model answered (the body's `model` too — aliases stay transparent)
    const realHeaders = {
      'x-abdalgani-model': model.id,
      'x-abdalgani-upstream': `${route.id}/${route.upstream_model}`,
      ...(requestedName !== model.id ? { 'x-abdalgani-alias': String(requestedName) } : {}),
    };
    let upstream;
    // a provider that hangs (NVIDIA queues can sit >2 min) must not hold the student: give up and fail over
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), waitS * 1000);
    try {
      upstream = await fetch(upstreamUrl(route, m.format), {
        method: 'POST',
        headers: upstreamHeaders(route, secret, m.format, request.headers),
        body: JSON.stringify(buildUpstreamBody(clientFormat, m, body, route, model)),
        signal: ac.signal,
      });
      if (body.stream) clearTimeout(timer); // headers arrived; the stream itself may run long
    } catch (e) {
      clearTimeout(timer);
      const timedOut = ac.signal.aborted;
      lastStatus = timedOut ? 504 : 502; lastError = timedOut ? `timeout: no response from ${route.id} within ${waitS}s` : `network error: ${e?.message || e}`;
      ctx.waitUntil(markKeyFailure(env.DB, key.id, 0, lastError));
      ctx.waitUntil(recordFail(env.DB, route.id, route.route_id, 0, lastError));
      continue;
    }

    if (!upstream.ok) {
      const text = await upstream.text().finally(() => clearTimeout(timer));
      lastStatus = upstream.status; lastError = text.slice(0, 1000);
      if (countsAsFailure(upstream.status)) ctx.waitUntil(recordFail(env.DB, route.id, route.route_id, upstream.status, text));
      if (isRetryable(upstream.status)) {
        // a 429 burst on the only key left (Z.ai: "1302 Rate limit reached") clears in seconds:
        // wait and retry the same key instead of failing the student and parking the key
        const r = rateLimitRetries.get(key.id) || 0;
        if (upstream.status === 429 && isLast && r < RATE_LIMIT_RETRIES) {
          rateLimitRetries.set(key.id, r + 1);
          await sleep(retryDelayMs(upstream.headers.get('retry-after'), r));
          i--; tried--;
          continue;
        }
        ctx.waitUntil(markKeyFailure(env.DB, key.id, upstream.status, text));
        continue;
      }
      // client error (400/404/422): don't burn other keys, relay it
      ctx.waitUntil(finish(routeInfo, upstream.status, null, text));
      return new Response(scrub(text), { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', ...realHeaders } });
    }

    ctx.waitUntil(markKeySuccess(env.DB, key.id));
    ctx.waitUntil(recordOk(env.DB, route.id, route.route_id));
    const ctype = upstream.headers.get('content-type') || '';
    const isStream = !!body.stream && ctype.includes('text/event-stream');

    if (!isStream) {
      const data = await upstream.json().finally(() => clearTimeout(timer));
      let usage, out;
      if (m.format === 'anthropic') { usage = usageFromAnthropic(data.usage); out = { ...data, model: model.id }; }
      else {
        usage = usageFromOpenAI(data.usage);
        out = clientFormat === 'responses' ? chatToResponsesResponse(data, model.id, body, customTools)
          : m.mode === 'translate' ? openAIToAnthropicResponse(data, model.id) : { ...data, model: model.id };
      }
      ctx.waitUntil(finish(routeInfo, 200, usage));
      return json(out, 200, realHeaders);
    }

    // ── streaming: pass bytes through (or translate) while sniffing usage ──
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const parser = new SSEParser();
    const conv = clientFormat === 'responses' ? new ChatToResponsesStream(model.id, body, customTools)
      : m.mode === 'translate' ? new OpenAIToAnthropicStream(model.id) : null;
    let usage = null;

    const pump = (async () => {
      const reader = upstream.body.getReader();
      let errMsg = null, clientGone = false;
      const send = async (bytes) => {
        try { await writer.write(bytes); } catch { clientGone = true; throw new Error('client disconnected'); }
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          let outText = conv ? '' : null;
          for (const f of parser.feed(text)) {
            if (!f.data || f.data === '[DONE]') continue;
            let obj; try { obj = JSON.parse(f.data); } catch { continue; }
            if (m.format === 'anthropic') {
              if (obj.type === 'message_start') usage = usageFromAnthropic(obj.message?.usage, usage);
              else if (obj.type === 'message_delta') usage = usageFromAnthropic(obj.usage, usage);
            } else {
              if (obj.usage) usage = usageFromOpenAI(obj.usage);
              if (conv) outText += conv.push(obj);
            }
          }
          if (conv) { if (outText) await send(encoder.encode(outText)); }
          else await send(value);
        }
        if (conv) await send(encoder.encode(conv.finish()));
      } catch (e) {
        errMsg = clientGone ? 'client disconnected' : `stream aborted: ${e?.message || e || 'unknown error'}`;
        try { reader.cancel().catch(() => {}); } catch { /* already closed */ }
        // the provider dropped mid-answer: say so in-band, or the tool takes a cut-off reply as complete
        if (!clientGone) { try { await writer.write(encoder.encode(streamErrorEvent(clientFormat))); } catch { /* client gone */ } }
      } finally {
        try { await writer.close(); } catch { /* client went away */ }
        await finish(routeInfo, 200, usage, errMsg);
      }
    })();
    ctx.waitUntil(pump);

    return new Response(readable, {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', ...realHeaders },
    });
  }

  let why = 'not configured';
  if (!tried) {
    const usable = routes.filter((r) => modeFor(clientFormat, r));
    const ids = [...new Set(usable.map((r) => r.id))];
    const keys = ids.length ? await env.DB.prepare(`SELECT COUNT(*) n FROM provider_keys WHERE enabled = 1 AND provider_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).first() : { n: 0 };
    if (keys.n) why = 'keys cooling down';
    lastError = !usable.length ? `No route of "${model.id}" supports the ${clientFormat} API${pin ? ' (pinned route)' : ''}`
      : keys.n ? `All provider keys for "${model.id}" are cooling down after recent errors` : `No enabled provider key for "${model.id}" (${ids.join(', ')})`;
  }
  ctx.waitUntil(finish(null, lastStatus >= 400 ? lastStatus : 502, null, lastError));
  // the full upstream error stays in the admin's usage log; students get no provider details
  return apiError(lastStatus >= 400 ? lastStatus : 502, `The model "${model.id}" is temporarily unavailable (upstream ${tried ? lastStatus : why}). Try again shortly or pick another model.`, 'upstream_error');
}

/** Models the caller can actually use right now + their stable aliases. */
export async function handleModels(request, env, ctx, sec = {}) {
  const { user, keyId } = await authUser(request, env, ctx);
  await afterAuth(request, env, ctx, { user, keyId, ip: sec.ip, cfg: sec.cfg || {} });
  const { results: models } = await env.DB.prepare("SELECT * FROM models WHERE status NOT IN ('hidden','archived') ORDER BY sort, id").all();
  const subs = await loadSubscriptions(env.DB, user.id);
  const usable = models.filter((m) => subs.some((s) => isSubUsable(s, m)));
  const created = (m) => m.created_at;
  const data = usable.map((m) => ({
    id: m.id, object: 'model', created: created(m), owned_by: 'abdalgani',
    name: m.name, context_length: m.context_length, max_output_tokens: m.max_output, reasoning: !!m.reasoning, vision: !!m.vision, status: m.status, group: m.group_id,
  }));
  const { results: mine } = await env.DB.prepare('SELECT alias, model_id FROM user_aliases WHERE user_id = ?').bind(user.id).all();
  const aliases = { ...(await getGlobalAliases(env.DB)) };
  for (const a of mine) aliases[a.alias] = a.model_id;
  for (const [alias, target] of Object.entries(aliases)) {
    const m = usable.find((x) => x.id === target);
    if (m) data.push({ id: alias, object: 'model', created: m.created_at, owned_by: 'abdalgani', name: `${alias} → ${m.name}`, context_length: m.context_length, max_output_tokens: m.max_output, reasoning: !!m.reasoning, vision: !!m.vision, alias_of: m.id, alias_of_name: m.name });
  }
  return json({ object: 'list', data });
}

/** Rough count for Claude Code's /v1/messages/count_tokens preflight. */
export async function handleCountTokens(request, env, ctx) {
  await authUser(request, env, ctx);
  const body = await readJson(request);
  const chars = JSON.stringify([body.system, body.messages, body.tools]).length;
  return json({ input_tokens: Math.ceil(chars / 3.5) });
}
