// Model editor dialog (shared by the Models panel and the provider "discover" import).
// useModelEditor({ providers, getModels, onSaved }) → { openModel(m, isNew), editor }
import { useCallback, useMemo, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { ArrowDown, ArrowUp, Brain, Cpu, Eye, GripVertical, Plus, Route, Trash2, TriangleAlert, ArrowLeft } from 'lucide-react';
import { Badge, Button, Field, Input, Modal, Segmented, Select, Switch, Textarea, Tip, cn, toast, useConfirm } from '../../../ui/index.js';
import { STATUS } from '../../../lib/format.js';
import { api, useAdmin } from '../../ctx.js';
import { ID_RE, M, toDollars, toMicro } from './shared.js';

const USD = ['price_in', 'price_out', 'price_cache_read', 'price_cache_write', 'price_request'];
const FIELDS = ['id', 'name', 'group_id', 'status', 'context_length', 'max_output', 'pricing_mode', ...USD, 'markup_pct', 'sort', 'description'];
let rk = 0;
const mkRoute = (r = {}) => ({
  k: ++rk, provider_id: r.provider_id || '', upstream_model: r.upstream_model || '', enabled: r.enabled !== 0 && r.enabled !== false,
  cost_in: r.cost_in != null ? String(r.cost_in / M) : '', cost_out: r.cost_out != null ? String(r.cost_out / M) : '',
  archived_at: r.archived_at, archived_reason: r.archived_reason, first_fail_at: r.first_fail_at,
});

export const PRICING_MODES = [
  { value: 'token', label: 'لكل توكن', hint: 'جدولك لكل مليون توكن' },
  { value: 'request', label: 'لكل طلب', hint: 'سعر ثابت لكل طلب' },
  { value: 'provider', label: 'حسب المزوّد', hint: 'الكلفة الفعلية اللي بيرجعها المزوّد (OpenRouter) وإلا جدولك' },
];

function RouteRow({ r, i, n, custom, providers, onChange, onRemove, onMove }) {
  const controls = useDragControls();
  const prov = providers.find((p) => p.id === r.provider_id);
  return (
    <Reorder.Item value={r} dragListener={false} dragControls={controls} as="div"
      className={cn('relative rounded-2xl border bg-solid p-3 shadow-[0_1px_2px_rgba(0,0,0,.04)]', i === 0 && r.enabled ? 'border-accent/40' : 'border-line', !r.enabled && 'opacity-70')}>
      <div className="flex items-start gap-2.5">
        <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
          <span className={cn('grid size-7 place-items-center rounded-lg text-xs font-bold num', i === 0 ? 'grad-bg text-white' : 'bg-sunken text-muted')}>{i + 1}</span>
          {custom && (
            <button type="button" aria-label="اسحب لترتيب المسار" onPointerDown={(e) => { e.preventDefault(); controls.start(e); }}
              className="grid h-7 w-7 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-sunken hover:text-fg active:cursor-grabbing">
              <GripVertical size={16} />
            </button>
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
          <Select value={r.provider_id} onChange={(v) => onChange({ provider_id: v })} aria-label="المزوّد" placeholder="اختر مزوّد…"
            options={providers.map((p) => ({ value: p.id, label: p.name, hint: `${p.id}${p.archived_at ? ' · مؤرشف' : !p.enabled ? ' · موقوف' : ''}` }))} />
          <Input mono value={r.upstream_model} onChange={(e) => onChange({ upstream_model: e.target.value })} placeholder="upstream model id" aria-label="معرّف النموذج عند المزوّد" />
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Tip content="اختياري: كلفة المزوّد علينا لكل مليون توكن دخل (للمزوّدين حسب الاستخدام)">
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                <span className="shrink-0">كلفتنا $/1M</span>
                <Input type="number" step="any" min="0" inputMode="decimal" className="!h-8 !w-[88px] !px-2 text-[13px]" placeholder="دخل" value={r.cost_in} onChange={(e) => onChange({ cost_in: e.target.value })} aria-label="كلفتنا دخل $/1M" />
                <Input type="number" step="any" min="0" inputMode="decimal" className="!h-8 !w-[88px] !px-2 text-[13px]" placeholder="خرج" value={r.cost_out} onChange={(e) => onChange({ cost_out: e.target.value })} aria-label="كلفتنا خرج $/1M" />
              </div>
            </Tip>
            {r.archived_at ? <Badge tone="bad" title={r.archived_reason || ''}>مؤرشف</Badge> : r.first_fail_at ? <Badge tone="warn" dot>عم يفشل</Badge> : null}
            {prov && !prov.enabled && <Badge>المزوّد موقوف</Badge>}
            <div className="ms-auto flex items-center gap-1">
              <Switch size="sm" checked={r.enabled} onCheckedChange={(v) => onChange({ enabled: v })} label="مفعّل" className="me-1 text-[13px]" />
              {custom && <>
                <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => onMove(-1)} aria-label="لفوق"><ArrowUp size={15} /></Button>
                <Button size="icon-sm" variant="ghost" disabled={i === n - 1} onClick={() => onMove(1)} aria-label="لتحت"><ArrowDown size={15} /></Button>
              </>}
              <Button size="icon-sm" variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" onClick={onRemove} aria-label="حذف المسار"><Trash2 size={15} /></Button>
            </div>
          </div>
        </div>
      </div>
    </Reorder.Item>
  );
}

function ModelDialog({ state, onClose, providers, onSaved }) {
  const { groups } = useAdmin();
  const confirm = useConfirm();
  const [f, setF] = useState(state.form);
  const [routes, setRoutes] = useState(state.routes);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const rank = useCallback((id) => { const p = providers.find((x) => x.id === id); return p ? (p.priority ?? 50) : 999; }, [providers]);
  // Without a custom order the rows follow the provider priority (what the gateway really does).
  const shown = useMemo(() => (f.custom_order ? routes : [...routes].sort((a, b) => rank(a.provider_id) - rank(b.provider_id))), [routes, f.custom_order, rank]);
  const names = shown.filter((r) => r.upstream_model.trim() || r.provider_id).map((r) => providers.find((p) => p.id === r.provider_id)?.name).filter(Boolean);
  const patch = (k, p) => setRoutes((rs) => rs.map((x) => (x.k === k ? { ...x, ...p } : x)));
  const move = (i, d) => setRoutes(() => { const a = [...shown]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const mode = f.pricing_mode || 'token';
  const free = mode === 'request' ? !(+f.price_request) : mode !== 'provider' && !(+f.price_in) && !(+f.price_out);

  const save = async (e) => {
    e?.preventDefault();
    if (!ID_RE.test(f.id || '')) return toast.error('المعرّف العام لازم يكون بالإنجليزي (حروف، أرقام، . _ : / -)');
    setBusy(true);
    try {
      if (state.isNew) {
        const fresh = await api.get('/api/admin/models');
        const ex = fresh.find((x) => x.id === f.id);
        if (ex && !(await confirm({ title: `في نموذج اسمه ${f.id} أصلاً`, description: `وعنده ${ex.routes.length} مسار. الحفظ رح يستبدل إعداداته ومساراته. متأكد؟`, danger: true, confirmText: 'استبدل' }))) return;
      }
      const body = {
        ...f, reasoning: !!f.reasoning, vision: !!f.vision, custom_order: !!f.custom_order,
        ...Object.fromEntries(USD.map((k) => [k, toMicro(f[k])])),
        routes: shown.map((r, i) => ({
          provider_id: r.provider_id, upstream_model: r.upstream_model.trim(), enabled: r.enabled, priority: i,
          cost_in: r.cost_in === '' ? null : toMicro(r.cost_in), cost_out: r.cost_out === '' ? null : toMicro(r.cost_out),
        })).filter((r) => r.upstream_model),
      };
      if (body.routes.some((r) => !r.provider_id)) return toast.error('في مسار بلا مزوّد — اختار المزوّد أو امسح المسار');
      await api.post('/api/admin/models', body);
      toast.success('تم الحفظ');
      onClose(); onSaved?.(f.id);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const groupOpts = [{ value: '', label: '— كل النماذج —' }, ...groups.map((g) => ({ value: g.id, label: g.name, hint: g.id }))];
  const statusOpts = Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }));
  const num = (k, label, extra = {}) => (
    <Field label={label} hint={extra.hint}><Input type="number" step="any" inputMode="decimal" value={f[k] ?? ''} onChange={set(k)} placeholder={extra.placeholder} className="num" /></Field>
  );

  return (
    <Modal open={state.open} onOpenChange={(o) => { if (!o) onClose(); }} size="lg" icon={Cpu}
      title={state.isNew ? 'نموذج جديد' : <>تعديل <span className="font-mono ltr text-[0.9em]">{f.id}</span></>}
      description="الأسعار بالدولار. النسبة الإضافية تنضاف فوق السعر."
      footer={<>
        <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        <Button variant="primary" loading={busy} onClick={save}>حفظ</Button>
      </>}>
      <form onSubmit={save} className="space-y-6" autoComplete="off">
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="المعرّف العام" hint={state.isNew ? 'الطلاب بيطلبوا النموذج بهالاسم' : 'ما بيتغيّر بعد الإنشاء'}>
            <Input mono value={f.id} onChange={set('id')} readOnly={!state.isNew && !!state.form.id} required autoFocus={state.isNew} placeholder="glm-5.2" />
          </Field>
          <Field label="الاسم"><Input value={f.name ?? ''} onChange={set('name')} placeholder="GLM 5.2" /></Field>
          <Field label="الفئة"><Select value={f.group_id ?? ''} onChange={set('group_id')} options={groupOpts} /></Field>
          <Field label="الحالة"><Select value={f.status || 'new'} onChange={set('status')} options={statusOpts} /></Field>
          {num('context_length', 'السياق (توكن)')}
          {num('max_output', 'أقصى خرج (توكن)')}
          {num('sort', 'الترتيب', { hint: 'الأصغر بيطلع أول بالقائمة' })}
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3 pb-1.5">
            <Switch checked={!!f.reasoning} onCheckedChange={set('reasoning')} label={<span className="inline-flex items-center gap-1.5"><Brain size={15} className="text-accent" />يدعم التفكير</span>} />
            <Switch checked={!!f.vision} onCheckedChange={set('vision')} label={<span className="inline-flex items-center gap-1.5"><Eye size={15} className="text-accent" />يقبل صور</span>} />
          </div>
          <Field label="الوصف" className="sm:col-span-2"><Textarea value={f.description ?? ''} onChange={set('description')} className="min-h-[60px]" rows={2} /></Field>
        </section>

        <section className="rounded-2xl border border-line bg-sunken/50 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[14.5px] font-semibold">التسعير</h3>
            {free && <Badge tone="warn" dot><TriangleAlert size={12} />مجاني!</Badge>}
            <Segmented size="sm" className="ms-auto" value={mode} onChange={set('pricing_mode')} options={PRICING_MODES.map(({ value, label }) => ({ value, label }))} />
          </div>
          <p className="mb-3 text-xs text-muted">{PRICING_MODES.find((x) => x.value === mode)?.hint}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {mode === 'request' ? num('price_request', '$ لكل طلب') : <>
              {num('price_in', '$ دخل /1M')}
              {num('price_out', '$ خرج /1M')}
              {num('price_cache_read', '$ قراءة كاش /1M')}
              {num('price_cache_write', '$ كتابة كاش /1M', { placeholder: 'فاضي = سعر الدخل' })}
            </>}
            {num('markup_pct', 'نسبة إضافية %')}
          </div>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Route size={17} className="text-accent" />
            <h3 className="font-display text-[14.5px] font-semibold">التوجيه — مين بيخدم هالنموذج</h3>
          </div>
          <Switch checked={!!f.custom_order} onCheckedChange={(v) => { if (v) setRoutes(shown); setF((s) => ({ ...s, custom_order: v })); }}
            label="ترتيب مخصص لهالنموذج (بدل ترتيب المزوّدين العام)" className="mb-2 text-[13.5px]" />
          <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-accent-soft/60 px-3 py-2 text-[12.5px] text-fg-2">
            <span>{f.custom_order ? 'رتّب المسارات بالسحب أو بالأسهم: الأول بيخدم، والباقي احتياط بالترتيب.' : 'الترتيب حسب أولوية المزوّدين (من صفحة المزوّدين):'}</span>
            {names.length ? names.map((n, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 && <ArrowLeft size={13} className="text-muted" aria-label="←" />}
                <span className={cn('rounded-md px-1.5 py-0.5 font-medium', i === 0 ? 'bg-solid text-accent-ink shadow-sm' : 'text-fg-2')}>{n}</span>
              </span>
            )) : <span className="text-muted">—</span>}
          </div>
          <Reorder.Group axis="y" values={shown} onReorder={f.custom_order ? setRoutes : () => {}} as="div" className="flex flex-col gap-2">
            {shown.map((r, i) => (
              <RouteRow key={r.k} r={r} i={i} n={shown.length} custom={!!f.custom_order} providers={providers}
                onChange={(p) => patch(r.k, p)} onRemove={() => setRoutes((rs) => rs.filter((x) => x.k !== r.k))} onMove={(d) => move(i, d)} />
            ))}
          </Reorder.Group>
          {!shown.length && <div className="rounded-2xl border border-dashed border-line-strong p-5 text-center text-sm text-muted">بلا مسار، النموذج ما رح يشتغل. ضيف مسار.</div>}
          <Button size="sm" variant="soft" icon={Plus} className="mt-2.5" onClick={() => setRoutes((rs) => [...rs, mkRoute({ provider_id: providers[0]?.id })])}>إضافة مسار</Button>
        </section>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Opens the model editor. Pass `getModels` returning the freshest model list (for route merging). */
export function useModelEditor({ providers, getModels, onSaved }) {
  const [state, setState] = useState(null);
  const seq = useRef(0);
  const openModel = useCallback((m, isNew = false) => {
    // importing a model that already exists must ADD its route as a fallback, never wipe the others
    const ex = isNew && m.id ? (getModels?.() || []).find((x) => x.id === m.id) : null;
    if (ex) {
      const extra = (m.routes || []).filter((r) => !ex.routes.some((o) => o.provider_id === r.provider_id && o.upstream_model === r.upstream_model));
      m = { ...ex, routes: [...ex.routes, ...extra] }; isNew = false;
      toast(extra.length ? `${ex.id} موجود — انضاف المسار الجديد كاحتياط تحت المسارات الحالية. راجع واحفظ.` : `${ex.id} موجود وفيه هالمسار أصلاً`);
    }
    const form = {};
    for (const k of FIELDS) form[k] = USD.includes(k) ? toDollars(m[k]) : (m[k] ?? '');
    form.status = form.status || 'new'; form.pricing_mode = form.pricing_mode || 'token';
    form.reasoning = !!m.reasoning; form.vision = !!m.vision; form.custom_order = !!m.custom_order;
    const routes = (m.routes || []).map(mkRoute);
    if (!routes.length) routes.push(mkRoute({ provider_id: providers?.[0]?.id }));
    setState({ key: ++seq.current, open: true, form, routes, isNew });
  }, [getModels, providers]);
  const editor = state ? <ModelDialog key={state.key} state={state} providers={providers || []} onClose={() => setState((s) => (s ? { ...s, open: false } : s))} onSaved={onSaved} /> : null;
  return { openModel, editor };
}

/** Defaults for a brand-new model. */
export const NEW_MODEL = { status: 'new', pricing_mode: 'token', context_length: 128000, max_output: 16384, sort: 100, routes: [] };

/** Turn an upstream catalog entry (discover / updates) into a model draft. */
export function draftFromUpstream(m, providerId) {
  return {
    id: m.id.split('/').pop().replace(/[:]/g, '-'), name: m.name, context_length: m.context_length || 128000, max_output: m.max_output || 16384,
    pricing_mode: providerId === 'openrouter' ? 'provider' : 'token', price_in: m.price_in || 0, price_out: m.price_out || 0, price_cache_read: m.price_cache_read || 0, price_cache_write: m.price_cache_write || 0,
    status: 'new', reasoning: m.reasoning ?? true, vision: !!m.vision, routes: [{ provider_id: providerId, upstream_model: m.id }],
  };
}
