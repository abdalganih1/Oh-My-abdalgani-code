// Model lifecycle: discovery → auto-publish ("new" 7 days) → removal/health archiving → restore.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';
import { D1Shim } from './d1-shim.js';
import { runMaintenance, shouldArchive, recordFail, recordOk, normalizeUpstreamModel } from '../src/lifecycle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = { DB: new D1Shim().migrate(path.join(here, '..', 'migrations')), ADMIN_TOKEN: 'adm', ENCRYPTION_KEY: 'k', NOTIFY_WEBHOOK: 'https://hooks.example.com/x' };
const H = 3600, D = 86400, T0 = 1_800_000_000;
const catalogs = {
  zai: [{ id: 'glm-5.2' }, { id: 'glm-5.1' }, { id: 'glm-4.7' }],
  nvidia: [{ id: 'meta/llama-4' }],
  openrouter: [{ id: 'z-ai/glm-5.2', pricing: { prompt: '0.000001', completion: '0.000004' } }],
};
const webhooks = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://hooks.example.com')) { webhooks.push(JSON.parse(init.body)); return new Response('ok'); }
  const pid = url.includes('api.z.ai') ? 'zai' : url.includes('nvidia') ? 'nvidia' : url.includes('openrouter') ? 'openrouter' : null;
  if (pid && url.endsWith('/models')) return Response.json({ data: catalogs[pid] });
  if (url.endsWith('/chat/completions')) return Response.json({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  return new Response('nope', { status: 404 });
};
async function call(method, p, token, body) {
  const pending = [];
  const res = await worker.fetch(new Request(`https://gw${p}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) }), env, { waitUntil: (x) => pending.push(x) });
  const data = await res.json().catch(() => null); await Promise.all(pending);
  return { status: res.status, data };
}
const admin = (m, p, b) => call(m, `/api/admin${p}`, 'adm', b);
const model = (id) => env.DB.prepare('SELECT * FROM models WHERE id = ?').bind(id).first();
const events = async () => (await admin('GET', '/events')).data;
let student;

test('pure helpers', () => {
  assert.ok(shouldArchive({ first_fail_at: 10, last_fail_at: 10 + 6 * H }, 6));
  assert.ok(!shouldArchive({ first_fail_at: 10, last_fail_at: 10 + 5 * H }, 6), 'a 5h rate-limit window never archives');
  assert.ok(!shouldArchive({ first_fail_at: 10, last_fail_at: 10 + 7 * H, last_ok_at: 11 }, 6));
  assert.ok(!shouldArchive({ first_fail_at: null, last_fail_at: null }, 6));
  assert.equal(normalizeUpstreamModel({ id: 'x/y:free' }).free, 1);
  assert.equal(normalizeUpstreamModel({ id: 'a', pricing: { prompt: '0', completion: '0' } }).free, 1);
  assert.equal(normalizeUpstreamModel({ id: 'a', pricing: { prompt: '0.000003', completion: '0.000015' } }).price_in, 3_000_000);
});

test('setup: keys + a student with credit', async () => {
  for (const p of ['zai', 'nvidia', 'openrouter']) assert.equal((await admin('POST', `/providers/${p}/keys`, { label: 'k', key: `${p}-key-123456` })).status, 200);
  const u = await admin('POST', '/users', { name: 's' });
  student = u.data.api_key;
  const c = await admin('POST', '/coupons', { kind: 'usd', amount: 5_000_000 });
  assert.equal((await call('POST', '/api/me/redeem', student, { code: c.data.codes[0] })).status, 200);
});

test('first sync is a silent baseline', async () => {
  const s = await runMaintenance(env, { now: T0 });
  const synced = s.sync.filter((x) => !x.skipped);
  assert.deepEqual(synced.map((x) => x.provider).sort(), ['nvidia', 'openrouter', 'zai']);
  assert.ok(synced.every((x) => x.baseline));
  assert.equal((await events()).filter((e) => e.kind.startsWith('model_')).length, 0);
});

test('new upstream models: z.ai auto-published as "new", free OpenRouter published, others announced', async () => {
  catalogs.zai.push({ id: 'glm-5.5-flash' });
  catalogs.nvidia.push({ id: 'nvidia/nemotron-5' });
  catalogs.openrouter.push({ id: 'vendor/cool-model:free', pricing: { prompt: '0', completion: '0' } }, { id: 'vendor/paid', pricing: { prompt: '0.00001', completion: '0.00002' } });
  await runMaintenance(env, { now: T0 + H });
  const m = await model('glm-5.5-flash');
  assert.equal(m.status, 'new'); assert.equal(m.group_id, 'coding'); assert.equal(m.auto_source, 'zai');
  const free = await model('cool-model-free');
  assert.equal(free.group_id, 'cheap'); assert.equal(free.price_in, 0);
  assert.equal(await model('paid'), null, 'paid OpenRouter models wait for the admin');
  const ev = await events();
  assert.ok(ev.some((e) => e.kind === 'model_discovered' && e.message.includes('nvidia/nemotron-5')));
  assert.ok(ev.some((e) => e.kind === 'model_published' && e.model_id === 'glm-5.5-flash'));
  const pending = (await admin('GET', '/catalog?pending=1')).data.map((x) => x.upstream_id);
  assert.deepEqual(pending.sort(), ['nvidia/nemotron-5', 'vendor/paid']);
  assert.ok(webhooks.at(-1).text.includes('glm-5.5-flash'), 'admin gets pushed');
  // students see it immediately
  const list = (await call('GET', '/v1/models', student)).data.data.map((x) => x.id);
  assert.ok(list.includes('glm-5.5-flash'));
});

test('"new" expires after 7 days; admin-added models start as "new"', async () => {
  await admin('POST', '/models', { id: 'manual-one', name: 'Manual', status: 'active', routes: [{ provider_id: 'zai', upstream_model: 'glm-5.2' }] });
  assert.equal((await model('manual-one')).status, 'new');
  await runMaintenance(env, { now: T0 + 8 * D, sync: false });
  assert.equal((await model('glm-5.5-flash')).status, 'active');
});

test('model removed by the provider → archived after 6h (not before), student falls back, then restored', async () => {
  await call('PUT', '/api/me/aliases', student, { alias: 'abd-main', model_id: 'glm-4.7' });
  catalogs.zai = catalogs.zai.filter((m) => m.id !== 'glm-4.7');
  const t = T0 + 9 * D;
  await runMaintenance(env, { now: t });
  assert.notEqual((await model('glm-4.7')).status, 'archived', 'missing for 0h — keep');
  await runMaintenance(env, { now: t + 7 * H });
  assert.equal((await model('glm-4.7')).status, 'archived');
  assert.equal((await call('POST', '/v1/chat/completions', student, { model: 'glm-4.7', messages: [{ role: 'user', content: 'x' }] })).status, 410);
  const r = await call('POST', '/v1/chat/completions', student, { model: 'abd-main', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.status, 200); assert.equal(r.data.model, 'glm-5.2', 'archived personal pick → admin default');
  assert.ok(!(await call('GET', '/v1/models', student)).data.data.some((m) => m.id === 'glm-4.7'));
  const mine = (await call('GET', '/api/me/models', student)).data.models.find((m) => m.id === 'glm-4.7');
  assert.equal(mine.status, 'archived'); assert.equal(mine.available, false);
  catalogs.zai.push({ id: 'glm-4.7' });
  await runMaintenance(env, { now: t + 8 * H });
  assert.notEqual((await model('glm-4.7')).status, 'archived');
});

test('provider failing for 6h with no success → archived; a 5h rate-limit is tolerated; new key restores', async () => {
  const t = T0 + 20 * D;
  const route = await env.DB.prepare("SELECT id FROM model_routes WHERE provider_id = 'openrouter' LIMIT 1").first();
  await recordFail(env.DB, 'openrouter', route.id, 429, 'rate limited', t);
  await recordFail(env.DB, 'openrouter', route.id, 429, 'rate limited', t + 5 * H);
  await recordOk(env.DB, 'openrouter', route.id, t + 5 * H + 60);
  await runMaintenance(env, { now: t + 6 * H, sync: false });
  assert.equal((await env.DB.prepare("SELECT archived_at FROM providers WHERE id='openrouter'").first()).archived_at, null);

  await recordFail(env.DB, 'openrouter', route.id, 401, 'subscription cancelled', t + 7 * H);
  await recordFail(env.DB, 'openrouter', route.id, 401, 'subscription cancelled', t + 13 * H + 1);
  await runMaintenance(env, { now: t + 13 * H + 2, sync: false });
  const p = await env.DB.prepare("SELECT * FROM providers WHERE id='openrouter'").first();
  assert.ok(p.archived_at); assert.match(p.archived_reason, /401/);
  assert.equal((await model('cool-model-free')).status, 'archived', 'its only route is gone');
  assert.ok((await events()).some((e) => e.kind === 'provider_archived'));
  const res = await admin('POST', '/providers/openrouter/keys', { label: 'renewed', key: 'or-new-key-999' });
  assert.equal(res.data.restored, true);
  await runMaintenance(env, { now: t + 14 * H, sync: false });
  assert.notEqual((await model('cool-model-free')).status, 'archived');
});

test('route failing 6h while its provider serves other models → only that route archived', async () => {
  const t = T0 + 30 * D;
  const r51 = await env.DB.prepare("SELECT id FROM model_routes WHERE model_id = 'glm-5.1'").first();
  const r52 = await env.DB.prepare("SELECT id FROM model_routes WHERE model_id = 'glm-5.2' AND provider_id = 'zai'").first();
  await recordFail(env.DB, 'zai', r51.id, 404, 'model not found', t);
  await recordOk(env.DB, 'zai', r52.id, t + 3 * H);
  await recordFail(env.DB, 'zai', r51.id, 404, 'model not found', t + 6 * H + 5);
  await runMaintenance(env, { now: t + 6 * H + 10, sync: false });
  assert.equal((await env.DB.prepare("SELECT archived_at FROM providers WHERE id='zai'").first()).archived_at, null);
  assert.ok((await env.DB.prepare('SELECT archived_at FROM model_routes WHERE id = ?').bind(r51.id).first()).archived_at);
  assert.equal((await model('glm-5.1')).status, 'archived');
  assert.equal((await admin('POST', '/models/glm-5.1/restore')).data.ok, true);
  assert.equal((await model('glm-5.1')).status, 'active');
});

test('a global alias whose target is archived falls back to abd-main instead of failing', async () => {
  await admin('PUT', '/aliases', { 'abd-main': 'glm-5.2', 'abd-fast': 'glm-5.1' });
  await env.DB.prepare("UPDATE models SET status = 'archived' WHERE id = 'glm-5.1'").run();
  await call('DELETE', '/api/me/aliases/abd-main', student);
  const r = await call('POST', '/v1/chat/completions', student, { model: 'abd-fast', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.status, 200); assert.equal(r.data.model, 'glm-5.2');
  const fast = (await call('GET', '/api/me', student)).data.aliases.find((a) => a.alias === 'abd-fast');
  assert.equal(fast.fallback, true); assert.equal(fast.model_id, 'glm-5.2'); assert.equal(fast.archived_model_id, 'glm-5.1');
});
