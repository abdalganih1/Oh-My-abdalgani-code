// المفاتيح والأمان — API keys (create → shown once, revoke), devices, change password.
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { KeyRound, Lock, Monitor, Plus, ShieldAlert, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, CopyButton, DataTable, Field, Input, Reveal, toast, useConfirm } from '../../ui/index.js';
import { useAsync } from '../../lib/hooks.js';
import { ago, date } from '../../lib/format.js';
import { store } from '../../lib/store.js';
import { api, LAST_KEY, TOKEN_KEY, useStudent } from '../ctx.js';

const DEV_ST = { active: ['ok', 'مسموح'], pending: ['warn', 'بانتظار موافقة المدرّس'], blocked: ['bad', 'محظور'] };

function KeysCard() {
  const { me, reload } = useStudent();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api.post('/api/me/keys', { name: name || 'key' });
      setFresh(r.api_key); store.set(LAST_KEY, r.api_key); setName('');
      await reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const revoke = async (k) => {
    if (!(await confirm({ title: 'إلغاء هذا المفتاح نهائياً؟', description: `المفتاح "${k.name}" رح يوقف يشتغل فوراً بكل الأدوات المربوطة فيه.`, danger: true, confirmText: 'إلغاء المفتاح', cancelText: 'تراجع' }))) return;
    setRevoking(k.id);
    try { await api.post(`/api/me/keys/${k.id}/revoke`); await reload(); toast.success('انلغى المفتاح'); } catch (err) { toast.error(err.message); } finally { setRevoking(null); }
  };

  const cols = [
    { key: 'name', header: 'الاسم', primary: true, cell: (k) => <span className="inline-flex items-center gap-2"><KeyRound size={14} className="text-accent" /><b>{k.name}</b></span> },
    { key: 'prefix', header: 'البادئة', cell: (k) => <span className="font-mono text-[12.5px] ltr">{k.prefix}…</span> },
    { key: 'used', header: 'آخر استخدام', cell: (k) => <span className="text-[12.5px] text-fg-2" title={k.last_used_at ? new Date(k.last_used_at * 1000).toLocaleString('en-GB') : ''}>{k.last_used_at ? ago(k.last_used_at) : '—'}</span> },
    { key: 'act', header: '', align: 'end', cell: (k) => (k.id === me.current_key_id
      ? <Badge tone="accent" dot>الحالي</Badge>
      : <Button size="xs" variant="danger" icon={Trash2} loading={revoking === k.id} onClick={() => revoke(k)}>إلغاء</Button>) },
  ];
  return (
    <Card title="مفاتيحي" icon={KeyRound} subtitle="مفتاح لكل جهاز — حتى خمس مفاتيح فعّالة" actions={<span className="text-[12.5px] text-muted num ltr">{me.keys.length} / 5</span>}>
      <DataTable columns={cols} rows={me.keys} empty={{ icon: KeyRound, title: 'ما عندك مفاتيح', text: 'اعمل واحد تحت لتربط أدواتك' }} />
      <form onSubmit={create} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input id="keyName" icon={Monitor} className="flex-1" placeholder="اسم الجهاز (laptop)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="اسم الجهاز" />
        <Button type="submit" variant="primary" icon={Plus} loading={busy} disabled={me.keys.length >= 5}>مفتاح جديد</Button>
      </form>
      <AnimatePresence>
        {fresh && (
          <motion.div initial={{ opacity: 0, height: 0, y: -6 }} animate={{ opacity: 1, height: 'auto', y: 0 }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="relative mt-4 overflow-hidden rounded-2xl border border-ok/30 bg-ok-soft p-4">
              <div aria-hidden className="pointer-events-none absolute -top-16 end-0 size-48 rounded-full bg-[radial-gradient(closest-side,rgba(46,230,160,.25),transparent)]" />
              <div className="relative flex items-start gap-2">
                <p className="flex-1 text-[13.5px] text-fg-2">🔐 احفظه هلق — ما رح يظهر مرة تانية (وصار جاهز بأوامر "التثبيت والاستخدام"):</p>
                <Button variant="ghost" size="icon-sm" aria-label="إخفاء" onClick={() => setFresh(null)}><X size={15} /></Button>
              </div>
              <div className="relative mt-2 flex items-center gap-2 rounded-xl border border-line-strong bg-solid p-2 ps-3">
                <code className="min-w-0 flex-1 break-all font-mono text-[13px] font-semibold ltr text-start">{fresh}</code>
                <CopyButton text={fresh} label="نسخ" className="shrink-0" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function Devices() {
  const q = useAsync(() => api.get('/api/me/devices'), []);
  const cols = [
    { key: 'name', header: 'الجهاز', primary: true, cell: (d) => <span className="inline-flex items-center gap-2"><Monitor size={14} className="text-muted" />{d.name || '—'}</span> },
    { key: 'st', header: 'الحالة', cell: (d) => (DEV_ST[d.status] ? <Badge tone={DEV_ST[d.status][0]} dot>{DEV_ST[d.status][1]}</Badge> : null) },
    { key: 'seen', header: 'آخر استخدام', cell: (d) => <span className="text-[12.5px]">{date(d.last_seen)}</span> },
    { key: 'ip', header: 'آخر عنوان', cell: (d) => <span className="font-mono text-[12px] ltr">{d.last_ip || ''}</span> },
  ];
  return (
    <Card title="أجهزتي" icon={Monitor} subtitle="الأجهزة اللي استخدمت مفتاحك عبر أدوات abdalgani-setup.">
      <p className="mb-3 flex items-start gap-2 rounded-2xl border border-warn/25 bg-warn-soft p-3 text-[12.5px] text-fg-2"><ShieldAlert size={15} className="mt-0.5 shrink-0 text-warn" />إذا شفت جهاز ما بتعرفه، بلّغ المدرّس فوراً وغيّر مفتاحك.</p>
      <DataTable columns={cols} rows={q.data || []} loading={q.loading} empty={{ icon: Monitor, title: 'لا أجهزة مسجّلة بعد' }} />
    </Card>
  );
}

function Password() {
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.post('/api/me/password', Object.fromEntries(new FormData(e.currentTarget).entries()));
      toast.success('تم — سجّل الدخول من جديد');
      store.del(TOKEN_KEY);
      setTimeout(() => window.dispatchEvent(new Event('abd:logout')), 1200);
    } catch (err) { toast.error(err.message); setBusy(false); }
  };
  return (
    <Card title="كلمة السر" icon={Lock}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <Field label="الحالية"><Input name="current" type="password" autoComplete="current-password" /></Field>
        <Field label="الجديدة"><Input name="password" type="password" minLength={8} autoComplete="new-password" required placeholder="8 أحرف على الأقل" /></Field>
        <Button type="submit" variant="primary" loading={busy} className="self-start">تغيير</Button>
      </form>
      <p className="mt-3 text-[12.5px] text-muted">تغيير كلمة السر بيطلّعك من كل الأجهزة.</p>
    </Card>
  );
}

export default function Keys() {
  const { me } = useStudent();
  return (
    <div className="grid gap-4 sm:gap-5 [&>*]:min-w-0">
      <Reveal><KeysCard /></Reveal>
      <div className={me.user.has_password ? 'grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] [&>*]:min-w-0' : 'grid [&>*]:min-w-0'}>
        <Reveal delay={0.05}><Devices /></Reveal>
        {me.user.has_password && <Reveal delay={0.1}><Password /></Reveal>}
      </div>
    </div>
  );
}
