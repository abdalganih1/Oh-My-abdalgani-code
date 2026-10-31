// Anthropic Messages  <->  OpenAI Chat Completions translation.
// Used when a client speaks Anthropic (Claude Code) but the chosen route only has an
// OpenAI-compatible endpoint (e.g. OpenAI Platform).

const textOf = (content) =>
  typeof content === 'string'
    ? content
    : (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

function imagePart(block) {
  const s = block.source || {};
  const url = s.type === 'base64' ? `data:${s.media_type};base64,${s.data}` : s.url;
  return { type: 'image_url', image_url: { url } };
}

export function anthropicToOpenAIRequest(body, upstreamModel) {
  const messages = [];
  if (body.system) messages.push({ role: 'system', content: textOf(body.system) });

  for (const m of body.messages || []) {
    if (typeof m.content === 'string') { messages.push({ role: m.role, content: m.content }); continue; }
    const blocks = m.content || [];
    if (m.role === 'assistant') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const toolCalls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({
        id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));
      const msg = { role: 'assistant', content: text || null };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      messages.push(msg);
    } else {
      // tool results first (they must directly follow the assistant tool_calls), then user content
      for (const b of blocks.filter((x) => x.type === 'tool_result')) {
        const c = typeof b.content === 'string' ? b.content : textOf(b.content);
        messages.push({ role: 'tool', tool_call_id: b.tool_use_id, content: (b.is_error ? '[error] ' : '') + (c || '') });
      }
      const parts = [];
      for (const b of blocks) {
        if (b.type === 'text') parts.push({ type: 'text', text: b.text });
        else if (b.type === 'image') parts.push(imagePart(b));
      }
      if (parts.length) messages.push({ role: 'user', content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts });
    }
  }

  const out = { model: upstreamModel, messages, stream: !!body.stream };
  if (body.max_tokens) out.max_completion_tokens = body.max_tokens;
  if (body.temperature != null) out.temperature = body.temperature;
  if (body.top_p != null) out.top_p = body.top_p;
  if (body.stop_sequences?.length) out.stop = body.stop_sequences;
  if (body.stream) out.stream_options = { include_usage: true };
  if (body.tools?.length) {
    out.tools = body.tools.filter((t) => t.input_schema).map((t) => ({
      type: 'function', function: { name: t.name, description: t.description || '', parameters: t.input_schema },
    }));
  }
  const tc = body.tool_choice;
  if (tc) {
    out.tool_choice = tc.type === 'any' ? 'required' : tc.type === 'tool' ? { type: 'function', function: { name: tc.name } } : tc.type === 'none' ? 'none' : 'auto';
  }
  if (body.thinking?.type === 'enabled') {
    const b = body.thinking.budget_tokens || 0;
    out.reasoning_effort = b >= 16000 ? 'high' : b >= 4000 ? 'medium' : 'low';
  }
  return out;
}

const STOP_MAP = { stop: 'end_turn', length: 'max_tokens', tool_calls: 'tool_use', function_call: 'tool_use', content_filter: 'end_turn' };

function safeParse(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }

export function openAIToAnthropicResponse(resp, requestedModel) {
  const choice = resp.choices?.[0] || {};
  const msg = choice.message || {};
  const content = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  for (const tc of msg.tool_calls || []) {
    content.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input: safeParse(tc.function?.arguments) });
  }
  const u = resp.usage || {};
  return {
    id: resp.id ? `msg_${resp.id}` : `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: requestedModel,
    content,
    stop_reason: STOP_MAP[choice.finish_reason] || 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: (u.prompt_tokens || 0) - (u.prompt_tokens_details?.cached_tokens || 0),
      output_tokens: u.completion_tokens || 0,
      cache_read_input_tokens: u.prompt_tokens_details?.cached_tokens || 0,
    },
  };
}

const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Stateful converter: feed parsed OpenAI chunks, get Anthropic SSE frames back. */
export class OpenAIToAnthropicStream {
  constructor(requestedModel) {
    this.model = requestedModel;
    this.started = false;
    this.index = -1;          // current content block index
    this.open = null;         // 'text' | 'tool'
    this.toolIdx = new Map(); // openai tool index -> anthropic block index
    this.stop = 'end_turn';
    this.usage = { input_tokens: 0, output_tokens: 0 };
  }

  start(id) {
    this.started = true;
    return sse('message_start', {
      type: 'message_start',
      message: { id: `msg_${id || Date.now()}`, type: 'message', role: 'assistant', model: this.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
    });
  }

  closeBlock() {
    if (this.open == null) return '';
    this.open = null;
    return sse('content_block_stop', { type: 'content_block_stop', index: this.index });
  }

  push(chunk) {
    let out = '';
    if (!this.started) out += this.start(chunk.id);
    if (chunk.usage) {
      const cached = chunk.usage.prompt_tokens_details?.cached_tokens || 0;
      this.usage = { input_tokens: (chunk.usage.prompt_tokens || 0) - cached, output_tokens: chunk.usage.completion_tokens || 0, cache_read_input_tokens: cached };
    }
    const choice = chunk.choices?.[0];
    if (!choice) return out;
    const d = choice.delta || {};
    if (d.content) {
      if (this.open !== 'text') {
        out += this.closeBlock();
        this.index++;
        this.open = 'text';
        out += sse('content_block_start', { type: 'content_block_start', index: this.index, content_block: { type: 'text', text: '' } });
      }
      out += sse('content_block_delta', { type: 'content_block_delta', index: this.index, delta: { type: 'text_delta', text: d.content } });
    }
    for (const tc of d.tool_calls || []) {
      const key = tc.index ?? 0;
      if (!this.toolIdx.has(key)) {
        out += this.closeBlock();
        this.index++;
        this.open = 'tool';
        this.toolIdx.set(key, this.index);
        out += sse('content_block_start', {
          type: 'content_block_start', index: this.index,
          content_block: { type: 'tool_use', id: tc.id || `toolu_${Date.now()}_${key}`, name: tc.function?.name || '', input: {} },
        });
      }
      const args = tc.function?.arguments;
      if (args) out += sse('content_block_delta', { type: 'content_block_delta', index: this.toolIdx.get(key), delta: { type: 'input_json_delta', partial_json: args } });
    }
    if (choice.finish_reason) this.stop = STOP_MAP[choice.finish_reason] || 'end_turn';
    return out;
  }

  finish() {
    let out = '';
    if (!this.started) out += this.start();
    out += this.closeBlock();
    out += sse('message_delta', { type: 'message_delta', delta: { stop_reason: this.stop, stop_sequence: null }, usage: this.usage });
    out += sse('message_stop', { type: 'message_stop' });
    return out;
  }
}

/** Incremental SSE parser: feed text, get {event, data} records for complete frames. */
export class SSEParser {
  constructor() { this.buf = ''; }
  feed(text) {
    this.buf += text;
    const out = [];
    let idx;
    while ((idx = this.buf.search(/\r?\n\r?\n/)) >= 0) {
      const frame = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      let event = null; const data = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length || event) out.push({ event, data: data.join('\n') });
    }
    return out;
  }
}
