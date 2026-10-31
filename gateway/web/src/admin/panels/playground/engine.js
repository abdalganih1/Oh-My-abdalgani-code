// Playground engine: one request in any of the three gateway formats (OpenAI chat, Anthropic
// messages, Responses/Codex), streaming or not, parsed into {text, reasoning, toolCalls, meta}.
// Talks to /v1/* with the internal playground key so it walks the real gateway path.
import { api } from '../../ctx.js';
import { session } from '../../../lib/store.js';

export const RED_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IyJCEmIY1TCqYfhqAAACcQQQFwFJQgAAAABJRU5ErkJggg==';
export const WEATHER = { name: 'get_weather', description: 'Get the current weather for a city', parameters: { type: 'object', properties: { city: { type: 'string', description: 'City name' } }, required: ['city'] } };

export const PG = { key: null, userId: null };
export async function ensureKey(force = false) {
  if (!force && PG.key) return PG.key;
  const saved = !force && session.get('abd:pgKey');
  if (saved) { [PG.key, PG.userId] = saved.split('|'); return PG.key; }
  const r = await api.post('/api/admin/playground/key');
  PG.key = r.api_key; PG.userId = String(r.user_id);
  session.set('abd:pgKey', `${PG.key}|${PG.userId}`);
  return PG.key;
}

export async function callModel({ model, route, format, stream, messages, system, tools, maxTokens, temperature, effort, extra = {}, signal, onDelta }) {
  let path, body;
  if (format === 'anthropic') {
    path = '/v1/messages';
    body = { model, max_tokens: maxTokens, stream, messages: messages.map(toAnthropic), ...(system ? { system } : {}),
      ...(tools ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}) };
  } else if (format === 'responses') {
    path = '/v1/responses';
    body = { model, max_output_tokens: maxTokens, stream, input: messages.flatMap(toResponses), ...(system ? { instructions: system } : {}),
      ...(effort ? { reasoning: { effort } } : {}), ...(tools ? { tools: tools.map((t) => ({ type: 'function', ...t })) } : {}) };
  } else {
    path = '/v1/chat/completions';
    body = { model, max_tokens: maxTokens, stream, messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map(toOpenAI)],
      ...(stream ? { stream_options: { include_usage: true } } : {}), ...(effort ? { reasoning_effort: effort } : {}),
      ...(tools ? { tools: tools.map((t) => ({ type: 'function', function: t })) } : {}) };
  }
  if (temperature !== '' && temperature != null && !Number.isNaN(+temperature)) body.temperature = +temperature;
  Object.assign(body, extra);
  const t0 = performance.now();
  const send = async () => fetch(path, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await ensureKey()}`, 'anthropic-version': '2023-06-01', ...(route ? { 'x-abd-route': route } : {}) },
    body: JSON.stringify(body),
  });
  let res = await send();
  if (res.status === 401) { await ensureKey(true); res = await send(); } // key rotated in another tab
  const meta = { status: res.status, model: res.headers.get('x-abdalgani-model'), upstream: res.headers.get('x-abdalgani-upstream'), ttft: null, latency: 0, usage: null };
  const out = { text: '', reasoning: '', toolCalls: [], meta, error: null, deltas: 0 };
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    out.error = j.error?.message || `HTTP ${res.status}`;
    meta.latency = performance.now() - t0; return out;
  }
  const mark = () => { if (meta.ttft == null) meta.ttft = performance.now() - t0; out.deltas++; };
  if (!stream || !(res.headers.get('content-type') || '').includes('event-stream')) {
    const j = await res.json();
    parseFull(format, j, out);
    meta.latency = performance.now() - t0; meta.ttft = meta.latency;
    onDelta?.(out); return out;
  }
  // SSE
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  const tc = {}; // tool calls being assembled, by index / item id
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data || data === '[DONE]') continue;
      let ev; try { ev = JSON.parse(data); } catch { continue; }
      parseDelta(format, ev, out, tc, mark);
      onDelta?.(out);
    }
  }
  out.toolCalls = Object.values(tc).filter((t) => t.name);
  meta.latency = performance.now() - t0;
  onDelta?.(out);
  return out;
}

const toOpenAI = (m) => (m.role === 'tool' ? { role: 'tool', tool_call_id: m.id, content: m.content }
  : m.toolCalls ? { role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.args } })) }
  : m.image ? { role: m.role, content: [{ type: 'text', text: m.content }, { type: 'image_url', image_url: { url: m.image } }] }
  : { role: m.role, content: m.content });
const toAnthropic = (m) => (m.role === 'tool' ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.id, content: m.content }] }
  : m.toolCalls ? { role: 'assistant', content: [...(m.content ? [{ type: 'text', text: m.content }] : []), ...m.toolCalls.map((t) => ({ type: 'tool_use', id: t.id, name: t.name, input: safeJson(t.args) }))] }
  : m.image ? { role: m.role, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: m.image.split(',')[1] } }, { type: 'text', text: m.content }] }
  : { role: m.role, content: m.content });
const toResponses = (m) => (m.role === 'tool' ? [{ type: 'function_call_output', call_id: m.id, output: m.content }]
  : m.toolCalls ? [...(m.content ? [{ role: 'assistant', content: m.content }] : []), ...m.toolCalls.map((t) => ({ type: 'function_call', call_id: t.id, name: t.name, arguments: t.args }))]
  : m.image ? [{ role: m.role, content: [{ type: 'input_text', text: m.content }, { type: 'input_image', image_url: m.image }] }]
  : [{ role: m.role, content: m.content }]);
const safeJson = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

function parseFull(format, j, out) {
  const u = j.usage || {};
  if (format === 'anthropic') {
    for (const c of j.content || []) {
      if (c.type === 'text') out.text += c.text;
      else if (c.type === 'thinking') out.reasoning += c.thinking || '';
      else if (c.type === 'tool_use') out.toolCalls.push({ id: c.id, name: c.name, args: JSON.stringify(c.input || {}) });
    }
    out.meta.usage = { in: u.input_tokens, out: u.output_tokens };
  } else if (format === 'responses') {
    for (const o of j.output || []) {
      if (o.type === 'message') out.text += (o.content || []).map((c) => c.text || '').join('');
      else if (o.type === 'reasoning') out.reasoning += (o.summary || o.content || []).map((c) => c.text || '').join('');
      else if (o.type === 'function_call') out.toolCalls.push({ id: o.call_id, name: o.name, args: o.arguments });
    }
    out.meta.usage = { in: u.input_tokens, out: u.output_tokens };
  } else {
    const msg = j.choices?.[0]?.message || {};
    out.text = typeof msg.content === 'string' ? msg.content : (msg.content || []).map((c) => c.text || '').join('');
    out.reasoning = msg.reasoning_content || msg.reasoning || '';
    out.toolCalls = (msg.tool_calls || []).map((t) => ({ id: t.id, name: t.function?.name, args: t.function?.arguments }));
    out.meta.usage = { in: u.prompt_tokens, out: u.completion_tokens };
  }
}
function parseDelta(format, ev, out, tc, mark) {
  if (format === 'anthropic') {
    if (ev.type === 'message_start') out.meta.usage = { in: ev.message?.usage?.input_tokens, out: 0 };
    else if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') { tc[ev.index] = { id: ev.content_block.id, name: ev.content_block.name, args: '' }; mark(); }
    else if (ev.type === 'content_block_delta') {
      const d = ev.delta || {};
      if (d.type === 'text_delta') { out.text += d.text; mark(); }
      else if (d.type === 'thinking_delta') { out.reasoning += d.thinking; mark(); }
      else if (d.type === 'input_json_delta' && tc[ev.index]) tc[ev.index].args += d.partial_json;
    } else if (ev.type === 'message_delta') out.meta.usage = { ...(out.meta.usage || {}), out: ev.usage?.output_tokens };
    else if (ev.type === 'message_stop') out.done = true;
  } else if (format === 'responses') {
    if (ev.type === 'response.output_text.delta') { out.text += ev.delta; mark(); }
    else if (/^response\.reasoning.*\.delta$/.test(ev.type)) { out.reasoning += ev.delta || ''; mark(); }
    else if (ev.type === 'response.output_item.added' && ev.item?.type === 'function_call') { tc[ev.item.id || ev.output_index] = { id: ev.item.call_id, name: ev.item.name, args: '' }; mark(); }
    else if (ev.type === 'response.function_call_arguments.delta') { const t = tc[ev.item_id] || tc[ev.output_index]; if (t) t.args += ev.delta; }
    else if (ev.type === 'response.output_item.done' && ev.item?.type === 'function_call') { tc[ev.item.id || ev.output_index] = { id: ev.item.call_id, name: ev.item.name, args: ev.item.arguments }; }
    else if (ev.type === 'response.completed') { const u = ev.response?.usage || {}; out.meta.usage = { in: u.input_tokens, out: u.output_tokens }; out.done = true; }
  } else {
    const d = ev.choices?.[0]?.delta || {};
    if (d.content) { out.text += d.content; mark(); }
    if (d.reasoning_content || d.reasoning) { out.reasoning += d.reasoning_content || d.reasoning; mark(); }
    for (const t of d.tool_calls || []) {
      const cur = tc[t.index] || (tc[t.index] = { id: '', name: '', args: '' });
      if (t.id) cur.id = t.id; if (t.function?.name) cur.name += t.function.name; if (t.function?.arguments) cur.args += t.function.arguments;
      mark();
    }
    if (ev.usage) out.meta.usage = { in: ev.usage.prompt_tokens, out: ev.usage.completion_tokens };
  }
}

// ── full compatibility suite (same 12 checks as v2) ──
export const SUITE = [
  { name: 'رد بسيط', fmt: 'openai', stream: false, msgs: [{ role: 'user', content: 'Reply with exactly the word: pong' }], check: (o) => /pong/i.test(o.text) },
  { name: 'بث مباشر (stream)', fmt: 'openai', stream: true, msgs: [{ role: 'user', content: 'Count from 1 to 5, separated by spaces.' }], check: (o) => o.deltas > 1 && /5/.test(o.text), note: (o) => `${o.deltas} دفعة` },
  { name: 'عربي', fmt: 'openai', stream: false, msgs: [{ role: 'user', content: 'اكتب جملة واحدة قصيرة بالعربي عن البحر.' }], check: (o) => /[؀-ۿ]{3,}/.test(o.text) },
  { name: 'استدعاء أداة (tools)', fmt: 'openai', stream: false, tools: [WEATHER], msgs: [{ role: 'user', content: 'What is the weather in Damascus right now? Use the get_weather tool.' }], check: (o) => o.toolCalls.some((t) => t.name === 'get_weather' && /damascus/i.test(t.args || '')), keep: true },
  { name: 'متابعة بعد نتيجة الأداة', fmt: 'openai', stream: false, tools: [WEATHER], dependsOn: 3,
    build: (prev) => [{ role: 'user', content: 'What is the weather in Damascus right now? Use the get_weather tool.' }, { role: 'assistant', content: prev.text || '', toolCalls: prev.toolCalls.map((t, i) => ({ ...t, id: t.id || `call_${i}` })) }, ...prev.toolCalls.map((t, i) => ({ role: 'tool', id: t.id || `call_${i}`, content: '{"city":"Damascus","temp_c":24,"condition":"sunny"}' }))],
    check: (o) => /24/.test(o.text) },
  { name: 'Anthropic API (Claude Code)', fmt: 'anthropic', stream: false, msgs: [{ role: 'user', content: 'Reply with exactly the word: pong' }], check: (o) => /pong/i.test(o.text) },
  { name: 'Anthropic بث', fmt: 'anthropic', stream: true, msgs: [{ role: 'user', content: 'Reply with exactly the word: pong' }], check: (o) => /pong/i.test(o.text) && o.done },
  { name: 'Anthropic أدوات', fmt: 'anthropic', stream: true, tools: [WEATHER], msgs: [{ role: 'user', content: 'What is the weather in Damascus? Use the get_weather tool.' }], check: (o) => o.toolCalls.some((t) => t.name === 'get_weather') },
  { name: 'Responses API (Codex) بث', fmt: 'responses', stream: true, msgs: [{ role: 'user', content: 'Reply with exactly the word: pong' }], check: (o) => /pong/i.test(o.text) && o.done },
  { name: 'Codex أدوات', fmt: 'responses', stream: true, tools: [WEATHER], msgs: [{ role: 'user', content: 'What is the weather in Damascus? Use the get_weather tool.' }], check: (o) => o.toolCalls.some((t) => t.name === 'get_weather') },
  { name: 'JSON منظّم', fmt: 'openai', stream: false, optional: true, extra: { response_format: { type: 'json_object' } }, msgs: [{ role: 'user', content: 'Return only a JSON object with keys "a" = 1 and "b" = 2.' }], check: (o) => { try { const j = JSON.parse(o.text.replace(/^```(json)?|```$/g, '').trim()); return j.a == 1 && j.b == 2; } catch { return false; } } },
  { name: 'فهم الصور', fmt: 'openai', stream: false, optional: true, vision: true, msgs: [{ role: 'user', content: 'What single color fills this image? Answer with one English word.', image: RED_PNG }], check: (o) => /red/i.test(o.text) },
];

/** Usage-log rows written since `since` for the playground user (cost lands a moment after the reply). */
export async function costsSince(since, wait = 900) {
  if (wait) await new Promise((r) => setTimeout(r, wait));
  if (!PG.userId) return [];
  const rows = await api.get(`/api/admin/usage?user_id=${PG.userId}&limit=50`).catch(() => []);
  return rows.filter((r) => r.created_at >= since);
}
export async function spend24h() {
  if (!PG.userId) return null;
  const rows = await api.get(`/api/admin/usage?user_id=${PG.userId}&limit=500`).catch(() => []);
  const day = Date.now() / 1000 - 86400;
  const today = rows.filter((r) => r.created_at > day);
  return { n: today.length, cost: today.reduce((a, r) => a + (r.cost || 0), 0) };
}
export const safeParse = safeJson;
