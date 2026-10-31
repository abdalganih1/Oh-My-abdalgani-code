// Coupons: generate batches (shown once + auto-copied), list with status, copy, enable/disable, delete.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Copy, Download, Pause, Play, RefreshCw, Search, Sparkles, Ticket, Trash2, Wand2, X, Coins, CircleDollarSign } from 'lucide-react';
import {
  Badge, Button, Card, CopyButton, CountUp, DataTable, Empty, Field, Input, Kbd, Reveal, Segmented, Select, Stat, Tip, copyText, cn, toast, useConfirm,
} from '../../ui/index.js';
import { useAsync } from '../../lib/hooks.js';
import { saveBlob } from '../../lib/api.js';
import { M, date, tokens, usd } from '../../lib/format.js';
import { api, useAdmin } from '../ctx.js';
import { useSlashFocus } from './users/bits.jsx';

const statusOf = (c, now = Date.now() / 1000) => (c.disabled ? 'off' : c.used_count >= c.max_uses ? 'used' : c.expires_at && c.expires_at < now ? 'expired' : 'open');
const ST = { open: { label: 'متاح', tone: 'ok' }, used: { label: 'مستخدم', tone: 'accent' }, expired: { label: 'منتهي', tone: 'bad' }, off: { label: 'موقوف', tone: 'neutral' } };
const salePrice = (c) => c.sale_price ?? (c.kind === 'usd' ? c.amount : 0);
const INIT = { kind: 'usd', amount: '10', group_id: '', valid_days: '30', count: '1', max_uses: '1', expires_in_days: '0', sale_price: '', note: '' };

export default function Coupons() {
  const { groups, groupName, reloadGroups } = useAdmin();
  const confirm = useConfirm();
  const list = useAsync(() => api.get('/api/admin/coupons'), []);
  const coupons = list.data || [];
  const [f, setF] = useState(INIT);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [rowBusy, setRowBusy] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const searchRef = useRef(null);

  useEffect(() => { reloadGroups?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onKey = useSlashFocus(searchRef);
  useEffect(() => { window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onKey]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const groupOpts = useMemo(() => [{ value: '', label: 'كل النماذج' }, ...groups.map((g) => ({ value: g.id, label: g.name }))], [groups]);

  const stats = useMemo(() => {
    const s = { open: 0, used: 0, expired: 0, off: 0, redeemed: 0, revenue: 0 };
    for (const c of coupons) { s[statusOf(c)]++; s.redeemed += c.used_count; s.revenue += c.used_count * salePrice(c); }
    return s;
  }, [coupons]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return coupons.filter((c) => (filter === 'all' || statusOf(c) === filter) && (!s || `${c.code} ${c.note || ''}`.toLowerCase().includes(s)));
  }, [coupons, q, filter]);

  const generate = async (e) => {
    e.preventDefault();
    if (!(+f.amount > 0)) { toast.error('القيمة لازم تكون أكبر من صفر'); return; }
    setBusy(true);
    try {
      const r = await api.post('/api/admin/coupons', { ...f, amount: Math.round(+f.amount * M), sale_price: f.sale_price === '' ? undefined : Math.round(+f.sale_price * M) });
      setFresh({ codes: r.codes, kind: f.kind, amount: +f.amount, note: f.note });
      copyText(r.codes.join('\n'), r.codes.length > 1 ? `تم توليد ${r.codes.length} كوبون ونسخها` : 'تم توليد الكوبون ونسخه');
      list.reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const toggle = async (c) => {
    setRowBusy(c.code);
    try { await api.patch(`/api/admin/coupons/${encodeURIComponent(c.code)}`, { disabled: !c.disabled }); toast.success(c.disabled ? 'تم التفعيل' : 'تم الإيقاف'); await list.reload(); } catch (err) { toast.error(err.message); } finally { setRowBusy(''); }
  };
  const remove = async (c) => {
    if (!(await confirm({ title: 'حذف الكوبون؟', description: <>الكود <b className="font-mono ltr">{c.code}</b> رح يوقف يشتغل. الاشتراكات اللي انفعّلت فيه قبل بتضل.</>, danger: true, confirmText: 'حذف', icon: Trash2 }))) return;
    setRowBusy(c.code);
    try { await api.del(`/api/admin/coupons/${encodeURIComponent(c.code)}`); toast.success('تم الحذف'); await list.reload(); } catch (err) { toast.error(err.message); } finally { setRowBusy(''); }
  };

  const columns = [
    {
      key: 'code', header: 'الكود', primary: true,
      cell: (c) => (
        <div className="flex items-center gap-1">
          <code className={cn('font-mono text-[13px] font-medium tracking-wide ltr', statusOf(c) !== 'open' && 'text-muted')}>{c.code}</code>
          <CopyButton text={c.code} />
        </div>
      ),
    },
    {
      key: 'value', header: 'القيمة',
      cell: (c) => (
        <div>
          <div className="flex items-center gap-1.5 font-semibold num">
            {c.kind === 'usd' ? <CircleDollarSign size={14} className="text-accent" /> : <Coins size={14} className="text-new" />}
            {c.kind === 'usd' ? usd(c.amount) : `${tokens(c.amount)} tok`}
          </div>
          <div className="text-[11.5px] text-muted">بيع: {usd(salePrice(c))}</div>
        </div>
      ),
    },
    { key: 'group', header: 'الفئة', cell: (c) => <span className="text-[13px]">{groupName(c.group_id)}</span> },
    {
      key: 'valid', header: 'صلاحية', hideOnMobile: false,
      cell: (c) => (
        <div className="text-[12.5px]">
          <div>{c.valid_days ? `${c.valid_days} يوم` : 'دائم'}</div>
          {c.expires_at && <Tip content="آخر موعد للتفعيل"><div className="text-[11px] text-muted">يفعّل قبل {date(c.expires_at)}</div></Tip>}
        </div>
      ),
    },
    {
      key: 'uses', header: 'استخدام', width: 110,
      cell: (c) => (
        <div className="min-w-[70px]">
          <div className="text-[12.5px] num">{c.used_count}/{c.max_uses}</div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full grad-bg" style={{ width: `${Math.min(100, (c.used_count / c.max_uses) * 100)}%` }} /></div>
        </div>
      ),
    },
    { key: 'status', header: 'الحالة', cell: (c) => { const s = ST[statusOf(c)]; return <Badge tone={s.tone} dot>{s.label}</Badge>; } },
    { key: 'note', header: 'ملاحظة', hideOnMobile: true, cell: (c) => <span className="text-[12.5px] text-muted">{c.note || ''}</span> },
    {
      key: 'act', header: '', mobileFull: true,
      cell: (c) => (
        <div className="flex justify-end gap-1.5 max-[760px]:justify-start">
          <Button size="xs" variant={c.disabled ? 'soft' : 'ghost'} icon={c.disabled ? Play : Pause} loading={rowBusy === c.code} onClick={() => toggle(c)}>{c.disabled ? 'تفعيل' : 'إيقاف'}</Button>
          <Tip content="حذف"><Button size="icon-sm" variant="ghost" className="text-bad hover:bg-bad-soft" aria-label="حذف" onClick={() => remove(c)}><Trash2 size={15} /></Button></Tip>
        </div>
      ),
    },
  ];

  const unitHint = f.kind === 'usd' ? 'دولار' : 'مليون توكن';
  const preview = `${f.count || 1} × ${f.kind === 'usd' ? `$${(+f.amount || 0).toFixed(2)}` : `${+f.amount || 0}M tok`}`;

  return (
    <div className="space-y-5">
      <Reveal className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Ticket} label="متاحة للبيع" loading={list.loading && !list.data} value={<CountUp value={stats.open} />} sub={`من ${coupons.length} كوبون`} />
        <Stat icon={CheckCircle2} label="مرات التفعيل" loading={list.loading && !list.data} value={<CountUp value={stats.redeemed} />} sub={`${stats.used} كوبون مستهلك بالكامل`} />
        <Stat icon={CircleDollarSign} label="قيمة المبيع المفعّل" loading={list.loading && !list.data} value={<CountUp value={stats.revenue / 1e6} format={(v) => `$${v.toFixed(2)}`} />} sub="حسب سعر البيع" />
        <Stat icon={AlertTriangle} label="منتهية / موقوفة" loading={list.loading && !list.data} value={<CountUp value={stats.expired + stats.off} />} sub={`${stats.expired} منتهي · ${stats.off} موقوف`} />
      </Reveal>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card icon={Wand2} title="توليد كوبونات" subtitle="الأكواد بتنسخ تلقائياً بعد التوليد.">
          <form onSubmit={generate} className="space-y-4">
            <Segmented full value={f.kind} onChange={set('kind')} options={[{ value: 'usd', label: 'رصيد دولار', icon: CircleDollarSign }, { value: 'tokens', label: 'توكنات', icon: Coins }]} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Field label={`القيمة (${unitHint})`}><Input type="number" step="0.01" min="0.01" required value={f.amount} onChange={set('amount')} className="num" /></Field>
              <Field label="العدد" hint="حتى 200 بالدفعة"><Input type="number" min="1" max="200" value={f.count} onChange={set('count')} className="num" /></Field>
              <Field label="مخصص لفئة" className="max-lg:col-span-2"><Select value={f.group_id} onChange={set('group_id')} options={groupOpts} /></Field>
              <Field label="سعر البيع للطالب ($)" className="max-lg:col-span-2" hint="لكل استخدام — فارغ = نفس قيمة الدولار"><Input type="number" step="0.01" min="0" value={f.sale_price} onChange={set('sale_price')} placeholder={f.kind === 'usd' ? (+f.amount || 0).toFixed(2) : '0.00'} className="num" /></Field>
              <Field label="صلاحية الاشتراك (يوم)" hint="0 = دائم"><Input type="number" min="0" value={f.valid_days} onChange={set('valid_days')} className="num" /></Field>
              <Field label="استخدامات لكل كوبون"><Input type="number" min="1" value={f.max_uses} onChange={set('max_uses')} className="num" /></Field>
              <Field label="ينتهي التفعيل بعد (يوم)" hint="0 = لا ينتهي"><Input type="number" min="0" value={f.expires_in_days} onChange={set('expires_in_days')} className="num" /></Field>
              <Field label="ملاحظة" className="col-span-2"><Input value={f.note} onChange={set('note')} placeholder="دفعة 2026" /></Field>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
              <span className="me-auto text-[12.5px] text-muted">رح يتولّد <b className="text-fg ltr num">{preview}</b>{f.group_id ? <> لفئة {groupName(f.group_id)}</> : null}</span>
              <Button variant="ghost" size="sm" onClick={() => setF(INIT)}>إعادة ضبط</Button>
              <Button type="submit" variant="primary" icon={Sparkles} loading={busy}>توليد</Button>
            </div>
          </form>
        </Card>

        <AnimatePresence mode="wait">
          {fresh ? (
            <motion.div key="fresh" initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }} className="min-w-0">
              <Card icon={CheckCircle2} title={`${fresh.codes.length} كوبون جديد`} subtitle={`${fresh.kind === 'usd' ? `$${fresh.amount.toFixed(2)}` : `${fresh.amount}M tok`} لكل كود${fresh.note ? ` · ${fresh.note}` : ''}`} className="h-full border-ok/30"
                actions={<Button size="icon-sm" variant="ghost" aria-label="إخفاء" onClick={() => setFresh(null)}><X size={16} /></Button>}>
                <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-line bg-sunken/60 p-2">
                  {fresh.codes.map((code, i) => (
                    <motion.div key={code} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.025 }}
                      className="flex items-center gap-2 rounded-xl px-2.5 py-1 hover:bg-solid">
                      <span className="w-6 text-[11px] text-muted num">{i + 1}</span>
                      <code className="flex-1 font-mono text-[13.5px] font-medium tracking-wide ltr text-start">{code}</code>
                      <CopyButton text={code} />
                    </motion.div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" icon={Copy} onClick={() => copyText(fresh.codes.join('\n'), 'تم نسخ كل الأكواد')}>نسخ الكل</Button>
                  <Button variant="secondary" size="sm" icon={Download} onClick={() => saveBlob(new Blob([fresh.codes.join('\n') + '\n'], { type: 'text/plain' }), `coupons-${new Date().toISOString().slice(0, 10)}.txt`)}>تنزيل .txt</Button>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-w-0 max-xl:hidden">
              <Card className="h-full" bodyClassName="h-full">
                <Empty icon={Ticket} title="الأكواد الجديدة بتظهر هون" text="ولّد دفعة، وبتنسخ تلقائياً — جاهزة تبعتها للطلاب أو تبيعها." className="h-full" />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Card icon={Ticket} title="الكوبونات" subtitle={list.data ? `${rows.length} من ${coupons.length}` : undefined}
        actions={<Tip content="تحديث"><Button size="icon-sm" variant="ghost" aria-label="تحديث" onClick={() => list.reload()}><RefreshCw size={16} className={list.loading ? 'animate-spin' : ''} /></Button></Tip>}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Input ref={searchRef} icon={Search} type="search" placeholder="بحث بالكود أو الملاحظة…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }} />
            {!q && <Kbd className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 max-sm:hidden">/</Kbd>}
          </div>
          <Segmented size="sm" value={filter} onChange={setFilter} options={[
            { value: 'all', label: `الكل ${coupons.length}` },
            { value: 'open', label: `متاح ${stats.open}` },
            { value: 'used', label: `مستخدم ${stats.used}` },
            { value: 'expired', label: `منتهي ${stats.expired}` },
            { value: 'off', label: `موقوف ${stats.off}` },
          ]} />
        </div>
        {list.error && !list.data ? (
          <Empty icon={AlertTriangle} title="ما قدرنا نجيب الكوبونات" text={list.error.message} action={<Button icon={RefreshCw} onClick={() => list.reload()}>إعادة المحاولة</Button>} />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(c) => c.code} loading={list.loading}
            rowClassName={(c) => cn(statusOf(c) !== 'open' && 'opacity-70')}
            empty={coupons.length
              ? { icon: Search, title: 'ما في نتائج', text: 'جرّب كلمة بحث أو فلتر تاني.' }
              : { icon: Ticket, title: 'ما في كوبونات بعد', text: 'ولّد أول دفعة من النموذج فوق.' }} />
        )}
      </Card>
    </div>
  );
}
