import { configureOpenCode, configureKilo, configureEHCode } from './opencode.js';
import { configureClaude } from './claude.js';
import { configureHermes } from './hermes.js';
import { configureCodex } from './codex.js';
import { configurePi, configureQwen, configureGoose, configureAider, configureOpenClaw, configureKimi } from './others.js';

/** name → { label, configure, effort (asks reasoning effort), recommended } */
export const TOOLS = {
  OpenCode: { label: 'OpenCode (V2)', configure: configureOpenCode, effort: true, recommended: true },
  ClaudeCode: { label: 'Claude Code', configure: configureClaude, recommended: true },
  Hermes: { label: 'Hermes Agent', configure: configureHermes, effort: true, recommended: true },
  CodexCLI: { label: 'OpenAI Codex CLI', configure: configureCodex, effort: true },
  KiloCLI: { label: 'Kilo CLI', configure: configureKilo, effort: true },
  PiCode: { label: 'Pi coding agent', configure: configurePi },
  QwenCode: { label: 'Qwen Code', configure: configureQwen },
  Goose: { label: 'Goose', configure: configureGoose },
  Aider: { label: 'Aider', configure: configureAider },
  OpenClaw: { label: 'OpenClaw', configure: configureOpenClaw },
  KimiCode: { label: 'Kimi Code', configure: configureKimi },
  EHCode: { label: 'EH Code (Windows · legacy — OpenCode + Arabic pack replaces it)', configure: configureEHCode, effort: true },
};
