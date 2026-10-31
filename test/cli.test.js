import test from 'node:test';
import assert from 'node:assert/strict';
import TOML from '@iarna/toml';
import { buildOpenCodeV2, buildOpenCodeV1, applyArabic, ARABIC_COMMANDS } from '../cli/tools/opencode.js';
import { buildClaudeSettings } from '../cli/tools/claude.js';
import { buildHermesConfig, upsertEnv } from '../cli/tools/hermes.js';
import { buildCodexConfig } from '../cli/tools/codex.js';

const models = [
  { id: 'abd-main', name: 'abd-main → glm-5.2', context: 1_000_000, output: 131072, reasoning: true, alias: true },
  { id: 'abd-fast', name: 'abd-fast → glm-4.7', context: 204800, output: 131072, reasoning: true, alias: true },
  { id: 'gpt-x', name: 'GPT X', context: 400000, output: 64000, reasoning: false },
];
const ctx = { apiKey: 'sk-abd-test', models, model: 'abd-main', effort: 'high' };

test('OpenCode V2: providers map, keeps other providers, drops stale V1 entry, variant in model', () => {
  const out = buildOpenCodeV2({ provider: { abdalgani: { old: true }, ollama: { x: 1 } }, providers: { anthropic: { settings: {} } }, theme: 'dark' }, ctx);
  assert.deepEqual(out.provider, { ollama: { x: 1 } });
  assert.ok(out.providers.anthropic, 'other V2 providers untouched');
  const p = out.providers.abdalgani;
  assert.equal(p.package, '@opencode/ai/providers/openai-compatible');
  assert.equal(p.settings.apiKey, 'sk-abd-test');
  assert.match(p.settings.baseURL, /\/v1$/);
  assert.deepEqual(p.models['abd-fast'].limit, { context: 204800, output: 131072 });
  assert.ok(p.models['abd-main'].variants.some((v) => v.id === 'high'));
  assert.equal(p.models['gpt-x'].variants, undefined, 'no reasoning variants on non-reasoning models');
  assert.equal(out.model, 'abdalgani/abd-main#high');
  assert.equal(out.theme, 'dark');
});

test('OpenCode V1 (Kilo / EH Code): provider map with @ai-sdk/openai-compatible', () => {
  const out = buildOpenCodeV1({ provider: { litellm: {} } }, { ...ctx, smallModel: 'abd-fast' });
  assert.ok(out.provider.litellm);
  assert.equal(out.provider.abdalgani.npm, '@ai-sdk/openai-compatible');
  assert.equal(out.provider.abdalgani.models['abd-main'].options.reasoningEffort, 'high');
  assert.equal(out.provider.abdalgani.models['gpt-x'].options, undefined);
  assert.equal(out.small_model, 'abdalgani/abd-fast');
});

test('Claude Code: env merged, unrelated settings kept, window = smallest used alias', () => {
  const out = buildClaudeSettings({ permissions: { allow: ['Bash'] }, env: { FOO: '1', DISABLE_PROMPT_CACHING: '1' } }, ctx);
  assert.deepEqual(out.permissions, { allow: ['Bash'] });
  assert.equal(out.env.FOO, '1');
  assert.equal(out.env.DISABLE_PROMPT_CACHING, undefined);
  assert.equal(out.env.ANTHROPIC_AUTH_TOKEN, 'sk-abd-test');
  assert.equal(out.env.ANTHROPIC_API_KEY, '');
  assert.ok(!out.env.ANTHROPIC_BASE_URL.endsWith('/v1'), 'Claude Code appends /v1/messages itself');
  assert.equal(out.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'abd-fast');
  assert.equal(out.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '204800');
});

test('Hermes: current `providers:` schema, legacy entry migrated, others kept; env upsert', () => {
  const vctx = { ...ctx, models: [...models, { id: 'vis', name: 'V', context: 1000, output: 10, vision: true }] };
  const out = buildHermesConfig({
    custom_providers: [{ name: 'Abdalgani', base_url: 'old' }, { name: 'local', base_url: 'x' }],
    providers: { work: { api: 'http://w/v1' } },
    model: { temperature: 0.2, base_url: 'https://api.abdalgani.com/v1', api_key: '${ABDALGANI_API_KEY}' },
  }, vctx);
  assert.deepEqual(out.custom_providers, [{ name: 'local', base_url: 'x' }]);
  assert.ok(out.providers.work);
  const p = out.providers.abdalgani;
  assert.equal(p.transport, 'chat_completions');
  assert.equal(p.key_env, 'ABDALGANI_API_KEY');
  assert.match(p.api, /\/v1$/);
  assert.equal(p.default_model, 'abd-main');
  assert.equal(p.models['abd-main'].context_length, 1_000_000);
  assert.equal(p.models.vis.supports_vision, true);
  assert.deepEqual(out.model, { temperature: 0.2, default: 'abd-main', provider: 'custom:abdalgani' });
  assert.equal(out.agent.reasoning_effort, 'high');
  assert.equal(buildHermesConfig({ custom_providers: [{ name: 'abdalgani' }] }, ctx).custom_providers, undefined);
  assert.equal(upsertEnv('A=1\nABDALGANI_API_KEY=old\n', 'ABDALGANI_API_KEY', 'new'), 'A=1\nABDALGANI_API_KEY=new\n');
  assert.equal(upsertEnv('', 'K', 'v'), 'K=v\n');
});

test('Codex: responses wire API, valid TOML round trip, keeps other providers', () => {
  const out = buildCodexConfig({ model_providers: { ollama: { name: 'ollama', base_url: 'http://x' } }, approval_policy: 'on-request' }, ctx);
  const parsed = TOML.parse(TOML.stringify(out));
  assert.equal(parsed.model_provider, 'abdalgani');
  assert.equal(parsed.model_providers.abdalgani.wire_api, 'responses');
  assert.equal(parsed.model_providers.abdalgani.env_key, 'ABDALGANI_API_KEY');
  assert.ok(parsed.model_providers.ollama);
  assert.equal(parsed.approval_policy, 'on-request');
  assert.equal(parsed.model_reasoning_effort, 'high');
});

test('OpenCode Arabic: /ar + /en commands per schema, default-Arabic instructions toggle', () => {
  const v2 = applyArabic({ commands: { mine: { template: 'x' } }, instructions: ['AGENTS.md'] }, { v2: true, arabicDefault: true, dir: '/h/.config/opencode' });
  assert.ok(v2.commands.mine && v2.commands.ar && v2.commands.en);
  assert.match(v2.commands.ar.template, /العربية/);
  assert.match(v2.commands.ar.template, /\$ARGUMENTS/);
  assert.deepEqual(v2.instructions, ['AGENTS.md', '/h/.config/opencode/abdalgani-arabic.md']);
  const off = applyArabic(v2, { v2: true, arabicDefault: false, dir: '/h/.config/opencode' });
  assert.deepEqual(off.instructions, ['AGENTS.md']);
  const v1 = applyArabic({}, { v2: false, arabicDefault: false, dir: '/d' });
  assert.deepEqual(Object.keys(v1.command), Object.keys(ARABIC_COMMANDS));
  assert.equal(v1.instructions, undefined);
});
