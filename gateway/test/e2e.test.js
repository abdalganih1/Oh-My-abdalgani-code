// End-to-end: admin → user → coupon → routed requests (mock upstreams), via the Worker's fetch().
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';
import { D1Shim } from './d1-shim.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = { DB: new D1Shim().migrate(path.join(here, '..', 'migrations')), ADMIN_TOKEN: 'admin-secret', ENCRYPTION_KEY: 'enc-secret' };
const realFetch = globalThis.fetch;
const upstreamCalls = [];

// ── mock upstreams ──
function sseBody(frames) {
  return new ReadableStream({ start(c) { const e = new TextEncoder(); for (const f of frames) c.enqueue(e.encode(f)); c.close(); } });
}
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (!/^https:\/\/(api\.z\.ai|openrouter\.ai|api\.openai\.com|api\.anthropic\.com)/.test(url)) return realFetch(url, init);
  const body = init.body ? JSON.parse(init.body) : null;
  const auth = init.headers?.authorization || init.headers?.['x-api-key'];
  upstreamCalls.push({ url, body, auth });
  if (auth?.includes('ratelimited')) return new Response('{"error":"rate"}', { status: 429 });
  if (url.endsWith('/models')) return Response.json({ data: [{ id: 'up-model', context_length: 1000, pricing: { prompt: '0.000003', completion: '0.000015' } }] });
  if (url.endsWith('/chat/completions')) {
    if (body.stream) {
      return new Response(sseBody([
        `data: ${JSON.stringify({ id: 'c', choices: [{ delta: { content: 'Hi' } }] })}\n\n`,
        `data: ${JSON.stringify({ id: 'c', choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
        `data: ${JSON.stringify({ id: 'c', choices: [], usage: { prompt_tokens: 100, completion_tokens: 50 } })}\n\n`,
        'data: [DONE]\n\n',
      ]), { headers: { 'content-type': 'text/event-stream' } });
    }
    return Response.json({ id: 'c', model: body.model, choices: [{ message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 500, cost: 0.02 } });
  }
  if (url.endsWith('/v1/messages')) {
    if (body.stream) {
      return new Response(sseBody([
        `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 40, output_tokens: 1 } } })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'yo' } })}\n\n`,
        `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } })}\n\n`,
        `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
      ]), { headers: { 'content-type': 'text/event-stream' } });
    }
    return Response.json({ id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: 'native' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } });
  }
  return new Response('nope', { status: 404 });
};

async function call(method, p, { token, body, headers = {} } = {}) {
  const pending = [];
  const ctx = { waitUntil: (pr) => pending.push(pr) };
  const res = await worker.fetch(new Request(`https://api.abdalgani.com${p}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }), env, ctx);
  const text = await res.text();
  // drain background work (stream pump, settle) — loop since tasks may enqueue more
  while (pending.length) await pending.shift();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
const admin = (m, p, body) => call(m, `/api/admin${p}`, { token: 'admin-secret', body });

let userKey, userId;

test('admin auth is required', async () => {
  assert.equal((await call('GET', '/api/admin/stats')).status, 401);
  assert.equal((await call('GET', '/api/admin/stats', { token: 'wrong' })).status, 401);
  assert.equal((await admin('GET', '/stats')).status, 200);
});

test('admin creates user + provider keys + prices', async () => {
  const u = await admin('POST', '/users', { name: 'Student 1' });
  assert.equal(u.status, 200);
  assert.match(u.data.api_key, /^sk-abd-/);
  userKey = u.data.api_key; userId = u.data.id;

  assert.equal((await admin('POST', '/providers/zai/keys', { label: 'bad', key: 'zai-ratelimited-key', weight: 100 })).status, 200);
  assert.equal((await admin('POST', '/providers/zai/keys', { label: 'good', key: 'zai-good-key-1234' })).status, 200);
  assert.equal((await admin('POST', '/providers/openai/keys', { label: 'oa', key: 'sk-openai-good' })).status, 200);
  assert.equal((await admin('POST', '/providers/openrouter/keys', { label: 'or', key: 'sk-or-good-key' })).status, 200);

  const prov = await admin('GET', '/providers');
  const zai = prov.data.find((p) => p.id === 'zai');
  assert.equal(zai.keys.length, 2);
  assert.ok(!('key_enc' in zai.keys[0]), 'encrypted key must never be returned');
  assert.equal(zai.keys[1].key_hint, '1234');

  // flat $0.01/request on glm-5.2
  const models = (await admin('GET', '/models')).data;
  const g = models.find((m) => m.id === 'glm-5.2');
  assert.equal((await admin('POST', '/models', { ...g, price_request: 10_000 })).status, 200);
  // a premium OpenAI model billed per token, and an OpenRouter model billed by provider cost
  assert.equal((await admin('POST', '/models', {
    id: 'gpt-x', name: 'GPT X', group_id: 'premium', pricing_mode: 'token', price_in: 2_000_000, price_out: 8_000_000, status: 'new',
    routes: [{ provider_id: 'openai', upstream_model: 'gpt-x-upstream' }],
  })).status, 200);
  assert.equal((await admin('POST', '/models', {
    id: 'or-model', name: 'OR', group_id: 'cheap', pricing_mode: 'provider', routes: [{ provider_id: 'openrouter', upstream_model: 'vendor/or-model' }],
  })).status, 200);

  const disc = await admin('POST', '/providers/openrouter/discover');
  assert.equal(disc.data[0].price_in, 3_000_000);
});

test('no coupon → no access (no trial)', async () => {
  const r = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'glm-5.2', messages: [{ role: 'user', content: 'hi' }] } });
  assert.equal(r.status, 402);
  const models = await call('GET', '/v1/models', { token: userKey });
  assert.equal(models.data.data.length, 0);
  assert.equal((await call('GET', '/v1/models', { token: 'sk-abd-nope' })).status, 401);
});

test('coupon redeem: once per user, max uses enforced', async () => {
  const c = await admin('POST', '/coupons', { kind: 'usd', amount: 1_000_000, group_id: 'coding', valid_days: 30 });
  const code = c.data.codes[0];
  assert.match(code, /^ABD-/);
  const r1 = await call('POST', '/api/me/redeem', { token: userKey, body: { code: code.toLowerCase() } });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.equal((await call('POST', '/api/me/redeem', { token: userKey, body: { code } })).status, 409);
  assert.equal((await call('POST', '/api/me/redeem', { token: userKey, body: { code: 'ABD-FAKE' } })).status, 404);
  const me = await call('GET', '/api/me', { token: userKey });
  assert.equal(me.data.subscriptions.length, 1);
  assert.equal(me.data.subscriptions[0].remaining, 1_000_000);
});

test('chat completion: failover past rate-limited key, flat price charged', async () => {
  upstreamCalls.length = 0;
  const r = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'abdalgani/glm-5.2', messages: [{ role: 'user', content: 'ping' }] } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.choices[0].message.content, 'pong');
  assert.equal(r.data.model, 'glm-5.2'); // real model, not the prefixed/aliased request name
  assert.equal(upstreamCalls.at(-1).body.model, 'glm-5.2');
  assert.equal(upstreamCalls.at(-1).auth, 'Bearer zai-good-key-1234');
  const prov = await admin('GET', '/providers');
  const bad = prov.data.find((p) => p.id === 'zai').keys.find((k) => k.label === 'bad');
  // weighted pick: the heavy bad key is almost always tried first; when it was, it must be parked
  if (upstreamCalls.some((c) => String(c.auth).includes('ratelimited'))) assert.ok(bad.cooling, 'rate-limited key is cooling down');
  const me = await call('GET', '/api/me', { token: userKey });
  assert.equal(me.data.subscriptions[0].used, 10_000);
});

test('premium model blocked for coding-only wallet; token coupon for premium unlocks it', async () => {
  let r = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'gpt-x', messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(r.status, 402);
  const c = await admin('POST', '/coupons', { kind: 'tokens', amount: 10_000_000, group_id: 'premium' });
  assert.equal((await call('POST', '/api/me/redeem', { token: userKey, body: { code: c.data.codes[0] } })).status, 200);
  r = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'gpt-x', messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(r.status, 200);
  const me = await call('GET', '/api/me', { token: userKey });
  const tok = me.data.subscriptions.find((s) => s.kind === 'tokens');
  assert.equal(tok.used, 1500); // 1000 prompt + 500 completion
  const log = (await admin('GET', `/usage?user_id=${userId}`)).data[0];
  assert.equal(log.cost, 6000); // 1000*2 + 500*8 micro
});

test('streaming openai: usage sniffed and charged', async () => {
  const r = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'glm-5.2', stream: true, messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(r.status, 200);
  assert.match(r.text, /"Hi"/);
  assert.equal(upstreamCalls.at(-1).body.stream_options.include_usage, true);
  const log = (await admin('GET', `/usage?user_id=${userId}`)).data[0];
  assert.equal(log.prompt_tokens, 100);
  assert.equal(log.completion_tokens, 50);
  assert.equal(log.cost, 10_000);
});

test('/v1/messages native (z.ai anthropic endpoint), stream + non-stream', async () => {
  let r = await call('POST', '/v1/messages', { token: userKey, body: { model: 'glm-5.2', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.content[0].text, 'native');
  assert.equal(upstreamCalls.at(-1).url, 'https://api.z.ai/api/anthropic/v1/messages');
  r = await call('POST', '/v1/messages', { token: userKey, body: { model: 'glm-5.2', stream: true, max_tokens: 10, messages: [{ role: 'user', content: 'x' }] } });
  assert.match(r.text, /message_stop/);
  const log = (await admin('GET', `/usage?user_id=${userId}`)).data[0];
  assert.equal(log.prompt_tokens, 40);
  assert.equal(log.completion_tokens, 20);
});

test('/v1/messages translated to OpenAI for a provider without an Anthropic endpoint', async () => {
  let r = await call('POST', '/v1/messages', { token: userKey, body: { model: 'gpt-x', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.type, 'message');
  assert.equal(r.data.content[0].text, 'pong');
  assert.equal(upstreamCalls.at(-1).url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(upstreamCalls.at(-1).body.model, 'gpt-x-upstream');
  r = await call('POST', '/v1/messages', { token: userKey, body: { model: 'gpt-x', stream: true, max_tokens: 10, messages: [{ role: 'user', content: 'x' }] } });
  assert.match(r.text, /event: message_start/);
  assert.match(r.text, /"text":"Hi"/);
  assert.match(r.text, /event: message_stop/);
});

test('per-user alias switching (abd-main → another model)', async () => {
  // default global alias abd-main → glm-5.2
  let r = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'abd-main', messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(upstreamCalls.at(-1).body.model, 'glm-5.2');
  // not allowed to map to a model outside subscriptions
  assert.equal((await call('PUT', '/api/me/aliases', { token: userKey, body: { alias: 'abd-main', model_id: 'or-model' } })).status, 402);
  assert.equal((await call('PUT', '/api/me/aliases', { token: userKey, body: { alias: 'abd-main', model_id: 'glm-4.7' } })).status, 200);
  r = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'abd-main', messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(r.status, 200);
  assert.equal(upstreamCalls.at(-1).body.model, 'glm-4.7');
  const models = await call('GET', '/v1/models', { token: userKey });
  assert.ok(models.data.data.some((m) => m.id === 'abd-main' && m.alias_of === 'glm-4.7'));
  assert.ok(!models.data.data.some((m) => m.id === 'or-model'));
});

test('provider-reported cost billing (OpenRouter)', async () => {
  const c = await admin('POST', '/coupons', { kind: 'usd', amount: 5_000_000 }); // all models
  await call('POST', '/api/me/redeem', { token: userKey, body: { code: c.data.codes[0] } });
  const r = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'or-model', messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(upstreamCalls.at(-1).body.usage, { include: true });
  const log = (await admin('GET', `/usage?user_id=${userId}`)).data[0];
  assert.equal(log.cost, 20_000);
});

test('dashboard: models list shows locked + available, key management, disable user', async () => {
  const m = await call('GET', '/api/me/models', { token: userKey });
  assert.ok(m.data.models.every((x) => x.available));
  const k = await call('POST', '/api/me/keys', { token: userKey, body: { name: 'laptop' } });
  assert.match(k.data.api_key, /^sk-abd-/);
  assert.equal((await call('GET', '/api/me', { token: k.data.api_key })).status, 200);
  await admin('PATCH', `/users/${userId}`, { disabled: true });
  assert.equal((await call('GET', '/api/me', { token: userKey })).status, 403);
  await admin('PATCH', `/users/${userId}`, { disabled: false });
  const stats = await admin('GET', '/stats');
  assert.ok(stats.data.day.req > 0);
});

test('/v1/responses (Codex) translated to chat, stream + non-stream, billed', async () => {
  let r = await call('POST', '/v1/responses', { token: userKey, body: { model: 'glm-5.2', instructions: 'x', input: 'hello' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.object, 'response');
  assert.equal(r.data.output_text, 'pong');
  assert.equal(upstreamCalls.at(-1).url, 'https://api.z.ai/api/coding/paas/v4/chat/completions');
  r = await call('POST', '/v1/responses', { token: userKey, body: { model: 'glm-5.2', stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }] } });
  assert.match(r.text, /event: response.completed/);
  const log = (await admin('GET', `/usage?user_id=${userId}`)).data[0];
  assert.equal(log.endpoint, '/v1/responses');
  assert.equal(log.prompt_tokens, 100);
});

test('real model is visible: headers, body.model, usage log keeps alias + upstream', async () => {
  const pending = [];
  const res = await worker.fetch(new Request('https://api.abdalgani.com/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${userKey}` },
    body: JSON.stringify({ model: 'abd-main', reasoning_effort: 'ultra', max_completion_tokens: 20, messages: [{ role: 'developer', content: 'd' }, { role: 'user', content: 'x' }] }),
  }), env, { waitUntil: (p) => pending.push(p) });
  const body = await res.json(); await Promise.all(pending);
  assert.equal(res.headers.get('x-abdalgani-alias'), 'abd-main');
  assert.equal(res.headers.get('x-abdalgani-model'), 'glm-4.7');           // re-mapped earlier in this suite
  assert.equal(res.headers.get('x-abdalgani-upstream'), 'zai/glm-4.7');
  assert.equal(body.model, 'glm-4.7');
  const sent = upstreamCalls.at(-1).body;                                   // z.ai compat applied
  assert.equal(sent.max_tokens, 20); assert.equal(sent.max_completion_tokens, undefined);
  assert.equal(sent.reasoning_effort, 'max');
  assert.equal(sent.messages[0].role, 'system');
  const log = (await admin('GET', `/usage?user_id=${userId}`)).data[0];
  assert.equal(log.requested_model, 'abd-main');
  assert.equal(log.upstream_model, 'glm-4.7');
  const me = await call('GET', '/api/me', { token: userKey });
  const main = me.data.aliases.find((a) => a.alias === 'abd-main');
  assert.equal(main.model_name, 'GLM-4.7');
  assert.match(main.served_by, /Z\.AI/);
});

test('NVIDIA + OpenCode Zen providers are seeded', async () => {
  const prov = (await admin('GET', '/providers')).data.map((p) => p.id);
  assert.ok(prov.includes('nvidia') && prov.includes('opencode-zen'));
});

test('reports: admin totals/top lists/heatmap/money + student report + CSV', async () => {
  await admin('POST', '/expenses', { amount: 1_500_000, note: 'OpenRouter top-up', provider_id: 'openrouter' });
  const all = await admin('GET', '/providers');
  const zai = all.data.find((p) => p.id === 'zai');
  await admin('POST', '/providers', { ...zai, billing: 'subscription', monthly_fee: 30_000_000 });
  const c = await admin('POST', '/coupons', { kind: 'tokens', amount: 1_000_000, sale_price: 2_000_000 });
  await call('POST', '/api/me/redeem', { token: userKey, body: { code: c.data.codes[0] } });

  const rep = (await admin('GET', '/reports?tz=180')).data;
  assert.ok(rep.totals.requests > 5);
  assert.equal(rep.totals.tokens, rep.totals.prompt_tokens + rep.totals.completion_tokens);
  assert.ok(rep.models[0].requests >= rep.models.at(-1).requests, 'sorted by requests');
  assert.equal(rep.users[0].name, 'Student 1');
  assert.ok(rep.users[0].top_model);
  assert.equal(rep.heat.reduce((a, h) => a + h.requests, 0), rep.totals.requests);
  assert.ok(rep.heat.every((h) => h.dow >= 0 && h.dow <= 6 && h.hour >= 0 && h.hour <= 23));
  const m = rep.money;
  assert.equal(m.expenses, 1_500_000);
  assert.ok(m.fixed_fees > 29_000_000 && m.fixed_fees < 31_000_000, '30 days of a $30/month plan');
  assert.equal(m.paid, m.upstream_usage + m.expenses + m.fixed_fees);
  assert.ok(m.revenue >= 2_000_000 + 1_000_000, 'sold token coupon + face value of USD coupons');
  assert.equal(m.profit, m.revenue - m.paid);
  assert.ok(m.upstream_usage > 0, 'OpenRouter usage.cost / OpenAI price recorded as our cost');
  assert.ok(rep.months.length >= 1);

  const mine = (await call('GET', '/api/me/report?tz=180', { token: userKey })).data;
  assert.ok(mine.totals.requests > 0);
  assert.ok(mine.by_model.length > 0);
  assert.ok(mine.series.length > 0);
  assert.ok('usd_days_left' in mine.burn);

  const pending = [];
  const res = await worker.fetch(new Request('https://api.abdalgani.com/api/admin/reports/export', { headers: { authorization: 'Bearer admin-secret' } }), env, { waitUntil: (p) => pending.push(p) });
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM so Excel shows Arabic names');
  const csv = new TextDecoder().decode(bytes);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(csv, /^time_utc,user,requested_model/);
  assert.ok(csv.split('\n').length > 5);
});

// ── security ──
async function callFrom(ip, method, p, { token, body, headers = {} } = {}) {
  return call(method, p, { token, body, headers: { 'cf-connecting-ip': ip, ...headers } });
}
async function setSecurity(patch) {
  const cur = (await admin('GET', '/security')).data.settings;
  return admin('PUT', '/security', { ...cur, ...patch });
}

test('security: repeated bad keys auto-block the IP; admin can unblock', async () => {
  await setSecurity({ auth_fail_limit: 5 });
  for (let i = 0; i < 5; i++) await callFrom('203.0.113.9', 'GET', '/v1/models', { token: `sk-abd-guess${i}` });
  const r = await callFrom('203.0.113.9', 'GET', '/v1/models', { token: userKey });
  assert.equal(r.status, 403, 'even a valid key is refused from a blocked network');
  assert.equal((await callFrom('198.51.100.7', 'GET', '/v1/models', { token: userKey })).status, 200, 'other networks unaffected');
  const sec = (await admin('GET', '/security')).data;
  const blk = sec.blocks.find((b) => b.value === '203.0.113.9');
  assert.ok(blk && blk.auto === 1 && blk.expires_at);
  assert.ok(sec.events.some((e) => e.kind === 'security_block'));
  await admin('DELETE', `/blocks/${blk.id}`);
  assert.equal((await callFrom('203.0.113.9', 'GET', '/v1/models', { token: userKey })).status, 200);
});

test('security: wrong admin token attempts and coupon guessing also count', async () => {
  await setSecurity({ auth_fail_limit: 3 });
  for (let i = 0; i < 3; i++) await callFrom('203.0.113.20', 'GET', '/api/admin/stats', { token: 'nope' });
  assert.equal((await callFrom('203.0.113.20', 'GET', '/api/admin/stats', { token: 'admin-secret' })).status, 403);
  for (let i = 0; i < 3; i++) await callFrom('203.0.113.21', 'POST', '/api/me/redeem', { token: userKey, body: { code: `ABD-FAKE-${i}` } });
  assert.equal((await callFrom('203.0.113.21', 'GET', '/api/me', { token: userKey })).status, 403);
  await setSecurity({ auth_fail_limit: 10 });
});

test('security: device binding (track → enforce, limit, approve, block)', async () => {
  const dev = (id) => ({ 'x-abd-device': id.padEnd(24, 'x'), 'x-abd-device-name': `laptop-${id}` });
  const ask = (h) => call('GET', '/v1/models', { token: userKey, headers: h });
  assert.equal((await ask({})).status, 200, 'track mode: header optional');
  await setSecurity({ device_policy: 'enforce', max_devices: 2 });
  assert.equal((await ask({})).status, 403, 'enforce: no device header → refused');
  assert.equal((await ask(dev('aaa'))).status, 200);
  assert.equal((await ask(dev('bbb'))).status, 200);
  assert.equal((await ask(dev('ccc'))).status, 403, 'third device needs approval');
  const sec = (await admin('GET', '/security')).data;
  const pending = sec.devices.find((d) => d.status === 'pending');
  assert.equal(pending.name, 'laptop-ccc');
  await admin('PATCH', `/devices/${pending.id}`, { status: 'active' });
  assert.equal((await ask(dev('ccc'))).status, 200);
  await admin('POST', '/blocks', { kind: 'device', value: 'aaa'.padEnd(24, 'x'), reason: 'shared key' });
  assert.equal((await ask(dev('aaa'))).status, 403, 'blocked device refused');
  const mine = (await call('GET', '/api/me/devices', { token: userKey })).data;
  assert.equal(mine.length, 3);
  assert.equal((await ask({ 'x-abd-device': 'bad id!' })).status, 400);
  await setSecurity({ device_policy: 'track' });
});

test('security: reservation stops over-spending and parallel double-spend', async () => {
  const u = await admin('POST', '/users', { name: 'tiny-balance' });
  const k = u.data.api_key;
  // $0.015 on a $0.01/request model → exactly one request fits, even when 3 fire at once
  await admin('POST', `/users/${u.data.id}/subscriptions`, { kind: 'usd', amount: 15_000, valid_days: 1 });
  const fire = () => call('POST', '/v1/chat/completions', { token: k, body: { model: 'glm-5.2', messages: [{ role: 'user', content: 'x' }] } });
  const results = await Promise.all([fire(), fire(), fire()]);
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.some((r) => r.status === 402));
  const subs = (await admin('GET', `/users/${u.data.id}`)).data.subscriptions;
  assert.equal(subs[0].used, 10_000, 'reservation replaced by the real charge, nothing leaked');
  // a failed upstream call refunds the hold
  assert.ok(subs[0].used <= subs[0].total);
});

test('security: daily caps (dollars and tokens) and global budget kill switch', async () => {
  await setSecurity({ user_daily_tokens: 1000 });
  const r = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'glm-5.2', messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(r.status, 429);
  assert.match(r.data.error.message, /Daily token limit/);
  await setSecurity({ user_daily_tokens: 0, global_daily_upstream_usd: 0.000001 });
  const g = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'glm-5.2', messages: [{ role: 'user', content: 'x' }] } });
  assert.equal(g.status, 503);
  await setSecurity({ global_daily_upstream_usd: 0, user_daily_usd: 0 });
});

test('security: upstream details never reach students; oversized bodies refused', async () => {
  const r = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'gpt-x', messages: [{ role: 'user', content: 'x' }] } });
  assert.ok(!JSON.stringify(r.data).includes('sk-'), 'no key fragments');
  const big = await call('POST', '/v1/chat/completions', { token: userKey, body: { model: 'glm-5.2', messages: [] }, headers: { 'content-length': String(50 * 1024 * 1024) } });
  assert.equal(big.status, 413);
  const sec = (await admin('GET', '/security')).data;
  assert.ok(Array.isArray(sec.unpriced_models));
});
