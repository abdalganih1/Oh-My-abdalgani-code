// Claude Code → gateway's Anthropic-compatible /v1/messages.
import path from 'node:path';
import { HOME, BASE_URL, ALIASES, readJson, writeJson, log, tr } from '../core.js';

export function buildClaudeSettings(settings, { apiKey, model, models = [], tiers = {}, headers }) {
  const env = { ...(settings.env || {}) };
  delete env.DISABLE_PROMPT_CACHING; // cache_control is passed through — saves real money on Anthropic routes
  Object.assign(env, {
    ANTHROPIC_BASE_URL: BASE_URL,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_API_KEY: '', // an inherited real key would override the token
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: tiers.opus || ALIASES.think,
    ANTHROPIC_DEFAULT_SONNET_MODEL: tiers.sonnet || model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: tiers.haiku || ALIASES.fast,
    CLAUDE_CODE_SUBAGENT_MODEL: tiers.sonnet || model,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
  });
  // device identity for the gateway (ANTHROPIC_CUSTOM_HEADERS = newline-separated "Name: value")
  if (headers) env.ANTHROPIC_CUSTOM_HEADERS = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n');
  // Gateway aliases aren't Claude IDs, so Claude Code can't know their window: declare the
  // smallest one in use (it compacts at that size). Valid range is 100k–1M.
  const used = [env.ANTHROPIC_MODEL, env.ANTHROPIC_DEFAULT_OPUS_MODEL, env.ANTHROPIC_DEFAULT_SONNET_MODEL, env.ANTHROPIC_DEFAULT_HAIKU_MODEL];
  const windows = models.filter((m) => used.includes(m.id)).map((m) => m.context).filter(Boolean);
  if (windows.length) env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(Math.min(1_000_000, Math.max(100_000, Math.min(...windows))));
  for (const tier of ['OPUS', 'SONNET', 'HAIKU']) env[`ANTHROPIC_DEFAULT_${tier}_MODEL_NAME`] = `${env[`ANTHROPIC_DEFAULT_${tier}_MODEL`]} (abdalgani)`;
  return { ...settings, env };
}

export function configureClaude(ctx) {
  const file = path.join(HOME, '.claude', 'settings.json');
  const out = buildClaudeSettings(readJson(file, {}), ctx);
  writeJson(file, out);
  log.dim(`   Opus → ${out.env.ANTHROPIC_DEFAULT_OPUS_MODEL} · Sonnet → ${out.env.ANTHROPIC_DEFAULT_SONNET_MODEL} · Haiku → ${out.env.ANTHROPIC_DEFAULT_HAIKU_MODEL}`);
  log.dim(`   ${tr('غيّر ما تشير إليه هالأسماء من لوحة التحكم بدون إعادة إعداد', 'Re-map these aliases from the dashboard anytime')}: ${BASE_URL}`);
}
