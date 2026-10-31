// Smaller tools — all speak the OpenAI-compatible API.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { writePiArabicPrompts } from '../arabic.js';
import { HOME, API_URL, PROVIDER_ID, KEY_ENV, readJson, writeJson, writeText, run, log, tr, persistEnv } from '../core.js';

export function configurePi(ctx) {
  const dir = process.env.PI_CODING_AGENT_DIR || path.join(HOME, '.pi', 'agent');
  const file = path.join(dir, 'models.json');
  const cfg = readJson(file, {});
  // literal key = works in the current terminal too (an env reference needs a new shell).
  // The gateway normalizes max_tokens / developer role / reasoning levels per upstream,
  // so pi needs no compat flags.
  const entry = {
    baseUrl: API_URL, apiKey: ctx.apiKey, api: 'openai-completions',
    headers: { 'X-Abdalgani-Client': 'pi', ...(ctx.headers || {}) },
    models: ctx.models.map((m) => ({
      id: m.id, name: m.name, reasoning: m.reasoning, input: m.vision ? ['text', 'image'] : ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: m.context, maxTokens: m.output,
    })),
  };
  cfg.$schema = cfg.$schema || 'https://pi.dev/schemas/models.schema.json';
  cfg.providers = { ...(cfg.providers && typeof cfg.providers === 'object' ? cfg.providers : {}), [PROVIDER_ID]: entry };
  delete cfg[PROVIDER_ID]; // pre-2026 layout written by old versions of this tool
  writeJson(file, cfg);
  writePiArabicPrompts();
  log.dim(`   pi --provider ${PROVIDER_ID} --model ${ctx.model}   (${tr('أو /model داخل pi', 'or /model inside pi')})`);
}

export function configureQwen(ctx) {
  warnNoDeviceHeader();
  const file = path.join(HOME, '.qwen', 'settings.json');
  const cfg = readJson(file, {});
  cfg.modelProviders = cfg.modelProviders || {};
  const others = (cfg.modelProviders.openai || []).filter((m) => m.baseUrl !== API_URL);
  cfg.modelProviders.openai = [...others, ...ctx.models.map((m) => ({ id: m.id, name: `${m.name} · abdalgani`, baseUrl: API_URL, envKey: KEY_ENV }))];
  cfg.env = { ...(cfg.env || {}), [KEY_ENV]: ctx.apiKey };
  cfg.security = { ...(cfg.security || {}), auth: { ...(cfg.security?.auth || {}), selectedType: 'openai' } };
  cfg.model = { ...(cfg.model || {}), name: ctx.model };
  writeJson(file, cfg);
}

function loadYaml(file) {
  if (!fs.existsSync(file)) return {};
  try { return yaml.load(fs.readFileSync(file, 'utf8')) || {}; } catch { return {}; }
}

export function configureGoose(ctx) {
  warnNoDeviceHeader();
  const file = path.join(HOME, '.config', 'goose', 'config.yaml');
  const cfg = loadYaml(file);
  Object.assign(cfg, { GOOSE_PROVIDER: 'openai', GOOSE_MODEL: ctx.model, OPENAI_HOST: API_URL.replace(/\/v1$/, ''), OPENAI_BASE_PATH: 'v1/chat/completions' });
  writeText(file, yaml.dump(cfg, { lineWidth: -1 }));
  const secrets = path.join(HOME, '.config', 'goose', 'secrets.yaml');
  const s = loadYaml(secrets); s.OPENAI_API_KEY = ctx.apiKey;
  writeText(secrets, yaml.dump(s));
}

export function configureAider(ctx) {
  warnNoDeviceHeader();
  const file = path.join(HOME, '.aider.conf.yml');
  const cfg = loadYaml(file);
  Object.assign(cfg, { 'openai-api-key': ctx.apiKey, 'openai-api-base': API_URL, model: `openai/${ctx.model}`, 'weak-model': 'openai/abd-fast' });
  writeText(file, yaml.dump(cfg, { lineWidth: -1 }));
}

export function configureOpenClaw(ctx) {
  warnNoDeviceHeader();
  const dir = path.join(HOME, '.openclaw');
  const file = path.join(dir, 'openclaw.json');
  const cfg = readJson(file, {});
  cfg.models = cfg.models || {}; cfg.models.providers = cfg.models.providers || {};
  delete cfg.models.providers.litellm; // left over from the LiteLLM era
  cfg.models.providers[PROVIDER_ID] = {
    baseUrl: API_URL, apiKey: ctx.apiKey, auth: 'api_key', api: 'openai-completions', authHeader: true,
    models: ctx.models.map((m) => ({ id: m.id, name: m.name, reasoning: m.reasoning, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: m.context, maxTokens: m.output })),
  };
  cfg.auth = cfg.auth || {}; cfg.auth.profiles = cfg.auth.profiles || {};
  delete cfg.auth.profiles['litellm:default'];
  cfg.auth.profiles[`${PROVIDER_ID}:default`] = { provider: PROVIDER_ID, mode: 'api_key' };
  cfg.agents = cfg.agents || {}; cfg.agents.defaults = cfg.agents.defaults || {};
  cfg.agents.defaults.model = { ...(cfg.agents.defaults.model || {}), primary: `${PROVIDER_ID}/${ctx.model}`, fallbacks: [`${PROVIDER_ID}/abd-fast`] };
  const allowed = {}; for (const m of ctx.models) allowed[`${PROVIDER_ID}/${m.id}`] = {};
  cfg.agents.defaults.models = Object.fromEntries(Object.entries({ ...(cfg.agents.defaults.models || {}), ...allowed }).filter(([k]) => !k.startsWith('litellm/')));
  writeJson(file, cfg);
  // per-agent model caches go stale when providers change (OpenClaw issue #22747)
  const agents = path.join(dir, 'agents');
  if (fs.existsSync(agents)) {
    for (const a of fs.readdirSync(agents)) fs.rmSync(path.join(agents, a, 'agent', 'models.json'), { force: true });
  }
  if (run('systemctl --user restart openclaw-gateway', { silent: true }).ok) log.ok('✅ openclaw-gateway restarted');
}

export function configureKimi(ctx) {
  warnNoDeviceHeader();
  const file = path.join(HOME, '.kimi', 'config.json');
  const cfg = readJson(file, { default_model: '', models: {}, providers: {}, loop_control: { max_steps_per_run: 100, max_retries_per_step: 3 }, services: {} });
  cfg.providers = { ...(cfg.providers || {}), [PROVIDER_ID]: { type: 'openai_legacy', base_url: API_URL, api_key: ctx.apiKey } };
  cfg.models = cfg.models || {};
  for (const m of ctx.models) cfg.models[`${PROVIDER_ID}-${m.id.replace(/\//g, '-')}`] = { provider: PROVIDER_ID, model: m.id, max_context_size: m.context };
  cfg.default_model = `${PROVIDER_ID}-${ctx.model.replace(/\//g, '-')}`;
  writeJson(file, cfg);
}

export { KEY_ENV };

function warnNoDeviceHeader() {
  log.dim(`   ${tr('ملاحظة: هالأداة ما بتقدر تبعت هوية الجهاز — إذا فعّل المدير "إلزام الأجهزة" ما رح تشتغل؛ استخدم OpenCode أو Hermes أو pi أو Claude Code أو Codex.',
    'Note: this tool cannot send the device identity — if the admin enforces devices it will stop working; prefer OpenCode, Hermes, pi, Claude Code or Codex.')}`);
}
