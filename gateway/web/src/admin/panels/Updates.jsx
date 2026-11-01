// Lifecycle updates: event feed (mark read), run-now sync, new upstream models waiting for a
// decision (publish / dismiss), every provider's upstream catalog, and archiving settings.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle, Archive, BellRing, BookOpen, CheckCheck, CircleCheck, EyeOff, Gift, Library, Plug, PlugZap, RefreshCw, Rocket, Save, Search,
  ShieldAlert, Siren, Sliders, Sparkles, UserPlus, Undo2, Monitor, X, Brain, Image as ImageIcon,
} from 'lucide-react';
import {
  Badge, Button, Card, DataTable, Empty, Field, Input, Modal, Reveal, Segmented, Select, Skeleton, Switch, Tip, cn, toast,
} from '../../ui/index.js';
import { useAsync } from '../../lib/hooks.js';
import { M, ago, date, day, int, tokens } from '../../lib/format.js';
import { findTwin } from './cfg/shared.js';
import { api, useAdmin } from '../ctx.js';

const KIND = {
  model_discovered: { icon: Sparkles, tone: 'new', label: 'نموذج جديد', cat: 'models' },
  model_published: { icon: CircleCheck, tone: 'ok', label: 'نُشر', cat: 'models' },
  model_archived: { icon: Archive, tone: 'warn', label: 'أُرشف', cat: 'models' },
  model_restored: { icon: Undo2, tone: 'ok', label: 'رجع', cat: 'models' },
  model_merged: { icon: CircleCheck, tone: 'accent', label: 'دمج', cat: 'models' },
  provider_archived: { icon: PlugZap, tone: 'bad', label: 'مزوّد مؤرشف', cat: 'providers' },
  provider_restored: { icon: Plug, tone: 'ok', label: 'مزوّد رجع', cat: 'providers' },
  sync_error: { icon: AlertTriangle, tone: 'bad', label: 'خطأ مزامنة', cat: 'providers' },
  abuse_alert: { icon: Siren, tone: 'bad', label: 'تنبيه إساءة', cat: 'security' },
  security_block: { icon: ShieldAlert, tone: 'warn', label: 'حظر', cat: 'security' },
  device_new: { icon: Monitor, tone: 'accent', label: 'جهاز جديد', cat: 'security' },
  device_rejected: { icon: Monitor, tone: 'bad', label: 'جهاز مرفوض', cat: 'security' },
  user_signup: { icon: UserPlus, tone: 'accent', label: 'حساب جديد', cat: 'users' },
};
const TONE_BG = { new: 'bg-new-soft text-new', ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', accent: 'bg-accent-soft text-accent-ink', neutral: 'bg-sunken text-muted' };
const CATS = [
  { value: 'all', label: 'الكل' }, { value: 'unread', label: 'غير مقروء' }, { value: 'models', label: 'النماذج' },
  { value: 'providers', label: 'المزوّدون' }, { value: 'security', label: 'الأمان' }, { value: 'users', label: 'الطلاب' },
];
const per1M = (v) => (v == null ? '—' : `⁦$${(v / M).toFixed(3)}⁩`);

export default function Updates() {
  const { refreshStats } = useAdmin();
  const events = useAsync(() => api.get('/api/admin/events?limit=300'), []);
  const pending = useAsync(() => api.get('/api/admin/catalog?pending=1'), []);
  const providers = useAsync(() => api.get('/api/admin/providers'), []);
  const [publish, setPublish] = useState(null);
  const [catalogNonce, setCatalogNonce] = useState(0);

  const reloadAll = () => { events.reload(); pending.reload(); setCatalogNonce((n) => n + 1); refreshStats(); };

  const [running, setRunning] = useState(false);
  const runNow = async () => {
    setRunning(true);
    try {
      const r = await api.post('/api/admin/maintenance');
      const sync = r.sync || [];
      const found = sync.reduce((a, x) => a + (x.discovered || 0), 0);
      const errs = sync.filter((x) => x.error).length;
      toast.success(`تم الفحص: ${sync.filter((x) => x.models).length} مزوّد · ${found} نموذج جديد · ${r.models?.archived?.length || 0} أُرشف · ${r.models?.promoted || 0} انتهت شارة جديد`,
        errs ? { description: `${errs} مزوّد ما رد بنجاح` } : undefined);
    } catch (e) { toast.error(e.message); } finally { setRunning(false); }
    reloadAll();
  };

  const dismiss = async (m) => {
    try {
      await api.post('/api/admin/catalog/dismiss', { provider_id: m.provider_id, upstream_id: m.upstream_id });
      toast.success('تم التجاهل'); pending.reload(); setCatalogNonce((n) => n + 1);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="flex flex-col gap-5">
      <Feed events={events} running={running} onRun={runNow} onRead={async () => {
        try { await api.post('/api/admin/events/read'); events.setData((l) => (l || []).map((e) => ({ ...e, read: 1 }))); await refreshStats(); toast.success('تعلّم الكل كمقروء'); }
        catch (e) { toast.error(e.message); }
      }} />

      <Reveal delay={0.05}>
        <Card title="نماذج جديدة عند المزوّدين بانتظار قرارك" icon={Sparkles}
          subtitle="ظهرت بقائمة المزوّد ولسا ما انتشرت ولا تجاهلتها"
          actions={pending.data?.length ? <Badge tone="new" dot pulse>{pending.data.length} معلّق</Badge> : null}>
          <DataTable loading={pending.loading && !pending.data} rows={pending.data || []} rowKey={(m) => `${m.provider_id}/${m.upstream_id}`}
            empty={<Empty icon={CheckCheck} title="لا شيء معلّق" text="أي نموذج جديد بيظهر عند مزوّد بيوصل لهون — أو بينشر تلقائياً حسب سياسة المزوّد." />}
            columns={catalogColumns({ onPublish: setPublish, onDismiss: dismiss, pendingMode: true })} />
        </Card>
      </Reveal>

      <Catalog providers={providers.data || []} nonce={catalogNonce} onPublish={setPublish} onDismiss={dismiss} />

      <LifecycleForm />

      <PublishModal item={publish} onClose={() => setPublish(null)} onDone={() => { setPublish(null); reloadAll(); }} />
    </div>
  );
}

// ── event feed ──
function Feed({ events, running, onRun, onRead }) {
  const [cat, setCat] = useState('all');
  const list = events.data || [];
  const unread = list.filter((e) => !e.read).length;
  const shown = list.filter((e) => (cat === 'all' ? true : cat === 'unread' ? !e.read : (KIND[e.kind]?.cat || 'other') === cat));
  const groups = useMemo(() => {
    const out = [];
    for (const e of shown) {
      const k = day(e.created_at);
      if (!out.length || out.at(-1).k !== k) out.push({ k, items: [] });
      out.at(-1).items.push(e);
    }
    return out;
  }, [shown]);
  const [readBusy, setReadBusy] = useState(false);
  return (
    <Reveal>
      <Card title="تحديثات المزوّدين" icon={BellRing}
        subtitle={unread ? `${unread} غير مقروء` : 'كلشي مقروء'}
        actions={<>
          <Button variant="secondary" icon={CheckCheck} disabled={!unread} loading={readBusy} onClick={async () => { setReadBusy(true); await onRead(); setReadBusy(false); }}>تعليم الكل كمقروء</Button>
          <Button variant="primary" icon={RefreshCw} loading={running} onClick={onRun}>افحص الآن</Button>
        </>}>
        <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
          كل 30 دقيقة البوابة بتسحب قائمة نماذج كل مزوّد: الجديد بينشر تلقائياً (حسب سياسة المزوّد) كـ <b className="text-fg-2">جديد</b> لمدة الأيام المحددة، والمحذوف عند المزوّد بيتأرشف،
          وأي مزوّد/نموذج ما رد بنجاح طول المدة المحددة (مع إنو إجتو طلبات) بيتأرشف. للتنبيهات على <span className="ltr">Discord/Slack/Telegram</span>:{' '}
          <code className="rounded-md bg-sunken px-1.5 py-0.5 font-mono text-[11.5px] ltr">wrangler secret put NOTIFY_WEBHOOK</code>
        </p>
        <Segmented size="sm" value={cat} onChange={setCat} options={CATS.map((c) => (c.value === 'unread' && unread ? { ...c, label: `${c.label} (${unread})` } : c))} className="mb-3" />
        {events.loading && !events.data ? (
          <div className="space-y-2.5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : events.error && !events.data ? (
          <Empty icon={AlertTriangle} title="ما قدرنا نجيب الأحداث" text={events.error.message} action={<Button onClick={() => events.reload()} icon={RefreshCw}>جرّب كمان مرة</Button>} />
        ) : !shown.length ? (
          <Empty icon={BellRing} title={list.length ? 'ما في أحداث بهالتصنيف' : 'لا أحداث بعد'} text={list.length ? null : 'اضغط "افحص الآن" لتسحب قوائم المزوّدين هلّق.'} />
        ) : (
          <div className="-mx-1 max-h-[560px] overflow-y-auto px-1">
            {groups.map((g) => (
              <section key={g.k} className="mb-2">
                <div className="sticky top-0 z-[1] bg-gradient-to-b from-solid via-solid/90 to-transparent px-1 pb-2 pt-1 text-[11.5px] font-semibold text-muted">{g.k}</div>
                <ol className="relative space-y-1 ps-5 before:absolute before:inset-y-2 before:start-[13px] before:w-px before:bg-line-strong">
                  {g.items.map((e, i) => <EventItem key={e.id} e={e} i={i} />)}
                </ol>
              </section>
            ))}
          </div>
        )}
      </Card>
    </Reveal>
  );
}
function EventItem({ e, i }) {
  const k = KIND[e.kind] || { icon: BookOpen, tone: 'neutral', label: e.kind };
  const Icon = k.icon;
  return (
    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.25, i * 0.02) }}
      className={cn('relative -ms-5 flex items-start gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-sunken/70', !e.read && 'bg-accent-soft/40')}>
      <span className={cn('relative z-[1] grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-solid', TONE_BG[k.tone])}><Icon size={14} /></span>
      <div className="min-w-0 flex-1">
        <div className={cn('text-[13.5px] leading-relaxed break-words', !e.read ? 'font-semibold text-fg' : 'text-fg-2')}>{e.message}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
          <Badge tone={k.tone} className="h-5 px-2 text-[11px]">{k.label}</Badge>
          <Tip content={date(e.created_at)}><span>{ago(e.created_at)}</span></Tip>
          {e.model_id && <span className="font-mono ltr">{e.model_id}</span>}
          {e.provider_id && !e.model_id && <span className="font-mono ltr">{e.provider_id}</span>}
        </div>
      </div>
      {!e.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent shadow-[0_0_0_4px_var(--accent-2)]" aria-label="غير مقروء" />}
    </motion.li>
  );
}

// ── shared columns for pending + catalog ──
function catalogColumns({ onPublish, onDismiss, pendingMode }) {
  return [
    ...(pendingMode ? [{ key: 'provider', header: 'المزوّد', cell: (m) => <span className="font-medium">{m.provider_name}</span> }] : []),
    { key: 'id', header: 'المعرّف', primary: true, cell: (m) => (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[12.5px] ltr break-all">{m.upstream_id}</span>
          {!!m.free && <Badge tone="ok">مجاني</Badge>}
          {!!m.reasoning && <Tip content="تفكير (reasoning)"><span className="text-muted"><Brain size={13} /></span></Tip>}
          {!!m.vision && <Tip content="بيشوف الصور"><span className="text-muted"><ImageIcon size={13} /></span></Tip>}
        </div>
        {m.name && m.name !== m.upstream_id && <div className="text-[12px] text-muted">{m.name}</div>}
      </div>
    ) },
    { key: 'ctx', header: 'سياق', align: 'end', cell: (m) => (m.context_length ? tokens(m.context_length) : '—') },
    { key: 'price', header: 'السعر (دخل / خرج لكل مليون)', cell: (m) => <span className="text-[12.5px] num">{m.price_in != null ? `${per1M(m.price_in)} / ${per1M(m.price_out)}` : '—'}</span> },
    ...(!pendingMode ? [{ key: 'state', header: 'الحالة', cell: (m) => <CatalogState m={m} /> }] : []),
    { key: 'seen', header: 'ظهر', cell: (m) => <Tip content={date(m.first_seen)}><span className="text-[12.5px] text-muted">{ago(m.first_seen)}</span></Tip> },
    { key: 'act', header: '', align: 'end', mobileFull: true, cell: (m) => (m.published_as ? null : (
      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        <Button size="xs" variant="primary" icon={Rocket} onClick={() => onPublish(m)}>نشر</Button>
        {!m.dismissed && <Button size="xs" variant="ghost" icon={X} onClick={() => onDismiss(m)}>تجاهل</Button>}
      </div>
    )) },
  ];
}
function CatalogState({ m }) {
  if (m.published_as) return <Tip content={`منشور كـ ${m.published_as}`}><span><Badge tone="ok" dot>منشور · <span className="font-mono ltr">{m.published_as}</span></Badge></span></Tip>;
  if (m.missing_since) return <Badge tone="bad">اختفى {ago(m.missing_since)}</Badge>;
  if (m.dismissed) return <Badge>متجاهَل</Badge>;
  if (m.baseline) return <Tip content="كان موجود من أول مزامنة للمزوّد"><span><Badge>أساسي</Badge></span></Tip>;
  return <Badge tone="new" dot>معلّق</Badge>;
}

// ── every provider's upstream catalog ──
function Catalog({ providers, nonce, onPublish, onDismiss }) {
  const [pid, setPid] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  useEffect(() => { if (!pid && providers.length) setPid(providers.find((p) => !p.archived_at)?.id || providers[0].id); }, [providers, pid]);
  const cat = useAsync(() => (pid ? api.get(`/api/admin/catalog?provider=${encodeURIComponent(pid)}`) : Promise.resolve([])), [pid, nonce]);
  const all = cat.data || [];
  const counts = {
    all: all.length, published: all.filter((m) => m.published_as).length, unpublished: all.filter((m) => !m.published_as && !m.missing_since).length,
    free: all.filter((m) => m.free).length, missing: all.filter((m) => m.missing_since).length,
  };
  const s = q.trim().toLowerCase();
  const rows = all.filter((m) => {
    if (filter === 'published' && !m.published_as) return false;
    if (filter === 'unpublished' && (m.published_as || m.missing_since)) return false;
    if (filter === 'free' && !m.free) return false;
    if (filter === 'missing' && !m.missing_since) return false;
    return !s || `${m.upstream_id} ${m.name || ''}`.toLowerCase().includes(s);
  });
  const prov = providers.find((p) => p.id === pid);
  return (
    <Reveal delay={0.08}>
      <Card title="كتالوج المزوّدين" icon={Library} subtitle="كل النماذج اللي شافتها البوابة عند كل مزوّد بآخر مزامنة"
        actions={<Select value={pid} onChange={setPid} className="w-[220px] max-sm:w-full" aria-label="المزوّد"
          options={providers.map((p) => ({ value: p.id, label: p.name, hint: p.archived_at ? 'مؤرشف' : p.id }))} placeholder="اختر مزوّد" />}>
        {prov && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            {prov.last_sync_at ? <span>آخر مزامنة {ago(prov.last_sync_at)}</span> : <span>ما انمزمن بعد</span>}
            {prov.sync_error && <Badge tone="bad" className="max-w-full truncate" title={prov.sync_error}>خطأ: {prov.sync_error}</Badge>}
          </div>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالمعرّف أو الاسم…" className="min-w-[200px] flex-1" />
          <Segmented size="sm" value={filter} onChange={setFilter} options={[
            { value: 'all', label: `الكل ${counts.all}` }, { value: 'published', label: `منشور ${counts.published}` },
            { value: 'unpublished', label: `غير منشور ${counts.unpublished}` }, { value: 'free', label: `مجاني ${counts.free}` },
            ...(counts.missing ? [{ value: 'missing', label: `اختفى ${counts.missing}` }] : []),
          ]} />
        </div>
        <DataTable loading={cat.loading && !cat.data} rows={rows} rowKey={(m) => m.upstream_id} maxHeight={520} dense
          empty={<Empty icon={Library} title={!pid ? 'اختر مزوّد' : all.length ? 'ما في نتائج' : 'الكتالوج فاضي'} text={pid && !all.length ? 'المزامنة بتعبّيه — اضغط "افحص الآن" فوق.' : null} />}
          columns={catalogColumns({ onPublish, onDismiss, pendingMode: false })} />
      </Card>
    </Reveal>
  );
}

// ── publish an upstream model as a gateway model ──
function prefill(m) {
  const free = !!m.free;
  return {
    id: m.upstream_id.split('/').pop().replace(/[:]/g, '-').toLowerCase(), name: m.name || '', group_id: '',
    context_length: m.context_length || 128000, max_output: m.max_output || 16384,
    pricing_mode: free ? 'token' : 'auto',
    price_in: free ? 0 : (m.price_in || 0) / M, price_out: free ? 0 : (m.price_out || 0) / M,
    price_cache_read: free ? 0 : (m.price_cache_read || 0) / M, price_cache_write: free ? 0 : (m.price_cache_write || 0) / M,
    price_request: 0, reasoning: !!(m.reasoning ?? 1), vision: !!m.vision,
  };
}
function PublishModal({ item, onClose, onDone }) {
  const { groups, go } = useAdmin();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState([]);
  const [target, setTarget] = useState(''); // '' = publish as a new model, else add as a route to this model
  useEffect(() => {
    if (!item) return;
    setF(prefill(item)); setTarget('');
    api.get('/api/admin/models').then((ms) => {
      setModels(ms);
      const twin = findTwin(ms, { id: prefill(item).id, routes: [{ provider_id: item.provider_id, upstream_model: item.upstream_id }] });
      if (twin) setTarget(twin.id);
    }).catch(() => {});
  }, [item]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (target) {
        const r = await api.post(`/api/admin/models/${encodeURIComponent(target)}/routes`, { provider_id: item.provider_id, upstream_model: item.upstream_id });
        toast.success(r.added ? `انضاف ${item.provider_name} كمسار لـ ${target}` : `${target} فيه هالمسار أصلاً`, { action: { label: 'افتح النماذج', onClick: () => go('models') } });
        onDone(); return;
      }
      const n = (v) => Math.round(Number(v || 0) * M);
      await api.post('/api/admin/models', {
        id: f.id.trim(), name: f.name.trim() || f.id.trim(), group_id: f.group_id || null, context_length: Number(f.context_length), max_output: Number(f.max_output),
        pricing_mode: f.pricing_mode, price_in: n(f.price_in), price_out: n(f.price_out), price_cache_read: n(f.price_cache_read), price_cache_write: n(f.price_cache_write),
        price_request: n(f.price_request), reasoning: f.reasoning, vision: f.vision, status: 'new',
        routes: [{ provider_id: item.provider_id, upstream_model: item.upstream_id }],
      });
      toast.success(`انتشر ${f.id} كنموذج جديد`, { action: { label: 'افتح النماذج', onClick: () => go('models') } });
      onDone();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const groupOpts = [{ value: '', label: 'بلا فئة' }, ...groups.map((g) => ({ value: g.id, label: g.name || g.id, hint: g.id }))];
  return (
    <Modal open={!!item} onOpenChange={(o) => !o && onClose()} size="lg" icon={Rocket} title="نشر نموذج جديد"
      description={item ? <>من <b>{item.provider_name}</b>: <span className="font-mono ltr">{item.upstream_id}</span> — بيظهر للطلاب بشارة "جديد". بتقدر تعدّل كل شي لاحقاً من "النماذج والتوجيه".</> : null}
      footer={<>
        <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        <Button type="submit" form="abd-publish" variant="primary" icon={Rocket} loading={busy}>{target ? 'أضف المسار' : 'نشر'}</Button>
      </>}>
      {f && (
        <form id="abd-publish" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Segmented full value={target ? 'route' : 'new'} onChange={(v) => setTarget(v === 'new' ? '' : (findTwin(models, { id: f.id, routes: [{ provider_id: item.provider_id, upstream_model: item.upstream_id }] })?.id || models[0]?.id || ''))}
              options={[{ value: 'new', label: 'نموذج جديد' }, { value: 'route', label: 'مسار لنموذج موجود' }]} />
            {target && (
              <div className="mt-3 grid gap-2">
                <Select value={target} onChange={setTarget} aria-label="النموذج الموجود"
                  options={models.filter((m) => m.status !== 'archived').map((m) => ({ value: m.id, label: m.name, hint: m.id }))} />
                <p className="text-[12.5px] text-muted">{item.provider_name} بينضاف كمزوّد إضافي لـ <b className="font-mono ltr">{target}</b> (احتياط أو أساسي حسب أولوية المزوّدين). الطلاب بيضلوا يطلبوا نفس الاسم.</p>
              </div>
            )}
          </div>
        </form>
      )}
      {f && !target && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="المعرّف (اللي بيكتبه الطالب)" hint="أحرف صغيرة وأرقام و - . _"><Input mono required form="abd-publish" value={f.id} onChange={set('id')} /></Field>
          <Field label="الاسم"><Input value={f.name} onChange={set('name')} placeholder={f.id} /></Field>
          <Field label="الفئة"><Select value={f.group_id} onChange={set('group_id')} options={groupOpts} aria-label="الفئة" /></Field>
          <Field label="طريقة التسعير">
            <Segmented full value={f.pricing_mode} onChange={set('pricing_mode')} options={[{ value: 'auto', label: 'تلقائي' }, { value: 'token', label: 'بالتوكن' }, { value: 'provider', label: 'حسب المزوّد' }, { value: 'request', label: 'بالطلب' }]} />
          </Field>
          {f.pricing_mode === 'auto' ? (
            <p className="rounded-xl bg-accent-soft/60 px-3 py-2.5 text-[12.5px] text-fg-2 sm:col-span-2">السعر بيتحدد لحاله من OpenRouter (أو من سعر المزوّد) وبيتحدث كل 30 دقيقة — ما في شي تعبّيه.</p>
          ) : f.pricing_mode === 'request' ? (
            <Field label="السعر لكل طلب ($)" className="sm:col-span-2"><Input type="number" step="any" min="0" className="ltr" value={f.price_request} onChange={set('price_request')} /></Field>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
              <Field label="دخل ($/مليون)"><Input type="number" step="any" min="0" className="ltr" value={f.price_in} onChange={set('price_in')} /></Field>
              <Field label="خرج ($/مليون)"><Input type="number" step="any" min="0" className="ltr" value={f.price_out} onChange={set('price_out')} /></Field>
              <Field label="قراءة كاش"><Input type="number" step="any" min="0" className="ltr" value={f.price_cache_read} onChange={set('price_cache_read')} /></Field>
              <Field label="كتابة كاش"><Input type="number" step="any" min="0" className="ltr" value={f.price_cache_write} onChange={set('price_cache_write')} /></Field>
            </div>
          )}
          {f.pricing_mode === 'provider' && <p className="-mt-2 text-[12px] text-muted sm:col-span-2">الطالب بيدفع الكلفة الحقيقية اللي بيرجعها المزوّد؛ الأسعار فوق للتقدير والحجز المسبق.</p>}
          {f.pricing_mode !== 'request' && f.pricing_mode !== 'auto' && Number(f.price_in) === 0 && Number(f.price_out) === 0 && !item?.free && (
            <div className="flex items-start gap-2 rounded-2xl border border-warn/25 bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-warn sm:col-span-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />سعر صفر = أي طالب عنده رصيد بيستخدمه مجاناً.
            </div>
          )}
          <Field label="طول السياق"><Input type="number" min="1" className="ltr" value={f.context_length} onChange={set('context_length')} /></Field>
          <Field label="أقصى خرج"><Input type="number" min="1" className="ltr" value={f.max_output} onChange={set('max_output')} /></Field>
          <div className="flex flex-wrap gap-5 sm:col-span-2">
            <Switch checked={f.reasoning} onCheckedChange={set('reasoning')} label="تفكير (reasoning)" />
            <Switch checked={f.vision} onCheckedChange={set('vision')} label="بيشوف الصور" />
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── archiving settings ──
function LifecycleForm() {
  const lc = useAsync(() => api.get('/api/admin/lifecycle'), []);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (lc.data) setF({ archive_after_hours: lc.data.archive_after_hours ?? '', new_days: lc.data.new_days ?? '', missing_hours: lc.data.missing_hours ?? '' }); }, [lc.data]);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (target) {
        const r = await api.post(`/api/admin/models/${encodeURIComponent(target)}/routes`, { provider_id: item.provider_id, upstream_model: item.upstream_id });
        toast.success(r.added ? `انضاف ${item.provider_name} كمسار لـ ${target}` : `${target} فيه هالمسار أصلاً`, { action: { label: 'افتح النماذج', onClick: () => go('models') } });
        onDone(); return;
      } await api.put('/api/admin/lifecycle', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)]))); toast.success('تم الحفظ'); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const FIELDS = [
    { k: 'archive_after_hours', label: 'أرشفة بعد فشل متواصل (ساعات)', min: 1, icon: Archive },
    { k: 'new_days', label: 'مدة شارة "جديد" (أيام)', min: 0, icon: Gift },
    { k: 'missing_hours', label: 'أرشفة نموذج اختفى من قائمة المزوّد بعد (ساعات)', min: 1, icon: EyeOff },
  ];
  return (
    <Reveal delay={0.1}>
      <Card title="إعدادات الأرشفة" icon={Sliders}>
        {!f ? <Skeleton className="h-20" /> : (
          <form onSubmit={submit} className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
            {FIELDS.map((x) => (
              <Field key={x.k} label={x.label}>
                <Input icon={x.icon} type="number" min={x.min} required className="ltr" value={f[x.k]} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} />
              </Field>
            ))}
            <Button type="submit" variant="primary" icon={Save} loading={busy}>حفظ</Button>
          </form>
        )}
      </Card>
    </Reveal>
  );
}

