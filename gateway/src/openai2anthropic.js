// OpenAI Chat Completions client  ->  Anthropic Messages upstream (and the reply back).
// Anthropic's OpenAI-compatible endpoint never prompt-caches — not even with cache_control
// parts — so an OpenAI-speaking agent (Hermes) paid full price for its whole history on every
// turn. Talking /v1/messages natively with a cache breakpoint makes the repeated prefix ~10%.

const textOfContent = (c) =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p?.type === 'text').map((p) => p.text).join('\n') : '';

function imageBlock(part) {
  const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url || '';
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : { type: 'image', source: { type: 'url', url } };
}

/** OpenAI user/system content → Anthropic blocks (keeps any cache_control the client set). */
function toBlocks(content) {
  if (content == null) return [];
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
  const out = [];
  for (const p of content) {
    if (!p) continue;
    if (p.type === 'text' && p.text) out.push({ type: 'text', text: p.text, ...(p.cache_control ? { cache_control: p.cache_control } : {}) });
    else if (p.type === 'image_url') out.push(imageBlock(p));
  }
  return out;
}

function parseArgs(s) {
  if (s && typeof s === 'object') return s;
  try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : { value: v }; } catch { return { _raw: String(s) }; }
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const countCC = (blocks) => blocks.reduce((n, b) => n + (b.cache_control ? 1 : 0), 0);

export function openAIToAnthropicRequest(body, upstreamModel, { maxOutput = 32000 } = {}) {
  const system = [];
  const messages = [];
  const push = (role, blocks) => {
    if (!blocks.length) return;
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content.push(...blocks); // Anthropic wants alternating turns
    else messages.push({ role, content: [...blocks] });
  };

  for (const m of body.messages || []) {
    if (!m) continue;
    if (m.role === 'system' || m.role === 'developer') { system.push(...toBlocks(m.content).filter((b) => b.type === 'text')); continue; }
    if (m.role === 'tool' || m.role === 'function') {
      push('user', [{ type: 'tool_result', tool_use_id: m.tool_call_id || m.name || 'tool', content: textOfContent(m.content) || '(empty)' }]);
      continue;
    }
    if (m.role === 'assistant') {
      const blocks = [];
      const text = textOfContent(m.content);
      if (text) blocks.push({ type: 'text', text });
      for (const tc of m.tool_calls || []) {
        if (tc?.type && tc.type !== 'function') continue;
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function?.name || '', input: parseArgs(tc.function?.arguments) });
      }
      push('assistant', blocks);
      continue;
    }
    push('user', toBlocks(m.content));
  }
  if (!messages.length || messages[0].role !== 'user') messages.unshift({ role: 'user', content: [{ type: 'text', text: '.' }] });

  const want = body.max_completion_tokens ?? body.max_tokens;
  const out = { model: upstreamModel, messages, max_tokens: Math.max(1, Math.min(Number(want) || (body.stream ? maxOutput : 16000), maxOutput)) };
  // (a huge max_tokens without streaming is refused upstream, so an unset one stays modest there)
  if (system.length) out.system = system;
  if (body.stream) out.stream = true;
  const stop = typeof body.stop === 'string' ? [body.stop] : Array.isArray(body.stop) ? body.stop.filter(Boolean) : [];
  if (stop.length) out.stop_sequences = stop.slice(0, 8);
  // temperature/top_p are left out on purpose: current Claude models reject non-default sampling with 400

  const tools = (body.tools || []).filter((t) => t?.type === 'function' && t.function?.name);
  if (tools.length) {
    out.tools = tools.map((t) => ({ name: t.function.name, description: t.function.description || '', input_schema: t.function.parameters || { type: 'object', properties: {} } }));
  }
  const tc = body.tool_choice;
  // forced tool choice (`required` / a named function) is a 400 on current models → auto
  if (tc === 'none') { out.tool_choice = { type: 'none' }; }
  else if (out.tools && body.parallel_tool_calls === false) out.tool_choice = { type: 'auto', disable_parallel_tool_use: true };
  if (tc === 'none' && !out.tools) delete out.tool_choice;

  const effort = body.reasoning_effort ?? body.reasoning?.effort;
  if (effort != null) {
    const e = String(effort).toLowerCase() === 'minimal' ? 'low' : String(effort).toLowerCase();
    if (EFFORTS.includes(e)) out.output_config = { effort: e };
  }
  const rf = body.response_format;
  if (rf?.type === 'json_schema' && rf.json_schema?.schema) out.output_config = { ...(out.output_config || {}), format: { type: 'json_schema', schema: rf.json_schema.schema } };

  // prompt caching: one breakpoint on the (stable) system prompt + automatic caching of the
  // growing conversation; at most 4 breakpoints in total, counting any the client already set
  let used = countCC(system) + messages.reduce((n, m) => n + countCC(m.content), 0);
  if (system.length && !countCC(system) && used < 3) { system[system.length - 1].cache_control = { type: 'ephemeral' }; used++; }
  if (used < 4) out.cache_control = { type: 'ephemeral' };
  return out;
}

const FINISH = { end_turn: 'stop', stop_sequence: 'stop', max_tokens: 'length', tool_use: 'tool_calls', refusal: 'content_filter', pause_turn: 'stop', model_context_window_exceeded: 'length' };

function openAIUsage(u = {}) {
  const read = u.cache_read_input_tokens || 0, write = u.cache_creation_input_tokens || 0;
  const prompt = (u.input_tokens || 0) + read + write;
  const completion = u.output_tokens || 0;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, prompt_tokens_details: { cached_tokens: read, cache_write_tokens: write } };
}

export function anthropicToOpenAIResponse(data, modelId) {
  let text = '', reasoning = '';
  const toolCalls = [];
  for (const b of data.content || []) {
    if (b.type === 'text') text += b.text || '';
    else if (b.type === 'thinking') reasoning += b.thinking || '';
    else if (b.type === 'tool_use') toolCalls.push({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } });
  }
  const message = { role: 'assistant', content: text || (toolCalls.length ? null : '') };
  if (reasoning) message.reasoning_content = reasoning;
  if (toolCalls.length) message.tool_calls = toolCalls;
  return {
    id: data.id ? `chatcmpl-${data.id}` : `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [{ index: 0, message, finish_reason: FINISH[data.stop_reason] || 'stop' }],
    usage: openAIUsage(data.usage),
  };
}

/** Stateful converter: feed parsed Anthropic stream events, get OpenAI SSE `data:` frames back. */
export class AnthropicToOpenAIStream {
  constructor(modelId, { includeUsage = true } = {}) {
    this.model = modelId;
    this.includeUsage = includeUsage;
    this.id = `chatcmpl-${Date.now()}`;
    this.created = Math.floor(Date.now() / 1000);
    this.roleSent = false;
    this.tools = new Map();  // anthropic block index -> openai tool_calls index
    this.finishReason = null;
    this.usage = {};
    this.done = false;
  }

  frame(delta, finish = null, extra = {}) {
    return `data: ${JSON.stringify({ id: this.id, object: 'chat.completion.chunk', created: this.created, model: this.model, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`;
  }

  role() {
    if (this.roleSent) return '';
    this.roleSent = true;
    return this.frame({ role: 'assistant', content: '' });
  }

  push(ev) {
    switch (ev.type) {
      case 'message_start':
        if (ev.message?.id) this.id = `chatcmpl-${ev.message.id}`;
        Object.assign(this.usage, ev.message?.usage || {});
        return this.role();
      case 'content_block_start': {
        const b = ev.content_block || {};
        if (b.type !== 'tool_use') return this.role();
        const i = this.tools.size;
        this.tools.set(ev.index, i);
        return this.role() + this.frame({ tool_calls: [{ index: i, id: b.id, type: 'function', function: { name: b.name, arguments: '' } }] });
      }
      case 'content_block_delta': {
        const d = ev.delta || {};
        if (d.type === 'text_delta' && d.text) return this.role() + this.frame({ content: d.text });
        if (d.type === 'thinking_delta' && d.thinking) return this.role() + this.frame({ reasoning_content: d.thinking });
        if (d.type === 'input_json_delta' && d.partial_json && this.tools.has(ev.index)) {
          return this.frame({ tool_calls: [{ index: this.tools.get(ev.index), function: { arguments: d.partial_json } }] });
        }
        return '';
      }
      case 'message_delta':
        if (ev.delta?.stop_reason) this.finishReason = FINISH[ev.delta.stop_reason] || 'stop';
        for (const [k, v] of Object.entries(ev.usage || {})) if (v != null) this.usage[k] = v;
        return '';
      case 'message_stop':
        return this.end();
      case 'error':
        this.done = true;
        return `data: ${JSON.stringify({ error: { message: ev.error?.message || 'upstream error', type: ev.error?.type || 'upstream_error' } })}\n\n`;
      default:
        return '';
    }
  }

  /** Called once the upstream stream closed (no-op when message_stop already ended it). */
  finish() { return this.end(); }

  end() {
    if (this.done) return '';
    this.done = true;
    let out = this.role() + this.frame({}, this.finishReason || 'stop');
    if (this.includeUsage) out += `data: ${JSON.stringify({ id: this.id, object: 'chat.completion.chunk', created: this.created, model: this.model, choices: [], usage: openAIUsage(this.usage) })}\n\n`;
    return out + 'data: [DONE]\n\n';
  }
}
