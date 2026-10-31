// App shell: floating glass sidebar (desktop), drawer + bottom bar (phone), sticky top bar,
// command palette (Ctrl/⌘K), number-key shortcuts, theme switch, animated page transitions.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Command } from 'cmdk';
import * as DialogPrim from '@radix-ui/react-dialog';
import { Toaster } from 'sonner';
import { CornerDownLeft, Menu, Monitor, Moon, Search, Sun, X } from 'lucide-react';
import { store } from '../lib/store.js';
import { useMedia } from '../lib/hooks.js';
import { Button, Kbd, TipProvider, cn } from './core.jsx';
import { ConfirmProvider } from './overlay.jsx';

// ── theme ──
const THEMES = ['system', 'light', 'dark'];
function resolve(mode) { return mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode; }
export function applyTheme(mode) {
  const t = resolve(mode);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#05060f' : '#f5f6fc');
}
export function useTheme() {
  const [mode, setMode] = useState(() => store.get('abd:theme') || 'system');
  useEffect(() => {
    applyTheme(mode); store.set('abd:theme', mode);
    if (mode !== 'system') return undefined;
    const mq = matchMedia('(prefers-color-scheme: dark)'); const on = () => applyTheme('system');
    mq.addEventListener('change', on); return () => mq.removeEventListener('change', on);
  }, [mode]);
  return [mode, () => setMode((m) => THEMES[(THEMES.indexOf(m) + 1) % THEMES.length])];
}
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL = { system: 'حسب الجهاز', light: 'فاتح', dark: 'غامق' };
export function ThemeButton({ className }) {
  const [mode, cycle] = useTheme();
  const Icon = THEME_ICON[mode];
  return (
    <Button variant="secondary" size="icon" onClick={cycle} aria-label={`المظهر: ${THEME_LABEL[mode]}`} title={`المظهر: ${THEME_LABEL[mode]}`} className={className}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={mode} initial={{ rotate: -90, opacity: 0, scale: 0.6 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 90, opacity: 0, scale: 0.6 }} transition={{ duration: 0.2 }}>
          <Icon size={17} />
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

// ── hash routing for tabs ──
export function useHashTab(ids, fallback) {
  const read = useCallback(() => { const h = location.hash.replace(/^#\/?/, '').split('?')[0]; return ids.includes(h) ? h : null; }, [ids]);
  const [tab, setTab] = useState(() => read() || fallback);
  useEffect(() => {
    const on = () => { const t = read(); if (t) setTab(t); };
    window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on);
  }, [read]);
  const go = useCallback((t) => { if (location.hash !== `#${t}`) history.pushState(null, '', `#${t}`); setTab(t); }, []);
  return [tab, go];
}

// ── brand mark ──
export function Logo({ size = 36, className }) {
  return (
    <span className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-[11px] text-white shadow-[0_8px_24px_-6px_var(--glow)]', className)} style={{ width: size, height: size }}>
      <span className="absolute inset-[-40%] animate-spin-slow bg-[conic-gradient(from_0deg,var(--brand-a),#4d7bff,var(--brand-b),var(--brand-c),var(--brand-a))]" />
      <span className="absolute inset-[1.5px] rounded-[10px] bg-[linear-gradient(140deg,var(--brand-a),#4d7bff_60%,var(--brand-b))]" />
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} className="relative drop-shadow"><path d="M13.5 2 4 14h6.5L9.5 22 20 9.5h-6.6z" fill="currentColor" /></svg>
    </span>
  );
}

// ── command palette ──
function Palette({ open, onOpenChange, items }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const it of items) { const g = it.group || 'تنقّل'; if (!m.has(g)) m.set(g, []); m.get(g).push(it); }
    return [...m.entries()];
  }, [items]);
  return (
    <DialogPrim.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrim.Portal forceMount>
            <DialogPrim.Overlay asChild forceMount><motion.div className="fixed inset-0 z-[95] bg-[rgba(4,6,16,.5)] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /></DialogPrim.Overlay>
            <DialogPrim.Content asChild forceMount>
              <motion.div initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.18 }}
                className="fixed left-1/2 top-[12vh] z-[96] w-[min(620px,94vw)] -translate-x-1/2 overflow-hidden rounded-3xl border border-line-strong bg-solid shadow-[var(--shadow-pop)]">
                <DialogPrim.Title className="sr-only">بحث سريع</DialogPrim.Title>
                <DialogPrim.Description className="sr-only">روح لأي صفحة أو نفّذ أمر</DialogPrim.Description>
                <Command loop>
                  <div className="flex items-center gap-3 border-b border-line px-4">
                    <Search size={18} className="text-muted" />
                    <Command.Input autoFocus placeholder="روح لـ… أو نفّذ أمر" className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70" />
                    <Kbd>Esc</Kbd>
                  </div>
                  <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
                    <Command.Empty className="py-10 text-center text-sm text-muted">ما في نتائج</Command.Empty>
                    {groups.map(([g, its]) => (
                      <Command.Group key={g} heading={g} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted">
                        {its.map((it) => (
                          <Command.Item key={it.id} value={`${it.label} ${it.keywords || ''} ${it.id}`} onSelect={() => { onOpenChange(false); setTimeout(it.run, 10); }}
                            className="group flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-fg-2 data-[selected=true]:bg-accent-soft data-[selected=true]:text-fg">
                            {it.icon && <span className="grid size-7 place-items-center rounded-lg border border-line bg-sunken text-muted group-data-[selected=true]:border-accent/30 group-data-[selected=true]:text-accent"><it.icon size={15} /></span>}
                            <span className="flex-1 truncate">{it.label}</span>
                            {it.hint && <span className="text-xs text-muted">{it.hint}</span>}
                            <CornerDownLeft size={14} className="text-muted opacity-0 group-data-[selected=true]:opacity-100" />
                          </Command.Item>
                        ))}
                      </Command.Group>
                    ))}
                  </Command.List>
                </Command>
              </motion.div>
            </DialogPrim.Content>
          </DialogPrim.Portal>
        )}
      </AnimatePresence>
    </DialogPrim.Root>
  );
}

// ── sidebar nav list ──
function NavList({ nav, active, onNavigate, layoutId }) {
  let lastGroup = null;
  return (
    <nav className="flex flex-col gap-0.5">
      {nav.map((n) => {
        const head = n.group && n.group !== lastGroup ? n.group : null; lastGroup = n.group;
        const on = n.id === active;
        return (
          <div key={n.id}>
            {head && <div className="px-3 pb-1.5 pt-4 text-[11px] font-semibold tracking-wide text-muted/80 first:pt-1">{head}</div>}
            <button type="button" onClick={() => onNavigate(n.id)} aria-current={on ? 'page' : undefined}
              className={cn('group relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[14px] transition-colors', on ? 'font-semibold text-fg' : 'text-fg-2 hover:bg-sunken hover:text-fg')}>
              {on && (
                <motion.span layoutId={layoutId} transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                  className="absolute inset-0 -z-0 rounded-xl border border-accent/20 bg-[linear-gradient(90deg,var(--accent-2),transparent)] rtl:bg-[linear-gradient(-90deg,var(--accent-2),transparent)]">
                  <span className="absolute inset-y-2 start-0 w-[3px] rounded-full grad-bg shadow-[0_0_12px_var(--glow)]" />
                </motion.span>
              )}
              <n.icon size={18} className={cn('relative shrink-0 transition-colors', on ? 'text-accent' : 'text-muted group-hover:text-fg-2')} />
              <span className="relative flex-1 truncate text-start">{n.label}</span>
              {n.badge ? <span className="relative grid h-5 min-w-5 place-items-center rounded-full bg-bad px-1.5 text-[10.5px] font-bold text-white shadow-[0_0_12px_rgba(255,80,80,.5)]">{n.badge}</span> : null}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * AppShell
 * nav: [{ id, label, icon, group?, sub?, badge?, bottom?: true }]
 * commands: extra palette entries [{ id, label, icon, group, run, keywords }]
 */
export function AppShell({ brand, nav, active, onNavigate, footer, commands = [], topActions, children }) {
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const mobile = useMedia('(max-width: 1023px)');
  const cur = nav.find((n) => n.id === active) || nav[0];
  const go = useCallback((id) => { onNavigate(id); setDrawer(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [onNavigate]);

  useEffect(() => {
    const on = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return; }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable || document.querySelector('[role="dialog"]');
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = Number(e.key);
      if (k >= 1 && k <= 9 && nav[k - 1]) go(nav[k - 1].id);
    };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [nav, go]);
  useEffect(() => { document.title = `${cur.label} — ${brand.title}`; }, [cur, brand.title]);

  const items = useMemo(() => [
    ...nav.map((n, i) => ({ id: `nav:${n.id}`, label: n.label, icon: n.icon, group: 'تنقّل', hint: i < 9 ? String(i + 1) : '', run: () => go(n.id), keywords: n.sub })),
    ...commands,
  ], [nav, commands, go]);
  const bottom = nav.filter((n) => n.bottom);

  const side = (
    <div className="flex h-full flex-col">
      <a href={brand.href || '/'} className="flex items-center gap-3 px-2 pb-5 pt-1">
        <Logo />
        <span className="min-w-0 leading-tight">
          <span className="block font-display text-[15.5px] font-bold tracking-tight">{brand.title}</span>
          <span className="block truncate text-[11.5px] text-muted">{brand.subtitle}</span>
        </span>
      </a>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"><NavList nav={nav} active={active} onNavigate={go} layoutId={mobile ? 'nav-m' : 'nav-d'} /></div>
      {footer && <div className="mt-3 border-t border-line pt-3">{footer}</div>}
    </div>
  );

  return (
    <TipProvider>
      <ConfirmProvider>
        <div className="nebula" aria-hidden><i /><b /></div>
        <div className="grain min-h-dvh lg:ps-[288px]">
          {/* desktop sidebar */}
          <aside className="glass fixed inset-y-3 start-3 z-30 hidden w-[264px] rounded-3xl p-3.5 lg:block">{side}</aside>

          {/* phone drawer */}
          <AnimatePresence>
            {drawer && mobile && (
              <>
                <motion.div className="fixed inset-0 z-40 bg-[rgba(4,6,16,.5)] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
                <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.38 }}
                  className="fixed inset-y-0 right-0 z-50 w-[min(300px,86vw)] border-s border-line-strong bg-solid p-4 shadow-[var(--shadow-pop)]">
                  <Button variant="ghost" size="icon-sm" className="absolute end-3 top-3" onClick={() => setDrawer(false)} aria-label="إغلاق"><X size={17} /></Button>
                  {side}
                </motion.aside>
              </>
            )}
          </AnimatePresence>

          <div className="flex min-h-dvh min-w-0 flex-col">
            <header className="sticky top-0 z-20 px-3 pt-3 sm:px-5 lg:ps-2">
              <div className="glass flex h-16 items-center gap-3 rounded-2xl px-3 sm:px-4">
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="القائمة"><Menu size={19} /></Button>
                <div className="min-w-0 flex-1">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={cur.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                      <h1 className="truncate font-display text-[17px] font-semibold leading-tight sm:text-lg">{cur.label}</h1>
                      {cur.sub && <p className="hidden truncate text-[12.5px] text-muted sm:block">{cur.sub}</p>}
                    </motion.div>
                  </AnimatePresence>
                </div>
                {topActions}
                <button type="button" onClick={() => setPalette(true)}
                  className="hidden h-10 items-center gap-2 rounded-xl border border-line-strong bg-solid px-3 text-[13px] text-muted transition-colors hover:border-accent/40 hover:text-fg md:inline-flex">
                  <Search size={15} /><span>روح لـ…</span><Kbd className="ms-3">Ctrl K</Kbd>
                </button>
                <Button variant="secondary" size="icon" className="md:hidden" onClick={() => setPalette(true)} aria-label="بحث سريع"><Search size={17} /></Button>
                <ThemeButton />
              </div>
            </header>

            <main className={cn('mx-auto w-full max-w-[1400px] flex-1 px-3 pb-10 pt-4 sm:px-5 lg:ps-2', bottom.length && 'max-lg:pb-28')}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={active} initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
                  {children}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>

          {/* phone bottom bar */}
          {bottom.length > 0 && (
            <nav className="glass fixed inset-x-3 bottom-3 z-30 flex h-16 items-stretch justify-around rounded-2xl px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
              {bottom.map((n) => {
                const on = n.id === active;
                return (
                  <button key={n.id} type="button" onClick={() => go(n.id)} className={cn('relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium', on ? 'text-accent-ink' : 'text-muted')}>
                    {on && <motion.span layoutId="bottom-pill" className="absolute inset-x-2 inset-y-1.5 rounded-xl bg-accent-soft" transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }} />}
                    <n.icon size={20} className="relative" /><span className="relative">{n.short || n.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
        <Palette open={palette} onOpenChange={setPalette} items={items} />
        <Toaster position="top-center" dir="rtl" richColors closeButton
          toastOptions={{ className: 'font-sans', style: { borderRadius: 16, fontFamily: 'var(--font-sans)' } }} theme={document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'} />
      </ConfirmProvider>
    </TipProvider>
  );
}

/** Page header row used at the top of panels (title-less pages just use cards). */
export function PageGrid({ children, className }) {
  return <div className={cn('grid gap-4 sm:gap-5', className)}>{children}</div>;
}
