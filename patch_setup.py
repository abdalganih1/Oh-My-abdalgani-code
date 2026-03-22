import re
import os

file_path = r'c:\Users\Abdalgani\Desktop\myapp\Antygravity\Oh-My-abdalgani-code\setup.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update i18n ar
content = content.replace(
    "claudecode: '��� ClaudeCode',",
    "claudecode: '��� ClaudeCode',\n        openclaw: '��� OpenClaw',"
)

# 2. Update exeName check
content = content.replace(
    "if (toolName === 'ClaudeCode') exeName = 'claude';\n    if (toolName === 'KiloCLI') exeName = 'kilo';",
    "if (toolName === 'ClaudeCode') exeName = 'claude';\n    if (toolName === 'KiloCLI') exeName = 'kilo';\n    if (toolName === 'OpenClaw') exeName = 'openclaw';"
)

# 3. Add to choices in select tool
content = content.replace(
    "{ name: t('claudecode'), value: 'ClaudeCode' },",
    "{ name: t('claudecode'), value: 'ClaudeCode' },\n                { name: t('openclaw'), value: 'OpenClaw' },"
)

# 4. We need the providerModels block outside the if so we can reuse it, or just copy it into openclaw setup.
# Actually, the quickest way to reuse providerModels is to move it before the if.
# Find where it starts and ends
start_tag = "const providerModels = {"
end_tag = "};\n\n        // أضف/حدّث مزود"

start_idx = content.find(start_tag)
end_idx = content.find(end_tag) + 2

provider_models_code = content[start_idx:end_idx]

# Replace the original provider_models_code from its current place with nothing
content = content.replace("        // بناء نماذج المزود مع limit الصحيح لكل نموذج\n        " + provider_models_code, "")

# Now insert it right after console.log(chalk.yellow(t('applying')));
content = content.replace(
    "console.log(chalk.yellow(t('applying')));\n",
    "console.log(chalk.yellow(t('applying')));\n\n    " + provider_models_code + "\n"
)

# 5. Add OpenClaw block
openclaw_block = """
    } else if (toolName === 'OpenClaw') {
        const clawDir = path.join(os.homedir(), '.openclaw');
        const clawFile = path.join(clawDir, 'openclaw.json');

        if (!fs.existsSync(clawDir)) fs.mkdirSync(clawDir, { recursive: true });

        let clawConfig = {};
        if (fs.existsSync(clawFile)) {
            try { clawConfig = JSON.parse(fs.readFileSync(clawFile, 'utf8')); }
            catch (_) { clawConfig = {}; }
        }

        if (!clawConfig.models) clawConfig.models = {};
        if (!clawConfig.models.providers) clawConfig.models.providers = {};

        const clawModelsList = [];
        const allowedModels = {};
        for (const [key, val] of Object.entries(providerModels)) {
            clawModelsList.push({
                id: key,
                name: val.name.split(' \\u2502')[0].strip() if ' \\u2502' in val.name else val.name,
                reasoning: false,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: val.limit.context,
                maxTokens: val.limit.output
            });
            allowedModels[`litellm/${key}`] = {};
        }

        clawConfig.models.providers["litellm"] = {
            baseUrl: "https://api.abdalgani.com/v1",
            apiKey: apiKey,
            auth: "api-key",
            api: "openai-completions",
            authHeader: true,
            models: clawModelsList
        };

        if (!clawConfig.auth) clawConfig.auth = {};
        if (!clawConfig.auth.profiles) clawConfig.auth.profiles = {};
        clawConfig.auth.profiles["litellm:default"] = {
            provider: "litellm",
            mode: "api_key"
        };

        if (!clawConfig.agents) clawConfig.agents = {};
        if (!clawConfig.agents.defaults) clawConfig.agents.defaults = {};
        if (!clawConfig.agents.defaults.model) clawConfig.agents.defaults.model = {};

        clawConfig.agents.defaults.model.primary = `litellm/${selectedModel}`;
        clawConfig.agents.defaults.model.fallbacks = [`abdalgani/${selectedModel}`];

        if (!clawConfig.agents.defaults.models) clawConfig.agents.defaults.models = {};
        clawConfig.agents.defaults.models = { ...clawConfig.agents.defaults.models, ...allowedModels };

        fs.writeFileSync(clawFile, JSON.stringify(clawConfig, null, 2));
        console.log(chalk.green(t('writtenTo', clawFile)));

        const cacheFile = path.join(clawDir, 'agents', 'main', 'agent', 'models.json');
        if (fs.existsSync(cacheFile)) {
            try { fs.unlinkSync(cacheFile); } catch(e) {}
        }

        console.log(chalk.cyan('Restarting openclaw-gateway...'));
        runCommand("systemctl --user restart openclaw-gateway");
"""

content = content.replace(
    "console.log(chalk.gray(t('apiKeyRemoved')));\n    }",
    "console.log(chalk.gray(t('apiKeyRemoved')));\n    }" + openclaw_block
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied")
