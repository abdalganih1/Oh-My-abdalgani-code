// Background auto-sync on the student's machine: new / archived models show up in their tools
// without them doing anything. Windows → Task Scheduler (hidden, every 6h + at logon);
// Linux / macOS → user crontab (every 6h + @reboot). `--sync --quiet` only rewrites configs
// when the catalog actually changed.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isWin, run, log, tr, ensureDir } from './core.js';
import { binDir } from './arabic.js';

const TASK = 'abdalgani-sync';
const MARK = '# abdalgani-sync';
const SETUP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'setup.js');

export function syncCommand() { return [process.execPath, SETUP, '--sync', '--quiet']; }

/** crontab text with our lines replaced (pure → tested). */
export function withCronLines(current, enable, cmd = syncCommand()) {
  const kept = String(current || '').split('\n').filter((l) => l.trim() && !l.includes(MARK));
  if (enable) {
    const c = cmd.map((x) => `"${x}"`).join(' ');
    kept.push(`23 */6 * * * ${c} >/dev/null 2>&1 ${MARK}`, `@reboot sleep 90 && ${c} >/dev/null 2>&1 ${MARK}`);
  }
  return kept.length ? `${kept.join('\n')}\n` : '';
}

/** systemd user units (pure → tested) for distros without cron (Arch, Fedora, …). */
export function systemdUnits(cmd = syncCommand()) {
  const exec = cmd.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ');
  return {
    service: `[Unit]\nDescription=abdalgani: refresh AI tool model lists\n\n[Service]\nType=oneshot\nExecStart=${exec}\n`,
    timer: `[Unit]\nDescription=abdalgani: refresh AI tool model lists every 6h\n\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=6h\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`,
  };
}

function systemdTimer(enable) {
  if (!run('systemctl --user show-environment', { silent: true }).ok) return false;
  const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '', '.config'), 'systemd', 'user');
  if (!enable) {
    run(`systemctl --user disable --now ${TASK}.timer`, { silent: true });
    for (const f of [`${TASK}.service`, `${TASK}.timer`]) fs.rmSync(path.join(dir, f), { force: true });
    return true;
  }
  ensureDir(dir);
  const u = systemdUnits();
  fs.writeFileSync(path.join(dir, `${TASK}.service`), u.service);
  fs.writeFileSync(path.join(dir, `${TASK}.timer`), u.timer);
  run('systemctl --user daemon-reload', { silent: true });
  return run(`systemctl --user enable --now ${TASK}.timer`, { silent: true }).ok;
}

function crontab(enable) {
  if (!run('command -v crontab', { silent: true }).ok) {
    if (systemdTimer(enable)) return true;
    log.warn(tr('⚠️ لا cron ولا systemd --user — شغّل `abdalgani-setup --sync` يدوياً بين فترة وفترة.', '⚠️ Neither cron nor systemd --user available — run `abdalgani-setup --sync` now and then.'));
    return false;
  }
  const current = run('crontab -l', { silent: true });
  const next = withCronLines(current.ok ? current.out : '', enable);
  try {
    if (next) execSync('crontab -', { input: next, stdio: ['pipe', 'ignore', 'pipe'] });
    else run('crontab -r', { silent: true });
    return true;
  } catch (e) { log.err(`❌ crontab: ${e.message}`); return false; }
}

function windowsTask(enable) {
  if (!enable) {
    run(`schtasks /Delete /F /TN ${TASK}`, { silent: true });
    run(`schtasks /Delete /F /TN ${TASK}-logon`, { silent: true });
    return true;
  }
  const dir = binDir(); ensureDir(dir);
  // a .vbs wrapper runs node with no console window flashing every 6 hours
  const vbs = path.join(dir, 'abdalgani-sync.vbs');
  const [node, setup, ...args] = syncCommand();
  fs.writeFileSync(vbs, `CreateObject("WScript.Shell").Run """${node}"" ""${setup}"" ${args.join(' ')}", 0, False\r\n`);
  const tr1 = `wscript.exe "${vbs}"`;
  const a = run(`schtasks /Create /F /SC HOURLY /MO 6 /TN ${TASK} /TR "${tr1.replace(/"/g, '\\"')}"`, { silent: true });
  const b = run(`schtasks /Create /F /SC ONLOGON /TN ${TASK}-logon /TR "${tr1.replace(/"/g, '\\"')}"`, { silent: true });
  if (!a.ok) log.err(`❌ schtasks: ${a.out}`);
  if (!b.ok) log.dim(`   (${tr('مهمة تسجيل الدخول تحتاج صلاحيات — المهمة كل 6 ساعات تكفي', 'logon task needs rights — the 6-hourly task is enough')})`);
  return a.ok;
}

export function setAutoSync(enable) {
  const ok = isWin ? windowsTask(enable) : crontab(enable);
  if (ok) log.ok(enable
    ? `✅ ${tr('تحديث تلقائي للنماذج داخل أدواتك كل 6 ساعات', 'Models in your tools auto-update every 6 hours')} (${isWin ? 'Task Scheduler' : 'cron / systemd'})`
    : `✅ ${tr('أُلغي التحديث التلقائي', 'Auto-update disabled')}`);
  if (!enable && !isWin) systemdTimer(false);
  return ok;
}
