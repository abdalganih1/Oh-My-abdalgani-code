// Students: list with search/filters, pending approvals, create (one-time key), detail drawer.
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, ChevronLeft, Clock, RefreshCw, Search, ShieldCheck, UserPlus, Users as UsersIcon, Wallet, UserCheck, UserX, Inbox } from 'lucide-react';
import {
  Badge, Button, Card, CountUp, DataTable, Empty, Field, Input, Kbd, Modal, Reveal, Segmented, Stat, Tip, cn, toast,
} from '../../ui/index.js';
import { useAsync } from '../../lib/hooks.js';
import { ago, date, tokens, usd } from '../../lib/format.js';
import { api, useAdmin } from '../ctx.js';
import { Avatar, SecretBox, useSlashFocus } from './users/bits.jsx';
import UserSheet from './users/UserSheet.jsx';

const statusOf = (u) => (u.approved === 0 ? 'pending' : u.disabled ? 'paused' : 'active');

export default function Users() {
  const { refreshStats } = useAdmin();
  const list = useAsync(() => api.get('/api/admin/users'), []);
  const users = list.data || [];
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState(null);
  const searchRef = useRef(null);

  const onKey = useSlashFocus(searchRef);
  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onKey]);

  const reload = () => { list.reload(); refreshStats?.(); };

  const counts = useMemo(() => {
    const c = { all: users.length, pending: 0, active: 0, paused: 0, empty: 0, self: 0, balance: 0 };
    for (const u of users) {
      c[statusOf(u)]++;
      if (u.self_signup) c.self++;
      if (!u.usd_left && !u.tokens_left) c.empty++;
      c.balance += u.usd_left || 0;
    }
    return c;
  }, [users]);
  const maxBal = useMemo(() => Math.max(1, ...users.map((u) => u.usd_left || 0)), [users]);
  const pending = users.filter((u) => u.approved === 0);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.filter((u) => {
      if (s && !`${u.name} ${u.email || ''} ${u.note || ''} #${u.id}`.toLowerCase().includes(s)) return false;
      if (filter === 'self') return !!u.self_signup;
      if (filter === 'empty') return !u.usd_left && !u.tokens_left;
      return filter === 'all' || statusOf(u) === filter;
    });
  }, [users, q, filter]);

  const approve = async (u, e) => {
    e?.stopPropagation();
    setApproving(u.id);
    try { await api.patch(`/api/admin/users/${u.id}`, { approved: true }); toast.success(`تمت الموافقة على ${u.name}`); reload(); } catch (err) { toast.error(err.message); } finally { setApproving(null); }
  };

  const columns = [
    {
      key: 'name', header: 'الطالب', primary: true,
      cell: (u) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={u.name} seed={u.id} size={38} dim={!!u.disabled} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5"><span className="truncate font-semibold">{u.name}</span><span className="font-mono text-[10.5px] text-muted ltr">#{u.id}</span></div>
            <div className="truncate text-[12px] text-muted ltr text-start">{u.email || <span className="rtl">بدون إيميل</span>}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'balance', header: 'الرصيد', width: 190,
      cell: (u) => (
        <div className="min-w-[120px]">
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <b className={cn('num', !u.usd_left && 'text-muted font-normal')}>{usd(u.usd_left)}</b>
            {u.tokens_left > 0 && <span className="text-[11px] text-muted num">{tokens(u.tokens_left)} tok</span>}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
            <motion.div className="h-full rounded-full grad-bg" initial={{ width: 0 }} animate={{ width: `${Math.max(u.usd_left ? 3 : 0, ((u.usd_left || 0) / maxBal) * 100)}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
          </div>
        </div>
      ),
    },
    { key: 'keys', header: 'مفاتيح', align: 'center', hideOnMobile: true, cell: (u) => <span className={cn('num', !u.keys && 'text-muted')}>{u.keys}</span> },
    {
      key: 'last', header: 'آخر نشاط',
      cell: (u) => (
        <Tip content={u.last_request ? date(u.last_request) : null}>
          <span className="inline-flex items-center gap-1.5 text-[12.5px]">
            <span className={cn('size-1.5 rounded-full', u.last_request && Date.now() / 1000 - u.last_request < 3600 ? 'bg-ok' : u.last_request ? 'bg-muted/50' : 'bg-line-strong')} />
            <span className={u.last_request ? 'text-fg-2' : 'text-muted'}>{u.last_request ? ago(u.last_request) : 'ما استخدم بعد'}</span>
          </span>
        </Tip>
      ),
    },
    {
      key: 'status', header: 'الحالة', mobileFull: true,
      cell: (u) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {u.approved === 0
            ? <Button size="xs" variant="primary" icon={ShieldCheck} loading={approving === u.id} onClick={(e) => approve(u, e)}>موافقة</Button>
            : u.disabled ? <Badge tone="bad" dot>موقوف</Badge> : <Badge tone="ok" dot>فعّال</Badge>}
          {!!u.self_signup && <Badge>تسجيل ذاتي</Badge>}
        </div>
      ),
    },
    { key: 'go', header: '', width: 40, hideOnMobile: true, cell: () => <ChevronLeft size={16} className="text-muted" /> },
  ];

  return (
    <div className="space-y-5">
      <Reveal className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={UsersIcon} label="الطلاب" loading={list.loading && !list.data} value={<CountUp value={counts.all} />} sub={`${counts.self} سجّلوا بأنفسهم`} />
        <Stat icon={UserCheck} label="فعّالين" loading={list.loading && !list.data} value={<CountUp value={counts.active} />} sub={counts.paused ? `${counts.paused} موقوف` : 'ولا حساب موقوف'} />
        <Stat icon={Clock} label="بانتظار الموافقة" loading={list.loading && !list.data} value={<CountUp value={counts.pending} />} tone={counts.pending ? 'bad' : undefined} sub={counts.pending ? 'راجعهم تحت' : 'ما في طلبات معلقة'} />
        <Stat icon={Wallet} label="أرصدة الطلاب" loading={list.loading && !list.data} value={<CountUp value={counts.balance / 1e6} format={(v) => `$${v.toFixed(2)}`} />} sub={`${counts.empty} بلا رصيد`} />
      </Reveal>

      <AnimatePresence>
        {pending.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
            <Card icon={Inbox} title="طلبات تسجيل بانتظار موافقتك" subtitle="الطلاب اللي سجّلوا بأنفسهم ما بيقدروا يستخدموا البوابة قبل الموافقة." className="border-warn/30">
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {pending.map((u) => (
                  <motion.div layout key={u.id} className="flex items-center gap-3 rounded-2xl border border-line bg-solid/70 p-3">
                    <Avatar name={u.name} seed={u.id} size={38} />
                    <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setOpenId(u.id)}>
                      <div className="truncate font-medium">{u.name}</div>
                      <div className="truncate text-[11.5px] text-muted"><span className="ltr">{u.email || '—'}</span> · {ago(u.created_at)}</div>
                    </button>
                    <Button size="sm" variant="primary" icon={ShieldCheck} loading={approving === u.id} onClick={(e) => approve(u, e)}>موافقة</Button>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card icon={UsersIcon} title="الطلاب" subtitle={list.data ? `${rows.length} من ${users.length}` : undefined}
        actions={<>
          <Tip content="تحديث"><Button size="icon-sm" variant="ghost" aria-label="تحديث" onClick={reload}><RefreshCw size={16} className={list.loading ? 'animate-spin' : ''} /></Button></Tip>
          <Button variant="primary" size="sm" icon={UserPlus} onClick={() => setCreating(true)}>طالب جديد</Button>
        </>}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Input ref={searchRef} icon={Search} type="search" placeholder="بحث بالاسم أو الإيميل…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }} />
            {!q && <Kbd className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 max-sm:hidden">/</Kbd>}
          </div>
          <Segmented size="sm" value={filter} onChange={setFilter} options={[
            { value: 'all', label: `الكل ${counts.all}` },
            { value: 'pending', label: `بانتظار ${counts.pending}` },
            { value: 'active', label: `فعّال ${counts.active}` },
            { value: 'paused', label: `موقوف ${counts.paused}` },
            { value: 'self', label: 'تسجيل ذاتي' },
            { value: 'empty', label: 'بلا رصيد' },
          ]} />
        </div>
        {list.error && !list.data ? (
          <Empty icon={AlertTriangle} title="ما قدرنا نجيب الطلاب" text={list.error.message} action={<Button icon={RefreshCw} onClick={reload}>إعادة المحاولة</Button>} />
        ) : (
          <DataTable columns={columns} rows={rows} loading={list.loading} onRowClick={(u) => setOpenId(u.id)}
            rowClassName={(u) => cn(u.disabled && 'opacity-60', u.approved === 0 && 'bg-warn-soft/40')}
            empty={users.length
              ? { icon: Search, title: 'ما في نتائج', text: 'جرّب كلمة بحث أو فلتر تاني.', action: <Button size="sm" variant="ghost" onClick={() => { setQ(''); setFilter('all'); }}>مسح الفلاتر</Button> }
              : { icon: UserPlus, title: 'ما في طلاب بعد', text: 'أنشئ أول طالب وابعتله مفتاحه، أو خلّيهم يسجّلوا بأنفسهم.', action: <Button variant="primary" icon={UserPlus} onClick={() => setCreating(true)}>طالب جديد</Button> }} />
        )}
      </Card>

      <CreateUser open={creating} onOpenChange={setCreating} onCreated={reload} onOpen={(id) => { setCreating(false); setOpenId(id); }} />
      <UserSheet id={openId} onOpenChange={(o) => { if (!o) setOpenId(null); }} onChanged={reload} />
    </div>
  );
}

function CreateUser({ open, onOpenChange, onCreated, onOpen }) {
  const [f, setF] = useState({ name: '', email: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  useEffect(() => { if (open) { setF({ name: '', email: '', note: '' }); setDone(null); } }, [open]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api.post('/api/admin/users', { name: f.name.trim(), email: f.email.trim(), note: f.note.trim() });
      setDone({ ...r, name: f.name.trim() }); onCreated();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} icon={UserPlus} title={done ? `تم إنشاء ${done.name} 🎉` : 'طالب جديد'}
      description={done ? 'هاد مفتاحه — ما رح يظهر مرة تانية، انسخه وابعتله ياه هلأ.' : 'بننشئ الحساب ومفتاح API جاهز فوراً.'}
      footer={done ? <>
        <Button variant="ghost" onClick={() => { setDone(null); setF({ name: '', email: '', note: '' }); }}>إنشاء طالب تاني</Button>
        <Button variant="secondary" onClick={() => onOpen(done.id)}>فتح ملفه</Button>
        <Button variant="primary" onClick={() => onOpenChange(false)}>تمام</Button>
      </> : <>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
        <Button variant="primary" type="submit" form="newUserForm" icon={UserPlus} loading={busy}>إنشاء + مفتاح</Button>
      </>}>
      {done ? (
        <SecretBox label="مفتاح الطالب — أرسله له الآن (لن يظهر مرة ثانية):" value={done.api_key} />
      ) : (
        <form id="newUserForm" onSubmit={submit} className="grid gap-3.5">
          <Field label="الاسم"><Input required autoFocus value={f.name} onChange={set('name')} placeholder="مثلاً: سارة أحمد" /></Field>
          <Field label="الإيميل" hint="اختياري"><Input type="email" className="ltr" value={f.email} onChange={set('email')} placeholder="name@example.com" /></Field>
          <Field label="ملاحظة"><Input value={f.note} onChange={set('note')} placeholder="دفعة 2026، مجموعة الصباح…" /></Field>
        </form>
      )}
    </Modal>
  );
}
