// Student dashboard: marketing landing + auth when logged out, AppShell with lazy panels when logged in.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Cpu, Home, KeyRound, List, LogOut, Shuffle, Terminal, Ticket, Copy } from 'lucide-react';
import { AppShell, Button, Logo, Spinner, copyText, toast, useHashTab } from '../ui/index.js';
import { store } from '../lib/store.js';
import { TZ } from '../lib/format.js';
import { StudentCtx, api, focusLater, fmtAmount, isSession, LAST_KEY, TOKEN_KEY } from './ctx.js';
import { buildSetup, SETUP_PREF } from './setup.js';
import Landing from './Landing.jsx';

const PANELS = {
  overview: lazy(() => import('./panels/Overview.jsx')),
  models: lazy(() => import('./panels/Models.jsx')),
  switch: lazy(() => import('./panels/Switch.jsx')),
  setup: lazy(() => import('./panels/Setup.jsx')),
  usage: lazy(() => import('./panels/Usage.jsx')),
  keys: lazy(() => import('./panels/Keys.jsx')),
};
const IDS = Object.keys(PANELS);
const NAV = [
  { id: 'overview', label: 'حسابي', short: 'حسابي', icon: Home, bottom: true, sub: 'رصيدك وحدودك ووين راح استهلاكك' },
  { id: 'models', label: 'النماذج', short: 'النماذج', icon: Cpu, bottom: true, sub: 'كل النماذج، الجديد والقديم والمسموح إلك' },
  { id: 'switch', label: 'تبديل النماذج', short: 'تبديل', icon: Shuffle, bottom: true, sub: 'غيّر النموذج ورا أي اسم ثابت — بيشتغل فوراً بكل أدواتك' },
  { id: 'setup', label: 'التثبيت والاستخدام', short: 'تثبيت', icon: Terminal, bottom: true, sub: 'أمر واحد بيثبّت الأداة وبيربطها بحسابك' },
  { id: 'usage', label: 'السجل', short: 'السجل', icon: List, sub: 'كل طلباتك الأخيرة بالتفصيل' },
  { id: 'keys', label: 'المفاتيح والأمان', short: 'مفاتيح', icon: KeyRound, bottom: true, sub: 'مفاتيح API وأجهزتك وكلمة السر' },
];

async function loadAll() {
  const [me, catalog, rep, limits] = await Promise.all([
    api.get('/api/me'), api.get('/api/me/models'), api.get(`/api/me/report?tz=${TZ}`), api.get('/api/me/limits'),
  ]);
  return { me, catalog, rep, limits };
}

function Booting() {
  return (
    <div className="grain grid min-h-dvh place-items-center">
      <div className="nebula" aria-hidden><i /><b /></div>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
        <Logo size={56} />
        <span className="shimmer-text font-display text-sm">عم نجهّز حسابك…</span>
      </motion.div>
    </div>
  );
}

function Loading() {
  return <div className="grid min-h-[50vh] place-items-center"><Spinner size={26} /></div>;
}

export default function App() {
  // 'boot' (checking a saved token) → 'out' (landing) | 'in' (dashboard)
  const [phase, setPhase] = useState(() => (store.get(TOKEN_KEY) ? 'boot' : 'out'));
  const [data, setData] = useState(null);
  const [tab, go] = useHashTab(IDS, store.get('abd:stuTab') || 'overview');
  useEffect(() => { store.set('abd:stuTab', tab); }, [tab]);

  const reload = useCallback(async () => { const d = await loadAll(); setData(d); setPhase('in'); return d; }, []);
  const reloadLimits = useCallback(async () => { const limits = await api.get('/api/me/limits'); setData((d) => ({ ...d, limits })); }, []);

  useEffect(() => {
    if (phase === 'boot') reload().catch(() => { setPhase('out'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const out = () => { setPhase('out'); setData(null); };
    window.addEventListener('abd:logout', out); return () => window.removeEventListener('abd:logout', out);
  }, []);

  const logout = useCallback(async () => {
    if (isSession()) { try { await api.post('/api/auth/logout'); } catch { /* ignore */ } }
    store.del(TOKEN_KEY); store.del(LAST_KEY);
    setPhase('out'); setData(null);
  }, []);

  const groupName = useCallback((id) => (id ? (data?.catalog.groups.find((g) => g.id === id)?.name || id) : 'كل النماذج'), [data]);
  const setAlias = useCallback(async (alias, model_id) => {
    try { await api.put('/api/me/aliases', { alias, model_id }); toast.success(<span className="ltr">{alias} → {model_id}</span>); await reload(); return true; }
    catch (err) { toast.error(err.message); return false; }
  }, [reload]);

  const ctx = useMemo(() => data && ({ ...data, reload, reloadLimits, go, groupName, setAlias, logout, fmtAmount }),
    [data, reload, reloadLimits, go, groupName, setAlias, logout]);

  const commands = useMemo(() => [
    { id: 'c:install', label: 'انسخ أمر التثبيت', icon: Copy, group: 'أوامر', keywords: 'install curl', run: () => {
      go('setup');
      const p = store.json(SETUP_PREF, {});
      if (data) copyText(buildSetup(data.me.base_url, p.tool || 'OpenCode', p.os || 'unix').install);
    } },
    { id: 'c:key', label: 'اعمل مفتاح API جديد', icon: KeyRound, group: 'أوامر', keywords: 'api key', run: () => { go('keys'); focusLater('keyName'); } },
    { id: 'c:redeem', label: 'فعّل كود تفعيل', icon: Ticket, group: 'أوامر', keywords: 'coupon', run: () => { go('overview'); focusLater('couponInput'); } },
    { id: 'c:logout', label: 'خروج', icon: LogOut, group: 'أوامر', keywords: 'logout', run: logout },
  ], [go, data, logout]);

  if (phase === 'boot') return <Booting />;
  if (phase === 'out' || !ctx) return <Landing onAuthed={() => reload()} />;

  const Panel = PANELS[tab];
  const u = data.me.user;
  return (
    <StudentCtx.Provider value={ctx}>
      <AppShell
        brand={{ title: 'abdalgani AI', subtitle: 'لوحة الطالب', href: '/' }}
        nav={NAV} active={tab} onNavigate={go} commands={commands}
        footer={
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-sunken/60 p-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl grad-bg font-display text-[15px] font-bold text-white shadow-[0_6px_18px_-6px_var(--glow)]">
                {(u.name || '?').trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold">{u.name}</div>
                {u.email && <div className="truncate text-[11.5px] text-muted ltr text-right">{u.email}</div>}
              </div>
            </div>
            <Button variant="ghost" className="justify-start text-bad hover:text-bad" icon={LogOut} onClick={logout}>خروج</Button>
          </div>
        }>
        <Suspense fallback={<Loading />}><Panel /></Suspense>
      </AppShell>
    </StudentCtx.Provider>
  );
}
