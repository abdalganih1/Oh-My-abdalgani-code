// Admin playground: chat with any model through the real gateway path (/v1/*) using an
// internal account, optionally pinned to one route, plus a one-click compatibility suite.
// Lazy-loaded by admin.js the first time the tab opens.
import { $, $$, esc, store, makeApi, toast, usdPrecise, tokens } from '/common.js';
import { icon } from '/ui.js';

const api = makeApi('abd:adminToken');
const RED_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IyJCEmIY1TCqYfhqAAACcQQQFwFJQgAAAABJRU5ErkJggg==';
const WEATHER = { name: 'get_weather', description: 'Get the current weather for a city', parameters: { type: 'object', properties: { city: { type: 'string', description: 'City name' } }, required: ['city'] } };

const P = { models: [], key: null, userId: null, convo: [], busy: false, ctrl: null, format: 'openai' };
const sget = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sset = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } };

async function ensureKey(force = false) {
  if (!force && P.key) return P.key;
  const saved = !force && sget('abd:pgKey');
  if (saved) { [P.key, P.userId] = saved.split('|'); return P.key; }
  const r = await api('POST', '/api/admin/playground/key');
  P.key = r.api_key; P.userId = String(r.user_id);
  sset('abd:pgKey', `${P.key}|${P.userId}`);
  return P.key;
}

// ── one request in any of the three gateway formats; returns text, reasoning, tool calls, meta ──
async function callModel({ format, stream, messages, system, tools, maxTokens, temperature, effort, extra = {}, signal, onDelta }) {
  const model = $('#pgModel').value, route = $('#pgRoute').value;
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

// cost lands in the usage log a moment after the reply (written in waitUntil)
async function lastCost(since) {
  await new Promise((r) => setTimeout(r, 900));
  const rows = await api('GET', `/api/admin/usage?user_id=${P.userId}&limit=50`).catch(() => []);
  return rows.filter((r) => r.created_at >= since);
}

// ── UI ──
function md(s) { // tiny, safe markdown: code fences, inline code, bold, line breaks
  const parts = String(s || '').split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 0) html += esc(parts[i]).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    else if (i % 3 === 2) html += `<pre class="ltr">${esc(parts[i])}</pre>`;
  }
  return html;
}
const fmtMs = (ms) => (ms == null ? '—' : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`);
function metaLine(o, cost) {
  const m = o.meta, u = m.usage || {};
  return `<div class="pg-meta">
    <span title="النموذج الحقيقي">${icon('cpu', 13)} ${esc(m.model || '—')}</span>
    <span class="ltr" title="المزوّد/المعرّف عنده">${icon('plug', 13)} ${esc(m.upstream || '—')}</span>
    <span title="زمن أول توكن">⚡ ${fmtMs(m.ttft)}</span><span title="الزمن الكلي">⏱ ${fmtMs(m.latency)}</span>
    <span title="توكنات دخل → خرج">${tokens(u.in || 0)} → ${tokens(u.out || 0)}</span>
    <span class="pg-cost">${cost != null ? usdPrecise(cost) : ''}</span>
    <span class="badge ${m.status < 400 ? 'ok' : 'bad'}">${m.status}</span></div>`;
}
function bubble(role, html, cls = '') {
  const el = document.createElement('div');
  el.className = `pg-msg ${role} ${cls}`;
  el.innerHTML = html;
  const box = $('#pgMsgs'); $('.pg-empty', box)?.remove(); box.appendChild(el); box.scrollTop = box.scrollHeight;
  return el;
}
function renderAssistant(el, o, cost) {
  el.innerHTML = `${o.reasoning ? `<details class="pg-think"><summary>💭 تفكير النموذج (${tokens(o.reasoning.length / 4)} توكن تقريباً)</summary><div>${md(o.reasoning)}</div></details>` : ''}
    ${o.text ? `<div class="pg-text">${md(o.text)}</div>` : ''}
    ${o.toolCalls.map((t) => `<div class="pg-tool">${icon('terminal', 14)} <b class="ltr">${esc(t.name)}</b><code class="ltr">${esc(t.args || '{}')}</code></div>`).join('')}
    ${o.error ? `<div class="pg-err" dir="auto">${esc(o.error)}</div>` : ''}
    ${!o.text && !o.toolCalls.length && !o.error && !o.reasoning ? '<span class="pg-typing"><i></i><i></i><i></i></span>' : ''}
    ${o.meta.latency ? metaLine(o, cost) : ''}`;
  $('#pgMsgs').scrollTop = $('#pgMsgs').scrollHeight;
}

function settings() {
  return {
    format: P.format, stream: $('#pgStream').checked, system: $('#pgSystem').value.trim(),
    maxTokens: +$('#pgMax').value || 1024, temperature: $('#pgTemp').value, effort: $('#pgEffort').value,
    tools: $('#pgTools').checked ? [WEATHER] : null,
  };
}
function setBusy(b) {
  P.busy = b; $('#pgSend').classList.toggle('hidden', b); $('#pgStop').classList.toggle('hidden', !b);
  $('#pgSuite').disabled = b;
}

async function send(text, image) {
  if (P.busy || !$('#pgModel').value) return;
  const userMsg = { role: 'user', content: text, ...(image ? { image } : {}) };
  P.convo.push(userMsg);
  bubble('user', `${image ? `<img src="${image}" alt="" class="pg-img">` : ''}${md(text)}`);
  const el = bubble('assistant', '');
  const s = settings(), since = Math.floor(Date.now() / 1000) - 1;
  P.ctrl = new AbortController(); setBusy(true);
  try {
    const o = await callModel({ ...s, messages: P.convo, signal: P.ctrl.signal, onDelta: (x) => renderAssistant(el, x) });
    renderAssistant(el, o);
    if (!o.error) P.convo.push({ role: 'assistant', content: o.text, ...(o.toolCalls.length ? { toolCalls: o.toolCalls.map((t, i) => ({ ...t, id: t.id || `call_${Date.now()}_${i}` })) } : {}) });
    else P.convo.pop();
    if (o.toolCalls.length && !o.error) {
      const last = P.convo.at(-1);
      const btn = document.createElement('button'); btn.className = 'small'; btn.type = 'button';
      btn.innerHTML = `${icon('zap', 14)} ابعت نتيجة وهمية للأداة وكمّل`;
      btn.onclick = () => { btn.remove(); for (const t of last.toolCalls) P.convo.push({ role: 'tool', id: t.id, content: JSON.stringify({ city: safeJson(t.args).city || '?', temp_c: 24, condition: 'sunny' }) }); bubble('user', `<span class="muted small">↩︎ نتيجة الأداة: <code class="ltr">{"temp_c":24,"condition":"sunny"}</code></span>`, 'tool'); continueAfterTool(); };
      el.appendChild(btn);
    }
    const rows = await lastCost(since);
    if (rows[0]) renderAssistant(el, o, rows[0].cost);
    refreshSpend();
  } catch (e) {
    if (e.name === 'AbortError') { el.insertAdjacentHTML('beforeend', '<div class="pg-err">انوقف</div>'); P.convo.pop(); }
    else { el.insertAdjacentHTML('beforeend', `<div class="pg-err">${esc(e.message)}</div>`); P.convo.pop(); }
  } finally { setBusy(false); P.ctrl = null; }
}
async function continueAfterTool() {
  const el = bubble('assistant', '');
  const s = settings(); P.ctrl = new AbortController(); setBusy(true);
  try {
    const o = await callModel({ ...s, messages: P.convo, signal: P.ctrl.signal, onDelta: (x) => renderAssistant(el, x) });
    renderAssistant(el, o);
    if (!o.error) P.convo.push({ role: 'assistant', content: o.text });
  } catch (e) { el.insertAdjacentHTML('beforeend', `<div class="pg-err">${esc(e.message)}</div>`); }
  finally { setBusy(false); P.ctrl = null; }
}

async function refreshSpend() {
  if (!P.userId) return;
  const rows = await api('GET', `/api/admin/usage?user_id=${P.userId}&limit=500`).catch(() => []);
  const day = Date.now() / 1000 - 86400;
  const today = rows.filter((r) => r.created_at > day);
  $('#pgSpend').innerHTML = `آخر 24 ساعة: <b>${today.length}</b> طلب · <b>${usdPrecise(today.reduce((a, r) => a + (r.cost || 0), 0))}</b> — الكلفة بتنحسب بالتقارير تحت "🧪 Playground"`;
}

// ── full compatibility suite ──
const SUITE = [
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

async function runSuite() {
  if (P.busy || !$('#pgModel').value) return;
  const model = P.models.find((m) => m.id === $('#pgModel').value);
  const card = $('#pgSuiteCard'); card.classList.remove('hidden');
  const since = Math.floor(Date.now() / 1000) - 1;
  const results = [];
  setBusy(true); P.ctrl = new AbortController();
  const max = Math.max(512, +$('#pgMax').value || 0);
  const draw = (running) => {
    const pass = results.filter((r) => r.st === 'pass').length, fail = results.filter((r) => r.st === 'fail').length;
    $('#pgSuiteHead').innerHTML = `${esc(model.name)} <span class="mono ltr small muted">${esc(model.id)}</span> ${running != null ? `<span class="badge accent">عم يفحص ${running + 1}/${SUITE.length}</span>` : `<span class="badge ${fail ? 'warn' : 'ok'}">${pass}/${results.filter((r) => r.st !== 'skip').length} نجح</span>`}`;
    $('#pgSuiteTable').innerHTML = '<tr><th>الاختبار</th><th>النتيجة</th><th class="num">أول توكن</th><th class="num">الزمن</th><th>عبر</th><th class="num">توكنات</th><th>ملاحظة</th></tr>' +
      SUITE.map((t, i) => {
        const r = results[i];
        const st = !r ? (i === running ? '<span class="pg-typing"><i></i><i></i><i></i></span>' : '<span class="muted">—</span>')
          : r.st === 'pass' ? '<span class="badge ok">نجح</span>' : r.st === 'warn' ? '<span class="badge warn">غير مدعوم</span>' : r.st === 'skip' ? '<span class="badge">تخطّي</span>' : '<span class="badge bad">فشل</span>';
        return `<tr><td>${esc(t.name)}${t.optional ? ' <span class="muted small">(اختياري)</span>' : ''}</td><td>${st}</td><td class="num">${r?.o ? fmtMs(r.o.meta.ttft) : ''}</td><td class="num">${r?.o ? fmtMs(r.o.meta.latency) : ''}</td>
          <td class="small mono ltr">${esc(r?.o?.meta.upstream || '')}</td><td class="num">${r?.o?.meta.usage ? `${tokens(r.o.meta.usage.in || 0)}→${tokens(r.o.meta.usage.out || 0)}` : ''}</td>
          <td class="small muted" dir="auto" style="max-width:320px">${esc(r?.note || '')}</td></tr>`;
      }).join('');
  };
  try {
    for (let i = 0; i < SUITE.length; i++) {
      const t = SUITE[i];
      draw(i);
      if (t.vision && !model.vision) { results[i] = { st: 'skip', note: 'النموذج مش معلّم إنه بيقبل صور (عدّلها من إعدادات النموذج)' }; continue; }
      const prev = t.dependsOn != null ? results[t.dependsOn] : null;
      if (t.dependsOn != null && (!prev || prev.st !== 'pass')) { results[i] = { st: 'skip', note: 'بيعتمد على اختبار الأداة اللي قبله' }; continue; }
      try {
        const o = await callModel({ format: t.fmt, stream: t.stream, messages: t.build ? t.build(prev.o) : t.msgs, tools: t.tools || null, maxTokens: max, system: '', temperature: '', effort: '', extra: t.extra, signal: P.ctrl.signal });
        const ok = !o.error && t.check(o);
        const snippet = o.error || (o.toolCalls.length ? `🔧 ${o.toolCalls.map((x) => `${x.name}(${x.args})`).join(', ')} ${o.text}` : o.text || (o.reasoning ? '(بس تفكير، بلا نص — زيد max tokens)' : '(رد فاضي)'));
        results[i] = { st: ok ? 'pass' : t.optional && !o.error ? 'warn' : 'fail', o, note: `${t.note && ok ? t.note(o) + ' · ' : ''}${snippet}`.slice(0, 220) };
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        results[i] = { st: 'fail', note: e.message };
      }
    }
    draw(null);
    const rows = await lastCost(since);
    $('#pgSuiteCost').textContent = `كلفة الفحص: ${usdPrecise(rows.reduce((a, r) => a + (r.cost || 0), 0))} · ${rows.length} طلب`;
    refreshSpend();
  } catch (e) {
    draw(null); toast(e.name === 'AbortError' ? 'انوقف الفحص' : e.message, e.name !== 'AbortError');
  } finally { setBusy(false); P.ctrl = null; }
}

function fillRoutes() {
  const m = P.models.find((x) => x.id === $('#pgModel').value);
  $('#pgRoute').innerHTML = '<option value="">تلقائي — حسب ترتيب التوجيه والاحتياط</option>' +
    (m?.routes || []).map((r, i) => `<option value="${r.id}" ${r.enabled ? '' : 'disabled'}>${i + 1}. ${esc(r.provider_id)} → ${esc(r.upstream_model)}${r.enabled ? '' : ' (موقوف)'}${r.archived_at ? ' (مؤرشف)' : ''}</option>`).join('');
  $('#pgModelInfo').innerHTML = m ? `${m.vision ? '<span class="badge accent">صور</span> ' : ''}${m.reasoning ? '<span class="badge accent">تفكير</span> ' : ''}<span class="badge">${tokens(m.context_length)} سياق</span> <span class="badge">${esc(m.status)}</span>` : '';
  store.set('abd:pgModel', $('#pgModel').value);
}

let wired = false;
export async function load() {
  P.models = await api('GET', '/api/admin/models');
  const sel = $('#pgModel'), keep = sel.value || store.get('abd:pgModel');
  const groups = [['new', 'جديد'], ['active', 'متاح'], ['legacy', 'قديم'], ['hidden', 'مخفي'], ['archived', 'مؤرشف']];
  sel.innerHTML = groups.map(([st, label]) => {
    const ms = P.models.filter((m) => m.status === st);
    return ms.length ? `<optgroup label="${label}">${ms.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} — ${esc(m.id)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  if (keep && P.models.some((m) => m.id === keep)) sel.value = keep;
  fillRoutes();
  await ensureKey().catch((e) => toast(e.message, true));
  refreshSpend();
  if (wired) return; wired = true;
  sel.addEventListener('change', fillRoutes);
  $('#pgFormat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    P.format = b.dataset.f; $$('#pgFormat button').forEach((x) => x.classList.toggle('on', x === b));
  });
  $('#pgForm').addEventListener('submit', (e) => { e.preventDefault(); const t = $('#pgInput').value.trim(); if (!t) return; $('#pgInput').value = ''; autosize(); send(t); });
  $('#pgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#pgForm').requestSubmit(); } });
  const autosize = () => { const t = $('#pgInput'); t.style.height = 'auto'; t.style.height = `${Math.min(200, t.scrollHeight)}px`; };
  $('#pgInput').addEventListener('input', autosize);
  $('#pgStop').addEventListener('click', () => P.ctrl?.abort());
  $('#pgClear').addEventListener('click', () => { P.convo = []; $('#pgMsgs').innerHTML = emptyState(); });
  $('#pgSuite').addEventListener('click', runSuite);
  $('#pgMsgs').addEventListener('click', (e) => { const q = e.target.closest('[data-q]'); if (q) { $('#pgInput').value = q.dataset.q; $('#pgForm').requestSubmit(); } });
  $('#pgImg').addEventListener('click', () => send('What single color fills this image? Answer in one word.', RED_PNG));
  $('#pgMsgs').innerHTML = emptyState();
}
function emptyState() {
  const qs = ['عرّف عن حالك بجملة: مين انت ومين صنعك؟', 'Write a Python function that reverses a string, with a test.', 'اشرحلي شو يعني API بطريقة بسيطة', "What's the weather in Damascus? (فعّل الأدوات)"];
  return `<div class="pg-empty">${icon('sparkles', 36)}<b>جرّب أي نموذج متل ما بيشوفه الطالب</b><span>الطلب بيمشي بنفس طريق البوابة الحقيقي: التوجيه، الاحتياط، الترجمة بين الصيغ، والمحاسبة.</span>
    <div class="pg-quick">${qs.map((q) => `<button type="button" class="small" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
}
