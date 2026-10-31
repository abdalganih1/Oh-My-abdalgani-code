// OpenAI Responses API (/v1/responses)  <->  Chat Completions translation.
// Codex CLI only speaks Responses (wire_api = "responses"); most upstreams (z.ai...) only
// speak Chat Completions, so every /v1/responses call is translated.

const rid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

function partsToChat(content) {
  if (typeof content === 'string') return content;
  const parts = [];
  for (const c of content || []) {
    if (c.type === 'input_text' || c.type === 'output_text' || c.type === 'text') parts.push({ type: 'text', text: c.text });
    else if (c.type === 'input_image') parts.push({ type: 'image_url', image_url: { url: c.image_url || c.url } });
  }
  if (parts.every((p) => p.type === 'text')) return parts.map((p) => p.text).join('\n');
  return parts;
}

/** @returns {{chat: object, customTools: Set<string>}} */
export function responsesToChatRequest(body, upstreamModel) {
  const messages = [];
  const customTools = new Set();
  if (body.instructions) messages.push({ role: 'system', content: body.instructions });

  const input = typeof body.input === 'string' ? [{ type: 'message', role: 'user', content: body.input }] : body.input || [];
  let pendingCalls = null; // merge consecutive function calls into one assistant message
  const flush = () => { if (pendingCalls) { messages.push(pendingCalls); pendingCalls = null; } };

  for (const item of input) {
    const type = item.type || (item.role ? 'message' : null);
    if (type === 'message') {
      const role = item.role === 'developer' ? 'system' : item.role;
      if (role === 'assistant' && pendingCalls && !pendingCalls.content) {
        pendingCalls.content = partsToChat(item.content);
        continue;
      }
      flush();
      messages.push({ role, content: partsToChat(item.content) });
    } else if (type === 'function_call' || type === 'custom_tool_call') {
      if (!pendingCalls) {
        const last = messages[messages.length - 1];
        if (last?.role === 'assistant' && !last.tool_calls) { messages.pop(); pendingCalls = { role: 'assistant', content: last.content, tool_calls: [] }; }
        else pendingCalls = { role: 'assistant', content: null, tool_calls: [] };
      }
      const args = type === 'custom_tool_call' ? JSON.stringify({ input: item.input ?? '' }) : item.arguments || '{}';
      pendingCalls.tool_calls.push({ id: item.call_id || item.id, type: 'function', function: { name: item.name, arguments: args } });
    } else if (type === 'function_call_output' || type === 'custom_tool_call_output') {
      flush();
      const out = typeof item.output === 'string' ? item.output : JSON.stringify(item.output);
      messages.push({ role: 'tool', tool_call_id: item.call_id, content: out });
    }
    // reasoning / web_search_call / local_shell items are dropped
  }
  flush();

  const chat = { model: upstreamModel, messages, stream: !!body.stream };
  if (body.stream) chat.stream_options = { include_usage: true };
  if (body.max_output_tokens) chat.max_completion_tokens = body.max_output_tokens;
  if (body.temperature != null) chat.temperature = body.temperature;
  if (body.top_p != null) chat.top_p = body.top_p;
  if (body.reasoning?.effort) chat.reasoning_effort = body.reasoning.effort;
  if (body.parallel_tool_calls != null && body.tools?.length) chat.parallel_tool_calls = body.parallel_tool_calls;
  const tools = [];
  for (const t of body.tools || []) {
    if (t.type === 'function') tools.push({ type: 'function', function: { name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } } });
    else if (t.type === 'custom') {
      customTools.add(t.name);
      tools.push({ type: 'function', function: { name: t.name, description: `${t.description || ''}\nPut the full raw input in the "input" string.`, parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] } } });
    }
  }
  if (tools.length) chat.tools = tools;
  const tc = body.tool_choice;
  if (tc && tools.length) chat.tool_choice = typeof tc === 'string' ? tc : tc.name ? { type: 'function', function: { name: tc.name } } : 'auto';
  return { chat, customTools };
}

function usageOf(u) {
  const cached = u?.prompt_tokens_details?.cached_tokens || 0;
  return {
    input_tokens: u?.prompt_tokens || 0,
    input_tokens_details: { cached_tokens: cached },
    output_tokens: u?.completion_tokens || 0,
    output_tokens_details: { reasoning_tokens: u?.completion_tokens_details?.reasoning_tokens || 0 },
    total_tokens: (u?.prompt_tokens || 0) + (u?.completion_tokens || 0),
  };
}

function callItem(tc, customTools, status = 'completed') {
  const name = tc.function?.name;
  if (customTools.has(name)) {
    let input = '';
    try { input = JSON.parse(tc.function.arguments || '{}').input ?? ''; } catch { input = tc.function?.arguments || ''; }
    return { type: 'custom_tool_call', id: rid('ctc'), call_id: tc.id, name, input, status };
  }
  return { type: 'function_call', id: rid('fc'), call_id: tc.id, name, arguments: tc.function?.arguments || '{}', status };
}

function envelope(id, model, body, extra) {
  return {
    id, object: 'response', created_at: Math.floor(Date.now() / 1000), model,
    instructions: body.instructions ?? null, tools: body.tools || [], parallel_tool_calls: body.parallel_tool_calls ?? true,
    tool_choice: body.tool_choice || 'auto', error: null, incomplete_details: null, metadata: body.metadata || {},
    ...extra,
  };
}

export function chatToResponsesResponse(resp, requestedModel, body, customTools) {
  const msg = resp.choices?.[0]?.message || {};
  const output = [];
  if (msg.content) output.push({ type: 'message', id: rid('msg'), role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: msg.content, annotations: [] }] });
  for (const tc of msg.tool_calls || []) output.push(callItem(tc, customTools));
  const fr = resp.choices?.[0]?.finish_reason;
  return envelope(rid('resp'), requestedModel, body, {
    status: fr === 'length' ? 'incomplete' : 'completed',
    incomplete_details: fr === 'length' ? { reason: 'max_output_tokens' } : null,
    output,
    output_text: msg.content || '',
    usage: usageOf(resp.usage),
  });
}

/** Stateful converter: Chat Completions chunks → Responses SSE events. */
export class ChatToResponsesStream {
  constructor(requestedModel, body, customTools) {
    this.model = requestedModel; this.body = body; this.custom = customTools;
    this.id = rid('resp'); this.seq = 0; this.started = false;
    this.items = [];          // finished output items
    this.text = null;         // {item, index, buf}
    this.calls = new Map();   // chat tool index → {index, tc:{id, function:{name, arguments}}}
    this.usage = null; this.finishReason = null;
  }
  ev(type, data) { return `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: this.seq++, ...data })}\n\n`; }
  base(status, extra = {}) { return envelope(this.id, this.model, this.body, { status, output: [], usage: null, ...extra }); }
  nextIndex() { return this.items.length + (this.text ? 1 : 0) + this.calls.size; }

  push(chunk) {
    let out = '';
    if (!this.started) {
      this.started = true;
      out += this.ev('response.created', { response: this.base('in_progress') });
      out += this.ev('response.in_progress', { response: this.base('in_progress') });
    }
    if (chunk.usage) this.usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) return out;
    const d = choice.delta || {};
    if (d.content) {
      if (!this.text) {
        const item = { type: 'message', id: rid('msg'), role: 'assistant', status: 'in_progress', content: [] };
        this.text = { item, index: this.nextIndex(), buf: '' };
        out += this.ev('response.output_item.added', { output_index: this.text.index, item });
        out += this.ev('response.content_part.added', { item_id: item.id, output_index: this.text.index, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } });
      }
      this.text.buf += d.content;
      out += this.ev('response.output_text.delta', { item_id: this.text.item.id, output_index: this.text.index, content_index: 0, delta: d.content });
    }
    for (const tc of d.tool_calls || []) {
      const k = tc.index ?? 0;
      if (!this.calls.has(k)) {
        out += this.closeText();
        const entry = { index: this.nextIndex(), tc: { id: tc.id || rid('call'), function: { name: tc.function?.name || '', arguments: '' } } };
        entry.item = callItem(entry.tc, this.custom, 'in_progress');
        this.calls.set(k, entry);
        out += this.ev('response.output_item.added', { output_index: entry.index, item: entry.item });
      }
      const e = this.calls.get(k);
      if (tc.function?.name && !e.tc.function.name) e.tc.function.name = tc.function.name;
      if (tc.function?.arguments) {
        e.tc.function.arguments += tc.function.arguments;
        if (e.item.type === 'function_call') out += this.ev('response.function_call_arguments.delta', { item_id: e.item.id, output_index: e.index, delta: tc.function.arguments });
      }
    }
    if (choice.finish_reason) this.finishReason = choice.finish_reason;
    return out;
  }

  closeText() {
    if (!this.text) return '';
    const { item, index, buf } = this.text;
    const part = { type: 'output_text', text: buf, annotations: [] };
    const done = { ...item, status: 'completed', content: [part] };
    let out = this.ev('response.output_text.done', { item_id: item.id, output_index: index, content_index: 0, text: buf });
    out += this.ev('response.content_part.done', { item_id: item.id, output_index: index, content_index: 0, part });
    out += this.ev('response.output_item.done', { output_index: index, item: done });
    this.items[index] = done;
    this.text = null;
    return out;
  }

  finish() {
    let out = '';
    if (!this.started) out += this.push({});
    out += this.closeText();
    for (const e of [...this.calls.values()].sort((a, b) => a.index - b.index)) {
      const done = { ...callItem(e.tc, this.custom), id: e.item.id };
      if (done.type === 'function_call') out += this.ev('response.function_call_arguments.done', { item_id: done.id, output_index: e.index, arguments: done.arguments });
      out += this.ev('response.output_item.done', { output_index: e.index, item: done });
      this.items[e.index] = done;
    }
    const output = this.items.filter(Boolean);
    const text = output.filter((i) => i.type === 'message').map((i) => i.content[0].text).join('');
    const incomplete = this.finishReason === 'length';
    out += this.ev(incomplete ? 'response.incomplete' : 'response.completed', {
      response: this.base(incomplete ? 'incomplete' : 'completed', {
        output, output_text: text, usage: usageOf(this.usage), incomplete_details: incomplete ? { reason: 'max_output_tokens' } : null,
      }),
    });
    return out;
  }
}
