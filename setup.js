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
        openclaw: '🐾 OpenClaw',
        exitOption: '❌ إنهاء البرنامج',
        goodbye: 'إلى اللقاء! 👋',
        cancelled: '\nتم إلغاء العملية. إلى اللقاء! 👋',
        unexpectedError: 'حدث خطأ غير متوقع:',
        setupAnother: 'هل تريد إعداد أداة أخرى؟',
        allDone: '\n🎉 انتهى الإعداد. تم تحسين بيئتك بنجاح!',
        configuringTool: (t) => `\n=== ⚙️ إعداد ${t} ===`,
        toolNotInstalled: (t) => `أداة ${t} غير مثبتة في النظام. سيتم تثبيتها تلقائياً...`,
        installing: (t, method) => `جاري تثبيت ${t} عبر ${method}...`,
        installFailed: (t) => `فشل في تثبيت ${t}`,
        installFailedAll: (t) => `❌ فشلت جميع طرق تثبيت ${t}. يرجى التثبيت يدوياً.`,
        tryingFallback: (method) => `⚠️ فشلت الطريقة الأولى، جاري تجربة: ${method}...`,
        manualInstall: (cmds) => `\n📋 أوامر التثبيت اليدوي:\n${cmds}`,
        skipped: (t) => `تم تخطي إعداد ${t} بطلب منك.`,
        nodeNotFound: '❌ Node.js غير مثبت! يجب تثبيته أولاً.',
        nodeVersion: (v) => `✅ Node.js: ${v}`,
        npmVersion: (v) => `✅ npm: ${v}`,
        npmOld: (v) => `⚠️ إصدار npm قديم (${v}). جاري التحديث...`,
        npmFixing: 'جاري إصلاح npm...',
        npmFixed: '✅ تم إصلاح/تحديث npm بنجاح.',
        npmFixFailed: '⚠️ فشل تحديث npm. قد تواجه مشاكل في التثبيت.',
        envCheck: '\n🔍 فحص البيئة...',
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
        openclaw: '🐾 OpenClaw',
        exitOption: '❌ Exit',
        goodbye: 'Goodbye! 👋',
        cancelled: '\nOperation cancelled. Goodbye! 👋',
        unexpectedError: 'Unexpected error:',
        setupAnother: 'Do you want to configure another tool?',
        allDone: '\n🎉 Setup complete. Your environment is ready!',
        configuringTool: (t) => `\n=== ⚙️ Configuring ${t} ===`,
        toolNotInstalled: (t) => `${t} is not installed. It will be installed automatically...`,
        installing: (t, method) => `Installing ${t} via ${method}...`,
        installFailed: (t) => `Failed to install ${t}`,
        installFailedAll: (t) => `❌ All installation methods failed for ${t}. Please install manually.`,
        tryingFallback: (method) => `⚠️ Primary method failed, trying: ${method}...`,
        manualInstall: (cmds) => `\n📋 Manual install commands:\n${cmds}`,
        skipped: (t) => `Skipped ${t} setup as requested.`,
        nodeNotFound: '❌ Node.js is not installed! Please install it first.',
        nodeVersion: (v) => `✅ Node.js: ${v}`,
        npmVersion: (v) => `✅ npm: ${v}`,
        npmOld: (v) => `⚠️ npm version is old (${v}). Updating...`,
        npmFixing: 'Fixing npm...',
        npmFixed: '✅ npm updated/fixed successfully.',
        npmFixFailed: '⚠️ Failed to update npm. You may experience installation issues.',
        envCheck: '\n🔍 Checking environment...',
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
    { value: "nvidia/glm-5",                   name: "GLM-5                  │ CTX: 200,000 │ OUT:  32,000" },
    { value: "nvidia/glm-4.7",                 name: "GLM-4.7                │ CTX: 200,000 │ OUT:  32,000" },
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
    { value: "nvidia/nemotron-3-super-120b-a12b", name: "Nemotron 3 Super 120B  │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/deepseek-r1",             name: "DeepSeek R1            │ CTX: 163,840 │ OUT:  32,768" },
    { value: "nvidia/gpt-oss-120b",            name: "GPT-OSS 120B           │ CTX: 128,000 │ OUT:  16,384" },
    { value: "nvidia/step-3.5-flash",          name: "Step 3.5 Flash         │ CTX: 128,000 │ OUT:  32,768" },

    // ── Gemini (via LiteLLM) ─────────────────────────────────────────────────
    { value: "gemini-3.1-pro",                 name: "Gemini 3.1 Pro         │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-3.1-flash",               name: "Gemini 3.1 Flash       │ CTX: 1,048,576 │ OUT: 65,536" },
    // ── abdalgani (ollama) - ابحث بكلمة ollama ──────────────────────────────
    { value: "glm-5.1:cloud",                  name: "GLM-5.1 (Ollama Cloud)  │ CTX: 200,000 │ OUT: 131,072" },
    { value: "glm-5:cloud",                    name: "GLM-5 (Ollama Cloud)    │ CTX: 202,752 │ OUT: 131,072" },
    { value: "gemma4",                          name: "Gemma 4 (Ollama)        │ CTX: 128,000 │ OUT:  32,768" },
    { value: "qwen3.5",                         name: "Qwen 3.5 (Ollama)       │ CTX: 131,072 │ OUT:  32,768" },
    { value: "minimax-m2.7:cloud",             name: "MiniMax M2.7 (Ollama)   │ CTX: 196,608 │ OUT: 196,608" },
    { value: "kimi-k2.5:cloud",                name: "Kimi K2.5 (Ollama)      │ CTX: 262,144 │ OUT:  65,535" },
    { value: "glm-4.7:cloud",                  name: "GLM-4.7 (Ollama)        │ CTX: 200,000 │ OUT: 128,000" },
    { value: "deepseek-v3.2:cloud",            name: "DeepSeek V3.2 (Ollama)  │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nemotron-3-super:cloud",         name: "Nemotron 3 Super(Ollama)│ CTX: 131,072 │ OUT:  32,768" },
];

// ==================== Tool Installation Map ====================
const isWin = os.platform() === 'win32';
const TOOL_INSTALL_MAP = {
    OpenCode: {
        exeName: 'opencode',
        methods: isWin
            ? [
                { label: 'npm',  cmd: 'npm install -g opencode-ai' },
              ]
            : [
                { label: 'curl', cmd: 'curl -fsSL https://opencode.ai/install | bash' },
                { label: 'npm',  cmd: 'npm install -g opencode-ai' },
              ],
        manual: isWin
            ? '  npm install -g opencode-ai'
            : '  curl -fsSL https://opencode.ai/install | bash\n  # or: npm install -g opencode-ai',
    },
    KiloCLI: {
        exeName: 'kilo',
        methods: [
            { label: 'npm', cmd: 'npm install -g @kilocode/cli' },
        ],
        manual: '  npm install -g @kilocode/cli',
    },
    ClaudeCode: {
        exeName: 'claude',
        methods: isWin
            ? [
                { label: 'PowerShell', cmd: 'powershell -Command "irm https://claude.ai/install.ps1 | iex"' },
                { label: 'npm (deprecated)', cmd: 'npm install -g @anthropic-ai/claude-code' },
              ]
            : [
                { label: 'curl', cmd: 'curl -fsSL https://claude.ai/install.sh | bash' },
                { label: 'npm (deprecated)', cmd: 'npm install -g @anthropic-ai/claude-code' },
              ],
        manual: isWin
            ? '  irm https://claude.ai/install.ps1 | iex\n  # or: winget install Anthropic.ClaudeCode'
            : '  curl -fsSL https://claude.ai/install.sh | bash\n  # or: brew install --cask claude-code',
    },
    OpenClaw: {
        exeName: 'openclaw',
        methods: isWin
            ? [
                { label: 'PowerShell', cmd: 'powershell -Command "irm https://openclaw.ai/install.ps1 | iex"' },
                { label: 'npm (beta)', cmd: 'npm install -g openclaw@beta' },
              ]
            : [
                { label: 'curl', cmd: 'curl -fsSL https://openclaw.ai/install.sh | bash -s -- --install-method git' },
                { label: 'npm (beta)', cmd: 'npm install -g openclaw@beta' },
              ],
        manual: isWin
            ? '  powershell -c "irm https://openclaw.ai/install.ps1 | iex"\n  # or: npm i -g openclaw@beta'
            : '  curl -fsSL https://openclaw.ai/install.sh | bash -s -- --install-method git\n  # or: npm i -g openclaw@beta',
    },
};

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

function runSilent(command) {
    try {
        return execSync(command, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
    } catch (e) {
        return null;
    }
}

function checkInstalled(command) {
    try {
        if (isWin) {
            execSync(`where ${command}`, { stdio: 'ignore' });
        } else {
            execSync(`which ${command}`, { stdio: 'ignore' });
        }
        return true;
    } catch (e) {
        return false;
    }
}

// ==================== Environment Pre-flight ====================
function ensureNodeNpm() {
    console.log(chalk.cyan(t('envCheck')));

    // Check Node.js
    const nodeV = runSilent('node -v');
    if (!nodeV) {
        console.log(chalk.red(t('nodeNotFound')));
        if (isWin) {
            console.log(chalk.yellow('  → Install nvm-windows: https://github.com/coreybutler/nvm-windows/releases'));
            console.log(chalk.yellow('    nvm install lts && nvm use lts'));
        } else {
            console.log(chalk.yellow('  → curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash'));
            console.log(chalk.yellow('    nvm install --lts && nvm use --lts'));
        }
        process.exit(1);
    }
    console.log(chalk.green(t('nodeVersion', nodeV)));

    // Check npm
    const npmV = runSilent('npm -v');
    if (!npmV) {
        console.log(chalk.red('❌ npm not found! Attempting fix...'));
        try {
            execSync('node -e "process.exit(0)"', { stdio: 'ignore' });
            console.log(chalk.yellow(t('npmFixing')));
            execSync('npm install -g npm@latest', { stdio: 'inherit' });
        } catch (_) {
            console.log(chalk.red(t('npmFixFailed')));
        }
    } else {
        console.log(chalk.green(t('npmVersion', npmV)));
        // If npm < 9, suggest upgrade
        const npmMajor = parseInt(npmV.split('.')[0], 10);
        if (npmMajor < 9) {
            console.log(chalk.yellow(t('npmOld', npmV)));
            try {
                execSync('npm install -g npm@latest', { stdio: 'inherit' });
                console.log(chalk.green(t('npmFixed')));
            } catch (_) {
                console.log(chalk.yellow(t('npmFixFailed')));
            }
        }
    }
    console.log('');
}

// ==================== Smart Tool Installer ====================
async function installTool(toolName) {
    const map = TOOL_INSTALL_MAP[toolName];
    if (!map) {
        console.log(chalk.red(`Unknown tool: ${toolName}`));
        return false;
    }

    for (let i = 0; i < map.methods.length; i++) {
        const method = map.methods[i];
        if (i > 0) {
            console.log(chalk.yellow(t('tryingFallback', method.label)));
        }
        console.log(chalk.yellow(t('installing', toolName, method.label)));
        try {
            execSync(method.cmd, { stdio: 'inherit' });
            // Verify it actually installed
            if (checkInstalled(map.exeName)) {
                return true;
            }
            // If cmd succeeded but binary not found, try npm cache fix then retry
            console.log(chalk.yellow('⚠️ Command succeeded but binary not found in PATH. Trying npm cache fix...'));
            try {
                execSync('npm cache clean --force', { stdio: 'ignore' });
            } catch (_) {}
        } catch (e) {
            console.log(chalk.red(t('installFailed', `${toolName} (${method.label})`)));
        }
    }

    // All methods failed
    console.log(chalk.red(t('installFailedAll', toolName)));
    console.log(chalk.cyan(t('manualInstall', map.manual)));
    return false;
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

    const map = TOOL_INSTALL_MAP[toolName];
    const exeName = map ? map.exeName : toolName.toLowerCase();

    const isInstalled = checkInstalled(exeName);
    if (!isInstalled) {
        console.log(chalk.yellow(t('toolNotInstalled', toolName)));
        const success = await installTool(toolName);
        if (!success) {
            return;
        }
    } else {
        console.log(chalk.green(t('toolReady', toolName)));
    }

    const apiKey = await input({ message: t('enterApiKey') });

    // === الدقة والتحديث التلقائي للنماذج من الـ API (Dynamic Model Fetching) ===
    console.log(chalk.gray("\n🔄 Fetching latest dynamic models from api.abdalgani.com..."));
    try {
        const res = await fetch("https://api.abdalgani.com/v1/models", {
            headers: { "Authorization": `Bearer ${apiKey}` },
            // timeout safe handling optional, native fetch used natively
        });
        if (res.ok) {
            const data = await res.json();
            const customModels = data.data || [];
            let addedCount = 0;
            customModels.forEach(m => {
                const modelId = m.id;
                if (!models.find(mod => mod.value === modelId)) {
                    models.push({ value: modelId, name: `${modelId} (Dynamic) │ CTX: 128,000 │ OUT: 8,192` });
                    addedCount++;
                }
            });
            if (addedCount > 0) {
                console.log(chalk.green(`✅ Dynamically added ${addedCount} new models from API.`));
            }
        }
    } catch (e) {
        console.log(chalk.yellow("⚠️ Could not fetch dynamic models due to network. Proceeding with offline list."));
    }

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
            "nvidia/glm-5":               { name: "GLM-5 (NVIDIA)",               limit: { context: 200000,  output: 32000 } },
            "nvidia/glm-4.7":             { name: "GLM-4.7 (NVIDIA)",             limit: { context: 200000,  output: 32000 } },
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
            "nvidia/nemotron-3-super-120b-a12b": { name: "Nemotron 3 Super 120B (NVIDIA)", limit: { context: 131072,  output:  32768 } },
            "nvidia/deepseek-r1":         { name: "DeepSeek R1 (NVIDIA)",         limit: { context: 163840,  output:  32768 } },
            "nvidia/gpt-oss-120b":        { name: "GPT-OSS 120B (NVIDIA)",        limit: { context: 128000,  output:  16384 } },
            "nvidia/step-3.5-flash":      { name: "Step 3.5 Flash (NVIDIA)",      limit: { context: 128000,  output:  32768 } },

            // ── Gemini ───────────────────────────────────────────────────────────
            "gemini-3.1-pro":      { name: "Gemini 3.1 Pro",           limit: { context: 1048576, output:  65536 } },
            "gemini-3.1-flash":    { name: "Gemini 3.1 Flash",         limit: { context: 1048576, output:  65536 } },
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
            "glm-5.1:cloud":  { name: "GLM-5.1 Cloud (Ollama)", limit: { context: 200000, output: 131072 } },
            "glm-5:cloud":  { name: "GLM-5 Cloud (Ollama)", limit: { context: 202752, output: 131072 } },
            "gemma4":       { name: "Gemma 4 (Ollama)", limit: { context: 128000, output: 32768 } },
            "qwen3.5":      { name: "Qwen 3.5 (Ollama)", limit: { context: 131072, output: 32768 } },
            "minimax-m2.7:cloud": { name: "MiniMax M2.7 (Ollama)", limit: { context: 196608, output: 196608 } },
            "kimi-k2.5:cloud":    { name: "Kimi K2.5 (Ollama)", limit: { context: 262144, output: 65535 } },
            "glm-4.7:cloud":      { name: "GLM-4.7 (Ollama)", limit: { context: 200000, output: 128000 } },
            "deepseek-v3.2:cloud":{ name: "DeepSeek V3.2 (Ollama)", limit: { context: 131072, output: 32768 } },
            "nemotron-3-super:cloud": { name: "Nemotron 3 Super (Ollama)", limit: { context: 131072, output: 32768 } },
        };

        // Sync dynamically fetched models — parse CTX/OUT from name instead of hardcoded defaults
        models.forEach(m => {
            if (!providerModels[m.value]) {
                const parts = m.name.split('│');
                const cleanName = parts[0].trim();
                const ctxStr = parts[1] ? parts[1].replace(/[^0-9]/g, '') : '128000';
                const outStr = parts[2] ? parts[2].replace(/[^0-9]/g, '') : '8192';
                providerModels[m.value] = {
                    name: cleanName,
                    limit: { context: parseInt(ctxStr, 10), output: parseInt(outStr, 10) }
                };
            }
        });

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
    } else if (toolName === 'OpenClaw') {
        const clawDir = path.join(os.homedir(), '.openclaw');
        const clawFile = path.join(clawDir, 'openclaw.json');

        if (!fs.existsSync(clawDir)) fs.mkdirSync(clawDir, { recursive: true });

        let clawConfig = { models: { providers: {} }, auth: { profiles: {} }, agents: { defaults: { model: {}, models: {} } } };
        if (fs.existsSync(clawFile)) {
            try { 
                const existing = JSON.parse(fs.readFileSync(clawFile, 'utf8')); 
                clawConfig = { ...clawConfig, ...existing };
                if (!clawConfig.models) clawConfig.models = { providers: {} };
                if (!clawConfig.models.providers) clawConfig.models.providers = {};
                if (!clawConfig.auth) clawConfig.auth = { profiles: {} };
                if (!clawConfig.auth.profiles) clawConfig.auth.profiles = {};
                if (!clawConfig.agents) clawConfig.agents = { defaults: { model: {}, models: {} } };
                if (!clawConfig.agents.defaults) clawConfig.agents.defaults = { model: {}, models: {} };
                if (!clawConfig.agents.defaults.model) clawConfig.agents.defaults.model = {};
                if (!clawConfig.agents.defaults.models) clawConfig.agents.defaults.models = {};
            } catch (_) {}
        }

        const clawModelsList = [];
        const allowedModels = {};
        
        models.forEach(m => {
            const parts = m.name.split('│');
            const cleanName = parts[0].trim();
            const ctxStr = parts[1] ? parts[1].replace(/[^0-9]/g, '') : '128000';
            const outStr = parts[2] ? parts[2].replace(/[^0-9]/g, '') : '32768';
            let contextWindow = parseInt(ctxStr, 10);
            let maxTokens = parseInt(outStr, 10);

            clawModelsList.push({
                id: m.value,
                name: cleanName,
                reasoning: false,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: contextWindow,
                maxTokens: maxTokens
            });
            allowedModels[`litellm/${m.value}`] = {};
            allowedModels[`abdalgani/${m.value}`] = {};
        });

        clawConfig.models.providers["litellm"] = {
            baseUrl: "https://api.abdalgani.com/v1",
            apiKey: apiKey,
            auth: "api-key",
            api: "openai-completions",
            authHeader: true,
            models: clawModelsList
        };

        // Register abdalgani as a separate provider with the SAME model list
        // This ensures abdalgani/ models get correct context windows instead of defaults
        clawConfig.models.providers["abdalgani"] = {
            baseUrl: "https://api.abdalgani.com/v1",
            apiKey: apiKey,
            auth: "api-key",
            api: "openai-completions",
            authHeader: true,
            models: clawModelsList
        };

        clawConfig.auth.profiles["litellm:default"] = {
            provider: "litellm",
            mode: "api_key"
        };

        clawConfig.auth.profiles["abdalgani:default"] = {
            provider: "abdalgani",
            mode: "api_key"
        };

        let primaryModel = selectedModel || 'glm-4.7';
        clawConfig.agents.defaults.model.primary = `litellm/${primaryModel}`;
        clawConfig.agents.defaults.model.fallbacks = [`abdalgani/${primaryModel}`];
        
        clawConfig.agents.defaults.models = { ...clawConfig.agents.defaults.models, ...allowedModels };

        fs.writeFileSync(clawFile, JSON.stringify(clawConfig, null, 2));
        console.log(chalk.green(t('writtenTo', clawFile)));

        const cacheFile = path.join(clawDir, 'agents', 'main', 'agent', 'models.json');
        if (fs.existsSync(cacheFile)) {
            try { fs.unlinkSync(cacheFile); } catch(e) {}
        }

        console.log(chalk.cyan('\\nRestarting openclaw-gateway...'));
        try {
            execSync("systemctl --user restart openclaw-gateway", { stdio: 'ignore' });
            console.log(chalk.green("✅ OpenClaw Gateway restarted successfully."));
        } catch(e) {
            console.log(chalk.yellow("⚠️ Could not restart openclaw-gateway. It might not be running or systemctl is not available."));
        }
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

    // Pre-flight: ensure Node.js + npm are healthy
    ensureNodeNpm();

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
                { name: t('openclaw'), value: 'OpenClaw' },
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
