// Admin dashboard: token login → shell with lazily-loaded panels.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity, ArrowLeft, BarChart3, Bell, Cpu, KeyRound, Layers, List, LogOut, Plug, Plus, ScanSearch, Shield, Sparkles, Ticket, Users, ExternalLink, Wand2, FileDown, Coins,
} from 'lucide-react';
import { AppShell, Button, Input, Logo, Spinner, useHashTab, toast, ThemeButton } from '../ui/index.js';
import { store } from '../lib/store.js';
import { useAsync } from '../lib/hooks.js';
import { AdminCtx, api, TOKEN_KEY } from './ctx.js';

const PANELS = {
  overview: lazy(() => import('./panels/Overview.jsx')),
  live: lazy(() => import('./panels/Live.jsx')),
  logs: lazy(() => import('./panels/Logs.jsx')),
  security: lazy(() => import('./panels/Security.jsx')),
  playground: lazy(() => import('./panels/Playground.jsx')),
  updates: lazy(() => import('./panels/Updates.jsx')),
  providers: lazy(() => import('./panels/Providers.jsx')),
  models: lazy(() => import('./panels/Models.jsx')),
  settings: lazy(() => import('./panels/Settings.jsx')),
  users: lazy(() => import('./panels/Users.jsx')),
  coupons: lazy(() => import('./panels/Coupons.jsx')),
};

function navFor(stats) {
  return [
    { id: 'overview', label: 'التقارير', icon: BarChart3, group: 'المراقبة', sub: 'الاستخدام والمال والذروة لأي فترة' },
    { id: 'live', label: 'السجل المباشر', icon: Activity, group: 'المراقبة', sub: 'كل طلب لحظة بلحظة' },
    { id: 'logs', label: 'تاريخ الطلبات', icon: List, group: 'المراقبة', sub: 'كل الطلبات السابقة بالتاريخ — فلترة، تفاصيل وتصدير' },
    { id: 'security', label: 'الأمان', icon: Shield, group: 'المراقبة', sub: 'تنبيهات الإساءة، الحظر، الأجهزة وقواعد الحماية', badge: stats?.open_alerts || 0 },
    { id: 'playground', label: 'Playground', icon: Sparkles, group: 'المراقبة', sub: 'دردش مع أي نموذج واختبره عبر طريق البوابة الحقيقي' },
    { id: 'updates', label: 'التحديثات', icon: Bell, group: 'المراقبة', sub: 'نماذج جديدة، أرشفة تلقائية وأحداث المزوّدين', badge: stats?.unread_events || 0 },
    { id: 'providers', label: 'المزوّدون والمفاتيح', icon: Plug, group: 'الإعداد', sub: 'المزوّدون، مفاتيحهم المشفّرة، وترتيب الطلب' },
    { id: 'models', label: 'النماذج والتوجيه', icon: Cpu, group: 'الإعداد', sub: 'الأسعار والحالة ومسارات التوجيه' },
    { id: 'settings', label: 'الفئات والأسماء', icon: Layers, group: 'الإعداد', sub: 'فئات النماذج والأسماء الثابتة الافتراضية' },
    { id: 'users', label: 'الطلاب', icon: Users, group: 'الناس والمال', sub: 'الحسابات، الموافقات، السقوف وكلمات السر' },
    { id: 'coupons', label: 'الكوبونات', icon: Ticket, group: 'الناس والمال', sub: 'أكواد التفعيل وسعر بيعها' },
  ];
}
const IDS = Object.keys(PANELS);

function Login({ onDone }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    store.set(TOKEN_KEY, token.trim());
    try { await api.get('/api/admin/stats', { noAuthFail: true }); onDone(); } catch (err) { store.del(TOKEN_KEY); toast.error(err.status === 401 ? 'التوكن غلط' : err.message); } finally { setBusy(false); }
  };
  return (
    <div className="grain relative grid min-h-dvh place-items-center p-4">
      <div className="nebula" aria-hidden><i /><b /></div>
      <div className="absolute end-4 top-4"><ThemeButton /></div>
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        className="glass w-full max-w-sm rounded-3xl p-7" autoComplete="on">
        <Logo size={48} className="mb-5" />
        <h1 className="font-display text-2xl font-bold">لوحة الإدارة</h1>
        <p className="mb-6 mt-1 text-sm text-muted">ادخل بتوكن المدير (<span className="font-mono ltr">ADMIN_TOKEN</span>).</p>
        <input type="text" name="username" autoComplete="username" value="admin" readOnly hidden />
        <Input icon={KeyRound} type="password" name="password" autoComplete="current-password" placeholder="admin token" value={token} onChange={(e) => setToken(e.target.value)} required autoFocus />
        <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" loading={busy} iconEnd={ArrowLeft}>دخول</Button>
        <p className="mt-4 text-center text-xs text-muted">المحاولات الخاطئة المتكررة بتحظر العنوان تلقائياً.</p>
      </motion.form>
    </div>
  );
}

function Loading() {
  return <div className="grid min-h-[50vh] place-items-center"><Spinner size={26} /></div>;
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!store.get(TOKEN_KEY));
  const [tab, go] = useHashTab(IDS, store.get('abd:adminTab') || 'overview');
  const [stats, setStats] = useState(null);
  useEffect(() => { store.set('abd:adminTab', tab); }, [tab]);
  useEffect(() => { const out = () => setAuthed(false); window.addEventListener('abd:logout', out); return () => window.removeEventListener('abd:logout', out); }, []);

  const refreshStats = useCallback(() => api.get('/api/admin/stats').then(setStats).catch(() => {}), []);
  useEffect(() => {
    if (!authed) return undefined;
    refreshStats();
    const t = setInterval(() => { if (!document.hidden) refreshStats(); }, 60_000);
    return () => clearInterval(t);
  }, [authed, refreshStats]);

  const groups = useAsync(() => (authed ? api.get('/api/admin/groups') : Promise.resolve([])), [authed]);
  const groupName = useCallback((id) => (id ? groups.data?.find((g) => g.id === id)?.name || id : 'كل النماذج'), [groups.data]);

  const ctx = useMemo(() => ({ stats, refreshStats, go, groups: groups.data || [], reloadGroups: groups.reload, groupName }), [stats, refreshStats, go, groups.data, groups.reload, groupName]);
  const nav = useMemo(() => navFor(stats), [stats]);
  const commands = useMemo(() => [
    { id: 'c:scan', label: 'افحص الإساءة الآن', icon: ScanSearch, group: 'أوامر', run: () => go('security') },
    { id: 'c:coupons', label: 'ولّد كوبونات', icon: Ticket, group: 'أوامر', run: () => go('coupons') },
    { id: 'c:model', label: 'أضف نموذج جديد', icon: Plus, group: 'أوامر', run: () => { go('models'); setTimeout(() => window.dispatchEvent(new CustomEvent('abd:cmd', { detail: 'new-model' })), 300); } },
    { id: 'c:provider', label: 'أضف مزوّد جديد', icon: Plug, group: 'أوامر', run: () => { go('providers'); setTimeout(() => window.dispatchEvent(new CustomEvent('abd:cmd', { detail: 'new-provider' })), 300); } },
    { id: 'c:or', label: 'سعّر النماذج متل OpenRouter', icon: Coins, group: 'أوامر', run: () => { go('models'); setTimeout(() => window.dispatchEvent(new CustomEvent('abd:cmd', { detail: 'openrouter-prices' })), 300); } },
    { id: 'c:sync', label: 'افحص تحديثات المزوّدين', icon: Wand2, group: 'أوامر', run: () => go('updates') },
    { id: 'c:csv', label: 'صدّر تقرير CSV', icon: FileDown, group: 'أوامر', run: () => go('overview') },
    { id: 'c:student', label: 'افتح لوحة الطالب', icon: ExternalLink, group: 'أوامر', run: () => window.open('/', '_blank', 'noopener') },
  ], [go]);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  const Panel = PANELS[tab];
  return (
    <AdminCtx.Provider value={ctx}>
      <AppShell
        brand={{ title: 'abdalgani', subtitle: 'إدارة البوابة', href: '/admin' }}
        nav={nav} active={tab} onNavigate={go} commands={commands}
        footer={
          <div className="flex flex-col gap-1">
            <Button variant="ghost" className="justify-start" icon={ExternalLink} onClick={() => window.open('/', '_blank', 'noopener')}>لوحة الطالب</Button>
            <Button variant="ghost" className="justify-start text-bad hover:text-bad" icon={LogOut} onClick={() => { store.del(TOKEN_KEY); setAuthed(false); }}>خروج</Button>
          </div>
        }>
        <Suspense fallback={<Loading />}><Panel /></Suspense>
      </AppShell>
    </AdminCtx.Provider>
  );
}
