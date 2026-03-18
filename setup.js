import { select, input, search } from '@inquirer/prompts';
import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ==================== Localization ====================
const i18n = {
    ar: {
        header: '🚀 Oh-My-abdalgani-code Setup Tool 🚀',
        selectTool: 'أي أداة تريد إعدادها مع مزود api.abdalgani.com؟',
        opencode: '💻 OpenCode',
        kilocli: '⌨️  KiloCLI',
        claudecode: '🤖 ClaudeCode',
        exitOption: '❌ إنهاء البرنامج',
        goodbye: 'إلى اللقاء! 👋',
        cancelled: '\nتم إلغاء العملية. إلى اللقاء! 👋',
        unexpectedError: 'حدث خطأ غير متوقع:',
        setupAnother: 'هل تريد إعداد أداة أخرى؟',
        allDone: '\n🎉 انتهى الإعداد. تم تحسين بيئتك بنجاح!',
        configuringTool: (t) => `\n=== ⚙️ إعداد ${t} ===`,
        toolNotInstalled: (t) => `أداة ${t} غير مثبتة في النظام. سيتم تثبيتها تلقائياً عبر npm...`,
        installing: (t) => `جاري تثبيت ${t}...`,
        installFailed: (t) => `فشل في تثبيت ${t}`,
        skipped: (t) => `تم تخطي إعداد ${t} بطلب منك.`,
        toolReady: (t) => `✔️ أداة ${t} مثبتة مسبقاً وجاهزة للإعداد.`,
        enterApiKey: '⌨️ أدخل مفتاح الـ API الخاص بـ abdalgani.com:',
        selectModel: 'اختر النموذج (Model) الافتراضي (استخدم الأسهم أعلى/أسفل للتنقل):',
        applying: '🔄 جاري تطبيق الإعدادات ودمجها بسلاسة...',
        configReadError: 'تعذر قراءة ملف الإعدادات القديم، سيتم إنشاء واحد جديد.',
        configSuccess: (f) => `✅ تم تحديث ${f} بنجاح عبَر إضافة/تحديث مزود abdalgani دون مسح المزودين القدامى!`,
        claudeInfo: '\n✅ لربط ClaudeCode، يجب تصدير المتغيرات البيئية لاستخدام حزمة @ai-sdk/openai-compatible.',
        claudeRunCmds: 'الرجاء تنفيذ الأوامر التالية في الطرفية الخاصة بك لجعل المزود يعمل:\n',
        claudeNote: 'ملاحظة: يمكنك إضافتها إلى .bashrc أو .zshrc لتكون دائمة.',
        runFailed: (cmd) => `فشل التنفيذ: ${cmd}`,
        launchPrompt: (t) => `🚀 هل تريد تشغيل ${t} الآن مباشرة؟`,
        launching: (t) => `\n▶ جاري تشغيل ${t}...\n`,
        launchFailed: (t, err) => `فشل تشغيل ${t}: ${err}`,
        searchModel: (tier, def) => `🔍 ${tier} — ابحث عن نموذج (اضغط Enter للافتراضي: ${def}):`,
        noModelMatch: '⚠️ لا يوجد نموذج مطابق',
        chooseModelTier: '\n🎯 اختر نموذجاً لكل مستوى (اكتب للبحث أو اضغط Enter للافتراضي):\n',
        tierOpus: '🔴 Opus   (المهام الثقيلة والتفكير العميق)',
        tierSonnet: '🟡 Sonnet (المهام المتوسطة والكتابة)',
        tierHaiku: '🟢 Haiku  (المهام السريعة والخفيفة)',
        corruptConfig: '⚠️  ملف الإعداد القديم تالف، سيتم إنشاء واحد جديد.',
        updatedFile: (f) => `\n✅ تم تحديث: ${f}`,
        providerAdded: (count) => `   ← تمت إضافة مزود "abdalgani" بـ ${count} نموذجاً`,
        othersUntouched: '   ← المزودون الآخرون (google, litellm, ollama...) لم يُمسّوا',
        writtenTo: (f) => `\n✅ تم الكتابة إلى: ${f}`,
        modelsMap: '\n📦 خريطة النماذج الثلاثة:',
        apiKeyRemoved: '\n💡 تم حذف ANTHROPIC_API_KEY لتجنب تعارض المصادقة.',
    },
    en: {
        header: '🚀 Oh-My-abdalgani-code Setup Tool 🚀',
        selectTool: 'Which tool do you want to configure with api.abdalgani.com?',
        opencode: '💻 OpenCode',
        kilocli: '⌨️  KiloCLI',
        claudecode: '🤖 ClaudeCode',
        exitOption: '❌ Exit',
        goodbye: 'Goodbye! 👋',
        cancelled: '\nOperation cancelled. Goodbye! 👋',
        unexpectedError: 'Unexpected error:',
        setupAnother: 'Do you want to configure another tool?',
        allDone: '\n🎉 Setup complete. Your environment is ready!',
        configuringTool: (t) => `\n=== ⚙️ Configuring ${t} ===`,
        toolNotInstalled: (t) => `${t} is not installed. It will be installed automatically via npm...`,
        installing: (t) => `Installing ${t}...`,
        installFailed: (t) => `Failed to install ${t}`,
        skipped: (t) => `Skipped ${t} setup as requested.`,
        toolReady: (t) => `✔️ ${t} is already installed and ready to configure.`,
        enterApiKey: '⌨️ Enter your abdalgani.com API key:',
        selectModel: 'Select the default model (use arrow keys to navigate):',
        applying: '🔄 Applying settings and merging seamlessly...',
        configReadError: 'Could not read old config file, creating a new one.',
        configSuccess: (f) => `✅ Updated ${f} successfully! Provider "abdalgani" added/updated without removing existing providers.`,
        claudeInfo: '\n✅ To connect ClaudeCode, export the following environment variables for @ai-sdk/openai-compatible.',
        claudeRunCmds: 'Please run these commands in your terminal:\n',
        claudeNote: 'Note: Add them to .bashrc or .zshrc for persistence.',
        runFailed: (cmd) => `Execution failed: ${cmd}`,
        launchPrompt: (t) => `🚀 Do you want to launch ${t} now?`,
        launching: (t) => `\n▶ Launching ${t}...\n`,
        launchFailed: (t, err) => `Failed to launch ${t}: ${err}`,
        searchModel: (tier, def) => `🔍 ${tier} — Search for a model (Press Enter for default: ${def}):`,
        noModelMatch: '⚠️ No matching model found',
        chooseModelTier: '\n🎯 Choose a model for each tier (type to search or press Enter for default):\n',
        tierOpus: '🔴 Opus   (Heavy tasks & deep thinking)',
        tierSonnet: '🟡 Sonnet (Medium tasks & writing)',
        tierHaiku: '🟢 Haiku  (Fast & light tasks)',
        corruptConfig: '⚠️ Old config file is corrupt, a new one will be created.',
        updatedFile: (f) => `\n✅ Updated: ${f}`,
        providerAdded: (count) => `   ← "abdalgani" provider added with ${count} models`,
        othersUntouched: '   ← Other providers (google, litellm, ollama...) left untouched',
        writtenTo: (f) => `\n✅ Written to: ${f}`,
        modelsMap: '\n📦 Map of the three models:',
        apiKeyRemoved: '\n💡 ANTHROPIC_API_KEY removed to avoid authentication conflict.',
    }
};

let lang = 'en'; // default, will be set by user
function t(key, ...args) {
    const val = i18n[lang][key];
    return typeof val === 'function' ? val(...args) : val;
}

// ==================== Models ====================
// النموذج الافتراضي الصامت - يُستخدم لـ OpenCode/KiloCLI تلقائياً
const DEFAULT_MODEL = 'nvidia/glm-4.7';

// القائمة الكاملة مُحدَّثة من API الفعلي (api.abdalgani.com/v1/models)
const models = [
    // ── NVIDIA NIM ───────────────────────────────────────────────────────────
    { value: "nvidia/glm-5",                   name: "GLM-5                  │ CTX: 205,000 │ OUT: 131,072" },
    { value: "nvidia/glm-4.7",                 name: "GLM-4.7                │ CTX: 205,000 │ OUT: 128,000" },
    { value: "nvidia/kimi-k2.5",               name: "Kimi K2.5 (NVIDIA)     │ CTX: 262,144 │ OUT:  65,535" },
    // ── Moonshot & MiniMax ───────────────────────────────────────────────────
    { value: "moonshotai/kimi-k2.5",           name: "Kimi K2.5 (Moonshot)   │ CTX: 262,144 │ OUT:  65,535" },
    { value: "minimaxai/minimax-m2.5",         name: "MiniMax M2.5           │ CTX: 196,608 │ OUT: 196,608" },
    { value: "nvidia/qwen3.5-397b",            name: "Qwen 3.5 397B          │ CTX: 262,144 │ OUT:  81,920" },
    { value: "qwen",                           name: "Qwen 3.5 397B (Alias)  │ CTX: 262,144 │ OUT:  81,920" },
    { value: "qwen/qwen3.5-397b-a17b",         name: "Qwen 3.5 397B a17b     │ CTX: 262,144 │ OUT:  81,920" },
    { value: "nvidia/qwen3-coder-480b",        name: "Qwen3 Coder 480B       │ CTX: 262,144 │ OUT:  81,920" },
    { value: "nvidia/qwen3.5-122b",            name: "Qwen 3.5 122B          │ CTX: 262,144 │ OUT:  81,920" },
    { value: "nvidia/qwq-32b",                 name: "QwQ 32B                │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/qwen3-next-thinking",     name: "Qwen3 Next Thinking     │ CTX: 262,144 │ OUT:  81,920" },
    { value: "nvidia/nemotron-ultra-253b",     name: "Nemotron Ultra 253B    │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/nemotron-super-49b",      name: "Nemotron Super 49B     │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/deepseek-r1",             name: "DeepSeek R1            │ CTX: 163,840 │ OUT:  32,768" },
    { value: "nvidia/gpt-oss-120b",            name: "GPT-OSS 120B           │ CTX: 128,000 │ OUT:  16,384" },
    { value: "nvidia/step-3.5-flash",          name: "Step 3.5 Flash         │ CTX: 128,000 │ OUT:  32,768" },
    // ── NanoGPT ──────────────────────────────────────────────────────────────
    { value: "glm-5",                          name: "GLM-5       (NanoGPT)  │ CTX: 202,752 │ OUT: 131,072" },
    { value: "glm-5:thinking",                 name: "GLM-5 Think (NanoGPT)  │ CTX: 202,752 │ OUT: 131,072" },
    { value: "glm-4.7",                        name: "GLM-4.7     (NanoGPT)  │ CTX: 205,000 │ OUT: 128,000" },
    { value: "glm-4.7:thinking",               name: "GLM-4.7 T.  (NanoGPT)  │ CTX: 205,000 │ OUT: 128,000" },
    { value: "glm-4.7-flash",                  name: "GLM-4.7 Flash(NanoGPT) │ CTX: 202,752 │ OUT: 131,072" },
    { value: "glm-4.7-flash:thinking",         name: "GLM-4.7 F.T.(NanoGPT)  │ CTX: 202,752 │ OUT: 131,072" },
    { value: "glm-4.6",                        name: "GLM-4.6     (NanoGPT)  │ CTX: 128,000 │ OUT:  32,768" },
    { value: "glm-4.6:thinking",               name: "GLM-4.6 T.  (NanoGPT)  │ CTX: 128,000 │ OUT:  32,768" },
    { value: "kimi-k2.5",                      name: "Kimi K2.5   (NanoGPT)  │ CTX: 262,144 │ OUT:  65,535" },
    { value: "kimi-k2.5:thinking",             name: "Kimi K2.5 T.(NanoGPT)  │ CTX: 262,144 │ OUT:  65,535" },
    { value: "kimi-k2-thinking",               name: "Kimi K2 Think(NanoGPT) │ CTX: 262,144 │ OUT:  65,535" },
    { value: "minimax-m2.5",                   name: "MiniMax M2.5 (NanoGPT) │ CTX: 196,608 │ OUT: 196,608" },
    { value: "minimax-m2.1",                   name: "MiniMax M2.1 (NanoGPT) │ CTX: 196,608 │ OUT: 196,608" },
    { value: "deepseek-v3.2",                  name: "DeepSeek V3.2(NanoGPT) │ CTX: 131,072 │ OUT:  32,768" },
    { value: "mistral-small-4",                name: "Mistral Small 4        │ CTX: 128,000 │ OUT:  32,768" },
    { value: "nano-gpt-oss-120b",              name: "NanoGPT OSS 120B       │ CTX: 128,000 │ OUT:  16,384" },
    // ── abdalgani (ollama) - ابحث بكلمة ollama ──────────────────────────────
    { value: "glm-5:cloud",                    name: "GLM-5 abdalgani (ollama)│ CTX: 202,752 │ OUT: 131,072" },
    { value: "minimax-m2.7:cloud",             name: "MiniMax M2.7 (Ollama)   │ CTX: 196,608 │ OUT: 196,608" },
    { value: "kimi-k2.5:cloud",                name: "Kimi K2.5 (Ollama)      │ CTX: 262,144 │ OUT:  65,535" },
    { value: "glm-4.7:cloud",                  name: "GLM-4.7 (Ollama)        │ CTX: 205,000 │ OUT: 128,000" },
    { value: "deepseek-v3.2:cloud",            name: "DeepSeek V3.2 (Ollama)  │ CTX: 131,072 │ OUT:  32,768" },
];

// ==================== Utilities ====================
async function runCommand(command) {
    try {
        execSync(command, { stdio: 'inherit' });
        return true;
    } catch (e) {
        console.error(chalk.red(t('runFailed', command)));
        return false;
    }
}

function checkInstalled(command) {
    try {
        if (os.platform() === 'win32') {
            execSync(`where ${command}`, { stdio: 'ignore' });
        } else {
            execSync(`which ${command}`, { stdio: 'ignore' });
        }
        return true;
    } catch (e) {
        return false;
    }
}

// ==================== Launch After Setup ====================
async function launchAfterSetup(toolName, exeName) {
    console.log('');
    const launch = await select({
        message: chalk.cyan(t('launchPrompt', toolName)),
        choices: [
            { name: lang === 'ar' ? '✅ نعم' : '✅ Yes', value: true },
            { name: lang === 'ar' ? '❌ لا' : '❌ No',  value: false }
        ]
    });
    if (!launch) return;

    console.log(chalk.green(t('launching', toolName)));
    try {
        // spawn in foreground so the user gets the full interactive session
        const { spawnSync } = await import('child_process');
        spawnSync(exeName, [], { stdio: 'inherit', shell: true });
    } catch (e) {
        console.error(chalk.red(t('launchFailed', toolName, e.message)));
    }
}

// ==================== Core Logic ====================
async function configureTool(toolName) {
    console.log(chalk.cyan(t('configuringTool', toolName)));

    let exeName = toolName.toLowerCase();
    if (toolName === 'ClaudeCode') exeName = 'claude';
    if (toolName === 'KiloCLI') exeName = 'kilo';

    const isInstalled = checkInstalled(exeName);
    if (!isInstalled) {
        console.log(chalk.yellow(t('toolNotInstalled', toolName)));
        console.log(chalk.yellow(t('installing', toolName)));
        const success = await runCommand(`npm install -g ${exeName}`);
        if (!success) {
            console.log(chalk.red(t('installFailed', toolName)));
            return;
        }
    } else {
        console.log(chalk.green(t('toolReady', toolName)));
    }

    const apiKey = await input({ message: t('enterApiKey') });

    // === Model Selection: فقط لـ ClaudeCode بثلاثة أسئلة، OpenCode/Kilo تلقائياً ===
    let selectedModel = DEFAULT_MODEL;
    let claudeOpus   = 'nvidia/glm-5';
    let claudeSonnet = 'moonshotai/kimi-k2.5';
    let claudeHaiku  = 'minimaxai/minimax-m2.5';

    if (toolName === 'ClaudeCode') {
        // helper: prompt بحث لكل tier
        const pickModel = async (tierLabel, defaultVal) => {
            const chosen = await search({
                message: t('searchModel', tierLabel, defaultVal),
                source: (input) => {
                    const q = (input || '').toLowerCase();
                    const filtered = models.filter(
                        m => m.name.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)
                    );
                    // أضف الافتراضي في أول القائمة دائماً إذا ما فُلتر
                    const hasDefault = filtered.some(m => m.value === defaultVal);
                    const defaultEntry = models.find(m => m.value === defaultVal);
                    return filtered.length > 0
                        ? (hasDefault ? filtered : [defaultEntry, ...filtered])
                        : (defaultEntry ? [defaultEntry] : [{ value: '__none__', name: t('noModelMatch') }]);
                },
            });
            return chosen === '__none__' ? defaultVal : chosen;
        };

        console.log(chalk.cyan(t('chooseModelTier')));
        claudeOpus   = await pickModel(t('tierOpus'), 'nvidia/glm-5');
        claudeSonnet = await pickModel(t('tierSonnet'), 'moonshotai/kimi-k2.5');
        claudeHaiku  = await pickModel(t('tierHaiku'), 'minimaxai/minimax-m2.5');
        selectedModel = claudeOpus; // الافتراضي = Opus
    }

    console.log(chalk.yellow(t('applying')));

    if (toolName === 'OpenCode' || toolName === 'KiloCLI') {
        const folderName = exeName === 'kilo' ? 'kilo' : 'opencode';
        const configDir  = path.join(os.homedir(), '.config', folderName);
        const configFile = path.join(configDir, `${folderName}.json`);

        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

        let config = { "$schema": "https://opencode.ai/config.json", "provider": {} };
        if (fs.existsSync(configFile)) {
            try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); }
            catch (_) { console.log(chalk.yellow(t('corruptConfig'))); }
        }
        if (!config.provider) config.provider = {};

        // بناء نماذج المزود مع limit الصحيح لكل نموذج
        const providerModels = {
            // ── Providers ──────────────────────────────────────────────────────
            "moonshotai/kimi-k2.5":       { name: "Kimi K2.5 (Moonshot)",         limit: { context: 262144,  output:  65535 } },
            "minimaxai/minimax-m2.5":     { name: "MiniMax M2.5 (MiniMax)",       limit: { context: 196608,  output: 196608 } },
            // ── NVIDIA NIM ────────────────────────────────────────────────────
            "nvidia/glm-5":               { name: "GLM-5 (NVIDIA)",               limit: { context: 205000,  output: 131072 } },
            "nvidia/glm-4.7":             { name: "GLM-4.7 (NVIDIA)",             limit: { context: 205000,  output: 128000 } },
            "nvidia/kimi-k2.5":           { name: "Kimi K2.5 (NVIDIA)",           limit: { context: 262144,  output:  65535 } },
            "nvidia/qwen3.5-397b":        { name: "Qwen 3.5 397B (NVIDIA)",       limit: { context: 262144,  output:  81920 } },
            "qwen":                       { name: "Qwen 3.5 397B (NVIDIA)",       limit: { context: 262144,  output:  81920 } },
            "qwen/qwen3.5-397b-a17b":     { name: "Qwen 3.5 397B a17b (NVIDIA)",  limit: { context: 262144,  output:  81920 } },
            "nvidia/qwen3.5-122b":        { name: "Qwen 3.5 122B (NVIDIA)",       limit: { context: 262144,  output:  81920 } },
            "nvidia/qwen3-coder-480b":    { name: "Qwen3 Coder 480B (NVIDIA)",    limit: { context: 262144,  output:  81920 } },
            "nvidia/qwq-32b":             { name: "QwQ 32B (NVIDIA)",             limit: { context: 131072,  output:  32768 } },
            "nvidia/qwen3-next-thinking":  { name: "Qwen3 Next Thinking (NVIDIA)", limit: { context: 262144,  output:  81920 } },
            "nvidia/nemotron-ultra-253b": { name: "Nemotron Ultra 253B (NVIDIA)", limit: { context: 131072,  output:  32768 } },
            "nvidia/nemotron-super-49b":  { name: "Nemotron Super 49B (NVIDIA)",  limit: { context: 131072,  output:  32768 } },
            "nvidia/deepseek-r1":         { name: "DeepSeek R1 (NVIDIA)",         limit: { context: 163840,  output:  32768 } },
            "nvidia/gpt-oss-120b":        { name: "GPT-OSS 120B (NVIDIA)",        limit: { context: 128000,  output:  16384 } },
            "nvidia/step-3.5-flash":      { name: "Step 3.5 Flash (NVIDIA)",      limit: { context: 128000,  output:  32768 } },
            // ── NanoGPT ────────────────────────────────────────────────────────
            "glm-5":               { name: "GLM-5 (NanoGPT)",          limit: { context: 202752,  output: 131072 } },
            "glm-5:thinking":      { name: "GLM-5 Thinking (NanoGPT)", limit: { context: 202752,  output: 131072 } },
            "glm-4.7":             { name: "GLM-4.7 (NanoGPT)",        limit: { context: 205000,  output: 128000 } },
            "glm-4.7:thinking":    { name: "GLM-4.7 Thinking (NanoGPT)",limit: { context: 205000, output: 128000 } },
            "glm-4.7-flash":       { name: "GLM-4.7 Flash (NanoGPT)",  limit: { context: 202752,  output: 131072 } },
            "glm-4.7-flash:thinking":{ name: "GLM-4.7 Flash Thinking (NanoGPT)", limit: { context: 202752, output: 131072 } },
            "glm-4.6":             { name: "GLM-4.6 (NanoGPT)",        limit: { context: 128000,  output:  32768 } },
            "glm-4.6:thinking":    { name: "GLM-4.6 Thinking (NanoGPT)",limit: { context: 128000, output:  32768 } },
            "kimi-k2.5":           { name: "Kimi K2.5 (NanoGPT)",      limit: { context: 262144,  output:  65535 } },
            "kimi-k2.5:thinking":  { name: "Kimi K2.5 Thinking (NanoGPT)", limit: { context: 262144, output: 65535 } },
            "kimi-k2-thinking":    { name: "Kimi K2 Thinking (NanoGPT)", limit: { context: 262144, output:  65535 } },
            "minimax-m2.5":        { name: "MiniMax M2.5 (NanoGPT)",   limit: { context: 196608,  output: 196608 } },
            "minimax-m2.1":        { name: "MiniMax M2.1 (NanoGPT)",   limit: { context: 196608,  output: 196608 } },
            "deepseek-v3.2":       { name: "DeepSeek V3.2 (NanoGPT)",  limit: { context: 131072,  output:  32768 } },
            "mistral-small-4":     { name: "Mistral Small 4",          limit: { context: 128000,  output:  32768 } },
            "nano-gpt-oss-120b":   { name: "NanoGPT OSS 120B",         limit: { context: 128000,  output:  16384 } },
            // ── نماذج الصور ────────────────────────────────────────────────────
            "nvidia/stable-diffusion-3": {
                name: "Stable Diffusion 3 (NVIDIA)", attachment: false,
                limit: { context: 8192, output: 4096 },
                modalities: { input: ["text"], output: ["image"] }
            },
            "flux.2-klein-4b": {
                name: "Flux 2 Klein 4B", attachment: false,
                limit: { context: 8192, output: 4096 },
                modalities: { input: ["text"], output: ["image"] }
            },
            // ── Ollama ─────────────────────────────────────────────────────────
            "glm-5:cloud":  { name: "GLM-5 Cloud (Ollama)", limit: { context: 202752, output: 131072 } },
            "minimax-m2.7:cloud": { name: "MiniMax M2.7 (Ollama)", limit: { context: 196608, output: 196608 } },
            "kimi-k2.5:cloud":    { name: "Kimi K2.5 (Ollama)", limit: { context: 262144, output: 65535 } },
            "glm-4.7:cloud":      { name: "GLM-4.7 (Ollama)", limit: { context: 205000, output: 128000 } },
            "deepseek-v3.2:cloud":{ name: "DeepSeek V3.2 (Ollama)", limit: { context: 131072, output: 32768 } },
        };

        // أضف/حدّث مزود abdalgani بدون المساس بالمزودين الآخرين (litellm, google, ollama...)
        config.provider['abdalgani'] = {
            name: "abdalgani",
            npm:  "@ai-sdk/openai-compatible",
            options: {
                baseURL: "https://api.abdalgani.com/v1",
                apiKey:  apiKey,
            },
            models: providerModels,
        };

        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        console.log(chalk.green(t('updatedFile', configFile)));
        console.log(chalk.cyan(t('providerAdded', Object.keys(providerModels).length)));
        console.log(chalk.gray(t('othersUntouched')));
    } else if (toolName === 'ClaudeCode') {
        // === Write ~/.claude/settings.json directly ===
        const claudeDir  = path.join(os.homedir(), '.claude');
        const claudeFile = path.join(claudeDir, 'settings.json');

        if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

        // Read existing settings to merge (don't overwrite unrelated fields)
        let claudeSettings = {};
        if (fs.existsSync(claudeFile)) {
            try { claudeSettings = JSON.parse(fs.readFileSync(claudeFile, 'utf8')); }
            catch (_) { console.log(chalk.yellow(t('corruptConfig'))); }
        }

        // استخدام الاختيارات الثلاثة من المستخدم
        claudeSettings.env = {
            ...(claudeSettings.env || {}),
            ANTHROPIC_BASE_URL:             'https://api.abdalgani.com/',
            ANTHROPIC_AUTH_TOKEN:           apiKey,
            ANTHROPIC_MODEL:                selectedModel,
            ANTHROPIC_DEFAULT_OPUS_MODEL:   claudeOpus,
            ANTHROPIC_DEFAULT_SONNET_MODEL: claudeSonnet,
            ANTHROPIC_DEFAULT_HAIKU_MODEL:  claudeHaiku,
        };

        // Remove conflicting key if present (ANTHROPIC_API_KEY causes the auth conflict warning)
        delete claudeSettings.env.ANTHROPIC_API_KEY;

        fs.writeFileSync(claudeFile, JSON.stringify(claudeSettings, null, 2));

        console.log(chalk.green(t('writtenTo', claudeFile)));
        console.log(chalk.cyan(t('modelsMap')));
        console.log(chalk.white(`   🔴 Opus   → ${claudeOpus}`));
        console.log(chalk.white(`   🟡 Sonnet → ${claudeSonnet}`));
        console.log(chalk.white(`   🟢 Haiku  → ${claudeHaiku}`));
        console.log(chalk.white(`   ⭐ Default→ ${selectedModel}`));
        console.log(chalk.gray(t('apiKeyRemoved')));
    }

    // === Launch Tool After Setup ===
    await launchAfterSetup(toolName, exeName);
}

// ==================== Main ====================
async function main() {
    console.clear();
    console.log(chalk.cyan.bold('===================================================='));
    console.log(chalk.cyan.bold('      🚀 Oh-My-abdalgani-code Setup Tool 🚀'));
    console.log(chalk.cyan.bold('====================================================\n'));

    // === Language Selection (first prompt) ===
    lang = await select({
        message: 'Choose your language / اختر لغتك:',
        choices: [
            { name: '🇬🇧 English', value: 'en' },
            { name: '🇸🇦 العربية', value: 'ar' },
        ]
    });

    console.log('');

    let running = true;
    while (running) {
        const targetTool = await select({
            message: t('selectTool'),
            choices: [
                { name: t('opencode'), value: 'OpenCode' },
                { name: t('kilocli'), value: 'KiloCLI' },
                { name: t('claudecode'), value: 'ClaudeCode' },
                { name: t('exitOption'), value: 'exit' }
            ]
        });

        if (targetTool === 'exit') {
            console.log(chalk.yellow(t('goodbye')));
            running = false;
            break;
        }

        await configureTool(targetTool);

        console.log("");
        running = await select({
            message: t('setupAnother'),
            choices: [
                { name: lang === 'ar' ? '✅ نعم' : '✅ Yes', value: true },
                { name: lang === 'ar' ? '❌ لا' : '❌ No',  value: false }
            ]
        });
    }
    console.log(chalk.green(t('allDone')));
}

main().catch(e => {
    if (e.name === 'ExitPromptError') {
        console.log(chalk.yellow(i18n[lang]?.cancelled || '\nCancelled. Goodbye! 👋'));
    } else {
        console.error(chalk.red(i18n[lang]?.unexpectedError || 'Unexpected error:'), e);
    }
    process.exit(1);
});
