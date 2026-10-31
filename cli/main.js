// Oh-My-abdalgani-code — wires AI coding tools to the abdalgani gateway.
import chalk from 'chalk';
import { select, input, checkbox, search, confirm } from '@inquirer/prompts';
import { createHash } from 'node:crypto';
import { BASE_URL, API_URL, ALIASES, setLang, getLang, tr, log, savedKey, saveKey, which, run, loadState, saveState, rememberTool, setQuiet } from './core.js';
import { setupArabicDisplay } from './arabic.js';
import { setAutoSync } from './schedule.js';
import { fetchCatalog, describeAccount, printStatus } from './gateway.js';
import { INSTALL, installTool, opencodeMajor } from './install.js';
import { TOOLS } from './tools/index.js';

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith('--')) { if (a === '-y') o.yes = true; else o._.push(a); continue; }
    a = a.slice(2);
    const eq = a.indexOf('=');
    if (eq >= 0) o[a.slice(0, eq)] = a.slice(eq + 1);
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) o[a] = argv[++i];
    else o[a] = true;
  }
  return o;
}

const HELP = `Oh-My-abdalgani-code — connect AI coding tools to ${BASE_URL}

Interactive:   node setup.js
Headless:      node setup.js --tool <Name[,Name]> [--model abd-main] [--effort high] [--api-key sk-abd-...]

  --tool        ${Object.keys(TOOLS).join(', ')}
  --model       model id or alias (default ${ALIASES.main}; aliases are re-mapped from the dashboard)
  --effort      none | low | medium | high | xhigh
  --api-key     gateway key (else ABDALGANI_API_KEY env, else the saved key)
  --no-install  only write config, never install the tool
  --upgrade     upgrade OpenCode V1 → V2 if found
  --arabic      Arabic pack: correct Arabic display in the terminal (WezTerm + <tool>-ar launchers)
                and Arabic replies by default in OpenCode (/ar and /en are always added, also in pi)
  --arabic-display  only the display part (WezTerm + launchers)
  --auto-sync   on | off — refresh your tools' model lists every 6h (Task Scheduler / cron)
  --lang        ar | en
  --status      balance + the real model behind abd-main / abd-fast / abd-think
  --sync        refresh every tool configured before (after switching models in the dashboard)
  --quiet       with --sync: silent, and only rewrites when the model catalog changed
  --list-tools / --list-models / --help

Dashboard:     ${BASE_URL}       Base URL: ${API_URL}`;

async function resolveKey(cli, interactive) {
  let key = (typeof cli['api-key'] === 'string' && cli['api-key']) || process.env.ABDALGANI_API_KEY || null;
  const saved = savedKey();
  if (!key && saved) {
    if (!interactive || await confirm({ message: tr(`استخدام المفتاح المحفوظ (${saved.slice(0, 12)}…)؟`, `Use saved key (${saved.slice(0, 12)}…)?`), default: true })) key = saved;
  }
  for (;;) {
    if (!key) {
      if (!interactive) { log.err(tr('❌ لا يوجد مفتاح: مرّر --api-key أو ABDALGANI_API_KEY', '❌ No key: pass --api-key or set ABDALGANI_API_KEY')); process.exit(1); }
      key = (await input({ message: tr('🔑 مفتاح البوابة (sk-abd-…) من المدرّس:', '🔑 Gateway key (sk-abd-…) from your teacher:') })).trim();
    }
    const cat = await fetchCatalog(key);
    if (cat.ok) { saveKey(key); describeAccount(cat.account); return { key, catalog: cat }; }
    log.err(`❌ ${tr('مفتاح مرفوض', 'Key rejected')}: ${cat.reason}`);
    if (!interactive) process.exit(1);
    key = null;
  }
}

async function ensureInstalled(tool, cli, interactive) {
  const spec = INSTALL[tool];
  if (tool === 'OpenCode') {
    const major = opencodeMajor();
    if (major === 1) {
      const up = cli.upgrade === true || (interactive && await confirm({ message: tr('OpenCode V1 موجود. ترقية لـ V2؟ (الإعداد القديم يبقى بنسخة احتياطية)', 'OpenCode V1 found. Upgrade to V2? (old config is backed up)'), default: true }));
      if (up) { await installTool('OpenCode'); return opencodeMajor(); }
      return 1;
    }
    if (major) return major;
  } else if (!spec || which(spec.exe)) {
    return null;
  }
  if (cli['no-install']) { log.warn(`⚠️ ${tool} ${tr('غير مثبّت — سأكتب الإعداد فقط', 'not installed — writing config only')}`); return tool === 'OpenCode' ? 2 : null; }
  if (interactive && !await confirm({ message: tr(`${tool} غير مثبّت. تثبيته الآن؟`, `${tool} is not installed. Install it now?`), default: true })) return tool === 'OpenCode' ? 2 : null;
  await installTool(tool);
  return tool === 'OpenCode' ? (opencodeMajor() || 2) : null;
}

async function pickModel(models) {
  const how = await select({
    message: tr('النموذج الافتراضي للأدوات:', 'Default model for the tools:'),
    choices: [
      { name: tr(`⭐ ${ALIASES.main} — اسم ثابت تبدّله من لوحة التحكم (موصى)`, `⭐ ${ALIASES.main} — stable alias you switch from the dashboard (recommended)`), value: ALIASES.main },
      { name: tr('🔎 اختر نموذج محدد', '🔎 Pick a specific model'), value: '__pick' },
    ],
  });
  if (how !== '__pick') return how;
  return search({
    message: tr('ابحث:', 'Search:'),
    source: (q) => models.filter((m) => !q || `${m.id} ${m.name}`.toLowerCase().includes(q.toLowerCase())).map((m) => ({ value: m.id, name: m.name })),
  });
}

const pickEffort = () => select({
  message: tr('🧠 مستوى التفكير (reasoning effort):', '🧠 Reasoning effort:'),
  choices: [
    { name: tr('افتراضي المزوّد', 'Provider default'), value: '' },
    { name: 'none', value: 'none' }, { name: 'low', value: 'low' }, { name: 'medium', value: 'medium' },
    { name: tr('high (موصى للبرمجة)', 'high (recommended for coding)'), value: 'high' },
  ],
});

async function configure(tool, base, cli, interactive) {
  console.log(chalk.bold.cyan(`\n━━ ${TOOLS[tool].label} ━━`));
  const opencodeMajorVer = await ensureInstalled(tool, cli, interactive);
  TOOLS[tool].configure({ ...base, opencodeMajor: opencodeMajorVer ?? 2 });
  rememberTool(tool, { model: base.model, effort: base.effort, arabic: base.arabic });
}

function printMapping(models) {
  const aliases = models.filter((m) => m.alias && m.target);
  if (!aliases.length) return;
  log.info(tr('\n🎯 أسماؤك الثابتة تشير الآن إلى:', '\n🎯 Your stable aliases currently point to:'));
  for (const a of aliases) log.info(`   ${a.id.padEnd(12)} → ${a.targetName || a.target} (${a.target})`);
}

/** Re-run every tool configured before, keeping its options (no prompts, no installs). */
const catalogHash = (models) => createHash('sha256').update(JSON.stringify(models.map((m) => [m.id, m.name, m.context, m.output, m.reasoning, m.vision]))).digest('hex').slice(0, 16);

async function sync(key, catalog, { onlyIfChanged = false } = {}) {
  const state = loadState();
  const tools = state.tools || {};
  const names = Object.keys(tools).filter((t) => TOOLS[t]);
  if (!names.length) { log.warn(tr('ما في أدوات مضبوطة سابقاً — شغّل الإعداد أولاً.', 'No tools configured yet — run the setup first.')); return; }
  const hash = catalogHash(catalog.models);
  if (onlyIfChanged && (catalog.offline || state.catalogHash === hash)) return;
  for (const t of names) {
    const o = tools[t];
    let model = o.model || ALIASES.main;
    if (!catalog.offline && !catalog.models.some((m) => m.id === model)) {
      log.warn(`⚠️ ${t}: ${model} ${tr('ما عاد متاح (مؤرشف أو خارج اشتراكك) — رجعت لـ', 'is no longer available (archived or outside your plan) — back to')} ${ALIASES.main}`);
      model = ALIASES.main;
    }
    log.info(chalk.bold(`\n━━ ${TOOLS[t].label} ━━`));
    TOOLS[t].configure({ apiKey: key, models: catalog.models, model, effort: o.effort || '', arabic: !!o.arabic, opencodeMajor: t === 'OpenCode' ? (opencodeMajor() || 2) : 2 });
  }
  saveState({ catalogHash: hash, lastSync: Math.floor(Date.now() / 1000) });
  printMapping(catalog.models);
}

export async function main(argv = process.argv.slice(2)) {
  const cli = parseArgs(argv);
  setLang(cli.lang || (cli.tool ? 'en' : 'ar'));
  if (cli.help || cli.h) { console.log(HELP); return; }
  if (cli['list-tools']) { console.log(Object.keys(TOOLS).join('\n')); return; }

  const interactive = !cli.tool && !cli['list-models'] && !cli.yes && process.stdin.isTTY;

  if (interactive && !cli.lang) {
    setLang(await select({ message: 'Language / اللغة', choices: [{ name: 'العربية', value: 'ar' }, { name: 'English', value: 'en' }] }));
  }
  if (!cli.quiet) console.log(chalk.bold.cyan(`\n⚡ abdalgani — ${tr('إعداد أدوات البرمجة', 'coding tools setup')}  (${BASE_URL})\n`));

  if (cli.quiet) setQuiet(true);
  if (cli['arabic-display'] && !cli.tool) {
    const exes = Object.keys(loadState().tools || {}).filter((t) => t !== 'ClaudeCode').map((t) => INSTALL[t]?.exe).filter(Boolean);
    setupArabicDisplay(exes.length ? exes : ['opencode', 'pi', 'hermes'], { install: !cli['no-install'] });
    return;
  }
  if (cli['auto-sync'] && !cli.tool) { process.exit(setAutoSync(cli['auto-sync'] !== 'off') ? 0 : 1); }
  if (cli.status || cli.sync) {
    const key = (typeof cli['api-key'] === 'string' && cli['api-key']) || process.env.ABDALGANI_API_KEY || savedKey();
    if (!key) { log.err(tr('❌ لا يوجد مفتاح محفوظ — شغّل الإعداد أولاً', '❌ No saved key — run the setup first')); process.exit(1); }
    if (cli.status) { process.exit(await printStatus(key) ? 0 : 1); }
    const cat = await fetchCatalog(key);
    if (!cat.ok) { log.err(`❌ ${cat.reason}`); process.exit(1); }
    await sync(key, cat, { onlyIfChanged: !!cli.quiet });
    return;
  }

  const { key, catalog } = await resolveKey(cli, interactive);
  if (cli['list-models']) { console.log(catalog.models.map((m) => m.id).join('\n')); return; }

  let tools;
  if (interactive) {
    tools = await checkbox({
      message: tr('اختر الأدوات (مسافة للتحديد، Enter للتأكيد):', 'Select tools (space to toggle, enter to confirm):'),
      choices: Object.entries(TOOLS).map(([value, t]) => ({ value, name: `${t.label}${which(INSTALL[value]?.exe || '') ? chalk.green(' ✓') : ''}`, checked: false })),
      required: true, pageSize: 14,
    });
  } else {
    tools = String(cli.tool || '').split(',').map((s) => s.trim()).filter(Boolean);
    const bad = tools.filter((t) => !TOOLS[t]);
    if (!tools.length || bad.length) { log.err(`Unknown tool: ${bad.join(', ') || '(none)'} — see --list-tools`); process.exit(1); }
  }

  const model = typeof cli.model === 'string' ? cli.model : interactive ? await pickModel(catalog.models) : ALIASES.main;
  let effort = typeof cli.effort === 'string' ? cli.effort : '';
  if (interactive && tools.some((t) => TOOLS[t].effort)) effort = await pickEffort();

  const nonClaude = tools.filter((t) => t !== 'ClaudeCode'); // Claude Code renders Arabic itself
  let arabic = cli.arabic === true || cli.arabic === 'true';
  let arabicDisplay = arabic || cli['arabic-display'] === true;
  let autoSync = cli['auto-sync'] === 'on' || cli['auto-sync'] === true;
  if (interactive && nonClaude.length) {
    arabicDisplay = await confirm({
      message: tr('🇸🇦 حزمة العربي: عرض العربي صحيح بالطرفية (WezTerm + أوامر opencode-ar / pi-ar …)؟', '🇸🇦 Arabic pack: render Arabic correctly in the terminal (WezTerm + opencode-ar / pi-ar … launchers)?'),
      default: getLang() === 'ar',
    });
    if (nonClaude.some((t) => t === 'OpenCode' || t === 'EHCode')) {
      arabic = await confirm({ message: tr('OpenCode: يرد بالعربي افتراضياً؟ (/ar و /en بتنضاف بكل الأحوال)', 'OpenCode: reply in Arabic by default? (/ar and /en are added either way)'), default: getLang() === 'ar' });
    }
  }
  if (interactive) autoSync = await confirm({ message: tr('🔄 تحديث تلقائي لقائمة النماذج بأدواتك (نماذج جديدة/مؤرشفة) كل 6 ساعات؟', '🔄 Auto-update the model lists in your tools (new/archived models) every 6 hours?'), default: true });

  const base = { apiKey: key, models: catalog.models, model, effort, arabic };
  for (const tool of tools) {
    try { await configure(tool, base, cli, interactive); }
    catch (e) { log.err(`❌ ${tool}: ${e.message}`); }
  }

  saveState({ catalogHash: catalogHash(catalog.models) });
  if (arabicDisplay && nonClaude.length) setupArabicDisplay(nonClaude.map((t) => INSTALL[t]?.exe).filter(Boolean), { install: !cli['no-install'] });
  if (autoSync) setAutoSync(true);
  printMapping(catalog.models);
  console.log(chalk.bold.green(`\n✅ ${tr('تم.', 'Done.')}`));
  log.dim(`   abdalgani-setup --status   ${tr('← رصيدك والنموذج الحقيقي', '← balance + real models')}`);
  log.dim(`   abdalgani-setup --sync     ${tr('← بعد التبديل من اللوحة', '← after switching in the dashboard')}`);
  log.info(`🌐 ${tr('لوحة التحكم (الرصيد، الكوبونات، تبديل النماذج)', 'Dashboard (balance, coupons, model switching)')}: ${BASE_URL}`);
  if (interactive && tools.length === 1) {
    const exe = INSTALL[tools[0]]?.exe;
    if (exe && which(exe) && await confirm({ message: tr(`تشغيل ${tools[0]} الآن؟`, `Launch ${tools[0]} now?`), default: false })) run(exe);
  }
}
