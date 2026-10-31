// Providers & keys: upstream accounts, their encrypted keys, discovery, and the global request order.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react';
import {
  Archive, ArrowDown, ArrowUp, ChevronDown, ChevronsDownUp, ChevronsUpDown, CircleCheck, Download, Eye, EyeOff, FlaskConical, GripVertical, KeyRound,
  ListOrdered, Pencil, Plug, Plus, RefreshCcw, RotateCcw, Search, Settings2, Trash2, TriangleAlert, Power, Replace, Link2,
} from 'lucide-react';
import {
  Badge, Button, Card, DataTable, Empty, Field, Input, Modal, Segmented, Select, Skeleton, Switch, Textarea, Tip, cn, toast, useConfirm,
} from '../../ui/index.js';
import { date, time, tokens, usd } from '../../lib/format.js';
import { useAsync, usePersisted } from '../../lib/hooks.js';
import { api } from '../ctx.js';
import { M, NO_AUTOFILL, PRESETS, SECRET_STYLE, hostOf, provState, slug, sortProviders, toMicro } from './cfg/shared.js';
import { draftFromUpstream, useModelEditor } from './cfg/ModelEditor.jsx';

const FILTERS = [
  { value: '', label: 'الكل' }, { value: 'on', label: 'مفعّل' }, { value: 'off', label: 'موقوف' }, { value: 'nokey', label: 'بلا مفاتيح' }, { value: 'archived', label: 'مؤرشف' },
];

/** Key test verdict → human message + tone. */
function verdictMessage(r) {
  const V = {
    works: ['ok', `المفتاح شغّال — طلب حقيقي على ${r.model || 'النموذج'} نجح (${r.latency_ms}ms)`],
    rate_limited: ['warn', 'المفتاح صحيح بس عليه حد طلبات هلق (429) — جرّب بعد شوي'],
    key_ok: ['ok', 'المفتاح مقبول (ما في نموذج مربوط بهالمزوّد لنجرّب طلب كامل)'],
    key_ok_model_rejected: ['warn', `المفتاح مقبول، بس المزوّد رفض النموذج ${r.model} — راجع اسم النموذج بالمسار`],
    bad_key: ['bad', 'المفتاح غلط أو ملغي (401/403)'],
    no_balance: ['bad', 'المفتاح صحيح بس ما في رصيد أو اشتراك فعّال عند المزوّد'],
    timeout: ['warn', `المزوّد ما رد خلال 30 ثانية على ${r.model || 'النموذج'} — غالباً زحمة عنده، جرّب نموذج تاني`],
    error: ['bad', `خطأ من المزوّد${r.status ? ` (${r.status})` : ' — ما قدرنا نوصله'}`],
  };
  const [tone, text] = V[r.verdict] || (r.ok ? ['ok', 'يعمل'] : ['bad', `فشل (${r.status})`]);
  return { tone, text, detail: r.ok ? '' : String(r.sample || '').slice(0, 140) };
}
function toastVerdict(r) {
  const { tone, text, detail } = verdictMessage(r);
  const fn = tone === 'ok' ? toast.success : tone === 'warn' ? toast.warning : toast.error;
  fn(text, detail ? { description: <span className="ltr block break-all text-start font-mono text-[11.5px]">{detail}</span>, duration: 9000 } : undefined);
}

// ── secret input that browsers won't autofill with the admin login ──
function SecretInput({ value, onChange, placeholder = 'API key', className, autoFocus, name = 'abd-upstream-secret' }) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn('relative min-w-0', className)}>
      <KeyRound size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
      <Input type="text" name={name} {...NO_AUTOFILL} autoFocus={autoFocus} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full ps-9 pe-10 font-mono text-[13px] ltr" style={show || !value ? undefined : SECRET_STYLE} />
      <button type="button" tabIndex={-1} onClick={() => setShow((s) => !s)} aria-label={show ? 'إخفاء' : 'إظهار'}
        className="absolute end-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-fg">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

// ── the global request order (drag & drop + arrows) ──
function OrderItem({ p, i, n, onMove, onDragEnd }) {
  const controls = useDragControls();
  const live = p.enabled && !p.archived_at;
  return (
    <Reorder.Item value={p.id} dragListener={false} dragControls={controls} onDragEnd={onDragEnd} as="li"
      whileDrag={{ scale: 1.02, boxShadow: '0 18px 40px -16px var(--glow)' }}
      className={cn('relative flex items-center gap-3 rounded-2xl border bg-solid px-2.5 py-2 sm:px-3', i === 0 && live ? 'border-accent/40' : 'border-line', !live && 'opacity-55')}>
      <button type="button" aria-label="اسحب للترتيب" onPointerDown={(e) => { e.preventDefault(); controls.start(e); }}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-sunken hover:text-fg active:cursor-grabbing">
        <GripVertical size={17} />
      </button>
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold num', i === 0 ? 'grad-bg text-white' : 'bg-sunken text-muted')}>{i + 1}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{p.name}</div>
        <div className="truncate text-[11.5px] text-muted">
          {i === 0 ? <span className="font-semibold text-ok">أول خيار · </span> : i === n - 1 && n > 1 ? <span className="font-semibold text-fg-2">آخر حل · </span> : null}
          {p.billing === 'subscription' ? 'اشتراك ثابت' : 'حسب الاستخدام'}{!p.keys.length ? ' · بلا مفتاح' : ''}{!p.enabled ? ' · موقوف' : ''}{p.archived_at ? ' · مؤرشف' : ''}
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => onMove(i, -1)} aria-label={`${p.name} لفوق`}><ArrowUp size={15} /></Button>
        <Button size="icon-sm" variant="ghost" disabled={i === n - 1} onClick={() => onMove(i, 1)} aria-label={`${p.name} لتحت`}><ArrowDown size={15} /></Button>
      </div>
    </Reorder.Item>
  );
}

function OrderCard({ providers, setProviders }) {
  const sorted = useMemo(() => sortProviders(providers), [providers]);
  const [ids, setIds] = useState(() => sorted.map((p) => p.id));
  const [saving, setSaving] = useState(false);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  useEffect(() => { setIds(sorted.map((p) => p.id)); }, [sorted]);
  const byId = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);

  const save = async (next) => {
    const before = sorted.map((p) => p.id);
    if (next.join() === before.join()) return;
    setSaving(true);
    try {
      await api.put('/api/admin/providers/order', { ids: next });
      setProviders((list) => list.map((p) => { const k = next.indexOf(p.id); return k < 0 ? p : { ...p, priority: (k + 1) * 10 }; }));
      toast.success(`الترتيب: ${next.slice(0, 3).map((id) => byId.get(id)?.name || id).join(' ← ')}${next.length > 3 ? '…' : ''}`);
    } catch (e) { toast.error(e.message); setIds(before); } finally { setSaving(false); }
  };
  const move = (i, d) => { const a = [...ids]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setIds(a); save(a); };

  return (
    <Card title="ترتيب الطلب" icon={ListOrdered}
      subtitle="بينحفظ لحاله — اسحب أو استعمل الأسهم"
      actions={saving ? <Badge tone="accent" dot pulse>عم يحفظ…</Badge> : <Badge tone="ok"><CircleCheck size={12} />محفوظ</Badge>}>
      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        لكل نموذج، البوابة بتجرّب المزوّدين <b className="text-fg-2">بهالترتيب</b>: الأول اللي عنده مسار للنموذج بيخدم، والباقي احتياط إذا وقع أو خلص حدّه.
        خلّي اشتراكك الثابت (<span className="ltr">z.ai coding plan</span>) فوق، و<span className="ltr">OpenRouter</span> تحت كآخر حل. أي نموذج بتقدر تعطيه ترتيب خاص من إعداداته.
      </p>
      {ids.length ? (
        <Reorder.Group axis="y" values={ids} onReorder={setIds} as="ol" className="flex flex-col gap-2">
          {ids.map((id, i) => byId.get(id) && <OrderItem key={id} p={byId.get(id)} i={i} n={ids.length} onMove={move} onDragEnd={() => save(idsRef.current)} />)}
        </Reorder.Group>
      ) : <p className="text-sm text-muted">ما في مزوّدين بعد.</p>}
    </Card>
  );
}

// ── keys ──
function KeyRow({ k, onChanged, onReplace }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState('');
  const [weight, setWeight] = useState(String(k.weight));
  const [result, setResult] = useState(null);
  useEffect(() => setWeight(String(k.weight)), [k.weight]);
  const run = (name, fn) => async () => { setBusy(name); try { await fn(); } catch (e) { toast.error(e.message); } finally { setBusy(''); } };
  const test = run('test', async () => {
    const r = await api.post(`/api/admin/keys/${k.id}/test`);
    setResult(verdictMessage(r)); toastVerdict(r); await onChanged();
  });
  const toggle = run('toggle', async () => { await api.patch(`/api/admin/keys/${k.id}`, { enabled: !k.enabled }); toast.success(k.enabled ? 'انوقف المفتاح' : 'رجع المفتاح للخدمة'); await onChanged(); });
  const reset = run('reset', async () => { await api.patch(`/api/admin/keys/${k.id}`, { reset: true }); toast.success('تصفّر التبريد والخطأ'); await onChanged(); });
  const del = run('del', async () => {
    if (!(await confirm({ title: 'حذف المفتاح نهائياً؟', description: `${k.label} · ••••${k.key_hint}`, danger: true, confirmText: 'احذف' }))) return;
    await api.del(`/api/admin/keys/${k.id}`); toast.success('انحذف المفتاح'); await onChanged();
  });
  const saveWeight = run('weight', async () => {
    const w = Math.max(1, parseInt(weight, 10) || 1);
    if (w === k.weight) { setWeight(String(w)); return; }
    await api.patch(`/api/admin/keys/${k.id}`, { weight: w }); toast.success(`الوزن صار ${w}`); await onChanged();
  });
  const status = !k.enabled ? <Badge>موقوف</Badge>
    : k.cooling ? <Badge tone="warn" dot pulse>تبريد حتى {time(k.cooldown_until)}</Badge>
      : <Badge tone="ok" dot>جاهز</Badge>;
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
      className={cn('rounded-2xl border border-line bg-solid/70 p-3', !k.enabled && 'opacity-75')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken text-accent"><KeyRound size={16} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{k.label}</div>
          <div className="font-mono text-[12px] text-muted ltr text-start">••••{k.key_hint}</div>
        </div>
        {status}
        <Tip content="عدد الطلبات اللي خدمها"><span className="text-xs text-muted num">{(k.used_count || 0).toLocaleString('en')} طلب</span></Tip>
        <Tip content="الوزن: كل ما زاد، أخذ المفتاح حصة أكبر من الطلبات">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            وزن
            <Input type="number" min="1" inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} onBlur={saveWeight}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="!h-8 !w-16 !px-2 text-center text-[13px] num" aria-label="الوزن" />
          </label>
        </Tip>
      </div>
      {(k.last_error || result) && (
        <div className="mt-2 space-y-1.5">
          {result && (
            <div className={cn('rounded-xl px-3 py-1.5 text-[12.5px]', result.tone === 'ok' ? 'bg-ok-soft text-ok' : result.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad')}>{result.text}</div>
          )}
          {k.last_error && <div className="max-h-16 overflow-auto rounded-xl bg-sunken px-3 py-1.5 font-mono text-[11.5px] leading-relaxed text-muted ltr text-start break-all">{k.last_error}</div>}
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Button size="xs" variant="soft" icon={FlaskConical} loading={busy === 'test'} onClick={test}>اختبار</Button>
        <Button size="xs" variant="ghost" icon={Replace} onClick={() => onReplace(k)}>تبديل</Button>
        <Button size="xs" variant="ghost" icon={Power} loading={busy === 'toggle'} onClick={toggle}>{k.enabled ? 'إيقاف' : 'تفعيل'}</Button>
        {(k.cooling || k.last_error) && <Button size="xs" variant="ghost" icon={RotateCcw} loading={busy === 'reset'} onClick={reset}>تصفير</Button>}
        <Button size="xs" variant="ghost" icon={Trash2} loading={busy === 'del'} onClick={del} className="ms-auto text-bad hover:bg-bad-soft hover:text-bad">حذف</Button>
      </div>
    </motion.div>
  );
}

function AddKeyForm({ providerId, onAdded }) {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [weight, setWeight] = useState('1');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (key.trim().length < 8) return toast.error('المفتاح قصير — الصقه كامل');
    setBusy(true);
    try {
      await api.post(`/api/admin/providers/${encodeURIComponent(providerId)}/keys`, { label: label.trim() || undefined, key: key.trim(), weight: Math.max(1, parseInt(weight, 10) || 1) });
      toast.success('تمت إضافة المفتاح (مشفّر)');
      setLabel(''); setKey(''); setWeight('1');
      await onAdded();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} autoComplete="off" className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 rounded-2xl border border-dashed border-line-strong bg-sunken/40 p-3 sm:grid-cols-[150px_minmax(0,1fr)_80px_auto]">
      {/* decoy fields soak up any password-manager autofill */}
      <input type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden className="hidden" readOnly value="" />
      <input type="password" name="password" autoComplete="new-password" tabIndex={-1} aria-hidden className="hidden" readOnly value="" />
      <Input name="abd-key-label" {...NO_AUTOFILL} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="اسم (حساب 1)" aria-label="اسم المفتاح" className="col-span-2 sm:col-span-1" />
      <SecretInput value={key} onChange={(e) => setKey(e.target.value)} className="col-span-2 sm:col-span-1" />
      <Input type="number" min="1" inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="الوزن" title="الوزن" className="text-center num" />
      <Button type="submit" variant="primary" icon={Plus} loading={busy}>إضافة مفتاح</Button>
    </form>
  );
}

function ReplaceKeyDialog({ keyRow: live, onClose, onDone }) {
  const last = useRef(live);
  if (live) last.current = live;
  const keyRow = live || last.current;
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (live) setKey(''); }, [live]);
  const submit = async (e) => {
    e?.preventDefault();
    if (key.trim().length < 8) return toast.error('المفتاح قصير — الصقه كامل');
    setBusy(true);
    try { await api.patch(`/api/admin/keys/${keyRow.id}`, { key: key.trim() }); toast.success('تم التبديل'); onClose(); await onDone(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!live} onOpenChange={(o) => { if (!o) onClose(); }} size="sm" icon={Replace} title="تبديل المفتاح"
      description={keyRow ? <>المفتاح الجديد رح يستبدل <span className="font-mono ltr">••••{keyRow.key_hint}</span> بنفس الإعدادات (الاسم والوزن).</> : null}
      footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button variant="primary" loading={busy} onClick={submit}>تبديل</Button></>}>
      <form onSubmit={submit} autoComplete="off">
        <input type="password" name="password" autoComplete="new-password" tabIndex={-1} aria-hidden className="hidden" readOnly value="" />
        <SecretInput autoFocus value={key} onChange={(e) => setKey(e.target.value)} placeholder="المفتاح الجديد" />
      </form>
    </Modal>
  );
}

// ── one provider (collapsible) ──
function ProviderCard({ p, rank, open, onToggle, reload, onEdit, onDiscover, discovering, onReplace, setProviders }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState('');
  const st = provState(p);
  const ready = p.keys.filter((k) => k.enabled && !k.cooling).length;
  const run = (name, fn) => async () => { setBusy(name); try { await fn(); } catch (e) { toast.error(e.message); } finally { setBusy(''); } };

  const toggle = async (on) => {
    setProviders((list) => list.map((x) => (x.id === p.id ? { ...x, enabled: on ? 1 : 0 } : x)));
    try {
      await api.post('/api/admin/providers', { ...p, enabled: on });
      toast.success(on ? `${p.name}: مفعّل` : `${p.name}: موقوف — ما رح يوصله ولا طلب`);
    } catch (e) { toast.error(e.message); }
    await reload();
  };
  const archive = run('archive', async () => {
    if (!(await confirm({ title: `أرشفة ${p.name}؟`, description: 'مساراته رح تتوقف (والنماذج اللي ما إلها غيره رح تتأرشف بالفحص الجاي).', danger: true, confirmText: 'أرشف', icon: Archive }))) return;
    await api.post(`/api/admin/providers/${encodeURIComponent(p.id)}/archive`); toast.success('تأرشف'); await reload();
  });
  const restore = run('restore', async () => { await api.post(`/api/admin/providers/${encodeURIComponent(p.id)}/restore`); toast.success('رجع للخدمة'); await reload(); });
  const del = run('del', async () => {
    if (!(await confirm({ title: `حذف ${p.name} نهائياً؟`, description: 'مع مفاتيحه ومساراته. النماذج اللي ما إلها مزوّد غيره رح توقف.', danger: true, confirmText: 'احذف نهائياً', requireText: p.id, icon: Trash2 }))) return;
    await api.del(`/api/admin/providers/${encodeURIComponent(p.id)}`); toast.success('انحذف'); onToggle(false, true); await reload();
  });

  const badge = st === 'archived' ? <Tip content={p.archived_reason}><Badge tone="bad">مؤرشف</Badge></Tip>
    : st === 'off' ? <Badge>موقوف</Badge>
      : !p.keys.length ? <Badge tone="warn" dot>بلا مفتاح</Badge>
        : p.first_fail_at ? <Badge tone="warn" dot pulse>عم يفشل</Badge>
          : <Badge tone="ok" dot>شغّال</Badge>;
  const initial = (p.name || p.id).trim().charAt(0).toUpperCase();

  return (
    <motion.div layout="position" id={`prov-${p.id}`}
      className={cn('glass overflow-hidden rounded-3xl transition-[border-color,box-shadow]', open && 'border-accent/25', st === 'archived' && 'opacity-80')}>
      <div role="button" tabIndex={0} aria-expanded={open} onClick={() => onToggle(!open)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onToggle(!open); } }}
        className="flex cursor-pointer select-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 hover:bg-accent-soft/30 focus-visible:bg-accent-soft/40 focus-visible:outline-none sm:px-5">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl font-display text-lg font-bold', st === 'on' ? 'grad-bg text-white shadow-[0_8px_20px_-8px_var(--glow)]' : 'bg-sunken text-muted')}>{initial}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <b className="truncate font-display text-[15px] font-semibold">{p.name}</b>
          </div>
          <div className="truncate font-mono text-[11.5px] text-muted ltr text-start">{p.id} · #{rank}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 max-sm:order-last max-sm:w-full max-sm:ps-14">
          {badge}
          <Badge tone="accent"><KeyRound size={12} />{p.keys.length ? `${ready}/${p.keys.length} مفتاح` : '0 مفتاح'}</Badge>
          <span className="hidden max-w-[240px] truncate text-xs text-muted ltr xl:inline">{hostOf(p.openai_base_url || p.anthropic_base_url)}</span>
        </div>
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex items-center">
          <Tip content={p.enabled ? 'إيقاف المزوّد' : 'تفعيل المزوّد'}>
            <span><Switch checked={!!p.enabled} disabled={!!p.archived_at} onCheckedChange={toggle} /></span>
          </Tip>
        </div>
        <ChevronDown size={18} className={cn('shrink-0 text-muted transition-transform duration-300', open && 'rotate-180 text-accent')} />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
            <div className="space-y-4 border-t border-line px-4 pb-5 pt-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="soft" icon={Download} loading={discovering} onClick={() => onDiscover(p)}>استعراض نماذج المزوّد</Button>
                <Button size="sm" icon={Pencil} onClick={() => onEdit(p)}>تعديل</Button>
                {p.archived_at
                  ? <Button size="sm" variant="primary" icon={RefreshCcw} loading={busy === 'restore'} onClick={restore}>استعادة</Button>
                  : <Button size="sm" variant="ghost" icon={Archive} loading={busy === 'archive'} onClick={archive}>أرشفة</Button>}
                <Button size="sm" variant="danger" icon={Trash2} loading={busy === 'del'} onClick={del} className="ms-auto">حذف نهائي</Button>
              </div>

              <div className="grid gap-2 text-[12.5px] sm:grid-cols-2">
                <Info label="OpenAI" mono>{p.openai_base_url || '—'}</Info>
                <Info label="Anthropic" mono>{p.anthropic_base_url || '—'}</Info>
                <Info label="المصادقة" mono>{p.auth_style === 'x-api-key' ? 'x-api-key' : 'Authorization: Bearer'}</Info>
                <Info label="الدفع">{p.billing === 'subscription' ? <>اشتراك ثابت {usd(p.monthly_fee)}/شهر</> : 'حسب الاستخدام'}</Info>
                <Info label="مزامنة النماذج">{p.last_sync_at ? <>آخر مزامنة: {date(p.last_sync_at)}</> : 'لم تتم مزامنة النماذج بعد'}</Info>
                {(p.sync_error || p.archived_reason || (p.first_fail_at && !p.archived_at)) && (
                  <Info label="ملاحظات">
                    <span className="flex flex-wrap gap-x-2">
                      {p.sync_error && <span className="text-bad">{p.sync_error}</span>}
                      {p.archived_reason && <span>{p.archived_reason}</span>}
                      {p.first_fail_at && !p.archived_at && <span className="text-warn">يفشل منذ {date(p.first_fail_at)}</span>}
                    </span>
                  </Info>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h4 className="font-display text-[14px] font-semibold">المفاتيح</h4>
                  <span className="text-xs text-muted">مشفّرة — بتتوزّع الطلبات حسب الوزن</span>
                </div>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {p.keys.map((k) => <KeyRow key={k.id} k={k} onChanged={reload} onReplace={onReplace} />)}
                  </AnimatePresence>
                  {!p.keys.length && <p className="rounded-2xl bg-warn-soft px-3 py-2 text-[13px] text-warn">لا مفاتيح — أضف واحد تحت</p>}
                  <AddKeyForm providerId={p.id} onAdded={reload} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
function Info({ label, children, mono }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 rounded-xl bg-sunken/60 px-3 py-2">
      <span className="shrink-0 text-[11.5px] font-semibold text-muted">{label}</span>
      <span className={cn('min-w-0 break-all text-fg-2', mono && 'font-mono text-[12px] ltr text-start')}>{children}</span>
    </div>
  );
}

// ── add / edit provider ──
const EMPTY_FORM = { id: '', name: '', openai_base_url: '', anthropic_base_url: '', auth_style: 'bearer', billing: 'usage', monthly_fee: '', key: '', extra_headers: '', compat: '', auto: '' };
function ProviderDialog({ state, onClose, providers, onSaved }) {
  const confirm = useConfirm();
  const lastState = useRef(state);
  if (state) lastState.current = state;
  const editing = (state || lastState.current)?.prov || null;
  const [f, setF] = useState(EMPTY_FORM);
  const [preset, setPreset] = useState('custom');
  const [idTouched, setIdTouched] = useState(false);
  const [adv, setAdv] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(null);
  const keyRef = useRef(null);
  useEffect(() => {
    if (!state) return;
    const p = state.prov;
    setPreset('custom'); setIdTouched(false); setBusy(false);
    if (p) {
      const v = { ...EMPTY_FORM };
      for (const n of ['id', 'name', 'openai_base_url', 'anthropic_base_url', 'extra_headers', 'compat', 'auto']) v[n] = p[n] || '';
      v.auth_style = p.auth_style || 'bearer'; v.billing = p.billing || 'usage'; v.monthly_fee = p.monthly_fee ? String(p.monthly_fee / M) : '';
      setF(v); setAdv(!!(p.extra_headers || p.compat || p.auto));
    } else { setF(EMPTY_FORM); setAdv(false); }
  }, [state]);
  const set = (k) => (e) => {
    const v = e?.target ? e.target.value : e;
    setF((s) => {
      const n = { ...s, [k]: v };
      if (k === 'name' && !editing && !idTouched) n.id = slug(v);
      return n;
    });
    if (k === 'id') setIdTouched(true);
  };
  const pickPreset = (id) => {
    setPreset(id);
    const x = PRESETS.find((p) => p.id === id);
    if (!x || x.id === 'custom') { setF((s) => ({ ...s, name: '', id: '', openai_base_url: '', anthropic_base_url: '' })); setIdTouched(false); setTimeout(() => nameRef.current?.focus(), 30); return; }
    let pid = x.id; for (let i = 2; providers.some((p) => p.id === pid); i++) pid = `${x.id}-${i}`; // a second account of the same provider
    setF((s) => ({ ...s, name: pid === x.id ? x.name : `${x.name} ${pid.split('-').pop()}`, id: pid, openai_base_url: x.openai || '', anthropic_base_url: x.anthropic || '', auth_style: x.auth || 'bearer', billing: x.billing || 'usage' }));
    setIdTouched(true);
    setTimeout(() => keyRef.current?.querySelector('input')?.focus(), 30);
  };
  const urlErr = (u) => (u && !/^https:\/\/[^\s/@]+/i.test(u.trim()) ? 'لازم يبلّش بـ https://' : null);
  const jsonErr = (s) => { if (!s.trim()) return null; try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? null : 'لازم يكون JSON object'; } catch { return 'JSON غير صالح'; } };

  const submit = async (e) => {
    e?.preventDefault();
    const { key, ...d } = f;
    if (!d.name.trim() || !d.id.trim()) return toast.error('الاسم والمعرّف مطلوبين');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,80}$/.test(d.id)) return toast.error('المعرّف بالإنجليزي: حروف، أرقام، . _ : / -');
    if (!d.openai_base_url && !d.anthropic_base_url) return toast.error('لازم رابط واحد على الأقل');
    if (urlErr(d.openai_base_url) || urlErr(d.anthropic_base_url)) return toast.error('الروابط لازم تكون https://');
    const bad = ['extra_headers', 'auto', 'compat'].find((k) => jsonErr(d[k]));
    if (bad) { setAdv(true); return toast.error(`${bad}: ${jsonErr(d[bad])}`); }
    const prev = providers.find((p) => p.id === d.id);
    if (prev && !editing && !(await confirm({ title: 'المعرّف مستعمل', description: `في مزوّد بنفس المعرّف (${d.id}). بدك تستبدل إعداداته؟`, danger: true, confirmText: 'استبدل' }))) return;
    setBusy(true);
    try {
      await api.post('/api/admin/providers', { ...d, name: d.name.trim(), monthly_fee: toMicro(d.monthly_fee), enabled: prev ? !!prev.enabled : true });
      let msg = 'تم الحفظ', failed = false;
      if (key && key.trim()) {
        await api.post(`/api/admin/providers/${encodeURIComponent(d.id)}/keys`, { label: 'key 1', key: key.trim(), weight: 1 });
        const list = await api.get('/api/admin/providers');
        const kid = list.find((p) => p.id === d.id)?.keys.at(-1)?.id;
        const t = kid ? await api.post(`/api/admin/keys/${kid}/test`).catch(() => null) : null;
        if (t?.ok) msg = `انحفظ والمفتاح شغّال (${t.latency_ms}ms) — استعرض نماذجه من بطاقته`;
        else { failed = true; msg = `انحفظ، بس اختبار المفتاح فشل${t ? `: ${verdictMessage(t).text}` : ''}`; }
      }
      (failed ? toast.error : toast.success)(msg);
      onClose(); await onSaved(d.id);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const presetOpts = PRESETS.map((x) => ({ value: x.id, label: x.name, hint: x.openai || x.anthropic ? hostOf(x.openai || x.anthropic) : 'أي رابط OpenAI أو Anthropic متوافق' }));
  return (
    <Modal open={!!state} onOpenChange={(o) => { if (!o) onClose(); }} size="lg" icon={Plug}
      title={editing ? `تعديل ${editing.name}` : 'مزوّد جديد'}
      description={<>الروابط لازم تكون <span className="ltr">https://</span>. بعد الحفظ بتقدر تستعرض نماذج المزوّد وتضيفها بضغطة.</>}
      footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button variant="primary" loading={busy} onClick={submit}>حفظ المزوّد</Button></>}>
      <form onSubmit={submit} autoComplete="off" className="space-y-4">
        <input type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden className="hidden" readOnly value="" />
        <input type="password" name="password" autoComplete="new-password" tabIndex={-1} aria-hidden className="hidden" readOnly value="" />
        {!editing && (
          <Field label='ابدأ من مزوّد معروف، أو اختر "مخصص" وحط أي رابط'>
            <Select value={preset} onChange={pickPreset} options={presetOpts} searchable />
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم"><Input ref={nameRef} {...NO_AUTOFILL} name="abd-prov-name" value={f.name} onChange={set('name')} placeholder="DeepSeek" required autoFocus={!!editing} /></Field>
          <Field label="المعرّف (بالإنجليزي، ما بيتغيّر)"><Input mono {...NO_AUTOFILL} name="abd-prov-id" value={f.id} onChange={set('id')} readOnly={!!editing} required placeholder="deepseek" /></Field>
          <Field className="sm:col-span-2" label={<>رابط OpenAI-compatible (ينتهي غالباً بـ <span className="ltr">/v1</span>)</>} error={urlErr(f.openai_base_url)}>
            <Input mono icon={Link2} type="url" {...NO_AUTOFILL} name="abd-prov-openai" value={f.openai_base_url} onChange={set('openai_base_url')} placeholder="https://api.example.com/v1" />
          </Field>
          <Field className="sm:col-span-2" label="رابط Anthropic-compatible (اختياري — لـ Claude Code مباشرة)" error={urlErr(f.anthropic_base_url)}>
            <Input mono icon={Link2} type="url" {...NO_AUTOFILL} name="abd-prov-anthropic" value={f.anthropic_base_url} onChange={set('anthropic_base_url')} placeholder="https://api.example.com/anthropic" />
          </Field>
          <Field label="المصادقة">
            <Select value={f.auth_style} onChange={set('auth_style')} mono options={[{ value: 'bearer', label: 'Authorization: Bearer' }, { value: 'x-api-key', label: 'x-api-key (Anthropic)' }]} />
          </Field>
          <Field label="طريقة الدفع للمزوّد">
            <Segmented full value={f.billing} onChange={set('billing')} options={[{ value: 'usage', label: 'حسب الاستخدام' }, { value: 'subscription', label: 'اشتراك شهري ثابت' }]} />
          </Field>
          <Field label="الاشتراك الشهري ($)" hint={f.billing === 'subscription' ? 'بيدخل بحساب الربح الشهري' : 'للمزوّدين باشتراك ثابت'}>
            <Input type="number" step="0.01" min="0" inputMode="decimal" value={f.monthly_fee} onChange={set('monthly_fee')} placeholder="مثلاً 30" className="num" />
          </Field>
          <Field label="مفتاح API (اختياري — بينحفظ مشفّر)" hint={editing ? 'إذا حطيت مفتاح هون بينضاف كمفتاح جديد' : 'بنختبره فوراً بعد الحفظ'}>
            <div ref={keyRef}><SecretInput value={f.key} onChange={set('key')} placeholder="sk-…" /></div>
          </Field>
        </div>

        <div className="rounded-2xl border border-line">
          <button type="button" onClick={() => setAdv((s) => !s)} aria-expanded={adv} className="flex w-full items-center gap-2 px-4 py-3 text-[13.5px] font-medium text-fg-2 hover:text-fg">
            <Settings2 size={16} className="text-accent" />إعدادات متقدمة
            <span className="text-xs font-normal text-muted">Headers · auto · compat</span>
            <ChevronDown size={16} className={cn('ms-auto text-muted transition-transform', adv && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {adv && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="grid gap-3 border-t border-line p-4">
                  <Field label="Headers إضافية (JSON)" error={jsonErr(f.extra_headers)}><Textarea mono rows={2} className="min-h-0" value={f.extra_headers} onChange={set('extra_headers')} placeholder='{"X-Title":"abd"}' /></Field>
                  <Field label="سياسة النماذج الجديدة auto (JSON)" error={jsonErr(f.auto)}><Textarea mono rows={2} className="min-h-0" value={f.auto} onChange={set('auto')} placeholder='{"publish":true,"free_only":false,"group":"coding","pricing_mode":"request","price_request":0,"markup_pct":0}' /></Field>
                  <Field label="توافق الطلبات compat (JSON)" error={jsonErr(f.compat)}><Textarea mono rows={2} className="min-h-0" value={f.compat} onChange={set('compat')} placeholder='{"max_tokens_field":"max_tokens","developer_role":false,"efforts":["low","medium","high"]}' /></Field>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ── discover upstream models ──
function DiscoverDialog({ data: live, onClose, onImport }) {
  const last = useRef(live);
  if (live) last.current = live;
  const data = live || last.current;
  const [q, setQ] = useState('');
  useEffect(() => { if (live) setQ(''); }, [live]);
  const rows = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    return data.list.filter((m) => !s || m.id.toLowerCase().includes(s) || String(m.name || '').toLowerCase().includes(s));
  }, [data, q]);
  const per1M = (v) => (v != null ? `$${(v / M).toFixed(3)}` : '—');
  const cols = [
    { key: 'id', header: 'upstream id', primary: true, cell: (m) => (
      <div className="min-w-0">
        <div className="break-all font-mono text-[12.5px] ltr text-start">{m.id}</div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {m.free && <Badge tone="ok" className="h-5 text-[10.5px]">مجاني</Badge>}
          {m.vision && <Badge className="h-5 text-[10.5px]">صور</Badge>}
        </div>
      </div>
    ) },
    { key: 'ctx', header: 'سياق', align: 'end', cell: (m) => <span className="num">{m.context_length ? tokens(m.context_length) : '—'}</span> },
    { key: 'in', header: '$ دخل/1M', align: 'end', cell: (m) => <span className="num ltr">{per1M(m.price_in)}</span> },
    { key: 'out', header: '$ خرج/1M', align: 'end', cell: (m) => <span className="num ltr">{per1M(m.price_out)}</span> },
    { key: 'act', header: '', align: 'end', mobileFull: true, cell: (m) => (data.existing.has(m.id)
      ? <Badge tone="ok"><CircleCheck size={12} />مضاف</Badge>
      : <Button size="xs" variant="soft" icon={Plus} onClick={(e) => { e.stopPropagation(); onImport(m); }}>إضافة</Button>) },
  ];
  return (
    <Modal open={!!live} onOpenChange={(o) => { if (!o) onClose(); }} size="xl" icon={Download}
      title={data ? <>نماذج {data.provider.name} <span className="num text-muted">({data.list.length})</span></> : ''}
      description="اضغط إضافة لتفتح محرّر النموذج معبّى. إذا النموذج موجود، المسار بينضاف كاحتياط."
      footer={<Button variant="ghost" onClick={onClose}>إغلاق</Button>}>
      {data && <>
        <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="فلترة..." className="mb-3" autoFocus />
        <DataTable columns={cols} rows={rows} rowKey={(m) => m.id} dense maxHeight="58vh"
          empty={{ icon: Search, title: data.list.length ? 'ما في نتائج' : 'المزوّد ما رجّع ولا نموذج' }} />
      </>}
    </Modal>
  );
}

// ── panel ──
export default function Providers() {
  const { data, error, loading, reload, setData } = useAsync(() => api.get('/api/admin/providers'), []);
  const providers = data || [];
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [openIds, setOpenIds] = usePersisted('abd:provOpen', []);
  const [dlg, setDlg] = useState(null); // { prov } | { prov: null }
  const [disc, setDisc] = useState(null);
  const [discBusy, setDiscBusy] = useState('');
  const [replacing, setReplacing] = useState(null);
  const modelsRef = useRef([]);
  const searchRef = useRef(null);
  const { openModel, editor } = useModelEditor({ providers, getModels: useCallback(() => modelsRef.current, []), onSaved: () => reload() });

  const openSet = useMemo(() => new Set(openIds), [openIds]);
  const ranks = useMemo(() => new Map(sortProviders(providers).map((p, i) => [p.id, i + 1])), [providers]);
  const ql = q.trim().toLowerCase();
  const list = useMemo(() => providers.filter((p) => {
    if (ql && ![p.id, p.name, p.openai_base_url, p.anthropic_base_url].some((v) => (v || '').toLowerCase().includes(ql))) return false;
    if (filter === 'nokey') return !p.keys.length;
    return !filter || provState(p) === filter;
  }), [providers, ql, filter]);
  const n = (f) => providers.filter((p) => (f === 'nokey' ? !p.keys.length : provState(p) === f)).length;

  const toggleOpen = (id, open, force) => {
    if (ql && !force) return; // while searching every match is open; don't persist
    setOpenIds((ids) => (open ? [...new Set([...ids, id])] : ids.filter((x) => x !== id)));
  };
  const setProviders = useCallback((fn) => setData((d) => fn(d || [])), [setData]);

  const discover = async (p) => {
    setDiscBusy(p.id);
    try {
      const [lst, models] = await Promise.all([api.post(`/api/admin/providers/${encodeURIComponent(p.id)}/discover`), api.get('/api/admin/models')]);
      modelsRef.current = models; // fresh, so "already added" and route-merging are right
      const existing = new Set(models.flatMap((m) => (m.routes || []).filter((r) => r.provider_id === p.id).map((r) => r.upstream_model)));
      setDisc({ provider: p, list: lst, existing });
    } catch (e) { toast.error(e.message); } finally { setDiscBusy(''); }
  };

  useEffect(() => {
    const on = (e) => { if (e.detail === 'new-provider') setDlg({ prov: null }); };
    window.addEventListener('abd:cmd', on);
    return () => window.removeEventListener('abd:cmd', on);
  }, []);
  useEffect(() => {
    const on = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; if (t.closest?.('input,textarea,[contenteditable],[role=dialog]')) return;
      e.preventDefault(); searchRef.current?.focus();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const afterSave = async (id) => {
    setOpenIds((ids) => [...new Set([...ids, id])]);
    await reload();
    setTimeout(() => document.getElementById(`prov-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
  };

  return (
    <div className="grid gap-4 sm:gap-5">
      <Card pad={false} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Input ref={searchRef} icon={Search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم المزوّد أو الرابط… (/)" className="min-w-[220px] flex-1" aria-label="بحث" />
          <Segmented value={filter} onChange={setFilter} options={FILTERS} size="sm" className="max-sm:w-full" />
          <div className="flex items-center gap-1.5 max-sm:w-full">
            <Tip content="فتح الكل"><Button size="icon" variant="ghost" aria-label="فتح الكل" onClick={() => setOpenIds(providers.map((p) => p.id))}><ChevronsUpDown size={17} /></Button></Tip>
            <Tip content="طي الكل"><Button size="icon" variant="ghost" aria-label="طي الكل" onClick={() => setOpenIds([])}><ChevronsDownUp size={17} /></Button></Tip>
            <Button variant="primary" icon={Plus} onClick={() => setDlg({ prov: null })} className="max-sm:ms-auto max-sm:flex-1">مزوّد جديد</Button>
          </div>
        </div>
        {!loading || data ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className="font-semibold text-fg-2 num">{providers.length} مزوّد</span>
            <span>·</span><span className="text-ok num">{n('on')} مفعّل</span>
            <span>·</span><span className="num">{n('off')} موقوف</span>
            <span>·</span><span className="num">{n('archived')} مؤرشف</span>
            <span>·</span><span className={cn('num', n('nokey') && 'text-warn')}>{n('nokey')} بلا مفاتيح</span>
            {list.length !== providers.length && <span className="ms-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent-ink">عم يظهر {list.length}</span>}
          </div>
        ) : <Skeleton className="mt-3 h-4 w-72" />}
      </Card>

      {error && !data ? (
        <Card><Empty icon={TriangleAlert} title="ما قدرنا نجيب المزوّدين" text={error.message} action={<Button onClick={reload} icon={RefreshCcw}>جرّب مرة تانية</Button>} /></Card>
      ) : (
        <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-w-0 gap-3">
            {loading && !data ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[74px] rounded-3xl" />)
              : list.length ? list.map((p) => (
                <ProviderCard key={p.id} p={p} rank={ranks.get(p.id)} open={!!ql || openSet.has(p.id)} onToggle={(o, force) => toggleOpen(p.id, o, force)}
                  reload={reload} setProviders={setProviders} onEdit={(prov) => setDlg({ prov })} onDiscover={discover} discovering={discBusy === p.id} onReplace={setReplacing} />
              )) : (
                <Card><Empty icon={Plug} title={providers.length ? 'ما في مزوّد بهالبحث' : 'ما في مزوّدين بعد'}
                  text={providers.length ? 'جرّب كلمة تانية أو شيل الفلتر.' : 'ضيف أول مزوّد — اختار من 20 مزوّد معروف أو حط أي رابط متوافق.'}
                  action={<Button variant="primary" icon={Plus} onClick={() => setDlg({ prov: null })}>مزوّد جديد</Button>} /></Card>
              )}
          </div>
          <div className="min-w-0">
            {loading && !data ? <Skeleton className="h-72 rounded-3xl" /> : <OrderCard providers={providers} setProviders={setProviders} />}
          </div>
        </div>
      )}

      <ProviderDialog state={dlg} onClose={() => setDlg(null)} providers={providers} onSaved={afterSave} />
      <DiscoverDialog data={disc} onClose={() => setDisc(null)} onImport={(m) => { const pid = disc.provider.id; setDisc(null); openModel(draftFromUpstream(m, pid), true); }} />
      <ReplaceKeyDialog keyRow={replacing} onClose={() => setReplacing(null)} onDone={reload} />
      {editor}
    </div>
  );
}
