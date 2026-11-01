// Models & routing: prices, status, groups and which providers serve each model.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Brain, Coins, Combine, Cpu, Eye, Layers, Pencil, Plus, RefreshCcw, Route, Search, Sparkles, Trash2, TriangleAlert, CircleOff } from 'lucide-react';
import { Badge, Button, Card, DataTable, Empty, Input, Segmented, Select, Stat, Tip, cn, toast, useConfirm } from '../../ui/index.js';
import { STATUS, priceLabel, tokens } from '../../lib/format.js';
import { useAsync, usePersisted } from '../../lib/hooks.js';
import { api, useAdmin } from '../ctx.js';
import { NEW_MODEL, useModelEditor } from './cfg/ModelEditor.jsx';
import OpenRouterDialog from './cfg/OpenRouterDialog.jsx';
import MergeDialog from './cfg/MergeDialog.jsx';
import { duplicateGroups } from './cfg/shared.js';

const isFree = (m) => (m.pricing_mode === 'request' ? !m.price_request : !m.price_in && !m.price_out && m.pricing_mode !== 'provider');
const MODE_BADGE = { auto: 'تلقائي', provider: 'حسب المزوّد' };
const needsRestore = (m) => m.status === 'archived' || m.routes.some((r) => r.archived_at);

function Routes({ m, provName }) {
  if (!m.routes.length) return <Badge tone="bad" dot>لا مسار</Badge>;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {m.routes.map((r, i) => (
        <div key={r.id ?? i} className={cn('flex min-w-0 items-center gap-1.5 text-[12.5px]', !r.enabled && 'opacity-50')}>
          <span className={cn('grid size-5 shrink-0 place-items-center rounded-md text-[10.5px] font-bold num', i === 0 ? 'bg-accent-soft text-accent-ink' : 'bg-sunken text-muted')}>{i + 1}</span>
          <span className="shrink-0 font-medium text-fg-2">{provName(r.provider_id)}</span>
          <ArrowLeft size={12} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate font-mono text-[11.5px] text-muted ltr" title={r.upstream_model}>{r.upstream_model}</span>
          {!r.enabled && <span className="text-[11px] text-muted">(off)</span>}
          {r.archived_at ? <Tip content={r.archived_reason}><Badge tone="bad" className="h-5 text-[10.5px]">مؤرشف</Badge></Tip>
            : r.first_fail_at ? <Badge tone="warn" className="h-5 text-[10.5px]">عم يفشل</Badge> : null}
        </div>
      ))}
      {(m.auto_source || m.custom_order) ? (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {m.auto_source && <Badge className="h-5 text-[10.5px]">auto</Badge>}
          {m.custom_order ? <Badge tone="accent" className="h-5 text-[10.5px]">ترتيب مخصص</Badge> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function Models() {
  const { groupName, groups } = useAdmin();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useAsync(() => Promise.all([api.get('/api/admin/models'), api.get('/api/admin/providers')]), []);
  const [models, providers] = data || [[], []];
  const modelsRef = useRef(models);
  modelsRef.current = models;
  const [q, setQ] = useState('');
  const [status, setStatus] = usePersisted('abd:modelStatus', '');
  const [group, setGroup] = usePersisted('abd:modelGroup', '');
  const [orOpen, setOrOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [merge, setMerge] = useState(null); // { into, from[] }
  const { openModel, editor } = useModelEditor({ providers, getModels: useCallback(() => modelsRef.current, []), onSaved: () => reload() });

  const provName = useCallback((id) => providers.find((p) => p.id === id)?.name || id, [providers]);
  const ql = q.trim().toLowerCase();
  const rows = useMemo(() => models.filter((m) => {
    if (status && m.status !== status) return false;
    if (group === '__none' ? m.group_id : group && m.group_id !== group) return false;
    if (ql && ![m.id, m.name, m.description, ...m.routes.map((r) => `${r.provider_id} ${r.upstream_model}`)].some((v) => (v || '').toLowerCase().includes(ql))) return false;
    return true;
  }), [models, status, group, ql]);
  const count = (s) => models.filter((m) => m.status === s).length;

  // palette commands
  const pending = useRef([]);
  useEffect(() => {
    const on = (e) => {
      if (e.detail === 'new-model') { if (data) openModel(NEW_MODEL, true); else pending.current.push('new-model'); }
      if (e.detail === 'openrouter-prices') setOrOpen(true);
    };
    window.addEventListener('abd:cmd', on);
    return () => window.removeEventListener('abd:cmd', on);
  }, [data, openModel]);
  useEffect(() => { if (data && pending.current.length) { pending.current = []; openModel(NEW_MODEL, true); } }, [data, openModel]);

  const restore = async (m) => {
    setBusy(`r:${m.id}`);
    try { await api.post(`/api/admin/models/${encodeURIComponent(m.id)}/restore`); toast.success('رجع للخدمة'); await reload(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const del = async (m) => {
    if (!(await confirm({ title: `حذف ${m.id}؟`, description: 'الأفضل تحويله لـ "قديم" أو "مخفي" — الحذف بيمسح مساراته كمان.', danger: true, confirmText: 'احذف', icon: Trash2 }))) return;
    setBusy(`d:${m.id}`);
    try { await api.del(`/api/admin/models/${encodeURIComponent(m.id)}`); toast.success('انحذف'); await reload(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  const cols = [
    { key: 'model', header: 'النموذج', primary: true, cell: (m) => (
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', m.status === 'archived' ? 'bg-sunken text-muted' : 'bg-accent-soft text-accent-ink')}><Cpu size={17} /></span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-semibold">{m.name}</span>
            {m.reasoning ? <Tip content="يدعم التفكير"><Brain size={14} className="shrink-0 text-accent" /></Tip> : null}
            {m.vision ? <Tip content="يقبل صور"><Eye size={14} className="shrink-0 text-accent" /></Tip> : null}
          </div>
          <div className="truncate font-mono text-[11.5px] text-muted ltr text-start">{m.id}</div>
        </div>
      </div>
    ) },
    { key: 'group', header: 'الفئة', cell: (m) => <span className="text-[13px] text-fg-2">{groupName(m.group_id)}</span> },
    { key: 'status', header: 'الحالة', cell: (m) => { const s = STATUS[m.status]; return s ? <Badge tone={s.tone} dot>{s.label}</Badge> : <Badge>{m.status}</Badge>; } },
    { key: 'price', header: 'السعر', mobileFull: true, cell: (m) => (
      <div className="max-w-[260px] text-[12.5px] leading-relaxed text-fg-2 max-sm:max-w-none">
        {MODE_BADGE[m.pricing_mode] && m.pricing_mode === 'auto' ? <Badge tone="accent" className="me-1.5 h-5 text-[10.5px]">{MODE_BADGE[m.pricing_mode]}</Badge> : null}
        {priceLabel(m)}{m.markup_pct ? <span className="text-accent-ink"> +{m.markup_pct}%</span> : null}
        {isFree(m) && <Badge tone="warn" className="ms-1.5 h-5 text-[10.5px]">مجاني!</Badge>}
      </div>
    ) },
    { key: 'routes', header: 'المسارات', mobileFull: true, cell: (m) => <div className="max-w-[340px] max-sm:max-w-none"><Routes m={m} provName={provName} /></div> },
    { key: 'ctx', header: 'سياق', align: 'end', cell: (m) => <span className="num">{tokens(m.context_length)}</span> },
    { key: 'act', header: '', align: 'end', mobileFull: true, cell: (m) => (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {needsRestore(m) && <Tip content={m.archived_reason || 'استعادة'}><Button size="xs" variant="primary" icon={RefreshCcw} loading={busy === `r:${m.id}`} onClick={() => restore(m)}>استعادة</Button></Tip>}
        <Button size="icon-sm" variant="ghost" aria-label={`تعديل ${m.id}`} onClick={() => openModel(m)}><Pencil size={15} /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={`حذف ${m.id}`} className="text-bad hover:bg-bad-soft hover:text-bad" loading={busy === `d:${m.id}`} onClick={() => del(m)}><Trash2 size={15} /></Button>
      </div>
    ) },
  ];

  const statusOpts = [{ value: '', label: `الكل ${models.length || ''}`.trim() }, ...Object.entries(STATUS).map(([value, s]) => ({ value, label: `${s.label} ${count(value) || ''}`.trim() }))];
  const groupOpts = [{ value: '', label: 'كل الفئات' }, { value: '__none', label: 'بلا فئة' }, ...groups.map((g) => ({ value: g.id, label: g.name, hint: g.id }))];
  const live = models.filter((m) => ['new', 'active', 'legacy'].includes(m.status));
  const noRoute = live.filter((m) => !m.routes.some((r) => r.enabled && !r.archived_at)).length;
  const free = live.filter(isFree).length;
  const dups = useMemo(() => duplicateGroups(models), [models]);

  return (
    <div className="grid gap-4 sm:gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="كل النماذج" icon={Cpu} value={models.length} loading={loading && !data} sub={`${count('archived')} مؤرشف · ${count('hidden')} مخفي`} />
        <Stat label="متاحة للطلاب" icon={Sparkles} value={live.length} loading={loading && !data} sub={`${count('new')} جديد · ${count('legacy')} قديم`} />
        <Stat label="بلا مسار شغّال" icon={CircleOff} value={noRoute} tone={noRoute ? 'bad' : undefined} loading={loading && !data} sub="نماذج متاحة ما حدا بيخدمها" />
        <Stat label="غير مسعّرة" icon={TriangleAlert} value={free} tone={free ? 'bad' : undefined} loading={loading && !data} sub="متاحة ومجانية — تأكد إنها مقصودة" />
      </div>

      <Card title="النماذج" icon={Layers}
        subtitle={<>وضع التسعير: <b>لكل توكن</b> = جدولك لكل مليون توكن · <b>لكل طلب</b> = سعر ثابت · <b>حسب المزوّد</b> = الكلفة الفعلية اللي بيرجعها المزوّد (OpenRouter) وإلا جدولك · <b>تلقائي</b> = نموذج تحته عدة نماذج (مثل fast)، كل طلب بسعر OpenRouter للنموذج اللي ردّ. النسبة الإضافية تنضاف فوق.</>}
        actions={<>
          <Button icon={Combine} disabled={!data} onClick={() => setMerge({})}>دمج</Button>
          <Button icon={Coins} onClick={() => setOrOpen(true)}>أسعار OpenRouter</Button>
          <Button variant="primary" icon={Plus} disabled={!data} onClick={() => openModel(NEW_MODEL, true)}>نموذج جديد</Button>
        </>}>
        {dups.length > 0 && (
          <div className="mb-4 grid gap-2">
            {dups.map((g) => (
              <div key={g.map((m) => m.id).join('|')} className="flex flex-wrap items-center gap-2 rounded-2xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[13px]">
                <Combine size={16} className="shrink-0 text-warn" />
                <span className="text-fg-2">هدول شكلهم نفس النموذج من مزوّدين مختلفين:</span>
                {g.map((m) => <Badge key={m.id} className="font-mono ltr">{m.id} · {m.routes.map((r) => provName(r.provider_id)).join('+')}</Badge>)}
                <Button size="xs" variant="primary" icon={Combine} className="ms-auto" onClick={() => setMerge({ into: g[0].id, from: g.slice(1).map((m) => m.id) })}>ادمجهم</Button>
              </div>
            ))}
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <Input icon={Search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو المعرّف أو المزوّد…" className="min-w-[220px] flex-1" aria-label="بحث" />
          <Select value={group} onChange={setGroup} options={groupOpts} className="w-full sm:w-[190px]" aria-label="الفئة" />
          <Segmented size="sm" value={status} onChange={setStatus} options={statusOpts} className="max-sm:w-full" />
        </div>
        {error && !data ? (
          <Empty icon={TriangleAlert} title="ما قدرنا نجيب النماذج" text={error.message} action={<Button icon={RefreshCcw} onClick={reload}>جرّب مرة تانية</Button>} />
        ) : (
          <>
            {data && rows.length !== models.length && <p className="mb-2 text-xs text-muted">عم يظهر {rows.length} من {models.length}</p>}
            <DataTable columns={cols} rows={rows} loading={loading && !data} onRowClick={(m) => openModel(m)} rowKey={(m) => m.id}
              rowClassName={(m) => cn(m.status === 'archived' && 'opacity-60')}
              empty={models.length
                ? { icon: Search, title: 'ما في نموذج بهالفلتر', text: 'جرّب كلمة تانية أو غيّر الحالة/الفئة.' }
                : { icon: Route, title: 'ما في نماذج بعد', text: 'ضيف نموذج يدوياً، أو استعرض نماذج مزوّد من صفحة المزوّدين وضيفها بضغطة.', action: <Button variant="primary" icon={Plus} onClick={() => openModel(NEW_MODEL, true)}>نموذج جديد</Button> }} />
          </>
        )}
      </Card>

      <OpenRouterDialog open={orOpen} onOpenChange={setOrOpen} onApplied={reload} />
      {merge && <MergeDialog open models={models} initial={merge} provName={provName} onClose={() => setMerge(null)} onDone={() => { setMerge(null); reload(); }} />}
      {editor}
    </div>
  );
}
