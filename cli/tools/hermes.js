// Hermes Agent (NousResearch) — the tool used most here, so it gets the current schema:
// a named endpoint lives in the top-level `providers:` dict (api / key_env / transport /
// default_model / models{context_length, supports_vision}); `model.provider: custom:<name>`
// selects it, and `/model custom:abdalgani:<id>` switches models inside Hermes.
// The legacy `custom_providers:` list (written by v1 of this tool) is migrated away.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { HOME, isWin, API_URL, PROVIDER_ID, KEY_ENV, writeText, log, tr } from '../core.js';

export const hermesHome = () => process.env.HERMES_HOME
  || (isWin ? path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'hermes') : path.join(HOME, '.hermes'));

// Hermes sends reasoning_effort on every request; the gateway maps it per upstream.
const HERMES_EFFORTS = { none: 'none', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'xhigh' };

export function buildHermesConfig(cfg, { models, model, effort }) {
  const out = { ...cfg };
  const catalog = {};
  for (const m of models) catalog[m.id] = { context_length: m.context, ...(m.vision ? { supports_vision: true } : {}) };

  out.providers = {
    ...(out.providers && typeof out.providers === 'object' ? out.providers : {}),
    [PROVIDER_ID]: {
      name: PROVIDER_ID,
      api: API_URL,
      key_env: KEY_ENV,
      transport: 'chat_completions',
      default_model: model,
      discover_models: false,
      models: catalog,
    },
  };

  if (Array.isArray(out.custom_providers)) {
    out.custom_providers = out.custom_providers.filter((e) => !(e && String(e.name || '').trim().toLowerCase() === PROVIDER_ID));
    if (!out.custom_providers.length) delete out.custom_providers;
  }

  const mb = { ...(out.model || {}) };
  if (!mb.base_url || mb.base_url === API_URL || String(mb.base_url).includes('abdalgani')) {
    delete mb.base_url; delete mb.api_mode; delete mb.api_key; // the named provider carries these now
  }
  out.model = { ...mb, default: model, provider: `custom:${PROVIDER_ID}` };
  if (effort && HERMES_EFFORTS[effort]) out.agent = { ...(out.agent || {}), reasoning_effort: HERMES_EFFORTS[effort] };
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
  log.dim(`   ${tr('داخل Hermes للتبديل', 'Switch inside Hermes')}: /model custom:${PROVIDER_ID}:<id>   (${ctx.models.length} ${tr('نموذج', 'models')})`);
}
