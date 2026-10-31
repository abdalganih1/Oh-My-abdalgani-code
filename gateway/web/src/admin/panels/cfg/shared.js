// Shared bits for the providers / models / settings panels.
export const M = 1e6;
export const ID_RE = /^[a-z0-9][a-z0-9._:/-]{0,80}$/i;

// Well-known OpenAI-compatible endpoints. "custom" = any URL the admin pastes.
export const PRESETS = [
  { id: 'custom', name: 'مزوّد مخصص — أي رابط', openai: '' },
  { id: 'openrouter', name: 'OpenRouter', openai: 'https://openrouter.ai/api/v1' },
  { id: 'openai', name: 'OpenAI', openai: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic', openai: '', anthropic: 'https://api.anthropic.com', auth: 'x-api-key' },
  { id: 'zai', name: 'Z.AI Coding Plan', openai: 'https://api.z.ai/api/coding/paas/v4', anthropic: 'https://api.z.ai/api/anthropic', billing: 'subscription' },
  { id: 'deepseek', name: 'DeepSeek', openai: 'https://api.deepseek.com/v1', anthropic: 'https://api.deepseek.com/anthropic' },
  { id: 'moonshot', name: 'Moonshot (Kimi)', openai: 'https://api.moonshot.ai/v1', anthropic: 'https://api.moonshot.ai/anthropic' },
  { id: 'minimax', name: 'MiniMax', openai: 'https://api.minimax.io/v1', anthropic: 'https://api.minimax.io/anthropic' },
  { id: 'qwen', name: 'Qwen (DashScope International)', openai: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
  { id: 'gemini', name: 'Google Gemini (OpenAI-compatible)', openai: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'xai', name: 'xAI (Grok)', openai: 'https://api.x.ai/v1' },
  { id: 'mistral', name: 'Mistral', openai: 'https://api.mistral.ai/v1' },
  { id: 'groq', name: 'Groq', openai: 'https://api.groq.com/openai/v1' },
  { id: 'cerebras', name: 'Cerebras', openai: 'https://api.cerebras.ai/v1' },
  { id: 'together', name: 'Together AI', openai: 'https://api.together.xyz/v1' },
  { id: 'fireworks', name: 'Fireworks AI', openai: 'https://api.fireworks.ai/inference/v1' },
  { id: 'deepinfra', name: 'DeepInfra', openai: 'https://api.deepinfra.com/v1/openai' },
  { id: 'huggingface', name: 'Hugging Face Router', openai: 'https://router.huggingface.co/v1' },
  { id: 'nvidia', name: 'NVIDIA NIM', openai: 'https://integrate.api.nvidia.com/v1' },
  { id: 'nous', name: 'Nous Portal', openai: 'https://inference-api.nousresearch.com/v1' },
  { id: 'opencode-zen', name: 'OpenCode Zen', openai: 'https://opencode.ai/zen/v1' },
];

export const provState = (p) => (p.archived_at ? 'archived' : !p.enabled ? 'off' : 'on');
export const byPriority = (a, b) => (a.priority ?? 50) - (b.priority ?? 50) || a.id.localeCompare(b.id);
export const sortProviders = (list) => [...(list || [])].sort(byPriority);
export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
/** micro-USD → dollar input string ('' for 0/null). */
export const toDollars = (v) => (v ? String(+(v / M).toFixed(6)) : '');
export const toMicro = (v) => Math.round((+v || 0) * M);
export const hostOf = (u) => String(u || '').replace(/^https:\/\//, '');
/** Props that stop browsers / password managers from autofilling the admin login into a field. */
export const NO_AUTOFILL = { autoComplete: 'off', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other' };
/** Visually masks a plain text input (no type=password → no "save password" prompt, no autofill). */
export const SECRET_STYLE = { WebkitTextSecurity: 'disc', textSecurity: 'disc' };
