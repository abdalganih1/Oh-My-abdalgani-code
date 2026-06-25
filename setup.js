import { select, input, search, checkbox } from '@inquirer/prompts';
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
        picode: '🥧 Pi Code',
        ehcode: '🧩 EH Code (نواة OpenCode محلية)',
        effortPrompt: '🧠 مستوى التفكير — z.ai GLM فيه 3 حالات فعلية فقط: None / High / Max:',
        effortDefault: '⚪ افتراضي (بدون تحديد — GLM-5.2 افتراضه أصلاً Max)',
        effortSet: (e) => `✅ مستوى التفكير: ${e}`,
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
        picode: '🥧 Pi Code',
        ehcode: '🧩 EH Code (local OpenCode core)',
        effortPrompt: '🧠 Reasoning effort — z.ai GLM has only 3 real states: None / High / Max:',
        effortDefault: '⚪ Default (leave unset — GLM-5.2 already defaults to Max)',
        effortSet: (e) => `✅ Reasoning effort: ${e}`,
        winNotSupported: (t) => `⚠️ ${t} does not support interactive launch on Windows yet. Config was saved successfully — run it from WSL or Linux.`,
    }
};

let lang = 'en'; // default, will be set by user
function t(key, ...args) {
    const val = i18n[lang][key];
    return typeof val === 'function' ? val(...args) : val;
}

// ==================== Models ====================
// النموذج الافتراضي الصامت - يُستخدم لـ OpenCode/KiloCLI تلقائياً.
// glm-5.2 (مجرّد) = z.ai coding plan الحيّ. (سابقاً nvidia/glm-4.7 — غير معرّف في
// البوّابة و NVIDIA غير منزّل، فكان يفشل.)
const DEFAULT_MODEL = 'glm-5.2';

// ── علامة المزوّد للـ picker ──
// كل اسم نموذج في البوّابة بحمل المزوّد عبر بادئته (nvidia/ · zai/ · nanogpt/ · cc/ ·
// لاحقة :cloud · والمجرّد glm-* = z.ai). نشتقّ منها وسماً واضحاً [Provider] نعرضه
// أمام الاسم وقت البحث حتى ما تختلط النسخ المكرّرة (glm-5.2 على zai مقابل nanogpt...).
function providerOf(value) {
    const prefixes = {
        'nvidia/': 'NVIDIA', 'nanogpt/': 'NanoGPT', 'zai/': 'Z.AI',
        'cc/': 'Claude Code', 'xiaomi/': 'Xiaomi', 'moonshotai/': 'Moonshot',
        'minimaxai/': 'MiniMax', 'qwen/': 'NVIDIA',
    };
    for (const p in prefixes) if (value.startsWith(p)) return prefixes[p];
    if (value.endsWith(':cloud')) return value.startsWith('deepseek-v4') ? 'DeepSeek' : 'Ollama(dead)';
    if (/^(gemini|veo|lyria|gemma)/.test(value)) return 'Google';
    if (/^mimo-/.test(value)) return 'Xiaomi';
    if (/^glm-/.test(value)) return 'Z.AI';
    if (/^deepseek-v4/.test(value)) return 'NVIDIA';
    if (value === 'qwen' || /^qwen3/.test(value)) return 'NVIDIA';
    return 'abdalgani';
}
function tagModels(list) {
    return list.map(m => (m && m.value && m.name)
        ? { value: m.value, name: `[${providerOf(m.value)}] ${m.name}` }
        : m);
}

// ── النماذج الوكيلية المختارة (الشغّالة فقط — مُختبَرة عبر api.abdalgani.com 2026-06-25) ──
// هاي القائمة الوحيدة اللي بتظهر بمنتقي النماذج للأدوات الوكيلية (Hermes / OpenClaw...).
// كل اسم مكتوب فيه مزوّده. nanoGPT محصور بـ mimo + kimi-k2.7-code (يظهروا باسم nanoGPT
// مش mimo حتى ما يختلطوا بالمزوّد الرسمي). Gemini محصور بـ gemini-3.5-flash.
const AGENT_MODELS = [
    { value: "glm-5.2", name: "[Z.AI] GLM-5.2              │ خطة الكود — الأساسي" },
    { value: "glm-5.1", name: "[Z.AI] GLM-5.1              │ خطة الكود — fallback → NVIDIA" },
    { value: "glm-4.7", name: "[Z.AI] GLM-4.7              │ خطة الكود" },
    { value: "qwen", name: "[NVIDIA] Qwen 3.5 397B" },
    { value: "nvidia/minimax-m3", name: "[NVIDIA] MiniMax M3" },
    { value: "nvidia/deepseek-v4-pro", name: "[NVIDIA] DeepSeek V4 Pro    │ وقت القطعة" },
    { value: "nvidia/deepseek-v4-flash", name: "[NVIDIA] DeepSeek V4 Flash  │ وقت القطعة" },
    { value: "nvidia/nemotron-3-ultra-550b", name: "[NVIDIA] Nemotron 3 Ultra 550B │ قوي بس بطيء" },
    { value: "nanogpt/mimo-v2.5-pro", name: "[nanoGPT] mimo-v2.5-pro" },
    { value: "nanogpt/kimi-k2.7-code", name: "[nanoGPT] kimi-k2.7-code" },
    { value: "gemini-3.5-flash", name: "[Google] Gemini 3.5 Flash" },
];

// القائمة الكاملة مُحدَّثة من API الفعلي (api.abdalgani.com/v1/models)
const models = [
    // ── NVIDIA NIM ───────────────────────────────────────────────────────────
    { value: "nvidia/glm-5.2", name: "GLM-5.2                │ CTX: 1,000,000 │ OUT:  32,000" },
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
    { value: "deepseek-v4-pro", name: "DeepSeek V4 Pro        │ CTX: 1,048,576 │ OUT: 384,000" },
    { value: "deepseek-v4-flash", name: "DeepSeek V4 Flash      │ CTX: 1,048,576 │ OUT: 384,000" },
    { value: "nvidia/gpt-oss-120b", name: "GPT-OSS 120B           │ CTX: 128,000 │ OUT:  16,384" },
    { value: "nvidia/gpt-oss-20b", name: "GPT-OSS 20B            │ CTX: 128,000 │ OUT:  16,384" },
    { value: "nvidia/step-3.5-flash", name: "Step 3.5 Flash         │ CTX: 128,000 │ OUT:  32,768" },
    { value: "nvidia/step-3.7-flash", name: "Step 3.7 Flash         │ CTX: 128,000 │ OUT:  32,768" },
    { value: "nvidia/minimax-m3", name: "MiniMax M3 (NVIDIA)     │ CTX: 1,048,576 │ OUT: 196,608" },
    { value: "nvidia/nemotron-3-ultra-550b", name: "Nemotron 3 Ultra 550B  │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/nemotron-nano-3-30b", name: "Nemotron Nano 3 30B    │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/mistral-large-3", name: "Mistral Large 3 675B   │ CTX: 131,072 │ OUT:  32,768" },
    { value: "nvidia/qwen3-next-80b", name: "Qwen3 Next 80B (NVIDIA) │ CTX: 262,144 │ OUT:  81,920" },

    // ── Gemini (via LiteLLM) ─────────────────────────────────────────────────
    { value: "gemini-3.1-pro", name: "Gemini 3.1 Pro         │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-3.1-flash", name: "Gemini 3.1 Flash       │ CTX: 1,048,576 │ OUT: 65,536" },
    { value: "gemini-3.5-flash", name: "Gemini 3.5 Flash       │ CTX: 1,048,576 │ OUT: 65,536" },
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
    { value: "gemma4", name: "Gemma 4 (Ollama)        │ CTX: 128,000 │ OUT:  32,768" },
    { value: "qwen3.5", name: "Qwen 3.5 (Ollama)       │ CTX: 131,072 │ OUT:  32,768" },
    { value: "deepseek-v4-pro:cloud", name: "DeepSeek V4 Pro (DS API)│ CTX: 1,048,576 │ OUT: 384,000" },
    { value: "deepseek-v4-flash:cloud", name: "DeepSeek V4 Flsh(DS API)│ CTX: 1,048,576 │ OUT: 384,000" },
    // ── Z.AI Coding Plan (مباشر عبر LiteLLM) ───────────────────────────────
    { value: "glm-5", name: "GLM-5 (Z.AI codeplan)     │ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-4.6", name: "GLM-4.6 (Z.AI codeplan)   │ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-4.5", name: "GLM-4.5 (Z.AI codeplan)   │ CTX: 131,072 │ OUT: 131,072" },
    { value: "glm-5.2", name: "GLM-5.2 (Z.AI codeplan)   │ CTX: 1,000,000 │ OUT: 131,072" },
    { value: "glm-5.1", name: "GLM-5.1 (Z.AI codeplan)   │ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-5-turbo", name: "GLM-5-Turbo (Z.AI codeplan)  │ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-4.7", name: "GLM-4.7 (Z.AI codeplan)   │ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-4.7-flash", name: "GLM-4.7-Flash (Z.AI codeplan)│ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-4.5-air", name: "GLM-4.5-Air (Z.AI codeplan)  │ CTX: 204,800 │ OUT: 131,072" },
    { value: "glm-4.5-flash", name: "GLM-4.5-Flash (Z.AI codeplan)│ CTX: 204,800 │ OUT: 131,072" },
    // ── Z.AI for Claude Code (Anthropic pass-through safe) ────────────────────
    // ── XiaomiMimo Custom API ────────────────────────────────────────────────
    { value: "xiaomi/claude-3-5-sonnet", name: "Xiaomi Claude 3.5 Sonnet│ CTX: 200,000 │ OUT:   8,192" },
    { value: "xiaomi/claude-3-5-haiku", name: "Xiaomi Claude 3.5 Haiku │ CTX: 200,000 │ OUT:   8,192" },
    { value: "xiaomi/gpt-4o", name: "Xiaomi GPT-4o           │ CTX: 128,000 │ OUT:   4,096" },
    { value: "xiaomi/gpt-4o-mini", name: "Xiaomi GPT-4o Mini      │ CTX: 128,000 │ OUT:   4,096" },
    { value: "xiaomi/deepseek-chat", name: "Xiaomi DeepSeek Chat    │ CTX:  64,000 │ OUT:   8,192" },
    { value: "xiaomi/deepseek-reasoner", name: "Xiaomi DeepSeek Reasoner│ CTX:  64,000 │ OUT:   8,192" },
    // ── XiaomiMimo Native Models ──
    { value: "mimo-v2.5-pro", name: "Xiaomi Mimo v2.5 Pro    │ CTX: 1,048,576 │ OUT: 131,072" },
    { value: "mimo-v2.5", name: "Xiaomi Mimo v2.5        │ CTX: 1,048,576 │ OUT:  32,768" },
    { value: "mimo-v2-pro", name: "Xiaomi Mimo v2 Pro      │ CTX: 1,048,576 │ OUT: 131,072" },
    { value: "mimo-v2-omni", name: "Xiaomi Mimo v2 Omni     │ CTX: 1,048,576 │ OUT:  32,768" },
    // ── NanoGPT (nano-gpt.com - اشتراك Pro) ──
    { value: "nanogpt/minimax-m3", name: "MiniMax M3 (NanoGPT)    │ CTX: 512,000  │ OUT:  65,536" },
    { value: "nanogpt/deepseek-v4-pro", name: "DeepSeek V4 Pro (Nano)  │ CTX: 1,048,576 │ OUT: 384,000" },
    { value: "nanogpt/deepseek-v4-flash", name: "DeepSeek V4 Flash(Nano) │ CTX: 1,048,576 │ OUT: 384,000" },
    { value: "nanogpt/glm-5.2", name: "GLM-5.2 (NanoGPT)       │ CTX: 1,000,000 │ OUT: 131,072" },
    { value: "nanogpt/glm-5.1", name: "GLM-5.1 (NanoGPT)       │ CTX: 200,000  │ OUT: 131,072" },
    { value: "nanogpt/mimo-v2.5-pro", name: "MiMo V2.5 Pro (NanoGPT) │ CTX: 1,048,576 │ OUT: 131,072" },
    { value: "nanogpt/kimi-k2.6", name: "Kimi K2.6 (NanoGPT)     │ CTX: 256,000  │ OUT:  65,535" },
    { value: "nanogpt/kimi-k2.5", name: "Kimi K2.5 (NanoGPT)     │ CTX: 256,000  │ OUT:  65,535" },
    { value: "nanogpt/minimax-m2.7", name: "MiniMax M2.7 (NanoGPT)  │ CTX: 204,800  │ OUT: 196,608" },
    { value: "nanogpt/kimi-k2.7-code", name: "Kimi K2.7 Code (NanoGPT)│ CTX: 256,000  │ OUT:  65,535" },
    { value: "nanogpt/minimax-m2.7-turbo", name: "MiniMax M2.7 Turbo(Nano)│ CTX: 204,800  │ OUT: 196,608" },
    { value: "nanogpt/deepseek-v3.2", name: "DeepSeek V3.2 (NanoGPT) │ CTX: 131,072  │ OUT:  32,768" },
    { value: "nanogpt/qwen3.5-397b", name: "Qwen 3.5 397B (NanoGPT) │ CTX: 262,144  │ OUT:  81,920" },
    { value: "nanogpt/qwen3-coder-next", name: "Qwen3 Coder Next (Nano) │ CTX: 262,144  │ OUT:  81,920" },
    { value: "nanogpt/glm-5", name: "GLM-5 (NanoGPT)         │ CTX: 200,000  │ OUT: 131,072" },
    { value: "nanogpt/glm-4.7", name: "GLM-4.7 (NanoGPT)       │ CTX: 200,000  │ OUT: 131,072" },
    { value: "nanogpt/gpt-5.2-codex", name: "GPT-5.2 Codex (NanoGPT) │ CTX: 400,000  │ OUT: 128,000" },
    { value: "nanogpt/claude-opus-4.8", name: "Claude Opus 4.8 (Nano)  │ CTX: 200,000  │ OUT:  64,000" },
    { value: "nanogpt/grok-4.3", name: "Grok 4.3 (NanoGPT)      │ CTX: 256,000  │ OUT:  64,000" },
];

// ==================== Tool Installation Map ====================
const isWin = os.platform() === 'win32';

// ── EH Code (Elissar Hiba Code) — نواة OpenCode محلية مبنية كـ exe مستقل ──
// التنصيب يجرّب بالترتيب: (1) نسخة محلية → (2) رابط مباشر → (3) GitHub Release.
// 1) نسخة محلية (الطريق السريع لصاحب البناء) — عدّل المسار إذا نقلت مجلد dist-ehcode:
const EHCODE_DIST_DIR = 'C:/Users/Abdalgani/Desktop/alissar/ehcode/dist-ehcode';
// 2) لمن يشغّل setup من GitHub بدون النسخة المحلية: رابط مباشر لتحميل ehcode.exe.
//    مستضاف على Cloudflare R2 (bucket عام). التحديثات تُرفع لنفس المفتاح ehcode/ehcode.exe
//    فيبقى هذا الرابط ثابتاً (انظر AGENTS.md). اتركه فارغاً '' لتعطيل التحميل بالرابط.
const EHCODE_DOWNLOAD_URL = 'https://pub-f2c0b43b09ea4983a05bdb7998fafdf3.r2.dev/ehcode/ehcode.exe';
// 3) بديل عن الرابط: مستودع GitHub فيه أحدث Release باسم asset = ehcode.exe.
//    اتركه فارغاً '' لتعطيله. مثال: 'Abdalgani/ehcode'
const EHCODE_RELEASE_REPO = '';

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
    PiCode: {
        exeName: 'pi',
        methods: [
            { label: 'npm', cmd: 'npm install -g @mariozechner/pi-coding-agent' },
        ],
        manual: '  npm install -g @mariozechner/pi-coding-agent',
        configFormat: 'json',
    },
    EHCode: {
        // نواة OpenCode محلية كـ exe مستقل — يتولّى التنصيب installEHCode():
        // نسخة محلية من EHCODE_DIST_DIR، وإلا تحميل من EHCODE_DOWNLOAD_URL / EHCODE_RELEASE_REPO.
        exeName: 'ehcode',
        localExe: true,
        methods: [{ label: 'local/download', cmd: '' }],
        manual: isWin
            ? `  ضع ehcode.exe في ${EHCODE_DIST_DIR}\n  # أو عيّن EHCODE_DOWNLOAD_URL أو EHCODE_RELEASE_REPO في setup.js`
            : '  EH Code is a Windows-only build.',
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
                path.join(process.env.LOCALAPPDATA || '', 'EHCode', `${command}.exe`),
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

    // Kimi config (~/.kimi/config.json)
    try {
        const p = path.join(os.homedir(), '.kimi', 'config.json');
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            const abdalgani = data?.providers?.abdalgani;
            if (abdalgani?.api_key) return abdalgani.api_key;
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
// EH Code installer: نسخة محلية (سريع) → تحميل من رابط/Release (لمستخدمي GitHub) → رسالة واضحة.
async function installEHCode() {
    if (!isWin) {
        console.log(chalk.red('❌ EH Code is a Windows-only standalone build.'));
        return false;
    }
    const targetDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'EHCode');
    const targetExe = path.join(targetDir, 'ehcode.exe');
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

    // (1) نسخة محلية — الطريق السريع لصاحب البناء
    const localExe = path.join(EHCODE_DIST_DIR, 'ehcode.exe');
    if (existsSync(localExe)) {
        console.log(chalk.cyan('📦 Copying EH Code from local build...'));
        fs.copyFileSync(localExe, targetExe);
        console.log(chalk.green(`✅ EH Code → ${targetExe}`));
    } else {
        // (2) رابط مباشر → (3) أحدث GitHub Release asset = ehcode.exe
        let url = EHCODE_DOWNLOAD_URL;
        if (!url && EHCODE_RELEASE_REPO) {
            const info = await getLatestReleaseAsset(EHCODE_RELEASE_REPO, 'ehcode.exe');
            if (info) url = info.browserDownloadUrl;
        }
        if (!url) {
            console.log(chalk.red('❌ EH Code: لا توجد نسخة محلية ولا رابط تحميل.'));
            console.log(chalk.cyan(`   • ضع ehcode.exe في: ${EHCODE_DIST_DIR}`));
            console.log(chalk.cyan('   • أو عيّن EHCODE_DOWNLOAD_URL (رابط مباشر) أو EHCODE_RELEASE_REPO (GitHub Release) في setup.js'));
            return false;
        }
        console.log(chalk.cyan(`⬇️ Downloading EH Code (~156MB) from:\n   ${url}`));
        try {
            await downloadFile(url, targetExe);
            console.log(chalk.green(`✅ EH Code downloaded → ${targetExe}`));
        } catch (e) {
            console.log(chalk.red(`❌ EH Code download failed: ${e.message}`));
            try { rmSync(targetExe, { force: true }); } catch (_) { }
            return false;
        }
    }

    // إضافة %LOCALAPPDATA%\EHCode للـ PATH (المسار يُحسب داخل PowerShell لتفادي مشاكل الـ escaping)
    try {
        execSync(`powershell -NoProfile -Command "$t=Join-Path $env:LOCALAPPDATA 'EHCode'; $p=[Environment]::GetEnvironmentVariable('Path','User'); $kept=(($p -split ';') | Where-Object { $_ -and ($_ -ne $t) }); [Environment]::SetEnvironmentVariable('Path', (($kept -join ';')+';'+$t),'User')"`, { stdio: 'ignore' });
        console.log(chalk.green('✅ Added to PATH (open a NEW terminal to use `ehcode`).'));
    } catch (_) {
        console.log(chalk.yellow('⚠️ Could not update PATH automatically. Add %LOCALAPPDATA%\\EHCode manually.'));
    }
    return true;
}

async function installTool(toolName) {
    const map = TOOL_INSTALL_MAP[toolName];
    if (!map) {
        console.log(chalk.red(`Unknown tool: ${toolName}`));
        return false;
    }

    if (toolName === 'EHCode') {
        return await installEHCode();
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
async function launchAfterSetup(toolName, exeName, opts = {}) {
    if (opts.nonInteractive) return; // headless setup never launches an interactive session
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
        // EH Code يُنصَّب في %LOCALAPPDATA%\EHCode ويُحدّث الـ PATH، لكن PATH الجديد لا يكون
        // نشطاً في هذه الجلسة بعد — فنشغّله بالمسار الكامل لضمان عمله فوراً.
        let launchCmd = exeName;
        if (toolName === 'EHCode') {
            const ehExe = path.join(process.env.LOCALAPPDATA || '', 'EHCode', 'ehcode.exe');
            if (fs.existsSync(ehExe)) launchCmd = `"${ehExe}"`;
        }
        spawnSync(launchCmd, [], { stdio: 'inherit', shell: true });
    } catch (e) {
        console.error(chalk.red(t('launchFailed', toolName, e.message)));
    }
}

// ==================== Core Logic ====================
// Reasoning effort picker — values understood by both OpenCode (options.reasoningEffort)
// and Hermes (agent.reasoning_effort). The gateway drops the param where a model
// doesn't support it (drop_unsupported_params: true), so it's always safe to send.
//
// Per z.ai docs, GLM-5.2 accepts 7 values but collapses to only 3 FUNCTIONAL states:
//   none/minimal ⇒ None (skip thinking) · low/medium/high ⇒ High · xhigh ⇒ Max.
//   (max is GLM-5.2's native default = deep reasoning.)
// So we only expose the 3 real tiers, using portable values: "xhigh" is the top tier
// accepted by both OpenCode and Hermes, and z.ai maps it to its native Max.
async function pickReasoningEffort() {
    return await select({
        message: t('effortPrompt'),
        choices: [
            { name: t('effortDefault'), value: '' },
            { name: 'None — بدون تفكير / skip thinking', value: 'none' },
            { name: 'High — تفكير معزّز / enhanced reasoning', value: 'high' },
            { name: 'Max  — تفكير عميق / deep (z.ai الافتراضي · موصى به للبرمجة)', value: 'xhigh' },
        ],
    });
}

async function configureTool(toolName, opts = {}) {
    const nonInteractive = opts.nonInteractive === true;
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
    if (nonInteractive) {
        // Headless: key from --api-key / ABDALGANI_API_KEY / saved config — no prompt.
        apiKey = opts.apiKey || process.env.ABDALGANI_API_KEY || findExistingApiKey();
        if (!apiKey) {
            console.log(chalk.red('❌ Non-interactive: no API key. Pass --api-key=<key> or set ABDALGANI_API_KEY env.'));
            return;
        }
        if (opts.apiKey) saveGlobalApiKey(opts.apiKey);
    } else {
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
    let selectedModel = (nonInteractive && opts.model) ? opts.model : DEFAULT_MODEL;
    let selectedEffort = nonInteractive ? (opts.effort || '') : ''; // Reasoning effort; '' = provider default
    let claudeOpus = (nonInteractive && opts.model) ? opts.model : 'glm-5.2';
    let claudeSonnet = 'glm-4.7';
    let claudeHaiku = 'glm-4.7';
    let selectedHermesModels = null; // Hermes checkbox multiselect → كتالوج custom_providers
    if (nonInteractive) console.log(chalk.green(`▶ Headless: model=${selectedModel}${selectedEffort ? ', effort=' + selectedEffort : ''}`));

    // === Hermes: اختيار متعدّد (checkbox) من النماذج الوكيلية المختارة فقط ===
    if (!nonInteractive && toolName === 'Hermes') {
        selectedHermesModels = await checkbox({
            message: '🔮 اختر نماذج Hermes (مسافة للتحديد، Enter للتأكيد):',
            choices: AGENT_MODELS.map(m => ({ value: m.value, name: m.name })),
            required: true,
            pageSize: 15,
            loop: false,
        });
        selectedModel = selectedHermesModels.length === 1
            ? selectedHermesModels[0]
            : await select({
                message: '⭐ النموذج الافتراضي (default):',
                choices: selectedHermesModels.map(v => {
                    const m = AGENT_MODELS.find(x => x.value === v);
                    return { value: v, name: m ? m.name : v };
                }),
            });
        console.log(chalk.green(t('openClawPrimarySet', selectedModel)));
        console.log(chalk.gray(`   ← كتالوج Hermes: ${selectedHermesModels.join(', ')}`));
    }
    // === OpenClaw وغيره من الأدوات الوكيلية: نموذج واحد من القائمة المختارة فقط ===
    else if (!nonInteractive && ['OpenClaw', 'ZeroClaw', 'KimiCode', 'Aider', 'Goose', 'GeminiCLI', 'CodexCLI', 'DeepSeekTUI', 'QwenCode', 'PiCode'].includes(toolName)) {
        const pickOpenClawModel = async () => {
            const chosen = await search({
                message: t('selectToolModel', toolName),
                source: (input) => {
                    const q = (input || '').toLowerCase();
                    const filtered = AGENT_MODELS.filter(
                        m => m.name.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)
                    );
                    return filtered.length > 0
                        ? filtered
                        : [{ value: AGENT_MODELS[0].value, name: t('noModelMatch') }];
                },
            });
            return chosen || AGENT_MODELS[0].value;
        };
        selectedModel = await pickOpenClawModel();
        console.log(chalk.green(t('openClawPrimarySet', selectedModel)));
    }

    if (!nonInteractive && toolName === 'ClaudeCode') {
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
                        ? tagModels(hasDefault ? filtered : [defaultEntry, ...filtered])
                        : (defaultEntry ? tagModels([defaultEntry]) : [{ value: '__none__', name: t('noModelMatch') }]);
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

    // === Reasoning Effort Selection (OpenCode / KiloCLI / Hermes / EHCode) — تفاعلي فقط ===
    if (!nonInteractive && ['OpenCode', 'KiloCLI', 'Hermes', 'EHCode'].includes(toolName)) {
        selectedEffort = await pickReasoningEffort();
        if (selectedEffort) console.log(chalk.green(t('effortSet', selectedEffort)));
    }

    console.log(chalk.yellow(t('applying')));

    if (toolName === 'OpenCode' || toolName === 'KiloCLI' || toolName === 'EHCode') {
        // EH Code = نواة OpenCode: نفس صيغة opencode.json بالضبط، بس بمجلد ehcode/
        // (وبترجع ehcode تلقائياً لـ ~/.config/opencode لو مجلدها مش موجود).
        const folderName = toolName === 'KiloCLI' ? 'kilo' : (toolName === 'EHCode' ? 'ehcode' : 'opencode');
        const configFileName = toolName === 'KiloCLI' ? 'kilo.json' : 'opencode.json';
        const configDir = path.join(os.homedir(), '.config', folderName);
        const configFile = path.join(configDir, configFileName);

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
            "kimi-k2.7-code:cloud": { name: "Kimi K2.7 Code (Ollama)", limit: { context: 262144, output: 65535 } },
            "minimax-m3:cloud": { name: "MiniMax M3 (Ollama)", limit: { context: 1048576, output: 196608 } },
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
            "nvidia/deepseek-v4-pro": { name: "DeepSeek V4 Pro (NVIDIA)", limit: { context: 1048576, output: 384000 } },
            "nvidia/deepseek-v4-flash": { name: "DeepSeek V4 Flash (NVIDIA)", limit: { context: 1048576, output: 384000 } },
            "deepseek-v4-pro": { name: "DeepSeek V4 Pro", limit: { context: 1048576, output: 384000 } },
            "deepseek-v4-flash": { name: "DeepSeek V4 Flash", limit: { context: 1048576, output: 384000 } },
            "nvidia/gpt-oss-120b": { name: "GPT-OSS 120B (NVIDIA)", limit: { context: 128000, output: 16384 } },
            "nvidia/step-3.5-flash": { name: "Step 3.5 Flash (NVIDIA)", limit: { context: 128000, output: 32768 } },

            // ── Gemini ───────────────────────────────────────────────────────────
            "gemini-3.1-pro": { name: "Gemini 3.1 Pro", limit: { context: 1048576, output: 65536 } },
            "gemini-3.1-flash": { name: "Gemini 3.1 Flash", limit: { context: 1048576, output: 65536 } },
            "gemini-3.5-flash": { name: "Gemini 3.5 Flash", limit: { context: 1048576, output: 65536 } },
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
            "glm-5.1": { name: "GLM-5.1 (Z.AI codeplan)", limit: { context: 204800, output: 131072 } },
            "zai/glm-5-turbo": { name: "GLM-5-Turbo (Z.AI Coding)", limit: { context: 204800, output: 131072 } },
            "glm-5-turbo": { name: "GLM-5-Turbo (Z.AI codeplan)", limit: { context: 204800, output: 131072 } },
            "zai/glm-4.7": { name: "GLM-4.7 (Z.AI Coding Plan)", limit: { context: 204800, output: 131072 } },
            "glm-4.7": { name: "GLM-4.7 (Z.AI codeplan)", limit: { context: 204800, output: 131072 } },
            "zai/glm-4.7-flash": { name: "GLM-4.7-Flash (Z.AI Coding)", limit: { context: 204800, output: 131072 } },
            "glm-4.7-flash": { name: "GLM-4.7-Flash (Z.AI codeplan)", limit: { context: 204800, output: 131072 } },
            "zai/glm-4.5-air": { name: "GLM-4.5-Air (Z.AI Coding)", limit: { context: 204800, output: 131072 } },
            "glm-4.5-air": { name: "GLM-4.5-Air (Z.AI codeplan)", limit: { context: 204800, output: 131072 } },
            "zai/glm-4.5-flash": { name: "GLM-4.5-Flash (Z.AI Coding)", limit: { context: 204800, output: 131072 } },
            "glm-4.5-flash": { name: "GLM-4.5-Flash (Z.AI codeplan)", limit: { context: 204800, output: 131072 } },
            // ── Z.AI for Claude Code (Anthropic pass-through safe) ────────────
            // ── XiaomiMimo Custom API ────────────────────────────────────────
            "xiaomi/claude-3-5-sonnet": { name: "Xiaomi Claude 3.5 Sonnet", limit: { context: 200000, output: 8192 } },
            "xiaomi/claude-3-5-haiku": { name: "Xiaomi Claude 3.5 Haiku", limit: { context: 200000, output: 8192 } },
            "xiaomi/gpt-4o": { name: "Xiaomi GPT-4o", limit: { context: 128000, output: 4096 } },
            "xiaomi/gpt-4o-mini": { name: "Xiaomi GPT-4o Mini", limit: { context: 128000, output: 4096 } },
            "xiaomi/deepseek-chat": { name: "Xiaomi DeepSeek Chat", limit: { context: 64000, output: 8192 } },
            "xiaomi/deepseek-reasoner": { name: "Xiaomi DeepSeek Reasoner", limit: { context: 64000, output: 8192 } },
            // ── XiaomiMimo Native Models ──
            "mimo-v2.5-pro": { name: "Xiaomi Mimo v2.5 Pro", limit: { context: 1048576, output: 131072 } },
            "mimo-v2.5": { name: "Xiaomi Mimo v2.5", limit: { context: 1048576, output: 32768 } },
            "mimo-v2-pro": { name: "Xiaomi Mimo v2 Pro", limit: { context: 1048576, output: 131072 } },
            "mimo-v2-omni": { name: "Xiaomi Mimo v2 Omni", limit: { context: 1048576, output: 32768 } },
            // ── NanoGPT (nano-gpt.com - اشتراك Pro) ──
            "nanogpt/minimax-m3": { name: "MiniMax M3 (NanoGPT)", limit: { context: 512000, output: 65536 } },
            "nanogpt/deepseek-v4-pro": { name: "DeepSeek V4 Pro (NanoGPT)", limit: { context: 1048576, output: 384000 } },
            "nanogpt/deepseek-v4-flash": { name: "DeepSeek V4 Flash (NanoGPT)", limit: { context: 1048576, output: 384000 } },
            "nanogpt/glm-5.1": { name: "GLM-5.1 (NanoGPT)", limit: { context: 200000, output: 131072 } },
            "nanogpt/mimo-v2.5-pro": { name: "MiMo V2.5 Pro (NanoGPT)", limit: { context: 1048576, output: 131072 } },
            "nanogpt/kimi-k2.6": { name: "Kimi K2.6 (NanoGPT)", limit: { context: 256000, output: 65535 } },
            "nanogpt/kimi-k2.5": { name: "Kimi K2.5 (NanoGPT)", limit: { context: 256000, output: 65535 } },
            "nanogpt/minimax-m2.7": { name: "MiniMax M2.7 (NanoGPT)", limit: { context: 204800, output: 196608 } },
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

        // طبّق مستوى التفكير المختار على كل النماذج (الـ gateway يُسقطه عن اللي لا يدعمه)
        if (selectedEffort) {
            for (const k of Object.keys(providerModels)) {
                providerModels[k].options = {
                    ...(providerModels[k].options || {}),
                    reasoningEffort: selectedEffort,
                };
            }
        }

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
        // Claude Code uses Anthropic Messages API (/v1/messages).
        // LiteLLM receives this and routes to the configured backend.
        claudeSettings.env = {
            ...(claudeSettings.env || {}),
            ANTHROPIC_BASE_URL: 'https://api.abdalgani.com',
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ANTHROPIC_API_KEY: '',
            ANTHROPIC_MODEL: selectedModel,
            ANTHROPIC_DEFAULT_OPUS_MODEL: claudeOpus,
            ANTHROPIC_DEFAULT_SONNET_MODEL: claudeSonnet,
            ANTHROPIC_DEFAULT_HAIKU_MODEL: claudeHaiku,
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
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
        // Hermes uses HERMES_HOME (set during install) — default: %LOCALAPPDATA%\hermes on Windows, ~/.hermes on Linux/Mac.
        // CORRECT schema (verified against the installed hermes_cli/providers.py::resolve_custom_provider,
        // the working on-disk config.yaml, and the official docs/configuring-models):
        // a NAMED OpenAI-compatible endpoint is declared as an entry in the top-level `custom_providers:`
        // LIST, and the active `model:` block points at it via provider: "custom:<name-slug>".
        //   • The `/model` picker lists provider rows from `custom_providers[].name`, so the named
        //     "abdalgani" provider only appears when this list entry exists.
        //   • A bare `model.provider: "custom"` (no name) produces only an unnamed "Custom endpoint"
        //     row — which is EXACTLY why "abdalgani" never showed up in the picker before. (The old
        //     code here even did `delete hermesConfig.custom_providers`, removing the named entry.)
        //   • api_key is referenced via env (${ABDALGANI_API_KEY}); the list entry's key_env points
        //     Hermes at the same variable. Both are written to HERMES_HOME/.env below.
        const hermesHome = process.env.HERMES_HOME
            || (isWin ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'hermes') : path.join(os.homedir(), '.hermes'));
        const hermesConfigFile = path.join(hermesHome, 'config.yaml');
        const hermesEnvFile = path.join(hermesHome, '.env');

        if (!fs.existsSync(hermesHome)) fs.mkdirSync(hermesHome, { recursive: true });

        let hermesConfig = {};
        if (fs.existsSync(hermesConfigFile)) {
            try { hermesConfig = yaml.load(fs.readFileSync(hermesConfigFile, 'utf8')) || {}; }
            catch (_) { console.log(chalk.yellow(t('corruptConfig'))); }
        }

        // Build the named custom-provider entry "abdalgani" with the full model catalog.
        const HERMES_PROVIDER_NAME = 'abdalgani';
        // custom_provider_slug(): "custom:" + name.lower().replace(" ", "-")
        const HERMES_PROVIDER_SLUG = `custom:${HERMES_PROVIDER_NAME.toLowerCase().replace(/\s+/g, '-')}`;
        const HERMES_BASE_URL = 'https://api.abdalgani.com/v1';

        // Catalog = only the models the user checked (Hermes checkbox). Headless or
        // single-pick falls back to just the active model. No more dumping all models.
        const hermesModelsMap = {};
        const hermesModelList = (selectedHermesModels && selectedHermesModels.length)
            ? selectedHermesModels
            : [selectedModel];
        for (const v of hermesModelList) hermesModelsMap[v] = {};

        const abdalganiEntry = {
            name: HERMES_PROVIDER_NAME,
            base_url: HERMES_BASE_URL,
            api_mode: 'chat_completions',
            key_env: 'ABDALGANI_API_KEY',
            discover_models: false,
            models: hermesModelsMap,
        };

        // Preserve any other custom providers the user has; replace/insert ours by name.
        const existingCustom = Array.isArray(hermesConfig.custom_providers) ? hermesConfig.custom_providers : [];
        const otherCustom = existingCustom.filter(
            (e) => e && typeof e === 'object' && (e.name || '').trim().toLowerCase() !== HERMES_PROVIDER_NAME
        );
        hermesConfig.custom_providers = [...otherCustom, abdalganiEntry];

        // Point the active model at the named provider via "custom:<slug>".
        hermesConfig.model = {
            ...(hermesConfig.model || {}),
            default: selectedModel,
            provider: HERMES_PROVIDER_SLUG,
            base_url: HERMES_BASE_URL,
            api_mode: 'chat_completions',
            api_key: '${ABDALGANI_API_KEY}',
        };

        // Reasoning effort is a global agent setting in Hermes (xhigh/high/medium/low/minimal/none)
        if (selectedEffort) {
            hermesConfig.agent = {
                ...(hermesConfig.agent || {}),
                reasoning_effort: selectedEffort,
            };
        }

        fs.writeFileSync(hermesConfigFile, yaml.dump(hermesConfig, { lineWidth: -1 }));
        console.log(chalk.green(t('writtenTo', hermesConfigFile)));

        // --- Write .env: key_env (ABDALGANI_API_KEY) is the variable the provider entry references ---
        let envContent = '';
        if (fs.existsSync(hermesEnvFile)) {
            envContent = fs.readFileSync(hermesEnvFile, 'utf8');
        }

        if (envContent.includes('ABDALGANI_API_KEY=')) {
            envContent = envContent.replace(/ABDALGANI_API_KEY=.*/, `ABDALGANI_API_KEY=${apiKey}`);
        } else {
            envContent = envContent.trimEnd() + `\nABDALGANI_API_KEY=${apiKey}\n`;
        }

        // Also set OPENAI_API_KEY for backward-compat with any bare provider:"custom" fallback.
        if (envContent.includes('OPENAI_API_KEY=')) {
            envContent = envContent.replace(/OPENAI_API_KEY=.*/, `OPENAI_API_KEY=${apiKey}`);
        } else {
            envContent = envContent.trimEnd() + `\nOPENAI_API_KEY=${apiKey}\n`;
        }

        fs.writeFileSync(hermesEnvFile, envContent);
        console.log(chalk.green(t('writtenTo', hermesEnvFile)));

    } else if (toolName === 'KimiCode') {
        // Kimi CLI reads ~/.kimi/config.json (NOT config.toml) — uses JSON format with pydantic validation
        const kimiDir = path.join(os.homedir(), '.kimi');
        const kimiFile = path.join(kimiDir, 'config.json');
        if (!fs.existsSync(kimiDir)) fs.mkdirSync(kimiDir, { recursive: true });

        const modelId = `abdalgani-${selectedModel.replace(/\//g, '-')}`;

        // Load existing config or start fresh
        let kimiConfig = {
            default_model: "",
            models: {},
            providers: {},
            loop_control: { max_steps_per_run: 100, max_retries_per_step: 3 },
            services: {},
        };

        if (fs.existsSync(kimiFile)) {
            try {
                const existing = JSON.parse(fs.readFileSync(kimiFile, 'utf8'));
                kimiConfig = { ...kimiConfig, ...existing };
            } catch (_) { }
        }

        // Add/update abdalgani provider
        kimiConfig.providers['abdalgani'] = {
            type: "openai_legacy",
            base_url: "https://api.abdalgani.com/v1",
            api_key: apiKey,
        };

        // Add/update model
        kimiConfig.models[modelId] = {
            provider: "abdalgani",
            model: selectedModel,
            max_context_size: 200000,
        };

        // Set as default
        kimiConfig.default_model = modelId;

        fs.writeFileSync(kimiFile, JSON.stringify(kimiConfig, null, 2));
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
        // DeepSeek TUI only supports predefined providers (deepseek, openai, nvidia_nim, etc.)
        // We use the "openai" provider with custom base_url to point to api.abdalgani.com
        const dsDir = path.join(os.homedir(), '.deepseek');
        const dsFile = path.join(dsDir, 'config.toml');
        if (!fs.existsSync(dsDir)) fs.mkdirSync(dsDir, { recursive: true });

        let dsConfig = '';
        if (fs.existsSync(dsFile)) {
            dsConfig = fs.readFileSync(dsFile, 'utf8');
        }

        // Set root-level provider and base_url
        dsConfig = dsConfig.replace(/^provider\s*=\s*"[^"]*"/m, `provider = "openai"`);
        if (!/^provider\s*=/m.test(dsConfig)) {
            dsConfig = `provider = "openai"\n` + dsConfig;
        }

        dsConfig = dsConfig.replace(/^base_url\s*=\s*"[^"]*"/m, `base_url = "https://api.abdalgani.com/v1"`);
        if (!/^base_url\s*=/m.test(dsConfig)) {
            dsConfig = dsConfig.replace(/^(provider\s*=\s*"[^"]*"\n)/m, `$1base_url = "https://api.abdalgani.com/v1"\n`);
        }

        dsConfig = dsConfig.replace(/^api_key\s*=\s*"[^"]*"/m, `api_key = "${apiKey}"`);
        if (!/^api_key\s*=/m.test(dsConfig)) {
            dsConfig = dsConfig.replace(/^(provider\s*=\s*"[^"]*"\n)/m, `$1api_key = "${apiKey}"\n`);
        }

        dsConfig = dsConfig.replace(/^default_text_model\s*=\s*"[^"]*"/m, `default_text_model = "${selectedModel}"`);
        if (!/^default_text_model\s*=/m.test(dsConfig)) {
            dsConfig = dsConfig.replace(/^(api_key\s*=\s*"[^"]*"\n)/m, `$1default_text_model = "${selectedModel}"\n`);
        }

        // Ensure [providers.openai] section exists with our base_url, api_key and model
        if (!dsConfig.includes('[providers.openai]')) {
            dsConfig = dsConfig.trimEnd() + `\n\n[providers.openai]\napi_key = "${apiKey}"\nbase_url = "https://api.abdalgani.com/v1"\nmodel = "${selectedModel}"\n`;
        } else {
            // Update existing openai provider section
            if (dsConfig.includes('[providers.openai]\n')) {
                if (!dsConfig.match(/\[providers\.openai\]\napi_key\s*=/)) {
                    dsConfig = dsConfig.replace('[providers.openai]\n', `[providers.openai]\napi_key = "${apiKey}"\n`);
                } else {
                    dsConfig = dsConfig.replace(/(\[providers\.openai\][\s\S]*?)api_key\s*=\s*"[^"]*"/, `$1api_key = "${apiKey}"`);
                }
                if (!dsConfig.match(/\[providers\.openai\][\s\S]*?base_url\s*=/)) {
                    dsConfig = dsConfig.replace('[providers.openai]\n', `[providers.openai]\nbase_url = "https://api.abdalgani.com/v1"\n`);
                } else {
                    dsConfig = dsConfig.replace(/(\[providers\.openai\][\s\S]*?)base_url\s*=\s*"[^"]*"/, `$1base_url = "https://api.abdalgani.com/v1"`);
                }
                // Set model in openai provider section to override gpt-4.1 default
                if (!dsConfig.match(/\[providers\.openai\][\s\S]*?model\s*=/)) {
                    dsConfig = dsConfig.replace('[providers.openai]\n', `[providers.openai]\nmodel = "${selectedModel}"\n`);
                } else {
                    dsConfig = dsConfig.replace(/(\[providers\.openai\][\s\S]*?)model\s*=\s*"[^"]*"/, `$1model = "${selectedModel}"`);
                }
            }
        }

        // Ensure [default] section uses openai provider
        if (!dsConfig.includes('[default]')) {
            dsConfig = dsConfig.trimEnd() + `\n\n[default]\nprovider = "openai"\nmodel = "${selectedModel}"\n`;
        } else {
            dsConfig = dsConfig.replace(/(\[default\][\s\S]*?)provider\s*=\s*"[^"]*"/, `$1provider = "openai"`);
            dsConfig = dsConfig.replace(/(\[default\][\s\S]*?)model\s*=\s*"[^"]*"/, `$1model = "${selectedModel}"`);
        }

        // Clean up old abdalgani provider references (if any from previous versions)
        dsConfig = dsConfig.replace(/\[providers\.abdalgani\][\s\S]*?(?=\n\[|$)/g, '');

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

    } else if (toolName === 'PiCode') {
        // Pi coding agent reads ~/.pi/agent/models.json (override dir via PI_CODING_AGENT_DIR).
        // Custom OpenAI-compatible provider = a keyed object: { name, baseUrl, apiKey, api, models[] }.
        // Listing models here is what makes them appear in `pi --list-models` / the /model picker.
        const piDir = process.env.PI_CODING_AGENT_DIR
            || path.join(os.homedir(), '.pi', 'agent');
        const piFile = path.join(piDir, 'models.json');
        if (!fs.existsSync(piDir)) fs.mkdirSync(piDir, { recursive: true });

        let piConfig = {};
        if (fs.existsSync(piFile)) {
            try { piConfig = JSON.parse(fs.readFileSync(piFile, 'utf8')); }
            catch (_) { console.log(chalk.yellow(t('corruptConfig'))); }
        }

        // Build the full catalog so every model shows up in the picker
        const piModels = models.map(m => ({
            id: m.value,
            name: (m.name.split('│')[0] || m.value).trim(),
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 32000,
        }));

        piConfig['abdalgani'] = {
            name: "Abdalgani Gateway",
            baseUrl: "https://api.abdalgani.com/v1",
            apiKey: apiKey,
            api: "openai-completions",
            models: piModels,
        };

        fs.writeFileSync(piFile, JSON.stringify(piConfig, null, 2));
        console.log(chalk.green(t('writtenTo', piFile)));
        console.log(chalk.gray(`💡 pi --model abdalgani/${selectedModel}`));
    }

    // === Launch Tool After Setup ===
    await launchAfterSetup(toolName, exeName, opts);
}

// ==================== CLI (non-interactive / agent mode) ====================
// Minimal flag parser: --flag, --flag=value, --flag value, -y.
function parseCli() {
    const argv = process.argv.slice(2);
    const o = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        let a = argv[i];
        if (a.startsWith('--')) {
            a = a.slice(2);
            let val = true;
            const eq = a.indexOf('=');
            if (eq >= 0) { val = a.slice(eq + 1); a = a.slice(0, eq); }
            else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { val = argv[++i]; }
            o[a] = val;
        } else if (a === '-y') { o['yes'] = true; }
        else { o._.push(a); }
    }
    return o;
}

function printHelp() {
    console.log(`Oh-My-abdalgani-code — AI coding-tool setup (provider: api.abdalgani.com)

Interactive (humans):
  node setup.js

Non-interactive (automation / AI agents) — never launches a TUI:
  node setup.js --tool <Tool> [--model <id>] [--effort <none|high|xhigh>] [--api-key <key>] [--lang en|ar]

Flags:
  --tool <Name>      Tool to configure (see --list-tools). Implies --non-interactive.
  --model <id>       Primary model id (default: ${DEFAULT_MODEL}). See --list-models.
  --effort <level>   Reasoning effort: none | high | xhigh (z.ai/OpenCode/Hermes/EHCode).
  --api-key <key>    api.abdalgani.com key. Falls back to ABDALGANI_API_KEY env, then saved config.
  --lang <en|ar>     UI language (default: en).
  --non-interactive  Headless mode (also implied by --tool).
  --list-tools       Print supported tool names, then exit.
  --list-models      Print known + live gateway model ids, then exit.
  --help             Show this help.

Examples:
  node setup.js --tool Hermes  --model nvidia/glm-4.7 --effort xhigh --api-key sk-xxx
  node setup.js --tool EHCode  --model zai/glm-5.2    --effort xhigh
  node setup.js --tool OpenCode --effort high
  node setup.js --list-models`);
}

// ==================== Main ====================
async function main() {
    const cli = parseCli();

    if (cli.help || cli.h) { printHelp(); return; }
    if (cli['list-tools']) { console.log(Object.keys(TOOL_INSTALL_MAP).join('\n')); return; }

    const headless = !!cli.tool || cli['non-interactive'] === true || cli.yes === true;

    if (headless || cli['list-models']) {
        lang = cli.lang === 'ar' ? 'ar' : 'en';
        const apiKey = (typeof cli['api-key'] === 'string' ? cli['api-key'] : null) || process.env.ABDALGANI_API_KEY || findExistingApiKey();

        if (cli['list-models']) {
            if (apiKey) {
                try {
                    const res = await fetch('https://api.abdalgani.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
                    if (res.ok) { const d = await res.json(); (d.data || []).forEach(m => { if (!models.find(x => x.value === m.id)) models.push({ value: m.id, name: m.id }); }); }
                } catch (_) { /* offline: print the static list */ }
            }
            console.log(models.map(m => m.value).join('\n'));
            return;
        }

        ensureNodeNpm();
        if (!cli.tool || cli.tool === true) {
            console.error('Non-interactive mode requires --tool <Name>. See --list-tools or --help.');
            process.exit(1);
        }
        if (!TOOL_INSTALL_MAP[cli.tool]) {
            console.error(`Unknown tool: "${cli.tool}". See --list-tools.`);
            process.exit(1);
        }
        await configureTool(cli.tool, {
            nonInteractive: true,
            model: typeof cli.model === 'string' ? cli.model : undefined,
            effort: typeof cli.effort === 'string' ? cli.effort : undefined,
            apiKey: typeof cli['api-key'] === 'string' ? cli['api-key'] : undefined,
        });
        console.log(chalk.green('✅ Done (non-interactive).'));
        return;
    }

    // ===== Interactive =====
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
                { name: t('picode'), value: 'PiCode' },
                { name: t('ehcode'), value: 'EHCode' },
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
