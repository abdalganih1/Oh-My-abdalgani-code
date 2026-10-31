// Shared CLI helpers: constants, language, files, key storage, shell env.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';

export const isWin = os.platform() === 'win32';
export const HOME = os.homedir();
export const BASE_URL = (process.env.ABDALGANI_BASE_URL || 'https://api.abdalgani.com').replace(/\/+$/, '');
export const API_URL = `${BASE_URL}/v1`;
export const PROVIDER_ID = 'abdalgani';
export const KEY_ENV = 'ABDALGANI_API_KEY';
/** Stable names every tool is configured with; students re-map them from the dashboard. */
export const ALIASES = { main: 'abd-main', fast: 'abd-fast', think: 'abd-think' };

// ── language ──
let lang = 'ar';
export const setLang = (l) => { lang = l === 'en' ? 'en' : 'ar'; };
export const getLang = () => lang;
/** tr('عربي', 'English') */
export const tr = (ar, en) => (lang === 'en' ? en : ar);

export const log = {
  info: (m) => console.log(chalk.cyan(m)),
  ok: (m) => console.log(chalk.green(m)),
  warn: (m) => console.log(chalk.yellow(m)),
  err: (m) => console.log(chalk.red(m)),
  dim: (m) => console.log(chalk.gray(m)),
  wrote: (f) => console.log(chalk.green(`✅ ${tr('تم الكتابة', 'Written')}: ${f}`)),
};

// ── files ──
export function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

export function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return structuredClone(fallback);
  try {
    // tolerate BOM + JSONC comments / trailing commas
    const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    try { return JSON.parse(raw); } catch {
      const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(stripped);
    }
  } catch {
    const bak = `${file}.bak-${Date.now()}`;
    fs.copyFileSync(file, bak);
    log.warn(`⚠️ ${tr('ملف إعداد تالف — أخذت نسخة احتياطية', 'Corrupt config — backed up to')} ${bak}`);
    return structuredClone(fallback);
  }
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  backupOnce(file);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  log.wrote(file);
}

export function writeText(file, text) {
  ensureDir(path.dirname(file));
  backupOnce(file);
  fs.writeFileSync(file, text);
  log.wrote(file);
}

/** Keep one pristine backup (the state before abdalgani first touched the file). */
function backupOnce(file) {
  const bak = `${file}.abdalgani.bak`;
  if (fs.existsSync(file) && !fs.existsSync(bak)) fs.copyFileSync(file, bak);
}

// ── saved key (~/.abdalgani-code.json) ──
const G_CONFIG = path.join(HOME, '.abdalgani-code.json');
export function savedKey() {
  try { return JSON.parse(fs.readFileSync(G_CONFIG, 'utf8')).apiKey || null; } catch { return null; }
}
export function saveKey(apiKey) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(G_CONFIG, 'utf8')); } catch { /* new */ }
  fs.writeFileSync(G_CONFIG, JSON.stringify({ ...data, apiKey, baseUrl: BASE_URL }, null, 2));
  try { fs.chmodSync(G_CONFIG, 0o600); } catch { /* windows */ }
}

// ── processes ──
export function which(cmd) {
  try {
    const out = execSync(isWin ? `where ${cmd}` : `command -v ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'], shell: isWin ? undefined : '/bin/sh' }).toString().trim();
    if (out) return out.split(/\r?\n/)[0];
  } catch { /* not on PATH */ }
  const extra = isWin
    ? [path.join(HOME, '.local', 'bin', `${cmd}.exe`), path.join(process.env.LOCALAPPDATA || '', 'EHCode', `${cmd}.exe`)]
    : [path.join(HOME, '.local', 'bin', cmd), path.join(HOME, '.opencode', 'bin', cmd), path.join(HOME, '.cargo', 'bin', cmd), path.join(HOME, '.claude', 'local', cmd)];
  return extra.find((p) => p && fs.existsSync(p)) || null;
}

export function run(cmd, { silent = false } = {}) {
  try {
    const out = execSync(cmd, { stdio: silent ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' });
    return { ok: true, out: (out || '').trim() };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}`.trim() };
  }
}

/** Persist an environment variable for future shells (setx on Windows, rc files elsewhere). */
export function persistEnv(name, value) {
  process.env[name] = value;
  if (isWin) {
    const r = run(`setx ${name} "${value}"`, { silent: true });
    if (r.ok) log.ok(`✅ ${name} ${tr('محفوظ بمتغيرات المستخدم (افتح طرفية جديدة)', 'saved to user env (open a new terminal)')}`);
    else log.warn(`⚠️ setx failed — set ${name} manually`);
    return;
  }
  const line = `export ${name}="${value}"`;
  const rcs = ['.bashrc', '.zshrc', '.profile'].map((f) => path.join(HOME, f));
  const targets = rcs.filter((f) => fs.existsSync(f));
  if (!targets.length) targets.push(rcs[0]);
  for (const rc of targets) {
    let content = fs.existsSync(rc) ? fs.readFileSync(rc, 'utf8') : '';
    const re = new RegExp(`^export ${name}=.*$`, 'm');
    content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
    fs.writeFileSync(rc, content);
  }
  log.ok(`✅ ${name} → ${targets.map((t) => path.basename(t)).join(', ')} ${tr('(افتح طرفية جديدة أو source)', '(open a new terminal or source it)')}`);
}
