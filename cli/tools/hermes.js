// Hermes Agent (NousResearch). Named OpenAI-compatible endpoint = an entry in the top-level
// `custom_providers:` list; the active `model:` block points at it via provider "custom:<slug>".
// (A bare provider "custom" only shows an unnamed row in /model — that was the old bug.)
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { HOME, isWin, API_URL, PROVIDER_ID, KEY_ENV, writeText, log, tr } from '../core.js';

export const hermesHome = () => process.env.HERMES_HOME
  || (isWin ? path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'hermes') : path.join(HOME, '.hermes'));

export function buildHermesConfig(cfg, { models, model, effort }) {
  const out = { ...cfg };
  const catalog = {};
  for (const m of models) catalog[m.id] = { context_length: m.context };
  const entry = { name: PROVIDER_ID, base_url: API_URL, api_mode: 'chat_completions', key_env: KEY_ENV, discover_models: false, models: catalog };
  const others = (Array.isArray(out.custom_providers) ? out.custom_providers : [])
    .filter((e) => e && typeof e === 'object' && String(e.name || '').trim().toLowerCase() !== PROVIDER_ID);
  out.custom_providers = [...others, entry];
  out.model = { ...(out.model || {}), default: model, provider: `custom:${PROVIDER_ID}`, base_url: API_URL, api_mode: 'chat_completions', api_key: `\${${KEY_ENV}}` };
  if (effort) out.agent = { ...(out.agent || {}), reasoning_effort: effort };
  return out;
}

export function upsertEnv(content, name, value) {
  const re = new RegExp(`^${name}=.*$`, 'm');
  return re.test(content) ? content.replace(re, `${name}=${value}`) : `${content.trimEnd()}\n${name}=${value}\n`.replace(/^\n/, '');
}

export function configureHermes(ctx) {
  const home = hermesHome();
  const cfgFile = path.join(home, 'config.yaml');
  const envFile = path.join(home, '.env');
  let cfg = {};
  if (fs.existsSync(cfgFile)) { try { cfg = yaml.load(fs.readFileSync(cfgFile, 'utf8')) || {}; } catch { log.warn(tr('⚠️ config.yaml تالف — سأعيد كتابته', '⚠️ corrupt config.yaml — rewriting')); } }
  writeText(cfgFile, yaml.dump(buildHermesConfig(cfg, ctx), { lineWidth: -1 }));
  const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  writeText(envFile, upsertEnv(env, KEY_ENV, ctx.apiKey));
  log.dim(`   /model → custom:${PROVIDER_ID} (${ctx.models.length} ${tr('نموذج', 'models')})`);
}
