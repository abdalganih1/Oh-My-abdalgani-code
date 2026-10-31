// OpenAI Codex CLI — Responses API only (wire_api = "responses"), served by the gateway's /v1/responses.
import fs from 'node:fs';
import path from 'node:path';
import TOML from '@iarna/toml';
import { HOME, API_URL, PROVIDER_ID, KEY_ENV, writeText, persistEnv, log, tr } from '../core.js';

export function buildCodexConfig(cfg, { model, effort }) {
  const out = { ...cfg };
  out.model = model;
  out.model_provider = PROVIDER_ID;
  if (effort && effort !== 'none') out.model_reasoning_effort = effort === 'xhigh' ? 'high' : effort;
  out.model_providers = {
    ...(out.model_providers || {}),
    [PROVIDER_ID]: { name: 'abdalgani', base_url: API_URL, env_key: KEY_ENV, wire_api: 'responses' },
  };
  return out;
}

export function configureCodex(ctx) {
  const file = path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'), 'config.toml');
  let cfg = {};
  if (fs.existsSync(file)) { try { cfg = TOML.parse(fs.readFileSync(file, 'utf8')); } catch { log.warn(tr('⚠️ config.toml تالف — سأعيد كتابته', '⚠️ corrupt config.toml — rewriting')); } }
  writeText(file, TOML.stringify(buildCodexConfig(cfg, ctx)));
  persistEnv(KEY_ENV, ctx.apiKey);
}
