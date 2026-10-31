// Generated install commands / snippets — byte-for-byte the same text as the legacy dashboard.
import { toolKey } from './ctx.js';

export const TOOLS = ['OpenCode', 'Hermes', 'ClaudeCode', 'CodexCLI', 'KiloCLI', 'PiCode', 'QwenCode', 'Goose', 'Aider', 'OpenClaw', 'KimiCode', 'EHCode'];
export const SETUP_PREF = 'abd:stuSetup';

export function buildSetup(base, tool, os) {
  const key = toolKey();
  const win = os === 'win';
  return {
    key,
    install: win
      ? `$env:ABDALGANI_API_KEY="${key}"; irm ${base}/install.ps1 | iex; abdalgani-setup --tool ${tool}`
      : `curl -fsSL ${base}/install.sh | bash -s -- --tool ${tool} --api-key ${key}`,
    helper: `abdalgani-setup --status     # رصيدك + النموذج الحقيقي ورا كل اسم\nabdalgani-setup --sync       # حدّث أسماء النماذج داخل أدواتك بعد التبديل\nabdalgani-setup              # إضافة أداة جديدة`,
    openai: `Base URL : ${base}/v1\nAPI Key  : ${key}\nModel    : abd-main   (or any id from the Models tab)\n\ncurl ${base}/v1/chat/completions \\\n  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\\n  -d '{"model":"abd-main","messages":[{"role":"user","content":"hello"}]}'`,
    anthropic: `export ANTHROPIC_BASE_URL=${base}\nexport ANTHROPIC_AUTH_TOKEN=${key}\nexport ANTHROPIC_MODEL=abd-main\nexport ANTHROPIC_DEFAULT_HAIKU_MODEL=abd-fast\nclaude`,
  };
}
