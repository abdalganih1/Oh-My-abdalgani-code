import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const models = [
  { value: "glm-5", name: "GLM-5 (NanoGPT) | Context: 202,752 | Output: 131,072" },
  { value: "glm-5:thinking", name: "GLM-5 Thinking | Context: 202,752 | Output: 131,072" },
  { value: "glm-4.7", name: "GLM-4.7 | Context: 205,000 | Output: 128,000" },
  { value: "glm-4.7:thinking", name: "GLM-4.7 Thinking | Context: 205,000 | Output: 128,000" },
  { value: "glm-4.7-flash", name: "GLM-4.7 Flash | Context: 202,752 | Output: 131,072" },
  { value: "kimi-k2.5", name: "Kimi K2.5 | Context: 262,144 | Output: 65,535" },
  { value: "kimi-k2.5:thinking", name: "Kimi K2.5 Thinking | Context: 262,144 | Output: 65,535" },
  { value: "minimax-m2.5", name: "MiniMax M2.5 | Context: 196,608 | Output: 196,608" },
  { value: "deepseek-v3.2", name: "DeepSeek V3.2 (NanoGPT) | Context: 131,072 | Output: 32,768" },
  { value: "nvidia/glm-5", name: "GLM-5 (NVIDIA) | Context: 131,072 | Output: 16,384" },
  { value: "nvidia/nemotron-ultra-253b", name: "Nemotron Ultra 253B | Context: 131,072 | Output: 16,384" },
  { value: "nvidia/qwen3.5-397b", name: "Qwen 3.5 397B | Context: 262,144 | Output: 81,920" },
  { value: "nvidia/qwen3-coder-480b", name: "Qwen3 Coder 480B | Context: 262,144 | Output: 81,920" },
  { value: "nvidia/deepseek-r1", name: "DeepSeek R1 | Context: 163,840 | Output: 32,768" },
  { value: "nvidia/gpt-oss-120b", name: "GPT-OSS 120B | Context: 128,000 | Output: 16,384" },
  { value: "glm-5:cloud", name: "GLM-5 Cloud (Ollama) | Context: 202,752 | Output: 131,072" }
];

async function runCommand(command, errorMessage) {
    try {
        execSync(command, { stdio: 'inherit' });
        return true;
    } catch (e) {
        console.error(chalk.red(errorMessage || `فشل التنفيذ: ${command}`));
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

async function configureTool(toolName) {
    console.log(chalk.cyan(`\n=== ⚙️ إعداد ${toolName} ===`));
    
    let exeName = toolName.toLowerCase();
    if (toolName === 'ClaudeCode') exeName = 'claude';
    if (toolName === 'KiloCLI') exeName = 'kilocli';

    const isInstalled = checkInstalled(exeName);
    if (!isInstalled) {
        const install = await confirm({ message: `أداة ${toolName} غير مثبتة في النظام. هل تريد تثبيتها الآن عبر npm؟` });
        if (install) {
            console.log(chalk.yellow(`جاري تثبيت ${toolName}...`));
            const success = await runCommand(`npm install -g ${exeName}`, `فشل في تثبيت ${toolName}`);
            if (!success) return;
        } else {
            console.log(chalk.red(`تم تخطي إعداد ${toolName} بطلب منك.`));
            return;
        }
    } else {
        console.log(chalk.green(`✔️ أداة ${toolName} مثبتة مسبقاً وجاهزة للإعداد.`));
    }

    const apiKey = await input({ message: '⌨️ أدخل مفتاح الـ API الخاص بـ abdalgani.com:' });
    
    const selectedModel = await select({
        message: 'اختر النموذج (Model) الافتراضي (استخدم الأسهم أعلى/أسفل للتنقل):',
        choices: models,
        pageSize: 15
    });

    console.log(chalk.yellow('🔄 جاري تطبيق الإعدادات ودمجها بسلاسة...'));

    if (toolName === 'OpenCode' || toolName === 'KiloCLI') {
        const configDir = path.join(os.homedir(), `.${exeName}`);
        const configFile = path.join(configDir, 'config.json');
        
        if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
        
        let config = {};
        if (fs.existsSync(configFile)) {
            try {
                config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            } catch(e) { 
                console.log(chalk.red("تعذر قراءة ملف الإعدادات القديم، سيتم إنشاء واحد جديد."));
            }
        }

        config.default_model = selectedModel;
        
        if (!config.custom_providers) config.custom_providers = [];
        
        const existingProviderIndex = config.custom_providers.findIndex(p => p.name === 'abdalgani' || p.url?.includes('abdalgani.com'));
        
        const newProvider = {
            name: 'abdalgani',
            url: "https://api.abdalgani.com/v1",
            apiKey: apiKey,
            type: "@ai-sdk/openai-compatible",
            models: models.map(m => m.value)
        };

        if (existingProviderIndex !== -1) {
            config.custom_providers[existingProviderIndex] = { ...config.custom_providers[existingProviderIndex], ...newProvider };
        } else {
            config.custom_providers.push(newProvider);
        }

        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        console.log(chalk.green(`✅ تم تحديث ${configFile} بنجاح عبَر إضافة/تحديث مزود abdalgani دون مسح المزودين القدامى!`));
    } else if (toolName === 'ClaudeCode') {
        console.log(chalk.green('\n✅ لربط ClaudeCode، يجب تصدير المتغيرات البيئية لاستخدام حزمة @ai-sdk/openai-compatible.'));
        console.log(chalk.cyan(`الرجاء تنفيذ الأوامر التالية في الطرفية الخاصة بك لجعل المزود يعمل:\n`));
        console.log(chalk.white(`export CLAUDE_API_BASE="https://api.abdalgani.com/v1"`));
        console.log(chalk.white(`export CLAUDE_API_KEY="${apiKey}"`));
        console.log(chalk.white(`export CLAUDE_MODEL="${selectedModel}"\n`));
        console.log(chalk.gray(`ملاحظة: يمكنك إضافتها إلى .bashrc أو .zshrc لتكون دائمة.`));
    }
}

async function main() {
    console.clear();
    console.log(chalk.cyan.bold('===================================================='));
    console.log(chalk.cyan.bold('      🚀 Oh-My-abdalgani-code Setup Tool 🚀'));
    console.log(chalk.cyan.bold('====================================================\n'));

    let running = true;
    while (running) {
        const targetTool = await select({
            message: 'أي أداة تريد إعدادها مع مزود api.abdalgani.com؟',
            choices: [
                { name: '💻 OpenCode', value: 'OpenCode' },
                { name: '⌨️  KiloCLI', value: 'KiloCLI' },
                { name: '🤖 ClaudeCode', value: 'ClaudeCode' },
                { name: '❌ إنهاء البرنامج', value: 'exit' }
            ]
        });

        if (targetTool === 'exit') {
            console.log(chalk.yellow('إلى اللقاء! 👋'));
            running = false;
            break;
        }

        await configureTool(targetTool);
        
        console.log("");
        running = await confirm({ message: 'هل تريد إعداد أداة أخرى؟', default: false });
    }
    console.log(chalk.green('\n🎉 انتهى الإعداد. تم تحسين بيئتك بنجاح!'));
}

main().catch(e => {
    if (e.name === 'ExitPromptError') {
        console.log(chalk.yellow('\nتم إلغاء العملية. إلى اللقاء! 👋'));
    } else {
        console.error(chalk.red('حدث خطأ غير متوقع:'), e);
    }
    process.exit(1);
});
