// The data plane: /v1/chat/completions, /v1/messages, /v1/models.
import { authUser } from './auth.js';
import { pickSubscription, loadSubscriptions, settle, isSubUsable } from './billing.js';
import {
  resolveModel, loadRoutes, attempts, isRetryable, markKeyFailure, markKeySuccess,
  upstreamHeaders, upstreamUrl, getGlobalAliases, applyCompat,
} from './routing.js';
import { anthropicToOpenAIRequest, openAIToAnthropicResponse, OpenAIToAnthropicStream, SSEParser } from './translate.js';
import { responsesToChatRequest, chatToResponsesResponse, ChatToResponsesStream } from './responses.js';
import { json, apiError, readJson, HttpError } from './util.js';

// ── usage extraction ──
export function usageFromOpenAI(u) {
  if (!u) return null;
  return {
    prompt: u.prompt_tokens || 0,
    completion: u.completion_tokens || 0,
    cached: u.prompt_tokens_details?.cached_tokens || 0,
    providerCost: typeof u.cost === 'number' ? u.cost : null,
  };
}
export function usageFromAnthropic(u, prev = null) {
  if (!u && !prev) return null;
  u = u || {};
  const base = prev || { prompt: 0, completion: 0, cached: 0, providerCost: null };
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const prompt = u.input_tokens != null ? u.input_tokens + cacheRead + cacheWrite : base.prompt;
  return {
    prompt: Math.max(prompt, base.prompt),
    completion: Math.max(u.output_tokens || 0, base.completion),
    cached: Math.max(cacheRead, base.cached),
    providerCost: typeof u.cost === 'number' ? u.cost : base.providerCost,
  };
}
const ZERO = { prompt: 0, completion: 0, cached: 0, providerCost: null };

function buildUpstreamBody(clientFormat, m, body, route, model) {
  let out;
  if (clientFormat === 'responses') out = responsesToChatRequest(body, route.upstream_model).chat;
  else if (m.mode === 'translate') out = anthropicToOpenAIRequest(body, route.upstream_model);
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

export async function handleCompletion(request, env, ctx, clientFormat) {
  const started = Date.now();
  const { user, keyId } = await authUser(request, env, ctx);
  const body = await readJson(request);
  const model = await resolveModel(env.DB, user.id, body.model);
  const requestedName = body.model;

  const sub = pickSubscription(await loadSubscriptions(env.DB, user.id), model);
  if (!sub) {
    throw new HttpError(402,
      `No active subscription covers model "${model.id}"${model.group_id ? ` (group: ${model.group_id})` : ''}. ` +
      'Ask your administrator for a coupon and redeem it in the dashboard.', 'insufficient_quota');
  }

  const routes = await loadRoutes(env.DB, model.id);
  if (!routes.length) throw new HttpError(503, `Model "${model.id}" has no active route`, 'service_unavailable');

  const endpoint = { anthropic: '/v1/messages', responses: '/v1/responses' }[clientFormat] || '/v1/chat/completions';
  const customTools = clientFormat === 'responses' ? responsesToChatRequest(body, '').customTools : null;
  const finish = (routeInfo, status, usage, error) => settle(env.DB, {
    user, keyId, model, routeInfo, endpoint, status, usage: usage || ZERO, requestedModel: requestedName,
    providerCostUsd: usage?.providerCost ?? null, latency: Date.now() - started, error, subscriptionId: sub.id,
  });

  let lastStatus = 503, lastError = 'No provider key available for this model';
  let tried = 0;
  for await (const { route, key, secret } of attempts(env, routes)) {
    const m = modeFor(clientFormat, route);
    if (!m) continue;
    tried++;
    const routeInfo = { provider_id: route.id, key_id: key.id, upstream_model: route.upstream_model };
    // tell the student which real model answered (the body's `model` too — aliases stay transparent)
    const realHeaders = {
      'x-abdalgani-model': model.id,
      'x-abdalgani-upstream': `${route.id}/${route.upstream_model}`,
      ...(requestedName !== model.id ? { 'x-abdalgani-alias': String(requestedName) } : {}),
    };
    let upstream;
    try {
      upstream = await fetch(upstreamUrl(route, m.format), {
        method: 'POST',
        headers: upstreamHeaders(route, secret, m.format, request.headers),
        body: JSON.stringify(buildUpstreamBody(clientFormat, m, body, route, model)),
      });
    } catch (e) {
      lastStatus = 502; lastError = `network error: ${e.message}`;
      ctx.waitUntil(markKeyFailure(env.DB, key.id, 0, lastError));
      continue;
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      lastStatus = upstream.status; lastError = text.slice(0, 1000);
      if (isRetryable(upstream.status)) {
        ctx.waitUntil(markKeyFailure(env.DB, key.id, upstream.status, text));
        continue;
      }
      // client error (400/404/422): don't burn other keys, relay it
      ctx.waitUntil(finish(routeInfo, upstream.status, null, text));
      return new Response(text, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', ...realHeaders } });
    }

    ctx.waitUntil(markKeySuccess(env.DB, key.id));
    const ctype = upstream.headers.get('content-type') || '';
    const isStream = !!body.stream && ctype.includes('text/event-stream');

    if (!isStream) {
      const data = await upstream.json();
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
      let errMsg = null;
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
          if (conv) { if (outText) await writer.write(encoder.encode(outText)); }
          else await writer.write(value);
        }
        if (conv) await writer.write(encoder.encode(conv.finish()));
      } catch (e) {
        errMsg = `stream aborted: ${e.message}`;
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

  if (!tried) lastError = `No route of "${model.id}" supports the ${clientFormat} API, or no provider key is configured`;
  ctx.waitUntil(finish(null, lastStatus >= 400 ? lastStatus : 502, null, lastError));
  return apiError(lastStatus >= 400 ? lastStatus : 502, `All upstream providers failed for "${model.id}": ${lastError}`, 'upstream_error');
}

/** Models the caller can actually use right now + their stable aliases. */
export async function handleModels(request, env, ctx) {
  const { user } = await authUser(request, env, ctx);
  const { results: models } = await env.DB.prepare("SELECT * FROM models WHERE status != 'hidden' ORDER BY sort, id").all();
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
