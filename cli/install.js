// Installing the coding tools themselves (official installers first, npm as fallback).
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { isWin, HOME, which, run, log, tr, ensureDir } from './core.js';

// EH Code (OpenCode fork, Windows exe) — hosted on Cloudflare R2, same key on every update.
export const EHCODE_DOWNLOAD_URL = process.env.EHCODE_DOWNLOAD_URL || 'https://pub-f2c0b43b09ea4983a05bdb7998fafdf3.r2.dev/ehcode/ehcode.exe';

const ps = (cmd) => `powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd}"`;

/** Install recipes, verified against each project's docs (Oct 2026). Order = preference. */
export const INSTALL = {
  OpenCode: {
    exe: 'opencode',
    // OpenCode V2: new installer + npm package (@opencode/cli). V1 was `opencode-ai`.
    methods: isWin
      ? [['npm', 'npm install -g @opencode/cli']]
      : [['curl', 'curl -fsSL https://opencode.ai/v2/install | bash'], ['npm', 'npm install -g @opencode/cli'], ['brew', 'brew install anomalyco/tap/opencode-v2']],
    manual: isWin ? 'npm install -g @opencode/cli' : 'curl -fsSL https://opencode.ai/v2/install | bash',
  },
  ClaudeCode: {
    exe: 'claude',
    methods: isWin
      ? [['PowerShell', ps('irm https://claude.ai/install.ps1 | iex')], ['winget', 'winget install Anthropic.ClaudeCode -e --silent']]
      : [['curl', 'curl -fsSL https://claude.ai/install.sh | bash'], ['brew', 'brew install --cask claude-code']],
    manual: isWin ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash',
  },
  Hermes: {
    exe: 'hermes',
    methods: isWin
      ? [['PowerShell', ps('iex (irm https://hermes-agent.nousresearch.com/install.ps1)')]]
      : [['curl', 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup']],
    manual: isWin ? 'iex (irm https://hermes-agent.nousresearch.com/install.ps1)' : 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
  },
  CodexCLI: { exe: 'codex', methods: [['npm', 'npm install -g @openai/codex']], manual: 'npm install -g @openai/codex' },
  KiloCLI: { exe: 'kilo', methods: [['npm', 'npm install -g @kilocode/cli']], manual: 'npm install -g @kilocode/cli' },
  PiCode: { exe: 'pi', methods: [['npm', 'npm install -g @mariozechner/pi-coding-agent']], manual: 'npm install -g @mariozechner/pi-coding-agent' },
  QwenCode: { exe: 'qwen', methods: [['npm', 'npm install -g @qwen-code/qwen-code@latest']], manual: 'npm install -g @qwen-code/qwen-code@latest' },
  Goose: {
    exe: 'goose',
    methods: isWin
      ? [['PowerShell', ps('irm https://raw.githubusercontent.com/block/goose/main/download/install.ps1 | iex')]]
      : [['curl', 'curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash'], ['brew', 'brew install block-goose-cli']],
    manual: 'https://block.github.io/goose/docs/getting-started/installation',
  },
  Aider: { exe: 'aider', methods: [['uv', 'uv tool install --force --python python3.12 aider-chat@latest'], ['pipx', 'pipx install aider-chat'], ['pip', 'python -m pip install -U aider-chat']], manual: 'pipx install aider-chat' },
  OpenClaw: {
    exe: 'openclaw',
    methods: isWin
      ? [['PowerShell', ps('irm https://openclaw.ai/install.ps1 | iex')], ['npm', 'npm install -g openclaw@latest']]
      : [['curl', 'curl -fsSL https://openclaw.ai/install.sh | bash'], ['npm', 'npm install -g openclaw@latest']],
    manual: 'npm install -g openclaw@latest',
  },
  KimiCode: {
    exe: 'kimi',
    methods: isWin
      ? [['PowerShell', ps('Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression')]]
      : [['curl', 'curl -LsSf https://code.kimi.com/install.sh | bash']],
    manual: 'curl -LsSf https://code.kimi.com/install.sh | bash',
  },
  EHCode: { exe: 'ehcode', methods: [], manual: `Download ${EHCODE_DOWNLOAD_URL}` },
};

/** Returns 1 / 2 / null (not installed) — OpenCode V2 changed the config schema. */
export function opencodeMajor() {
  const exe = which('opencode');
  if (!exe) return null;
  const r = run(`"${exe}" --version`, { silent: true });
  const m = r.out.match(/(\d+)\.\d+\.\d+/);
  return m ? Number(m[1]) : 1;
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
}

async function installEHCode() {
  if (!isWin) { log.err('❌ EH Code is a Windows-only build.'); return false; }
  const dir = path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'EHCode');
  ensureDir(dir);
  const exe = path.join(dir, 'ehcode.exe');
  log.info(`⬇️ EH Code (~150MB) ← ${EHCODE_DOWNLOAD_URL}`);
  try { await downloadFile(EHCODE_DOWNLOAD_URL, exe); } catch (e) { log.err(`❌ ${e.message}`); fs.rmSync(exe, { force: true }); return false; }
  run(ps("$t=Join-Path $env:LOCALAPPDATA 'EHCode'; $p=[Environment]::GetEnvironmentVariable('Path','User'); $k=(($p -split ';') | Where-Object { $_ -and ($_ -ne $t) }); [Environment]::SetEnvironmentVariable('Path', (($k -join ';')+';'+$t),'User')"), { silent: true });
  log.ok(`✅ ${exe} (${tr('افتح طرفية جديدة لاستخدام ehcode', 'open a new terminal to use ehcode')})`);
  return true;
}

export async function installTool(tool) {
  const spec = INSTALL[tool];
  if (!spec) return false;
  if (tool === 'EHCode') return installEHCode();
  for (const [label, cmd] of spec.methods) {
    log.info(`📦 ${tr('تثبيت', 'Installing')} ${tool} (${label}) …`);
    if (run(cmd).ok && which(spec.exe)) { log.ok(`✅ ${tool} ${tr('جاهز', 'installed')}`); return true; }
    log.warn(`⚠️ ${label} ${tr('فشل، أجرّب الطريقة التالية', 'failed, trying next method')}`);
  }
  log.err(`❌ ${tr('فشل التثبيت التلقائي. ثبّت يدوياً:', 'Automatic install failed. Install manually:')}\n   ${spec.manual}`);
  return false;
}
