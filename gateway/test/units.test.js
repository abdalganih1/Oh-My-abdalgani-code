import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCost, pickSubscription } from '../src/billing.js';
import { anthropicToOpenAIRequest, openAIToAnthropicResponse, OpenAIToAnthropicStream, SSEParser } from '../src/translate.js';
import { encryptSecret, decryptSecret, safeEqual } from '../src/util.js';
import { weightedOrder } from '../src/routing.js';

test('computeCost: token / request / provider / markup', () => {
  const m = { pricing_mode: 'token', price_in: 3_000_000, price_out: 15_000_000, price_cache_read: 300_000, markup_pct: 0 };
  // 1M in, 1M out → $3 + $15
  assert.equal(computeCost(m, { prompt: 1e6, completion: 1e6, cached: 0 }), 18_000_000);
  // cached tokens billed at cache rate
  assert.equal(computeCost(m, { prompt: 1e6, completion: 0, cached: 1e6 }), 300_000);
  assert.equal(computeCost({ ...m, pricing_mode: 'request', price_request: 5000 }, { prompt: 99, completion: 99 }), 5000);
  assert.equal(computeCost({ ...m, pricing_mode: 'provider' }, { prompt: 0, completion: 0 }, 0.0123), 12_300);
  // provider mode without reported cost → token table
  assert.equal(computeCost({ ...m, pricing_mode: 'provider' }, { prompt: 1e6, completion: 0 }, null), 3_000_000);
  assert.equal(computeCost({ ...m, markup_pct: 10 }, { prompt: 1e6, completion: 0 }), 3_300_000);
});

test('pickSubscription priority + group restriction + expiry', () => {
  const t = 1000;
  const model = { id: 'x', group_id: 'coding' };
  const subs = [
    { id: 1, kind: 'usd', group_id: null, total: 10, used: 0, starts_at: 0, expires_at: null, disabled: 0 },
    { id: 2, kind: 'tokens', group_id: 'premium', total: 10, used: 0, starts_at: 0, expires_at: null, disabled: 0 },
    { id: 3, kind: 'tokens', group_id: 'coding', total: 10, used: 10, starts_at: 0, expires_at: null, disabled: 0 }, // exhausted
    { id: 4, kind: 'usd', group_id: 'coding', total: 10, used: 0, starts_at: 0, expires_at: 999, disabled: 0 },    // expired
    { id: 5, kind: 'tokens', group_id: null, total: 10, used: 0, starts_at: 0, expires_at: 5000, disabled: 0 },
  ];
  assert.equal(pickSubscription(subs, model, t).id, 5);
  assert.equal(pickSubscription(subs.filter((s) => s.id !== 5), model, t).id, 1);
  assert.equal(pickSubscription([subs[1]], model, t), null);
});

test('AES-GCM round trip + safeEqual', async () => {
  const blob = await encryptSecret('sk-live-123', 'secret');
  assert.notEqual(blob, 'sk-live-123');
  assert.equal(await decryptSecret(blob, 'secret'), 'sk-live-123');
  await assert.rejects(decryptSecret(blob, 'other'));
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
  assert.ok(!safeEqual('abc', 'abcd'));
});

test('weightedOrder keeps every key', () => {
  const keys = [{ id: 1, weight: 1 }, { id: 2, weight: 5 }, { id: 3, weight: 1 }];
  assert.deepEqual(weightedOrder(keys).map((k) => k.id).sort(), [1, 2, 3]);
});

test('anthropic → openai request translation (tools, tool results, images, system)', () => {
  const out = anthropicToOpenAIRequest({
    model: 'x', max_tokens: 100, stream: true, system: [{ type: 'text', text: 'be nice' }],
    tools: [{ name: 'read', description: 'read file', input_schema: { type: 'object' } }],
    tool_choice: { type: 'any' },
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'calling' }, { type: 'tool_use', id: 't1', name: 'read', input: { p: 1 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'data' }] }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }] },
    ],
  }, 'gpt-x');
  assert.equal(out.model, 'gpt-x');
  assert.equal(out.max_completion_tokens, 100);
  assert.deepEqual(out.stream_options, { include_usage: true });
  assert.equal(out.tool_choice, 'required');
  assert.equal(out.messages[0].role, 'system');
  assert.equal(out.messages[2].tool_calls[0].function.arguments, '{"p":1}');
  assert.deepEqual(out.messages[3], { role: 'tool', tool_call_id: 't1', content: 'data' });
  assert.equal(out.messages[4].content[0].image_url.url, 'data:image/png;base64,AAA');
  assert.equal(out.tools[0].function.name, 'read');
});

test('openai → anthropic response (non-stream)', () => {
  const r = openAIToAnthropicResponse({
    id: 'c1', choices: [{ finish_reason: 'tool_calls', message: { content: 'ok', tool_calls: [{ id: 't', function: { name: 'f', arguments: '{"a":2}' } }] } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }, 'abd-main');
  assert.equal(r.stop_reason, 'tool_use');
  assert.deepEqual(r.content[1], { type: 'tool_use', id: 't', name: 'f', input: { a: 2 } });
  assert.equal(r.usage.output_tokens, 5);
  assert.equal(r.model, 'abd-main');
});

test('openai → anthropic stream', () => {
  const s = new OpenAIToAnthropicStream('m');
  let out = s.push({ id: '1', choices: [{ delta: { content: 'Hel' } }] });
  out += s.push({ choices: [{ delta: { content: 'lo' } }] });
  out += s.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc', function: { name: 'f', arguments: '{"a"' } }] } }] });
  out += s.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':1}' } }] }, finish_reason: 'tool_calls' }] });
  out += s.push({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 3 } });
  out += s.finish();
  const events = new SSEParser().feed(out).map((f) => JSON.parse(f.data));
  assert.deepEqual(events.map((e) => e.type), [
    'message_start', 'content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_stop',
    'content_block_start', 'content_block_delta', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop',
  ]);
  assert.equal(events[5].content_block.name, 'f');
  assert.equal(events[9].delta.stop_reason, 'tool_use');
  assert.equal(events[9].usage.output_tokens, 3);
});

test('SSEParser handles split frames and CRLF', () => {
  const p = new SSEParser();
  assert.deepEqual(p.feed('data: {"a"'), []);
  assert.deepEqual(p.feed(':1}\r\n\r\nevent: x\ndata: 2\n\n'), [{ event: null, data: '{"a":1}' }, { event: 'x', data: '2' }]);
});

import { responsesToChatRequest, chatToResponsesResponse, ChatToResponsesStream } from '../src/responses.js';

test('responses → chat request (Codex style: instructions, custom tool, calls, outputs)', () => {
  const { chat, customTools } = responsesToChatRequest({
    model: 'abd-main', instructions: 'sys', stream: true, max_output_tokens: 99, reasoning: { effort: 'high' },
    tools: [{ type: 'function', name: 'shell', parameters: { type: 'object' } }, { type: 'custom', name: 'apply_patch', description: 'patch' }, { type: 'web_search' }],
    input: [
      { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'dev note' }] },
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'fix it' }] },
      { type: 'reasoning', summary: [] },
      { type: 'function_call', call_id: 'c1', name: 'shell', arguments: '{"cmd":"ls"}' },
      { type: 'custom_tool_call', call_id: 'c2', name: 'apply_patch', input: '*** Begin Patch' },
      { type: 'function_call_output', call_id: 'c1', output: 'a.js' },
      { type: 'custom_tool_call_output', call_id: 'c2', output: 'ok' },
    ],
  }, 'glm-5.2');
  assert.ok(customTools.has('apply_patch'));
  assert.equal(chat.model, 'glm-5.2');
  assert.equal(chat.max_completion_tokens, 99);
  assert.equal(chat.reasoning_effort, 'high');
  assert.equal(chat.tools.length, 2);
  assert.deepEqual(chat.messages.map((m) => m.role), ['system', 'system', 'user', 'assistant', 'tool', 'tool']);
  assert.equal(chat.messages[3].tool_calls.length, 2);
  assert.equal(chat.messages[3].tool_calls[1].function.arguments, '{"input":"*** Begin Patch"}');
});

test('chat → responses (non-stream + stream with custom tool)', () => {
  const custom = new Set(['apply_patch']);
  const r = chatToResponsesResponse({ choices: [{ finish_reason: 'tool_calls', message: { content: 'ok', tool_calls: [{ id: 'x', function: { name: 'apply_patch', arguments: '{"input":"P"}' } }] } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }, 'abd-main', {}, custom);
  assert.equal(r.output[0].content[0].text, 'ok');
  assert.deepEqual([r.output[1].type, r.output[1].input, r.output[1].call_id], ['custom_tool_call', 'P', 'x']);
  assert.equal(r.usage.total_tokens, 5);

  const s = new ChatToResponsesStream('m', {}, new Set());
  let out = s.push({ choices: [{ delta: { content: 'He' } }] }) + s.push({ choices: [{ delta: { content: 'y' } }] });
  out += s.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c', function: { name: 'shell', arguments: '{"a"' } }] } }] });
  out += s.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':1}' } }] }, finish_reason: 'tool_calls' }] });
  out += s.push({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 4 } });
  out += s.finish();
  const ev = new SSEParser().feed(out).map((f) => JSON.parse(f.data));
  const types = ev.map((e) => e.type);
  assert.equal(types[0], 'response.created');
  assert.ok(types.includes('response.output_text.delta'));
  assert.ok(types.includes('response.function_call_arguments.delta'));
  const done = ev.at(-1);
  assert.equal(done.type, 'response.completed');
  assert.equal(done.response.output[0].content[0].text, 'Hey');
  assert.equal(done.response.output[1].arguments, '{"a":1}');
  assert.equal(done.response.usage.output_tokens, 4);
  assert.deepEqual(ev.map((e) => e.sequence_number), ev.map((_, i) => i));
});

import { mapEffort, applyCompat } from '../src/routing.js';

test('mapEffort: nearest supported level, never silently disables reasoning', () => {
  const lmh = ['low', 'medium', 'high'];
  assert.equal(mapEffort('medium', lmh), 'medium');
  assert.equal(mapEffort('xhigh', lmh), 'high');
  assert.equal(mapEffort('max', lmh), 'high');
  assert.equal(mapEffort('ultra', ['none', 'low', 'high', 'max']), 'max');
  assert.equal(mapEffort('minimal', lmh), 'low');
  assert.equal(mapEffort('none', lmh), null);
  assert.equal(mapEffort('high', undefined), 'high');
  assert.equal(mapEffort('bogus', lmh), null);
});

test('applyCompat: max tokens field, developer role, effort', () => {
  const zai = { compat: '{"max_tokens_field":"max_tokens","developer_role":false,"efforts":["low","medium","high"]}' };
  const out = applyCompat({ max_completion_tokens: 50, reasoning_effort: 'xhigh', messages: [{ role: 'developer', content: 'x' }] }, zai);
  assert.deepEqual(out, { max_tokens: 50, reasoning_effort: 'high', messages: [{ role: 'system', content: 'x' }] });
  const oa = applyCompat({ max_tokens: 10 }, { compat: '{"max_tokens_field":"max_completion_tokens"}' });
  assert.deepEqual(oa, { max_completion_tokens: 10 });
  assert.deepEqual(applyCompat({ reasoning_effort: 'none' }, zai), {});
  assert.deepEqual(applyCompat({ a: 1 }, { compat: 'not json' }), { a: 1 });
});
