import { select, input, search } from '@inquirer/prompts';
import chalk from 'chalk';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import http from 'http';
import { createWriteStream, mkdirSync, rmSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import yaml from 'js-yaml';
import TOML from '@iarna/toml';

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
        foundExistingKey: '🔑 تم العثور على مفتاح API محفوظ. هل تريد استخدامه؟',
        useExistingKeyYes: '✅ نعم، استخدم المفتاح المحفوظ',
        useExistingKeyNo: '❌ لا، أريد إدخال مفتاح جديد',
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
        avxNotSupported: '⚠️ المعالج لا يدعم تعليمات AVX. جاري تحميل نسخة baseline...',
        downloadingBaseline: (url) => `⬇️ جاري تحميل Kilo Baseline:\n   ${url}`,
        extractingBaseline: '📦 جاري فك الضغط...',
        installingBaseline: '🔧 جاري تثبيت Kilo Baseline...',
        baselineInstallSuccess: '✅ تم تثبيت Kilo Baseline بنجاح!',
        baselineInstallFailed: '❌ فشل تثبيت Kilo Baseline.',
        checkingAvx: '🔍 فحص دعم المعالج لـ AVX...',
        avxSupported: '✅ المعالج يدعم AVX.',
        avxCheckingKilo: '🔍 فحص Kilo بعد التثبيت...',
        kiloCrashDetected: '⚠️ Kilo تعطل (لا يدعم المعالج). جاري التحول للنسخة Baseline...',
        npmMissing: '⚠️ npm غير مثبت! جاري المحاولة...',
        installingNodeNpm: (method) => `📦 جاري تثبيت Node.js + npm عبر ${method}...`,
        nodeInstallSuccess: '✅ تم تثبيت Node.js + npm بنجاح!',
        nodeInstallFailed: (method) => `❌ فشل التثبيت عبر ${method}.`,
        restartTerminal: '💡 يرجى إعادة فتح الطرفية بعد التثبيت.',
        psFixing: '🔧 إصلاح سياسة PowerShell...',
        psFixed: '✅ تم إصلاح سياسة PowerShell (RemoteSigned).',
        psFixFailed: '⚠️ فشل إصلاح سياسة PowerShell. قد تواجه مشاكل عند استخدام npm.',
        psRestricted: '⚠️ سياسة PowerShell مقيدة! npm قد لا يعمل. جاري الإصلاح...',
        selectToolModel: (tool) => `🎯 اختر النموذج الأساسي لـ ${tool}:`,
        selectOpenClawModelDefault: 'nvidia/glm-4.7',
        openClawPrimarySet: (m) => `✅ النموذج الأساسي: ${m}`,
        openClawFallbackNone: '   ← لم يتم تعيين نماذج احتياطية — لن يتم الرجوع لنموذج لم تختره',
        claudeBaseUrlNote: 'ℹ️  يجب أن يدعم المزود نقطة نهاية Anthropic Messages API (/v1/messages).',
        claudeApiKeyCleared: '💡 تم مسح ANTHROPIC_API_KEY (ضبط لقيمة فارغة) لمنع تعارض المصادقة مع ANTHROPIC_AUTH_TOKEN.',
        deepseekV4Pro: 'DeepSeek V4 Pro        │ CTX: 1,048,576 │ OUT: 384,000',
        deepseekV4Flash: 'DeepSeek V4 Flash      │ CTX: 1,048,576 │ OUT: 384,000',
        zeroclaw: '🦀 ZeroClaw',
        hermes: '🔮 Hermes Agent',
        kimicode: '🌙 Kimi Code',
        geminicli: '💎 Gemini CLI',
        codexcli: '🤖 Codex CLI',
        aider: '🔧 Aider',
        goose: '🪿 Goose',
        geminiKeyNote: '⚠️ ملاحظة: Gemini CLI يعمل فقط مع نماذج Google Gemini. لا يدعم مزودات مخصصة.',
        envVarSet: (f) => `✅ تم تعيين متغيرات البيئة وسيتم كتابتها إلى: ${f}`,
        pipNote: '📦 ملاحظة: يتطلب تثبيت هذا pip/Python. سيتم محاولة التثبيت تلقائياً.',
        shellProfileNote: '💡 أضف هذه الأوامر إلى ملف .bashrc أو .zshrc أو PowerShell Profile لجعلها دائمة.',
        deepseektui: '🔮 DeepSeek TUI',
        qwencode: '🌐 Qwen Code',
        winNotSupported: (t) => `⚠️ ${t} لا يدعم التشغيل التفاعلي على Windows حالياً. الإعداد تم بنجاح — شغّله من WSL أو Linux.`,
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
        foundExistingKey: '🔑 Found a saved API key. Do you want to use it?',
        useExistingKeyYes: '✅ Yes, use saved key',
        useExistingKeyNo: '❌ No, enter a new key',
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
        avxNotSupported: '⚠️ CPU does not support AVX instructions. Downloading baseline variant...',
        downloadingBaseline: (url) => `⬇️ Downloading Kilo Baseline:\n   ${url}`,
        extractingBaseline: '📦 Extracting...',
        installingBaseline: '🔧 Installing Kilo Baseline...',
        baselineInstallSuccess: '✅ Kilo Baseline installed successfully!',
        baselineInstallFailed: '❌ Failed to install Kilo Baseline.',
        checkingAvx: '🔍 Checking CPU AVX support...',
        avxSupported: '✅ CPU supports AVX.',
        avxCheckingKilo: '🔍 Verifying Kilo after install...',
        kiloCrashDetected: '⚠️ Kilo crashed (CPU incompatible). Switching to Baseline variant...',
        npmMissing: '⚠️ npm is not installed! Attempting to install...',
        installingNodeNpm: (method) => `📦 Installing Node.js + npm via ${method}...`,
        nodeInstallSuccess: '✅ Node.js + npm installed successfully!',
        nodeInstallFailed: (method) => `❌ Installation via ${method} failed.`,
        restartTerminal: '💡 Please restart your terminal after installation.',
        psFixing: '🔧 Fixing PowerShell execution policy...',
        psFixed: '✅ PowerShell execution policy fixed (RemoteSigned).',
        psFixFailed: '⚠️ Failed to fix PowerShell execution policy. npm may not work properly.',
        psRestricted: '⚠️ PowerShell execution policy is restricted! npm may fail. Fixing...',
        selectToolModel: (tool) => `🎯 Choose the primary model for ${tool}:`,
        selectOpenClawModelDefault: 'nvidia/glm-4.7',
        openClawPrimarySet: (m) => `✅ Primary model: ${m}`,
        openClawFallbackNone: '   ← No fallback models set — won\'t fall back to a model you didn\'t choose',
        claudeBaseUrlNote: 'ℹ️  The provider must support an Anthropic Messages API endpoint (/v1/messages).',
        claudeApiKeyCleared: '💡 ANTHROPIC_API_KEY set to empty string to prevent auth conflict with ANTHROPIC_AUTH_TOKEN.',
        deepseekV4Pro: 'DeepSeek V4 Pro        │ CTX: 1,048,576 │ OUT: 384,000',
        deepseekV4Flash: 'DeepSeek V4 Flash      │ CTX: 1,048,576 │ OUT: 384,000',
        zeroclaw: '🦀 ZeroClaw',
        hermes: '🔮 Hermes Agent',
        kimicode: '🌙 Kimi Code',
        geminicli: '💎 Gemini CLI',
        codexcli: '🤖 Codex CLI',
        aider: '🔧 Aider',
        goose: '🪿 Goose',
        geminiKeyNote: '⚠️ Note: Gemini CLI only works with Google Gemini models. Does not support custom providers.',
        envVarSet: (f) => `✅ Environment variables set and will be written to: ${f}`,
        pipNote: '📦 Note: This requires pip/Python. Installation will be attempted automatically.',
        shellProfileNote: '💡 Add these commands to your .bashrc, .zshrc, or PowerShell Profile for persistence.',
        deepseektui: '🔮 DeepSeek TUI',
        qwencode: '🌐 Qwen Code',
        winNotSupported: (t) => `⚠️ ${t} does not support interactive launch on Windows yet. Config was saved successfully — run it from WSL or Linux.`,
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
    { value: "nvidia/glm-5", name: "GLM-5                  │ CTX: 200,000 │ OUT:  32,000" },
    { value: "nvidia/glm-4.7", name: "GLM-4.7                │ CTX: 200,000 │ OUT:  32,000" },
    { value: "nvidia/kimi-k2.6", name: "Kimi K2.6 (NVIDIA)     │ CTX: 262,144 │ OUT:  65,535" },
    { value: "nvidia/kimi-k2.5", name: "Kimi K2.5 (NVIDIA)     │ CTX: 262,144 │ OUT:  65,535" },
    // ── Moonshot & MiniMax ───────────────────────────────────────────────────
    { value: "moonshotai/kimi-k2.5", name: "Kimi K2.5 (Moonshot)   │ CTX: 262,144 │ OUT:  65,535" },
    { value: "minimaxai/minimax-m2.5", name: "MiniMax M2.5           │ CTX: 196,608 │ OUT: 196,608" },
    { value: "nvidia/qwen3.5-397b", name: "Qwen 3.5 397B          │ CTX: 262,144 │ OUT:  81,920" },
    { value: "qwen", name: "Qwen 3.5 397B (Alias)  │ CTX: 262,144 │ OUT:  81,920" },
    { value: "qwen/qwen3.5-397b-a17b", name: "Qwen 3.5 397B a17b     │ CTX: 262,144 │ OUT:  81,920" },
    { value: "nvidia/qwen3-coder-480b", name: "Qwen3 Coder 480B       │ CTX: 262,144 │ OUT:  81,920" },
    { value: "nvidia/qwen3.5-122b", name: "Qwen 3.5 122B          │ CTX: 262,144 │ OUT:  81,920" },
    { value: "nvidia/qwq-32b", name: "QwQ 32B                │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/qwen3-next-thinking", name: "Qwen3 Next Thinking     │ CTX: 262,144 │ OUT:  81,920" },
    { value: "nvidia/nemotron-ultra-253b", name: "Nemotron Ultra 253B    │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/nemotron-super-49b", name: "Nemotron Super 49B     │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/nemotron-3-super-120b-a12b", name: "Nemotron 3 Super 120B  │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/deepseek-r1", name: "DeepSeek R1            │ CTX: 163,840 │ OUT:  32,768" },
    { value: "nvidia/deepseek-v4-pro", name: "DeepSeek V4 Pro        │ CTX: 1,048,576 │ OUT: 384,000" },
    { value: "nvidia/deepseek-v4-flash", name: "DeepSeek V4 Flash      │ CTX: 1,048,576 │ OUT: 384,000" },
    { value: "nvidia/gpt-oss-120b", name: "GPT-OSS 120B           │ CTX: 128,000 │ OUT:  16,384" },
    { value: "nvidia/step-3.5-flash", name: "Step 3.5 Flash         │ CTX: 128,000 │ OUT:  32,768" },

    // ── Gemini (via LiteLLM) ─────────────────────────────────────────────────
    { value: "gemini-3.1-pro", name: "Gemini 3.1 Pro         │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-3.1-flash", name: "Gemini 3.1 Flash       │ CTX: 1,048,576 │ OUT: 65,536" },
    // ── Google AI Studio (Direct API) ────────────────────────────────────────
    { value: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview  │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview  │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite   │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image  │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-3-pro-image-preview", name: "Gemini 3 Pro Image      │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image  │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-2.5-pro", name: "Gemini 2.5 Pro          │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-pro-latest", name: "Gemini Pro Latest       │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-flash-latest", name: "Gemini Flash Latest     │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-flash-lite-latest", name: "Gemini Flash Lite Latest│ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-2.5-flash", name: "Gemini 2.5 Flash        │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-3.1-flash-live-preview", name: "Gemini 3.1 Flash Live   │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "veo-3.1-generate-preview", name: "Veo 3.1 Video Gen       │ CTX:     8,192 │ OUT:  4,096" },
    { value: "lyria-3-pro-preview", name: "Lyria 3 Pro Audio       │ CTX:     8,192 │ OUT:  4,096" },
    { value: "gemma-4-31b-it", name: "Gemma 4 31B IT          │ CTX:   131,072 │ OUT: 32,768" },
    // ── abdalgani (ollama) - ابحث بكلمة ollama ──────────────────────────────
    { value: "glm-5.1:cloud", name: "GLM-5.1 (Ollama Cloud)  │ CTX: 200,000 │ OUT: 131,072" },
    { value: "glm-5:cloud", name: "GLM-5 (Ollama Cloud)    │ CTX: 202,752 │ OUT: 131,072" },
    { value: "gemma4", name: "Gemma 4 (Ollama)        │ CTX: 128,000 │ OUT:  32,768" },
    { value: "qwen3.5", name: "Qwen 3.5 (Ollama)       │ CTX: 131,072 │ OUT:  32,768" },
    { value: "minimax-m2.7:cloud", name: "MiniMax M2.7 (Ollama)   │ CTX: 196,608 │ OUT: 196,608" },
    { value: "kimi-k2.6:cloud", name: "Kimi K2.6 (Ollama)      │ CTX: 262,144 │ OUT:  65,535" },
    { value: "kimi-k2.5:cloud", name: "Kimi K2.5 (Ollama)      │ CTX: 262,144 │ OUT:  65,535" },
    { value: "glm-4.7:cloud", name: "GLM-4.7 (Ollama)        │ CTX: 200,000 │ OUT: 128,000" },
    { value: "deepseek-v3.2:cloud", name: "DeepSeek V3.2 (Ollama)  │ CTX: 131,072 │ OUT:  32,768" },
    { value: "deepseek-v4-pro:cloud", name: "DeepSeek V4 Pro (Ollama)│ CTX: 1,048,576 │ OUT: 384,000" },
    { value: "deepseek-v4-flash:cloud", name: "DeepSeek V4 Flsh(Ollama)│ CTX: 1,048,576 │ OUT: 384,000" },
    { value: "nemotron-3-super:cloud", name: "Nemotron 3 Super(Ollama)│ CTX: 131,072 │ OUT:  32,768" },
    // ── Z.AI Coding Plan (مباشر عبر LiteLLM) ───────────────────────────────
    { value: "zai/glm-5.1", name: "GLM-5.1 (Z.AI Coding)   │ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-5.1", name: "GLM-5.1 (Z.AI Direct)   │ CTX: 204,800 │ OUT: 131,072" },
    { value: "zai/glm-5-turbo", name: "GLM-5-Turbo (Z.AI)      │ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-5-turbo", name: "GLM-5-Turbo (Z.AI Dir)  │ CTX: 204,800 │ OUT: 131,072" },
    { value: "zai/glm-4.7", name: "GLM-4.7 (Z.AI Coding)   │ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-4.7", name: "GLM-4.7 (Z.AI Direct)   │ CTX: 204,800 │ OUT: 131,072" },
    { value: "zai/glm-4.5-air", name: "GLM-4.5-Air (Z.AI)      │ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-4.5-air", name: "GLM-4.5-Air (Z.AI Dir)  │ CTX: 204,800 │ OUT: 131,072" },
];

// ==================== Tool Installation Map ====================
const isWin = os.platform() === 'win32';
const TOOL_INSTALL_MAP = {
    OpenCode: {
        exeName: 'opencode',
        methods: isWin
            ? [
                { label: 'npm', cmd: 'npm install -g opencode-ai' },
            ]
            : [
                { label: 'curl', cmd: 'curl -fsSL https://opencode.ai/install | bash' },
                { label: 'npm', cmd: 'npm install -g opencode-ai' },
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
        baselineAsset: {
            win32: 'kilo-windows-x64-baseline.zip',
            linux: 'kilo-linux-x64-baseline.tar.gz',
            darwin: 'kilo-darwin-x64-baseline.zip',
        },
        manual: '  npm install -g @kilocode/cli',
        repo: 'Kilo-Org/kilocode',
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
    ZeroClaw: {
        exeName: 'zeroclaw',
        methods: isWin
            ? [
                { label: 'PowerShell', cmd: 'powershell -Command "irm https://raw.githubusercontent.com/zeroclaw-labs/zeroclaw/master/install.ps1 | iex"' },
            ]
            : [
                { label: 'curl', cmd: 'curl -fsSL https://raw.githubusercontent.com/zeroclaw-labs/zeroclaw/master/install.sh | bash -s -- --skip-onboard' },
            ],
        manual: isWin
            ? '  Download setup.bat from https://github.com/zeroclaw-labs/zeroclaw/releases'
            : '  curl -fsSL https://raw.githubusercontent.com/zeroclaw-labs/zeroclaw/master/install.sh | bash -s -- --skip-onboard',
        configFormat: 'toml',
    },
    Hermes: {
        exeName: 'hermes',
        methods: isWin
            ? [
                { label: 'PowerShell', cmd: 'powershell -Command "irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex -SkipSetup"' },
            ]
            : [
                { label: 'curl', cmd: 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup' },
            ],
        manual: isWin
            ? '  powershell -Command "irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex -SkipSetup"'
            : '  curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup',
        configFormat: 'yaml',
    },
    KimiCode: {
        exeName: 'kimi',
        altExeNames: ['kimi-cli', 'kimi-code'],
        methods: isWin
            ? [
                { label: 'PowerShell', cmd: 'powershell -Command "Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression"' },
            ]
            : [
                { label: 'curl', cmd: 'curl -LsSf https://code.kimi.com/install.sh | bash' },
            ],
        manual: isWin
            ? '  powershell -Command "Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression"'
            : '  curl -LsSf https://code.kimi.com/install.sh | bash',
        configFormat: 'toml',
        uvTool: true,
        noLaunchOnWin: true,
    },
    GeminiCLI: {
        exeName: 'gemini',
        methods: [
            { label: 'npm', cmd: 'npm install -g @google/gemini-cli' },
        ],
        manual: '  npm install -g @google/gemini-cli',
        configFormat: 'env',
        geminiOnly: true,
    },
    CodexCLI: {
        exeName: 'codex',
        methods: [
            { label: 'npm', cmd: 'npm install -g @openai/codex' },
        ],
        manual: '  npm install -g @openai/codex',
        configFormat: 'env',
    },
    Aider: {
        exeName: 'aider',
        methods: [
            { label: 'pip', cmd: 'pip install aider-chat' },
            { label: 'pipx', cmd: 'pipx install aider-chat' },
        ],
        manual: '  pip install aider-chat\n  # or: pipx install aider-chat',
        configFormat: 'yaml',
    },
    Goose: {
        exeName: 'goose',
        methods: isWin
            ? [
                { label: 'PowerShell', cmd: 'powershell -Command "irm https://raw.githubusercontent.com/block/goose/main/download/install.ps1 | iex"' },
            ]
            : [
                { label: 'curl', cmd: 'curl -fsSL https://raw.githubusercontent.com/block/goose/main/download/install.sh | bash' },
                { label: 'brew', cmd: 'brew install goose' },
            ],
        manual: isWin
            ? '  powershell -Command "irm https://raw.githubusercontent.com/block/goose/main/download/install.ps1 | iex"'
            : '  curl -fsSL https://raw.githubusercontent.com/block/goose/main/download/install.sh | bash\n  # or: brew install goose',
        configFormat: 'yaml',
    },
    DeepSeekTUI: {
        exeName: 'deepseek',
        methods: [
            { label: 'npm', cmd: 'npm install -g deepseek-tui' },
        ],
        manual: '  npm install -g deepseek-tui',
        configFormat: 'toml',
    },
    QwenCode: {
        exeName: 'qwen',
        methods: isWin
            ? [
                { label: 'npm', cmd: 'npm install -g @qwen-code/qwen-code@latest' },
            ]
            : [
                { label: 'curl', cmd: 'bash -c "$(curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh)"' },
                { label: 'npm', cmd: 'npm install -g @qwen-code/qwen-code@latest' },
            ],
        manual: isWin
            ? '  npm install -g @qwen-code/qwen-code@latest'
            : '  bash -c "$(curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh)"\n  # or: npm i -g @qwen-code/qwen-code@latest',
        configFormat: 'json',
    },
};
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
        return execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
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
        // Fallback: check common binary paths for tools installed by uv/pip/cargo
        const fallbackPaths = isWin
            ? [
                path.join(os.homedir(), '.local', 'bin', `${command}.exe`),
                path.join(os.homedir(), '.local', 'bin', command),
                path.join(os.homedir(), '.cargo', 'bin', `${command}.exe`),
                path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', '**', 'Scripts', `${command}.exe`),
            ]
            : [
                path.join(os.homedir(), '.local', 'bin', command),
                path.join(os.homedir(), '.cargo', 'bin', command),
            ];
        for (const p of fallbackPaths) {
            if (p && fs.existsSync(p)) return true;
        }
        return false;
    }
}

const G_CONFIG_PATH = path.join(os.homedir(), '.abdalgani-code.json');

function saveGlobalApiKey(key) {
    let data = {};
    if (fs.existsSync(G_CONFIG_PATH)) {
        try { data = JSON.parse(fs.readFileSync(G_CONFIG_PATH, 'utf8')); } catch (e) { }
    }
    data.apiKey = key;
    fs.writeFileSync(G_CONFIG_PATH, JSON.stringify(data, null, 2));
}

function findExistingApiKey() {
    if (fs.existsSync(G_CONFIG_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(G_CONFIG_PATH, 'utf8'));
            if (data.apiKey) return data.apiKey;
        } catch (e) { }
    }

    try {
        const p = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (data?.provider?.abdalgani?.options?.apiKey) return data.provider.abdalgani.options.apiKey;
        }
    } catch (e) { }

    try {
        const p = path.join(os.homedir(), '.config', 'kilo', 'kilo.json');
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (data?.provider?.abdalgani?.options?.apiKey) return data.provider.abdalgani.options.apiKey;
        }
    } catch (e) { }

    try {
        const p = path.join(os.homedir(), '.claude', 'settings.json');
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (data?.env?.ANTHROPIC_AUTH_TOKEN) return data.env.ANTHROPIC_AUTH_TOKEN;
        }
    } catch (e) { }

    try {
        const p = path.join(os.homedir(), '.openclaw', 'openclaw.json');
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (data?.models?.providers?.abdalgani?.apiKey) return data.models.providers.abdalgani.apiKey;
        }
    } catch (e) { }

    // ZeroClaw config (~/.zeroclaw/config.toml)
    try {
        const p = path.join(os.homedir(), '.zeroclaw', 'config.toml');
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            const match = content.match(/api_key\s*=\s*"([^"]+)"/);
            if (match && match[1]) return match[1];
        }
    } catch (e) { }

    // Hermes config (~/.hermes/config.yaml or HERMES_HOME)
    try {
        const hermesHome = process.env.HERMES_HOME
            || (isWin ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'hermes') : path.join(os.homedir(), '.hermes'));
        const envFile = path.join(hermesHome, '.env');
        if (fs.existsSync(envFile)) {
            const content = fs.readFileSync(envFile, 'utf8');
            // Prefer ABDALGANI_API_KEY (named custom provider), fallback to OPENAI_API_KEY
            const match = content.match(/^ABDALGANI_API_KEY=(.+)$/m) || content.match(/^OPENAI_API_KEY=(.+)$/m);
            if (match && match[1].trim()) return match[1].trim();
        }
    } catch (e) { }

    // Kimi config (~/.kimi/config.toml)
    try {
        const p = path.join(os.homedir(), '.kimi', 'config.toml');
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            const match = content.match(/api_key\s*=\s*"([^"]+)"/);
            if (match && match[1]) return match[1];
        }
    } catch (e) { }

    // Goose config (~/.config/goose/config.yaml)
    try {
        const p = path.join(os.homedir(), '.config', 'goose', 'config.yaml');
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            const parsed = yaml.load(content);
            if (parsed?.provider?.api_key) return parsed.provider.api_key;
        }
    } catch (e) { }

    // Aider config (~/.aider.conf.yml)
    try {
        const p = path.join(os.homedir(), '.aider.conf.yml');
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            const parsed = yaml.load(content);
            if (parsed?.['openai-api-key']) return parsed['openai-api-key'];
        }
    } catch (e) { }

    // DeepSeek TUI config (~/.deepseek/config.toml)
    try {
        const p = path.join(os.homedir(), '.deepseek', 'config.toml');
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf8');
            const match = content.match(/api_key\s*=\s*"([^"]+)"/);
            if (match && match[1]) return match[1];
        }
    } catch (e) { }

    // Qwen Code config (~/.qwen/settings.json)
    try {
        const p = path.join(os.homedir(), '.qwen', 'settings.json');
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (data?.env?.ABDALGANI_API_KEY) return data.env.ABDALGANI_API_KEY;
        }
    } catch (e) { }

    return null;
}

// ==================== AVX Detection ====================
function hasAVXSupport() {
    console.log(chalk.cyan(t('checkingAvx')));
    try {
        if (isWin) {
            const result = runSilent('powershell -Command "(Get-CimInstance Win32_Processor).Caption"');
            if (result) {
                const yearMatch = result.match(/\b(20\d{2})\b/);
                const cpuFamily = result.toLowerCase();
                if (yearMatch) {
                    const year = parseInt(yearMatch[1], 10);
                    if (year >= 2013) {
                        console.log(chalk.green(t('avxSupported')));
                        return true;
                    }
                }
                if (cpuFamily.includes('xeon') || cpuFamily.includes('opteron') || cpuFamily.includes('athlon') || cpuFamily.includes('sempron')) {
                    console.log(chalk.yellow(t('avxNotSupported')));
                    return false;
                }
            }
            const flags = runSilent('powershell -Command "[System.Runtime.Intrinsics.X86.Avx]::IsSupported"');
            if (flags && flags.trim() === 'True') {
                console.log(chalk.green(t('avxSupported')));
                return true;
            }
            if (flags && flags.trim() === 'False') {
                console.log(chalk.yellow(t('avxNotSupported')));
                return false;
            }
        } else if (process.platform === 'darwin') {
            const flags = runSilent("sysctl -a 2>/dev/null | grep -o 'AVX[^ ]*' | head -1");
            if (flags) {
                console.log(chalk.green(t('avxSupported')));
                return true;
            }
            const machdep = runSilent("sysctl -n machdep.cpu.brand_string 2>/dev/null");
            if (machdep && !machdep.includes('Intel') && !machdep.includes('Xeon')) {
                console.log(chalk.green(t('avxSupported')));
                return true;
            }
        } else {
            const flags = runSilent("grep -o 'avx' /proc/cpuinfo | head -1");
            if (flags && flags.trim() === 'avx') {
                console.log(chalk.green(t('avxSupported')));
                return true;
            }
        }
    } catch (_) { }
    console.log(chalk.gray('⚠️ Could not determine AVX support, assuming supported.'));
    return true;
}

function verifyKiloWorks() {
    console.log(chalk.cyan(t('avxCheckingKilo')));
    try {
        const result = spawnSync('kilo', ['--version'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 10000,
            shell: true,
        });
        if (result.status === 0 && result.stdout) {
            console.log(chalk.green(`✅ Kilo ${result.stdout.toString().trim()} working.`));
            return true;
        }
        if (result.status !== 0 && result.stderr) {
            const stderr = result.stderr.toString();
            if (stderr.includes('Illegal instruction') || stderr.includes('illegal instruction') || result.status === 132) {
                console.log(chalk.red(t('kiloCrashDetected')));
                return false;
            }
        }
        if (result.status === 132) {
            console.log(chalk.red(t('kiloCrashDetected')));
            return false;
        }
        return result.status === 0;
    } catch (_) {
        return false;
    }
}

async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const file = createWriteStream(destPath);
        client.get(url, { followAllRedirects: true }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close();
                rmSync(destPath, { force: true });
                downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                file.close();
                rmSync(destPath, { force: true });
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            rmSync(destPath, { force: true });
            reject(err);
        });
    });
}

async function getLatestReleaseAsset(repo, assetName) {
    try {
        const url = `https://api.github.com/repos/${repo}/releases/latest`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
        const data = await res.json();
        const asset = data.assets?.find(a => a.name === assetName);
        if (asset) return { browserDownloadUrl: asset.browser_download_url, tagName: data.tag_name };
        throw new Error(`Asset "${assetName}" not found in release ${data.tag_name}`);
    } catch (e) {
        console.log(chalk.yellow(`⚠️ Could not fetch release info: ${e.message}`));
        return null;
    }
}

async function installKiloBaseline() {
    const map = TOOL_INSTALL_MAP['KiloCLI'];
    const assetName = map.baselineAsset[process.platform];
    if (!assetName) {
        console.log(chalk.red(`❌ No baseline asset defined for platform: ${process.platform}`));
        return false;
    }

    const releaseInfo = await getLatestReleaseAsset(map.repo, assetName);
    if (!releaseInfo) return false;

    const downloadUrl = releaseInfo.browserDownloadUrl;
    console.log(chalk.cyan(t('downloadingBaseline', downloadUrl)));

    const tmpDir = path.join(os.tmpdir(), 'kilo-baseline-install');
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });

    const ext = path.extname(assetName);
    const archivePath = path.join(tmpDir, assetName);

    try {
        await downloadFile(downloadUrl, archivePath);
        console.log(chalk.green('✅ Download complete.'));
        console.log(chalk.cyan(t('extractingBaseline')));

        if (ext === '.zip') {
            if (isWin) {
                execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tmpDir}/extract' -Force"`, { stdio: 'inherit' });
            } else {
                execSync(`unzip -o "${archivePath}" -d "${tmpDir}/extract"`, { stdio: 'inherit' });
            }
        } else if (ext === '.gz') {
            execSync(`tar -xzf "${archivePath}" -C "${tmpDir}/extract"`, { stdio: 'inherit' });
            mkdirSync(`${tmpDir}/extract`, { recursive: true });
        }

        console.log(chalk.cyan(t('installingBaseline')));

        const binDir = isWin
            ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm')
            : '/usr/local/bin';

        if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

        if (isWin) {
            const kiloExe = path.join(binDir, 'kilo.exe');
            if (existsSync(kiloExe)) rmSync(kiloExe, { force: true });
            const found = findFile(tmpDir + '/extract', 'kilo.exe');
            if (found) {
                fs.copyFileSync(found, kiloExe);
                console.log(chalk.green(t('baselineInstallSuccess')));
                console.log(chalk.gray(`   Installed to: ${kiloExe}`));
                return true;
            }
        } else {
            const kiloBin = path.join(binDir, 'kilo');
            if (existsSync(kiloBin)) rmSync(kiloBin, { force: true });
            const found = findFile(tmpDir + '/extract', 'kilo');
            if (found) {
                fs.copyFileSync(found, kiloBin);
                fs.chmodSync(kiloBin, 0o755);
                console.log(chalk.green(t('baselineInstallSuccess')));
                console.log(chalk.gray(`   Installed to: ${kiloBin}`));
                return true;
            }
        }

        console.log(chalk.red('❌ kilo binary not found in archive.'));
        return false;
    } catch (e) {
        console.log(chalk.red(t('baselineInstallFailed')));
        console.log(chalk.red(`   Error: ${e.message}`));
        return false;
    } finally {
        if (existsSync(tmpDir)) {
            try { rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        }
    }
}

function findFile(dir, filename) {
    if (!existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === filename) return fullPath;
        if (entry.isDirectory()) {
            const found = findFile(fullPath, filename);
            if (found) return found;
        }
    }
    return null;
}

// ==================== Environment Pre-flight ====================
function fixPowerShellPolicy() {
    if (!isWin) return true;
    try {
        const policy = runSilent('powershell -Command "Get-ExecutionPolicy -Scope CurrentUser"');
        if (policy && (policy.trim() === 'Restricted' || policy.trim() === 'Undefined')) {
            console.log(chalk.yellow(t('psRestricted')));
            console.log(chalk.cyan(t('psFixing')));
            execSync('powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force"', { stdio: 'inherit' });
            console.log(chalk.green(t('psFixed')));
        }
        return true;
    } catch (e) {
        console.log(chalk.yellow(t('psFixFailed')));
        console.log(chalk.gray('   Run manually: powershell -Command "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser"'));
        return false;
    }
}

function ensureNodeNpm() {
    console.log(chalk.cyan(t('envCheck')));

    if (isWin) fixPowerShellPolicy();

    const nodeV = runSilent('node -v');
    if (!nodeV) {
        console.log(chalk.red(t('nodeNotFound')));
        console.log(chalk.yellow(t('npmMissing')));
        if (isWin) {
            const installMethods = [
                { label: 'winget', cmd: 'winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements' },
                { label: 'choco', cmd: 'choco install nodejs-lts -y' },
            ];
            let installed = false;
            for (const method of installMethods) {
                const hasInstaller = checkInstalled(method.label === 'winget' ? 'winget' : 'choco');
                if (hasInstaller) {
                    console.log(chalk.yellow(t('installingNodeNpm', method.label)));
                    try {
                        execSync(method.cmd, { stdio: 'inherit' });
                        console.log(chalk.green(t('nodeInstallSuccess')));
                        console.log(chalk.yellow(t('restartTerminal')));
                        installed = true;
                        break;
                    } catch (_) {
                        console.log(chalk.red(t('nodeInstallFailed', method.label)));
                    }
                }
            }
            if (!installed) {
                console.log(chalk.yellow('  → Install nvm-windows: https://github.com/coreybutler/nvm-windows/releases'));
                console.log(chalk.yellow('    nvm install lts && nvm use lts'));
                process.exit(1);
            }
        } else {
            const pkgManagers = [
                { check: 'apt-get', install: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs' },
                { check: 'dnf', install: 'sudo dnf install -y nodejs npm' },
                { check: 'pacman', install: 'sudo pacman -S --noconfirm nodejs npm' },
                { check: 'apk', install: 'sudo apk add --no-cache nodejs npm' },
            ];
            let installed = false;
            for (const pm of pkgManagers) {
                if (checkInstalled(pm.check)) {
                    console.log(chalk.yellow(t('installingNodeNpm', pm.check)));
                    try {
                        execSync(pm.install, { stdio: 'inherit' });
                        console.log(chalk.green(t('nodeInstallSuccess')));
                        console.log(chalk.yellow(t('restartTerminal')));
                        installed = true;
                        break;
                    } catch (_) {
                        console.log(chalk.red(t('nodeInstallFailed', pm.check)));
                    }
                }
            }
            if (!installed) {
                console.log(chalk.yellow('  → curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash'));
                console.log(chalk.yellow('    nvm install --lts && nvm use --lts'));
                process.exit(1);
            }
        }
        process.exit(0);
    }
    console.log(chalk.green(t('nodeVersion', nodeV)));

    const npmV = runSilent('npm -v');
    if (!npmV) {
        console.log(chalk.red(t('npmMissing')));
        if (isWin) {
            const hasNpm = checkInstalled('npm');
            if (!hasNpm) {
                console.log(chalk.yellow('  → Node.js was found but npm is missing. Reinstalling Node.js...'));
                try {
                    execSync('winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements', { stdio: 'inherit' });
                } catch (_) {
                    try {
                        execSync('choco install nodejs-lts -y', { stdio: 'inherit' });
                    } catch (__) {
                        console.log(chalk.red(t('npmFixFailed')));
                    }
                }
                console.log(chalk.yellow(t('restartTerminal')));
                process.exit(0);
            }
        } else {
            const pkgManagers = [
                { check: 'apt-get', install: 'sudo apt-get install -y npm' },
                { check: 'dnf', install: 'sudo dnf install -y npm' },
                { check: 'pacman', install: 'sudo pacman -S --noconfirm npm' },
                { check: 'apk', install: 'sudo apk add --no-cache npm' },
            ];
            let installed = false;
            for (const pm of pkgManagers) {
                if (checkInstalled(pm.check)) {
                    console.log(chalk.yellow(t('installingNodeNpm', pm.check)));
                    try {
                        execSync(pm.install, { stdio: 'inherit' });
                        console.log(chalk.green(t('nodeInstallSuccess')));
                        installed = true;
                        break;
                    } catch (_) {
                        console.log(chalk.red(t('nodeInstallFailed', pm.check)));
                    }
                }
            }
            if (!installed) {
                console.log(chalk.red(t('npmFixFailed')));
            }
        }
    } else {
        console.log(chalk.green(t('npmVersion', npmV)));
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
            // Check primary exe name and alt names
            let found = checkInstalled(map.exeName);
            if (!found && map.altExeNames) {
                for (const alt of map.altExeNames) {
                    if (checkInstalled(alt)) { found = true; break; }
                }
            }
            if (found) {
                if (toolName === 'KiloCLI') {
                    if (!verifyKiloWorks()) {
                        console.log(chalk.yellow(t('avxNotSupported')));
                        const baselineOk = await installKiloBaseline();
                        if (baselineOk) return true;
                        console.log(chalk.red(t('baselineInstallFailed')));
                        return false;
                    }
                }
                // For uv-installed tools, remind user to add ~/.local/bin to PATH
                if (map.uvTool && !checkInstalled(map.exeName)) {
                    const localBin = path.join(os.homedir(), '.local', 'bin');
                    console.log(chalk.yellow(`⚠️ Binary found in ${localBin} but not in system PATH.`));
                    console.log(chalk.cyan(`   Add to PATH: ${isWin ? `setx PATH "%PATH%;${localBin}"` : `export PATH="${localBin}:$PATH"`}`));
                    console.log(chalk.green(`✅ ${toolName} installed successfully. Restart terminal for PATH changes.`));
                }
                return true;
            }
            console.log(chalk.yellow('⚠️ Command succeeded but binary not found in PATH. Trying npm cache fix...'));
            try {
                execSync('npm cache clean --force', { stdio: 'ignore' });
            } catch (_) { }
        } catch (e) {
            console.log(chalk.red(t('installFailed', `${toolName} (${method.label})`)));
        }
    }

    if (toolName === 'KiloCLI' && map.baselineAsset) {
        console.log(chalk.yellow(t('tryingFallback', 'GitHub Baseline')));
        const baselineOk = await installKiloBaseline();
        if (baselineOk) return true;
    }

    console.log(chalk.red(t('installFailedAll', toolName)));
    console.log(chalk.cyan(t('manualInstall', map.manual)));
    return false;
}

// ==================== Launch After Setup ====================
async function launchAfterSetup(toolName, exeName) {
    const map = TOOL_INSTALL_MAP[toolName];

    // On Windows: try WSL for tools that need Unix (termios etc.)
    if (isWin && map?.noLaunchOnWin) {
        const hasWsl = checkInstalled('wsl');
        if (hasWsl) {
            console.log('');
            const launch = await select({
                message: chalk.cyan(t('launchPrompt', toolName)),
                choices: [
                    { name: lang === 'ar' ? '✅ نعم (عبر WSL)' : '✅ Yes (via WSL)', value: true },
                    { name: lang === 'ar' ? '❌ لا' : '❌ No', value: false }
                ]
            });
            if (!launch) return;
            console.log(chalk.green(t('launching', toolName)));
            try {
                const { spawnSync } = await import('child_process');
                // Pass the Windows HOME so WSL can read the same config files
                const winHome = os.homedir().replace(/\\/g, '/');
                spawnSync('wsl', ['-e', exeName], {
                    stdio: 'inherit',
                    shell: true,
                    env: { ...process.env, HOME: `/mnt/c${winHome.substring(2)}` },
                });
            } catch (e) {
                console.error(chalk.red(t('launchFailed', toolName, e.message)));
            }
        } else {
            console.log(chalk.yellow(t('winNotSupported', toolName)));
        }
        return;
    }

    console.log('');
    const launch = await select({
        message: chalk.cyan(t('launchPrompt', toolName)),
        choices: [
            { name: lang === 'ar' ? '✅ نعم' : '✅ Yes', value: true },
            { name: lang === 'ar' ? '❌ لا' : '❌ No', value: false }
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

    let apiKey = null;
    const existingKey = findExistingApiKey();
    if (existingKey) {
        const useExisting = await select({
            message: t('foundExistingKey'),
            choices: [
                { name: t('useExistingKeyYes'), value: true },
                { name: t('useExistingKeyNo'), value: false }
            ]
        });
        if (useExisting) {
            apiKey = existingKey;
        }
    }

    if (!apiKey) {
        apiKey = await input({ message: t('enterApiKey') });
        saveGlobalApiKey(apiKey);
    }

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

    // === Model Selection: ClaudeCode بثلاثة أسئلة، OpenClaw سؤال واحد، OpenCode/Kilo تلقائياً ===
    let selectedModel = DEFAULT_MODEL;
    let claudeOpus = 'nvidia/glm-5';
    let claudeSonnet = 'moonshotai/kimi-k2.5';
    let claudeHaiku = 'minimaxai/minimax-m2.5';

    // === OpenClaw Model Selection: سؤال واضح للمستخدم عن النموذج الأساسي ===
    if (['OpenClaw', 'ZeroClaw', 'Hermes', 'KimiCode', 'Aider', 'Goose', 'GeminiCLI', 'CodexCLI', 'DeepSeekTUI', 'QwenCode'].includes(toolName)) {
        const pickOpenClawModel = async () => {
            const chosen = await search({
                message: t('selectToolModel', toolName),
                source: (input) => {
                    const q = (input || '').toLowerCase();
                    const filtered = models.filter(
                        m => m.name.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)
                    );
                    return filtered.length > 0
                        ? filtered
                        : [{ value: DEFAULT_MODEL, name: t('noModelMatch') }];
                },
            });
            return chosen || DEFAULT_MODEL;
        };
        selectedModel = await pickOpenClawModel();
        console.log(chalk.green(t('openClawPrimarySet', selectedModel)));
    }

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
        claudeOpus = await pickModel(t('tierOpus'), 'nvidia/glm-5');
        claudeSonnet = await pickModel(t('tierSonnet'), 'moonshotai/kimi-k2.5');
        claudeHaiku = await pickModel(t('tierHaiku'), 'minimaxai/minimax-m2.5');
        selectedModel = claudeOpus; // الافتراضي = Opus
    }

    console.log(chalk.yellow(t('applying')));

    if (toolName === 'OpenCode' || toolName === 'KiloCLI') {
        const folderName = exeName === 'kilo' ? 'kilo' : 'opencode';
        const configDir = path.join(os.homedir(), '.config', folderName);
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
            "moonshotai/kimi-k2.5": { name: "Kimi K2.5 (Moonshot)", limit: { context: 262144, output: 65535 } },
            "minimaxai/minimax-m2.5": { name: "MiniMax M2.5 (MiniMax)", limit: { context: 196608, output: 196608 } },
            // ── NVIDIA NIM ────────────────────────────────────────────────────
            "nvidia/glm-5": { name: "GLM-5 (NVIDIA)", limit: { context: 200000, output: 32000 } },
            "nvidia/glm-4.7": { name: "GLM-4.7 (NVIDIA)", limit: { context: 200000, output: 32000 } },
            "nvidia/kimi-k2.6": { name: "Kimi K2.6 (NVIDIA)", limit: { context: 262144, output: 65535 } },
            "nvidia/kimi-k2.5": { name: "Kimi K2.5 (NVIDIA)", limit: { context: 262144, output: 65535 } },
            "nvidia/qwen3.5-397b": { name: "Qwen 3.5 397B (NVIDIA)", limit: { context: 262144, output: 81920 } },
            "qwen": { name: "Qwen 3.5 397B (NVIDIA)", limit: { context: 262144, output: 81920 } },
            "qwen/qwen3.5-397b-a17b": { name: "Qwen 3.5 397B a17b (NVIDIA)", limit: { context: 262144, output: 81920 } },
            "nvidia/qwen3.5-122b": { name: "Qwen 3.5 122B (NVIDIA)", limit: { context: 262144, output: 81920 } },
            "nvidia/qwen3-coder-480b": { name: "Qwen3 Coder 480B (NVIDIA)", limit: { context: 262144, output: 81920 } },
            "nvidia/qwq-32b": { name: "QwQ 32B (NVIDIA)", limit: { context: 131072, output: 32768 } },
            "nvidia/qwen3-next-thinking": { name: "Qwen3 Next Thinking (NVIDIA)", limit: { context: 262144, output: 81920 } },
            "nvidia/nemotron-ultra-253b": { name: "Nemotron Ultra 253B (NVIDIA)", limit: { context: 131072, output: 32768 } },
            "nvidia/nemotron-super-49b": { name: "Nemotron Super 49B (NVIDIA)", limit: { context: 131072, output: 32768 } },
            "nvidia/nemotron-3-super-120b-a12b": { name: "Nemotron 3 Super 120B (NVIDIA)", limit: { context: 131072, output: 32768 } },
            "nvidia/deepseek-r1": { name: "DeepSeek R1 (NVIDIA)", limit: { context: 163840, output: 32768 } },
            "nvidia/gpt-oss-120b": { name: "GPT-OSS 120B (NVIDIA)", limit: { context: 128000, output: 16384 } },
            "nvidia/step-3.5-flash": { name: "Step 3.5 Flash (NVIDIA)", limit: { context: 128000, output: 32768 } },

            // ── Gemini ───────────────────────────────────────────────────────────
            "gemini-3.1-pro": { name: "Gemini 3.1 Pro", limit: { context: 1048576, output: 65536 } },
            "gemini-3.1-flash": { name: "Gemini 3.1 Flash", limit: { context: 1048576, output: 65536 } },
            // ── Google AI Studio (Direct API) ────────────────────────────────────
            "gemini-3-flash-preview": { name: "Gemini 3 Flash Preview", limit: { context: 1048576, output: 65536 } },
            "gemini-3.1-pro-preview": { name: "Gemini 3.1 Pro Preview", limit: { context: 1048576, output: 65536 } },
            "gemini-3.1-flash-lite-preview": { name: "Gemini 3.1 Flash Lite", limit: { context: 1048576, output: 65536 } },
            "gemini-3.1-flash-image-preview": { name: "Gemini 3.1 Flash Image", limit: { context: 1048576, output: 65536 } },
            "gemini-3-pro-image-preview": { name: "Gemini 3 Pro Image", limit: { context: 1048576, output: 65536 } },
            "gemini-2.5-flash-image": { name: "Gemini 2.5 Flash Image", limit: { context: 1048576, output: 65536 } },
            "gemini-2.5-pro": { name: "Gemini 2.5 Pro", limit: { context: 1048576, output: 65536 } },
            "gemini-pro-latest": { name: "Gemini Pro Latest", limit: { context: 1048576, output: 65536 } },
            "gemini-flash-latest": { name: "Gemini Flash Latest", limit: { context: 1048576, output: 65536 } },
            "gemini-flash-lite-latest": { name: "Gemini Flash Lite Latest", limit: { context: 1048576, output: 65536 } },
            "gemini-2.5-flash": { name: "Gemini 2.5 Flash", limit: { context: 1048576, output: 65536 } },
            "gemini-3.1-flash-live-preview": { name: "Gemini 3.1 Flash Live", limit: { context: 1048576, output: 65536 } },
            "veo-3.1-generate-preview": { name: "Veo 3.1 Video Gen", limit: { context: 8192, output: 4096 }, modalities: { input: ["text"], output: ["video"] } },
            "lyria-3-pro-preview": { name: "Lyria 3 Pro Audio", limit: { context: 8192, output: 4096 }, modalities: { input: ["text"], output: ["audio"] } },
            "gemma-4-31b-it": { name: "Gemma 4 31B IT", limit: { context: 131072, output: 32768 } },
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
            "glm-5.1:cloud": { name: "GLM-5.1 Cloud (Ollama)", limit: { context: 200000, output: 131072 } },
            "glm-5:cloud": { name: "GLM-5 Cloud (Ollama)", limit: { context: 202752, output: 131072 } },
            "gemma4": { name: "Gemma 4 (Ollama)", limit: { context: 128000, output: 32768 } },
            "qwen3.5": { name: "Qwen 3.5 (Ollama)", limit: { context: 131072, output: 32768 } },
            "minimax-m2.7:cloud": { name: "MiniMax M2.7 (Ollama)", limit: { context: 196608, output: 196608 } },
            "kimi-k2.5:cloud": { name: "Kimi K2.5 (Ollama)", limit: { context: 262144, output: 65535 } },
            "glm-4.7:cloud": { name: "GLM-4.7 (Ollama)", limit: { context: 200000, output: 128000 } },
            "deepseek-v3.2:cloud": { name: "DeepSeek V3.2 (Ollama)", limit: { context: 131072, output: 32768 } },
            "nemotron-3-super:cloud": { name: "Nemotron 3 Super (Ollama)", limit: { context: 131072, output: 32768 } },
            // ── Z.AI Coding Plan ─────────────────────────────────────────────
            "zai/glm-5.1": { name: "GLM-5.1 (Z.AI Coding Plan)", limit: { context: 204800, output: 131072 } },
            "glm-5.1": { name: "GLM-5.1 (Z.AI Direct)", limit: { context: 204800, output: 131072 } },
            "zai/glm-5-turbo": { name: "GLM-5-Turbo (Z.AI Coding)", limit: { context: 204800, output: 131072 } },
            "glm-5-turbo": { name: "GLM-5-Turbo (Z.AI Direct)", limit: { context: 204800, output: 131072 } },
            "zai/glm-4.7": { name: "GLM-4.7 (Z.AI Coding Plan)", limit: { context: 204800, output: 131072 } },
            "glm-4.7": { name: "GLM-4.7 (Z.AI Direct)", limit: { context: 204800, output: 131072 } },
            "zai/glm-4.5-air": { name: "GLM-4.5-Air (Z.AI Coding)", limit: { context: 204800, output: 131072 } },
            "glm-4.5-air": { name: "GLM-4.5-Air (Z.AI Direct)", limit: { context: 204800, output: 131072 } },
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
            npm: "@ai-sdk/openai-compatible",
            options: {
                baseURL: "https://api.abdalgani.com/v1",
                apiKey: apiKey,
            },
            models: providerModels,
        };

        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        console.log(chalk.green(t('updatedFile', configFile)));
        console.log(chalk.cyan(t('providerAdded', Object.keys(providerModels).length)));
        console.log(chalk.gray(t('othersUntouched')));
    } else if (toolName === 'ClaudeCode') {
        // === Write ~/.claude/settings.json directly ===
        // Important: The provider must serve an Anthropic Messages-compatible API at /v1/messages.
        // ANTHROPIC_BASE_URL should point to the base URL that hosts /v1/messages underneath.
        // api.abdalgani.com proxies Anthropic-format requests, so we use /v1 as the base.
        console.log(chalk.gray(t('claudeBaseUrlNote')));

        const claudeDir = path.join(os.homedir(), '.claude');
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
            // Base URL must point to where /v1/messages is hosted.
            // api.abdalgani.com serves Anthropic-compatible /v1/messages alongside OpenAI /v1/chat/completions.
            ANTHROPIC_BASE_URL: 'https://api.abdalgani.com',
            ANTHROPIC_AUTH_TOKEN: apiKey,
            // Explicitly set ANTHROPIC_API_KEY to empty string to prevent Claude Code
            // from preferring it over ANTHROPIC_AUTH_TOKEN. A null/delete is NOT enough —
            // Claude Code falls back to its own OAuth if ANTHROPIC_API_KEY is absent,
            // which bypasses our custom provider entirely.
            ANTHROPIC_API_KEY: '',
            ANTHROPIC_MODEL: selectedModel,
            ANTHROPIC_DEFAULT_OPUS_MODEL: claudeOpus,
            ANTHROPIC_DEFAULT_SONNET_MODEL: claudeSonnet,
            ANTHROPIC_DEFAULT_HAIKU_MODEL: claudeHaiku,
            // Disable non-essential traffic (telemetry, etc.) when using a custom provider
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
            // Enable MCP tool search through the proxy
            ENABLE_TOOL_SEARCH: "true",
            CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
            DISABLE_PROMPT_CACHING: "1"
        };

        fs.writeFileSync(claudeFile, JSON.stringify(claudeSettings, null, 2));

        console.log(chalk.green(t('writtenTo', claudeFile)));
        console.log(chalk.cyan(t('modelsMap')));
        console.log(chalk.white(`   🔴 Opus   → ${claudeOpus}`));
        console.log(chalk.white(`   🟡 Sonnet → ${claudeSonnet}`));
        console.log(chalk.white(`   🟢 Haiku  → ${claudeHaiku}`));
        console.log(chalk.white(`   ⭐ Default→ ${selectedModel}`));
        console.log(chalk.gray(t('claudeApiKeyCleared')));
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
            } catch (_) { }
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
            auth: "api_key",
            api: "openai-completions",
            authHeader: true,
            models: clawModelsList
        };

        // Register abdalgani as a separate provider with the SAME model list
        // This ensures abdalgani/ models get correct context windows instead of defaults
        clawConfig.models.providers["abdalgani"] = {
            baseUrl: "https://api.abdalgani.com/v1",
            apiKey: apiKey,
            auth: "api_key",
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

        // Use ONLY the model the user explicitly selected — no silent fallback to DEFAULT_MODEL
        clawConfig.agents.defaults.model.primary = `litellm/${selectedModel}`;
        clawConfig.agents.defaults.model.fallbacks = [`abdalgani/${selectedModel}`];

        console.log(chalk.gray(t('openClawFallbackNone')));

        clawConfig.agents.defaults.models = { ...clawConfig.agents.defaults.models, ...allowedModels };

        fs.writeFileSync(clawFile, JSON.stringify(clawConfig, null, 2));
        console.log(chalk.green(t('writtenTo', clawFile)));

        // Clean ALL agent models.json cache files to force re-sync from global config
        // Without this, agents won't see the new providers/models (known OpenClaw issue #22747)
        const agentsDir = path.join(clawDir, 'agents');
        if (fs.existsSync(agentsDir)) {
            try {
                const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true });
                for (const agentDir of agentDirs) {
                    if (agentDir.isDirectory()) {
                        const modelsCache = path.join(agentsDir, agentDir.name, 'agent', 'models.json');
                        if (fs.existsSync(modelsCache)) {
                            try {
                                fs.unlinkSync(modelsCache);
                                console.log(chalk.gray(`   ← Cleaned cache: ${agentDir.name}/agent/models.json`));
                            } catch (_) { }
                        }
                    }
                }
            } catch (_) { }
        }

        console.log(chalk.cyan('\nRestarting openclaw-gateway...'));
        try {
            execSync("systemctl --user restart openclaw-gateway", { stdio: 'ignore' });
            console.log(chalk.green("✅ OpenClaw Gateway restarted successfully."));
        } catch (e) {
            console.log(chalk.yellow("⚠️ Could not restart openclaw-gateway. It might not be running or systemctl is not available."));
        }
    } else if (toolName === 'ZeroClaw') {
        const zcDir = path.join(os.homedir(), '.zeroclaw');
        const zcFile = path.join(zcDir, 'config.toml');
        if (!fs.existsSync(zcDir)) fs.mkdirSync(zcDir, { recursive: true });

        // Build TOML config
        let zcConfig = `# ZeroClaw Configuration — Generated by Oh-My-abdalgani-code
default_provider = "abdalgani"
default_model = "${selectedModel}"

[providers.abdalgani]
type = "openai"
api_url = "https://api.abdalgani.com/v1"
api_key = "${apiKey}"

[providers.models.abdalgani-${selectedModel.replace(/\//g, '-')}]
provider = "abdalgani"
model = "${selectedModel}"
`;

        // If existing config, try to merge
        if (fs.existsSync(zcFile)) {
            try {
                const existing = fs.readFileSync(zcFile, 'utf8');
                // Only update our provider section, keep the rest
                if (!existing.includes('[providers.abdalgani]')) {
                    zcConfig = existing.trimEnd() + '\n\n' + zcConfig;
                } else {
                    // Replace the abdalgani provider block
                    zcConfig = existing
                        .replace(/default_provider\s*=\s*"[^"]*"/, `default_provider = "abdalgani"`)
                        .replace(/default_model\s*=\s*"[^"]*"/, `default_model = "${selectedModel}"`);
                    // Update api_key if exists
                    if (zcConfig.includes('api_key')) {
                        zcConfig = zcConfig.replace(/api_key\s*=\s*"[^"]*"/, `api_key = "${apiKey}"`);
                    }
                    // Update api_url if exists
                    if (zcConfig.includes('api_url')) {
                        zcConfig = zcConfig.replace(/api_url\s*=\s*"[^"]*"/, `api_url = "https://api.abdalgani.com/v1"`);
                    }
                }
            } catch (_) { }
        }

        fs.writeFileSync(zcFile, zcConfig);
        console.log(chalk.green(t('writtenTo', zcFile)));

    } else if (toolName === 'Hermes') {
        // Hermes uses HERMES_HOME (set during install) — default: %LOCALAPPDATA%\hermes on Windows, ~/.hermes on Linux/Mac
        // Recommended config: named custom_providers (see https://hermes-agent.nousresearch.com/docs/integrations/providers)
        const hermesHome = process.env.HERMES_HOME
            || (isWin ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'hermes') : path.join(os.homedir(), '.hermes'));
        const hermesConfigFile = path.join(hermesHome, 'config.yaml');
        const hermesEnvFile = path.join(hermesHome, '.env');

        if (!fs.existsSync(hermesHome)) fs.mkdirSync(hermesHome, { recursive: true });

        // --- Write config.yaml: use named custom_providers + custom:abdalgani provider ---
        let hermesConfig = {};
        if (fs.existsSync(hermesConfigFile)) {
            try { hermesConfig = yaml.load(fs.readFileSync(hermesConfigFile, 'utf8')) || {}; }
            catch (_) { console.log(chalk.yellow(t('corruptConfig'))); }
        }

        // Add or update the abdalgani named custom provider
        // models dictionary: lists available models so they appear in Hermes /mod picker
        // Format per Hermes docs: { model_id: {} } or { model_id: { context_length: N } }
        const abdalganiModels = {
            "glm-5.1": {},
            "glm-5": {},
            "glm-4.7": {},
            "kimi-k2.6": {},
            "kimi-k2.5": {},
            "qwen3.5-397b": {},
            "qwen3.5-122b": {},
            "qwen3-coder-480b": {},
            "qwq-32b": {},
            "qwen3-next-thinking": {},
            "nemotron-ultra-253b": {},
            "nemotron-super-49b": {},
            "nemotron-3-super-120b-a12b": {},
            "deepseek-r1": {},
            "deepseek-v4-pro": {},
            "deepseek-v4-flash": {},
            "gpt-oss-120b": {},
            "step-3.5-flash": {},
        };

        const abdalganiProvider = {
            name: "abdalgani",
            base_url: "https://api.abdalgani.com/v1",
            key_env: "ABDALGANI_API_KEY",
            api_mode: "chat_completions",
            models: abdalganiModels,
        };

        if (!hermesConfig.custom_providers || !Array.isArray(hermesConfig.custom_providers)) {
            hermesConfig.custom_providers = [abdalganiProvider];
        } else {
            // Replace existing abdalgani provider or add new one
            const idx = hermesConfig.custom_providers.findIndex(p => p.name === 'abdalgani');
            if (idx >= 0) {
                hermesConfig.custom_providers[idx] = abdalganiProvider;
            } else {
                hermesConfig.custom_providers.push(abdalganiProvider);
            }
        }

        // Set model to use the named custom provider
        hermesConfig.model = {
            ...(hermesConfig.model || {}),
            default: selectedModel,
            provider: "custom:abdalgani",
        };
        // Remove old base_url from model section (now in custom_providers)
        delete hermesConfig.model.base_url;

        fs.writeFileSync(hermesConfigFile, yaml.dump(hermesConfig, { lineWidth: -1 }));
        console.log(chalk.green(t('writtenTo', hermesConfigFile)));

        // --- Write .env: set ABDALGANI_API_KEY for the named custom provider ---
        let envContent = '';
        if (fs.existsSync(hermesEnvFile)) {
            envContent = fs.readFileSync(hermesEnvFile, 'utf8');
        }

        // Update or add ABDALGANI_API_KEY (matches key_env in custom_providers)
        if (envContent.includes('ABDALGANI_API_KEY=')) {
            envContent = envContent.replace(/ABDALGANI_API_KEY=.*/, `ABDALGANI_API_KEY=${apiKey}`);
        } else {
            envContent = envContent.trimEnd() + `\nABDALGANI_API_KEY=${apiKey}\n`;
        }

        // Also update OPENAI_API_KEY for backward compatibility (Hermes may read this for some provider modes)
        if (envContent.includes('OPENAI_API_KEY=')) {
            envContent = envContent.replace(/OPENAI_API_KEY=.*/, `OPENAI_API_KEY=${apiKey}`);
        } else {
            envContent = envContent.trimEnd() + `\nOPENAI_API_KEY=${apiKey}\n`;
        }

        fs.writeFileSync(hermesEnvFile, envContent);
        console.log(chalk.green(t('writtenTo', hermesEnvFile)));

    } else if (toolName === 'KimiCode') {
        const kimiDir = path.join(os.homedir(), '.kimi');
        const kimiFile = path.join(kimiDir, 'config.toml');
        if (!fs.existsSync(kimiDir)) fs.mkdirSync(kimiDir, { recursive: true });

        let kimiConfig = `# Kimi Code CLI Configuration — Generated by Oh-My-abdalgani-code
default_model = "abdalgani-${selectedModel.replace(/\//g, '-')}"

[providers.abdalgani]
type = "openai_legacy"
base_url = "https://api.abdalgani.com/v1"
api_key = "${apiKey}"

[models.abdalgani-${selectedModel.replace(/\//g, '-')}]
provider = "abdalgani"
model = "${selectedModel}"
max_context_size = 200000
capabilities = ["thinking", "image_in"]
`;

        if (fs.existsSync(kimiFile)) {
            try {
                const existing = fs.readFileSync(kimiFile, 'utf8');
                if (!existing.includes('[providers.abdalgani]')) {
                    kimiConfig = existing.trimEnd() + '\n\n' + kimiConfig;
                } else {
                    kimiConfig = existing
                        .replace(/default_model\s*=\s*"[^"]*"/, `default_model = "abdalgani-${selectedModel.replace(/\//g, '-')}"`);
                    if (kimiConfig.includes('api_key')) {
                        kimiConfig = kimiConfig.replace(/api_key\s*=\s*"[^"]*"/, `api_key = "${apiKey}"`);
                    }
                }
            } catch (_) { }
        }

        fs.writeFileSync(kimiFile, kimiConfig);
        console.log(chalk.green(t('writtenTo', kimiFile)));

    } else if (toolName === 'GeminiCLI') {
        console.log(chalk.yellow(t('geminiKeyNote')));
        // Gemini CLI only uses GEMINI_API_KEY env var — write to shell profile
        const profileFiles = isWin
            ? [path.join(os.homedir(), 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1')]
            : [
                path.join(os.homedir(), '.bashrc'),
                path.join(os.homedir(), '.zshrc'),
            ];

        const envLine = isWin
            ? `$env:GEMINI_API_KEY = "${apiKey}"`
            : `export GEMINI_API_KEY="${apiKey}"`;

        for (const profileFile of profileFiles) {
            if (fs.existsSync(profileFile)) {
                let content = fs.readFileSync(profileFile, 'utf8');
                if (content.includes('GEMINI_API_KEY')) {
                    content = content.replace(/(?:export\s+)?GEMINI_API_KEY[=\s]+"?[^"\n]*"?/, envLine);
                } else {
                    content = content.trimEnd() + '\n' + envLine + '\n';
                }
                fs.writeFileSync(profileFile, content);
                console.log(chalk.green(t('envVarSet', profileFile)));
            } else {
                // Create the profile file if it doesn't exist (only .bashrc)
                if (profileFile.endsWith('.bashrc') || profileFile.endsWith('.ps1')) {
                    const profileDir = path.dirname(profileFile);
                    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
                    fs.writeFileSync(profileFile, envLine + '\n');
                    console.log(chalk.green(t('envVarSet', profileFile)));
                }
            }
        }
        console.log(chalk.gray(t('shellProfileNote')));

    } else if (toolName === 'CodexCLI') {
        // Codex CLI uses OPENAI_API_KEY + OPENAI_BASE_URL env vars
        const profileFiles = isWin
            ? [path.join(os.homedir(), 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1')]
            : [
                path.join(os.homedir(), '.bashrc'),
                path.join(os.homedir(), '.zshrc'),
            ];

        const envLines = isWin
            ? [`$env:OPENAI_API_KEY = "${apiKey}"`, `$env:OPENAI_BASE_URL = "https://api.abdalgani.com/v1"`]
            : [`export OPENAI_API_KEY="${apiKey}"`, `export OPENAI_BASE_URL="https://api.abdalgani.com/v1"`];

        for (const profileFile of profileFiles) {
            if (fs.existsSync(profileFile)) {
                let content = fs.readFileSync(profileFile, 'utf8');
                for (let i = 0; i < envLines.length; i++) {
                    const varName = isWin ? envLines[i].split(' = ')[0].replace('$env:', '') : envLines[i].split('=')[0].replace('export ', '');
                    if (content.includes(varName)) {
                        const regex = new RegExp(`(?:export\\s+)?${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[=\\s]+"?[^"\\n]*"?`, 'g');
                        content = content.replace(regex, envLines[i]);
                    } else {
                        content = content.trimEnd() + '\n' + envLines[i] + '\n';
                    }
                }
                fs.writeFileSync(profileFile, content);
                console.log(chalk.green(t('envVarSet', profileFile)));
            } else {
                if (profileFile.endsWith('.bashrc') || profileFile.endsWith('.ps1')) {
                    const profileDir = path.dirname(profileFile);
                    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
                    fs.writeFileSync(profileFile, envLines.join('\n') + '\n');
                    console.log(chalk.green(t('envVarSet', profileFile)));
                }
            }
        }
        console.log(chalk.gray(t('shellProfileNote')));

    } else if (toolName === 'Aider') {
        const aiderFile = path.join(os.homedir(), '.aider.conf.yml');
        console.log(chalk.cyan(t('pipNote')));

        let aiderConfig = {};
        if (fs.existsSync(aiderFile)) {
            try { aiderConfig = yaml.load(fs.readFileSync(aiderFile, 'utf8')) || {}; }
            catch (_) { }
        }

        aiderConfig['openai-api-key'] = apiKey;
        aiderConfig['openai-api-base'] = 'https://api.abdalgani.com/v1';
        aiderConfig['model'] = selectedModel;

        fs.writeFileSync(aiderFile, yaml.dump(aiderConfig, { lineWidth: -1 }));
        console.log(chalk.green(t('writtenTo', aiderFile)));

    } else if (toolName === 'Goose') {
        const gooseDir = path.join(os.homedir(), '.config', 'goose');
        const gooseFile = path.join(gooseDir, 'config.yaml');
        if (!fs.existsSync(gooseDir)) fs.mkdirSync(gooseDir, { recursive: true });

        let gooseConfig = {};
        if (fs.existsSync(gooseFile)) {
            try { gooseConfig = yaml.load(fs.readFileSync(gooseFile, 'utf8')) || {}; }
            catch (_) { }
        }

        gooseConfig.provider = {
            ...(gooseConfig.provider || {}),
            type: "openai",
            api_key: apiKey,
            base_url: "https://api.abdalgani.com/v1",
            model: selectedModel,
        };

        fs.writeFileSync(gooseFile, yaml.dump(gooseConfig, { lineWidth: -1 }));
        console.log(chalk.green(t('writtenTo', gooseFile)));
    } else if (toolName === 'DeepSeekTUI') {
        const dsDir = path.join(os.homedir(), '.deepseek');
        const dsFile = path.join(dsDir, 'config.toml');
        if (!fs.existsSync(dsDir)) fs.mkdirSync(dsDir, { recursive: true });

        let dsConfig = `# DeepSeek TUI Configuration — Generated by Oh-My-abdalgani-code

[providers.abdalgani]
api_key = "${apiKey}"
base_url = "https://api.abdalgani.com/v1"

[default]
provider = "abdalgani"
model = "${selectedModel}"
`;

        // Merge with existing config
        if (fs.existsSync(dsFile)) {
            try {
                const existing = fs.readFileSync(dsFile, 'utf8');
                if (!existing.includes('[providers.abdalgani]')) {
                    dsConfig = existing.trimEnd() + '\n\n' + dsConfig;
                } else {
                    dsConfig = existing;
                    // Update values
                    if (dsConfig.includes('api_key')) {
                        dsConfig = dsConfig.replace(/api_key\s*=\s*"[^"]*"/, `api_key = "${apiKey}"`);
                    }
                    if (dsConfig.includes('base_url')) {
                        dsConfig = dsConfig.replace(/base_url\s*=\s*"[^"]*"/, `base_url = "https://api.abdalgani.com/v1"`);
                    }
                    if (dsConfig.includes('model')) {
                        dsConfig = dsConfig.replace(/model\s*=\s*"[^"]*"/, `model = "${selectedModel}"`);
                    }
                }
            } catch (_) { }
        }

        fs.writeFileSync(dsFile, dsConfig);
        console.log(chalk.green(t('writtenTo', dsFile)));

    } else if (toolName === 'QwenCode') {
        const qwenDir = path.join(os.homedir(), '.qwen');
        const qwenFile = path.join(qwenDir, 'settings.json');
        if (!fs.existsSync(qwenDir)) fs.mkdirSync(qwenDir, { recursive: true });

        let qwenConfig = {};
        if (fs.existsSync(qwenFile)) {
            try { qwenConfig = JSON.parse(fs.readFileSync(qwenFile, 'utf8')); }
            catch (_) { }
        }

        // Build model provider entries from the selected model
        const modelEntry = {
            id: selectedModel,
            name: `${selectedModel} via Abdalgani`,
            baseUrl: "https://api.abdalgani.com/v1",
            description: `${selectedModel} via abdalgani proxy`,
            envKey: "ABDALGANI_API_KEY"
        };

        if (!qwenConfig.modelProviders) qwenConfig.modelProviders = {};
        if (!qwenConfig.modelProviders.openai) qwenConfig.modelProviders.openai = [];

        // Replace or add the model entry
        const existingIdx = qwenConfig.modelProviders.openai.findIndex(m => m.id === selectedModel);
        if (existingIdx >= 0) {
            qwenConfig.modelProviders.openai[existingIdx] = modelEntry;
        } else {
            qwenConfig.modelProviders.openai.push(modelEntry);
        }

        if (!qwenConfig.env) qwenConfig.env = {};
        qwenConfig.env.ABDALGANI_API_KEY = apiKey;

        if (!qwenConfig.security) qwenConfig.security = {};
        if (!qwenConfig.security.auth) qwenConfig.security.auth = {};
        qwenConfig.security.auth.selectedType = "openai";

        if (!qwenConfig.model) qwenConfig.model = {};
        qwenConfig.model.name = selectedModel;

        fs.writeFileSync(qwenFile, JSON.stringify(qwenConfig, null, 2));
        console.log(chalk.green(t('writtenTo', qwenFile)));
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
                { name: t('zeroclaw'), value: 'ZeroClaw' },
                { name: t('hermes'), value: 'Hermes' },
                { name: t('kimicode'), value: 'KimiCode' },
                { name: t('geminicli'), value: 'GeminiCLI' },
                { name: t('codexcli'), value: 'CodexCLI' },
                { name: t('aider'), value: 'Aider' },
                { name: t('goose'), value: 'Goose' },
                { name: t('deepseektui'), value: 'DeepSeekTUI' },
                { name: t('qwencode'), value: 'QwenCode' },
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
                { name: lang === 'ar' ? '❌ لا' : '❌ No', value: false }
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
