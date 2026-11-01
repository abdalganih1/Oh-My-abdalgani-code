// Shared CLI helpers: constants, language, files, key storage, shell env.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import chalk from 'chalk';
import { displayLine, isRtl } from './bidi.js';

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
/**
 * How this terminal shows Arabic, picked on the first screen (the user clicks the "العربية" that
 * reads right): 'native' = the terminal reorders + joins Arabic itself; 'flip' = it prints left-to-right,
 * so we hand it text that is already reordered and joined (and OpenCode gets its display plugin).
 */
let rtl = 'flip';
export const RTL_MODES = ['native', 'flip'];
export const setRtl = (m) => { if (RTL_MODES.includes(m)) rtl = m; };
export const getRtl = () => rtl;

/** Arabic text → what a left-to-right terminal must print, wrapped first so long lines still read top-down. */
export function flipText(text, width = (process.stdout.columns || 80) - 6) {
  return String(text).split('\n').map((line) => {
    if (![...line].some((ch) => isRtl(ch.codePointAt(0)))) return line;
    const rows = [];
    let cur = '';
    for (const word of line.split(' ')) {
      if (cur && [...cur].length + 1 + [...word].length > width) { rows.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word;
    }
    rows.push(cur);
    return rows.map((r) => displayLine(r)).join('\n');
  }).join('\n');
}

/** tr('عربي', 'English') */
export const tr = (ar, en) => (lang === 'en' ? en : rtl === 'flip' ? flipText(ar) : ar);

let quiet = false;
export const setQuiet = (q) => { quiet = !!q; };
export const isQuiet = () => quiet;
const out = (fn) => (m) => { if (!quiet) console.log(fn(m)); };
export const log = {
  info: out(chalk.cyan),
  ok: out(chalk.green),
  warn: out(chalk.yellow),
  err: (m) => console.log(chalk.red(m)),
  dim: out(chalk.gray),
  wrote: (f) => { if (!quiet) console.log(chalk.green(`✅ ${tr('تم الكتابة', 'Written')}: ${f}`)); },
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

export function writeText(file, text, { backup = true } = {}) {
  ensureDir(path.dirname(file));
  if (backup) backupOnce(file);
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
export function loadState() {
  try { return JSON.parse(fs.readFileSync(G_CONFIG, 'utf8')); } catch { return {}; }
}
export function saveState(patch) {
  fs.writeFileSync(G_CONFIG, JSON.stringify({ ...loadState(), ...patch, baseUrl: BASE_URL }, null, 2));
  try { fs.chmodSync(G_CONFIG, 0o600); } catch { /* windows */ }
}
export const saveKey = (apiKey) => saveState({ apiKey });

/**
 * This machine's gateway identity: a random ID created once per install (stored in
 * ~/.abdalgani-code.json) + a readable name. No hardware identifiers are read or sent —
 * the student sees the same name in their dashboard ("my devices").
 */
export function deviceHeaders() {
  const s = loadState();
  let id = s.deviceId;
  if (!id || !/^[A-Za-z0-9_-]{16,80}$/.test(id)) {
    id = crypto.randomUUID().replace(/-/g, '');
    saveState({ deviceId: id });
  }
  const name = `${os.hostname()} (${process.platform})`.replace(/[^\p{L}\p{N} ._()@-]/gu, '').slice(0, 80);
  return { 'X-Abd-Device': id, 'X-Abd-Device-Name': name };
}
/** Remember how each tool was configured so `--sync` can refresh it later. */
export function rememberTool(tool, opts) {
  const s = loadState();
  saveState({ tools: { ...(s.tools || {}), [tool]: opts } });
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
