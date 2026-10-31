// Oh-My-abdalgani-code — wires AI coding tools to the abdalgani gateway.
import chalk from 'chalk';
import { select, input, checkbox, search, confirm } from '@inquirer/prompts';
import { BASE_URL, API_URL, ALIASES, setLang, tr, log, savedKey, saveKey, which, run } from './core.js';
import { fetchCatalog, describeAccount } from './gateway.js';
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
  --lang        ar | en
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
  console.log(chalk.bold.cyan(`\n⚡ abdalgani — ${tr('إعداد أدوات البرمجة', 'coding tools setup')}  (${BASE_URL})\n`));

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

  const base = { apiKey: key, models: catalog.models, model, effort };
  for (const tool of tools) {
    try { await configure(tool, base, cli, interactive); }
    catch (e) { log.err(`❌ ${tool}: ${e.message}`); }
  }

  console.log(chalk.bold.green(`\n✅ ${tr('تم.', 'Done.')}`));
  log.info(`🌐 ${tr('لوحة التحكم (الرصيد، الكوبونات، تبديل النماذج)', 'Dashboard (balance, coupons, model switching)')}: ${BASE_URL}`);
  if (interactive && tools.length === 1) {
    const exe = INSTALL[tools[0]]?.exe;
    if (exe && which(exe) && await confirm({ message: tr(`تشغيل ${tools[0]} الآن؟`, `Launch ${tools[0]} now?`), default: false })) run(exe);
  }
}
