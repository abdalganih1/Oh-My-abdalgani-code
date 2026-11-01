// OpenCode (V1 + V2 schemas), KiloCLI and EH Code (both on the V1 schema).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HOME, API_URL, PROVIDER_ID, ALIASES, readJson, writeJson, writeText, log, tr } from '../core.js';

// ── Arabic mode (only for students who install through this tool): /ar + /en + optional default ──
import { ARABIC_RULE, AR_TEMPLATE, EN_TEMPLATE } from '../arabic.js';
export { ARABIC_RULE };
export const ARABIC_COMMANDS = {
  ar: { description: 'تحدّث بالعربية من الآن (Arabic mode)', template: AR_TEMPLATE },
  en: { description: 'Switch replies back to English', template: EN_TEMPLATE },
};

const ARABIC_FILE = (dir) => path.join(dir, 'abdalgani-arabic.md');

/** Add /ar + /en (V2 `commands`, V1 `command`) and toggle the default-Arabic instructions file. */
export function applyArabic(config, { v2, arabicDefault, dir }) {
  const key = v2 ? 'commands' : 'command';
  config[key] = { ...(config[key] || {}), ...ARABIC_COMMANDS };
  const file = ARABIC_FILE(dir);
  const list = (Array.isArray(config.instructions) ? config.instructions : []).filter((p) => !String(p).endsWith('abdalgani-arabic.md'));
  if (arabicDefault) list.push(file);
  if (list.length) config.instructions = list; else delete config.instructions;
  return config;
}

function writeArabicFile(dir, enabled) {
  if (enabled) writeText(ARABIC_FILE(dir), `# Language\n\n${ARABIC_RULE}\n`, { backup: false });
}

// ── Arabic DISPLAY inside OpenCode itself (any terminal): a TUI plugin that reorders + joins Arabic on
// screen. Nothing is sent to the model. V1: listed in tui.json; V2: plugins/abdalgani-arabic/. /rtl toggles it.
import { PLUGIN_FILE, pluginSource } from '../opencode-arabic-plugin.js';

const V2_SERVER_STUB = "// abdalgani-setup: the Arabic display lives in tui.js — nothing runs on the server\nexport default { id: 'abdalgani.arabic-display', setup() {} };\n";
export const V2_PLUGIN_DIR = (dir) => path.join(dir, 'plugins', 'abdalgani-arabic');

const ours = (p) => String(Array.isArray(p) ? p[0] : (p && typeof p === 'object' ? p.package : p)).includes(PLUGIN_FILE);

/** Drop our entry from a plugin list in a JSON(C) file (no-op when absent). */
function dropPluginEntry(file, key) {
  if (!fs.existsSync(file)) return;
  const cfg = readJson(file, null);
  if (!cfg || !Array.isArray(cfg[key]) || !cfg[key].some(ours)) return;
  cfg[key] = cfg[key].filter((p) => !ours(p));
  writeJson(file, cfg);
}

/**
 * V1 loads TUI plugins listed in tui.json (`plugin`, a file:// spec).
 * V2 ignores tui.json (it only migrates it once into cli.json) and discovers plugin folders under
 * <config>/plugins/<name>/ with a `tui.js` entry — so that's where V2 gets it, with no config edit.
 * The same file works for both (it exports `tui` for V1 and `setup` for V2).
 */
export function installArabicDisplayPlugin(dir, { v2 = false } = {}) {
  const jsonc = path.join(dir, 'tui.jsonc'), json = path.join(dir, 'tui.json');
  const tuiFile = !fs.existsSync(json) && fs.existsSync(jsonc) ? jsonc : json;
  const v2Dir = V2_PLUGIN_DIR(dir);
  if (v2) {
    const file = path.join(v2Dir, 'tui.js');
    writeText(file, pluginSource(), { backup: false });
    // the server only lists a plugin folder that has a server entry; this one does nothing
    writeText(path.join(v2Dir, 'index.js'), V2_SERVER_STUB, { backup: false });
    dropPluginEntry(tuiFile, 'plugin');                       // would be migrated into cli.json as a broken entry
    dropPluginEntry(path.join(dir, 'cli.json'), 'plugins');   // left there by an earlier migration
    return file;
  }
  fs.rmSync(v2Dir, { recursive: true, force: true });
  const file = path.join(dir, 'abdalgani', PLUGIN_FILE);
  writeText(file, pluginSource(), { backup: false });
  const tui = readJson(tuiFile, {});
  const plugins = (Array.isArray(tui.plugin) ? tui.plugin : []).filter((p) => !ours(p));
  tui.$schema = tui.$schema || 'https://opencode.ai/tui.json';
  tui.plugin = [...plugins, pathToFileURL(file).href];
  writeJson(tuiFile, tui);
  return file;
}

const EFFORTS = ['low', 'medium', 'high'];

/** OpenCode V2 — `providers` map, settings/headers/body split, model variants, provider/model#variant. */
export function buildOpenCodeV2(config, { apiKey, models, model, effort, headers }) {
  const out = { $schema: 'https://opencode.ai/config.json', ...config };
  // a stale V1 entry for our provider would shadow / confuse the V2 one
  if (out.provider?.[PROVIDER_ID]) {
    delete out.provider[PROVIDER_ID];
    if (!Object.keys(out.provider).length) delete out.provider;
  }
  const entries = {};
  for (const m of models) {
    entries[m.id] = {
      name: m.name,
      limit: { context: m.context, output: m.output },
      ...(m.reasoning ? { variants: EFFORTS.map((e) => ({ id: e, settings: { reasoningEffort: e } })) } : {}),
    };
  }
  out.providers = {
    ...(out.providers || {}),
    [PROVIDER_ID]: {
      name: 'abdalgani',
      package: '@opencode/ai/providers/openai-compatible',
      settings: { baseURL: API_URL, apiKey },
      ...(headers ? { headers } : {}),
      models: entries,
    },
  };
  const variant = effort && effort !== 'none' && EFFORTS.includes(effort) ? `#${effort}` : '';
  out.model = `${PROVIDER_ID}/${model}${variant}`;
  return out;
}

/** OpenCode V1 / Kilo / EH Code — `provider` map with @ai-sdk/openai-compatible. */
export function buildOpenCodeV1(config, { apiKey, models, model, effort, smallModel, headers }) {
  const out = { $schema: 'https://opencode.ai/config.json', ...config };
  const entries = {};
  for (const m of models) {
    entries[m.id] = { name: m.name, limit: { context: m.context, output: m.output } };
    if (effort && m.reasoning) entries[m.id].options = { reasoningEffort: effort };
  }
  out.provider = {
    ...(out.provider || {}),
    [PROVIDER_ID]: { name: 'abdalgani', npm: '@ai-sdk/openai-compatible', options: { baseURL: API_URL, apiKey, ...(headers ? { headers } : {}) }, models: entries },
  };
  out.model = `${PROVIDER_ID}/${model}`;
  if (smallModel) out.small_model = `${PROVIDER_ID}/${smallModel}`;
  return out;
}

export function configureOpenCode(ctx) {
  const dir = path.join(HOME, '.config', 'opencode');
  const file = path.join(dir, 'opencode.json');
  const v2 = ctx.opencodeMajor !== 1;
  const cfg = readJson(file, {});
  const out = v2 ? buildOpenCodeV2(cfg, ctx) : buildOpenCodeV1(cfg, { ...ctx, smallModel: ALIASES.fast });
  applyArabic(out, { v2, arabicDefault: !!ctx.arabic, dir });
  writeArabicFile(dir, !!ctx.arabic);
  writeJson(file, out);
  installArabicDisplayPlugin(dir, { v2 });
  log.dim(`   ${tr('صيغة الإعداد', 'Config schema')}: OpenCode V${v2 ? 2 : 1} · ${tr('النموذج', 'model')}: ${PROVIDER_ID}/${ctx.model}`);
  log.dim(`   ${tr('العربية', 'Arabic')}: ${tr('عرض صحيح داخل OpenCode بأي طرفية ✓ (/rtl للإيقاف)', 'correct display inside OpenCode in any terminal ✓ (/rtl toggles)')} · /ar ${tr('و', 'and')} /en ${ctx.arabic ? tr('· عربي افتراضياً ✓', '· Arabic by default ✓') : ''}`);
}

export function configureKilo(ctx) {
  const file = path.join(HOME, '.config', 'kilo', 'kilo.json');
  writeJson(file, buildOpenCodeV1(readJson(file, {}), { ...ctx, smallModel: ALIASES.fast }));
}

// EH Code ships curated agents (models resolve through the gateway's stable aliases).
export const EH_AGENTS = {
  plan: { description: 'Analyzes and plans only — never edits files', mode: 'primary', color: '#0ea5e9', permission: { edit: 'deny' }, model: `${PROVIDER_ID}/${ALIASES.think}`,
    prompt: 'You are the Plan agent. You ONLY analyze and plan — never modify files. Explore the codebase, then produce a clear step-by-step implementation plan with file paths, risks, and alternatives.' },
  code: { description: 'Implements features and fixes code', mode: 'primary', color: '#7c3aed', permission: {}, model: `${PROVIDER_ID}/${ALIASES.main}`,
    prompt: 'You are the Code agent. Implement features and fix code directly. Write clean, idiomatic code that matches the existing style of the project. Prefer minimal, focused changes and verify your work when possible.' },
  debug: { description: 'Diagnoses bugs and applies minimal fixes', mode: 'primary', color: '#f59e0b', permission: {}, model: `${PROVIDER_ID}/${ALIASES.main}`,
    prompt: 'You are the Debug agent. Diagnose bugs systematically: reproduce the issue, read the relevant code, form hypotheses, add targeted logging or tests when needed, and propose the minimal fix. Always explain the root cause before fixing.' },
  ask: { description: 'Answers questions — read-only', mode: 'primary', color: '#10b981', permission: { edit: 'deny', bash: 'ask' }, model: `${PROVIDER_ID}/${ALIASES.fast}`,
    prompt: 'You are the Ask agent. Answer questions about the codebase and general programming concisely and accurately. You do not modify files; you explain, summarize, and point to the relevant code locations.' },
  build: { disable: true },
};

export function configureEHCode(ctx) {
  const dir = path.join(HOME, '.config', 'ehcode');
  const file = path.join(dir, 'opencode.json');
  // first run: seed from the user's OpenCode config so their agents carry over
  let cfg = readJson(file, null);
  if (!cfg) cfg = readJson(path.join(HOME, '.config', 'opencode', 'opencode.json'), {});
  delete cfg.providers; // EH Code is built on the V1 core
  const out = buildOpenCodeV1(cfg, { ...ctx, smallModel: ALIASES.fast });
  out.agent = { ...EH_AGENTS, ...(out.agent || {}) };
  out.default_agent = out.default_agent || 'code';
  applyArabic(out, { v2: false, arabicDefault: !!ctx.arabic, dir });
  writeArabicFile(dir, !!ctx.arabic);
  writeJson(file, out);
}
