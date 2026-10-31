// Copy OpenRouter's public per-token prices onto our models.
import { useEffect, useMemo, useState } from 'react';
import { CircleCheck, Coins, RefreshCcw, TriangleAlert } from 'lucide-react';
import { Badge, Button, DataTable, Empty, Field, Input, Modal, Select, Skeleton, Switch, cn, toast } from '../../../ui/index.js';
import { usdPrecise } from '../../../lib/format.js';
import { api } from '../../ctx.js';
import { M } from './shared.js';

const per1M = (v) => (v == null ? '—' : `$${(v / M).toFixed(v && v < 1e5 ? 3 : 2)}`);
const samePrice = (m, x) => x && m.pricing_mode === 'token' && m.price_in === x.price_in && m.price_out === x.price_out
  && (m.price_cache_read || 0) === (x.price_cache_read || 0) && (m.price_cache_write || 0) === (x.price_cache_write || 0);

function Check({ checked, disabled, onChange, label }) {
  return (
    <input type="checkbox" aria-label={label} checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} onClick={(e) => e.stopPropagation()}
      className="size-[18px] shrink-0 cursor-pointer rounded accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40" />
  );
}

export default function OpenRouterDialog({ open, onOpenChange, onApplied }) {
  const [st, setSt] = useState(null); // { models, catalog }
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [markup, setMarkup] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const d = await api.get('/api/admin/pricing/openrouter');
      const models = d.models.map((m) => ({ ...m, pick: m.match ? { ...m.match } : null }));
      setSt({ models, catalog: d.catalog, byId: new Map(d.catalog.map((c) => [c.id, c])) });
      setSel(new Set(models.filter((m) => m.pick && !samePrice(m, m.pick)).map((m) => m.id)));
    } catch (e) { setErr(e); } finally { setLoading(false); }
  };
  useEffect(() => { if (open) { setMarkup(''); setOnlyDiff(true); load(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const catalogOpts = useMemo(() => (st?.catalog || []).map((c) => ({ value: c.id, label: c.id, hint: `${c.name} · ${per1M(c.price_in)} / ${per1M(c.price_out)}` })), [st]);
  const rows = useMemo(() => (st ? st.models.filter((m) => !onlyDiff || !samePrice(m, m.pick)) : []), [st, onlyDiff]);
  const matched = st ? st.models.filter((m) => m.pick).length : 0;
  const diff = st ? st.models.filter((m) => m.pick && !samePrice(m, m.pick)).length : 0;
  const selectable = rows.filter((m) => m.pick);
  const allOn = selectable.length > 0 && selectable.every((m) => sel.has(m.id));
  const chosen = st ? st.models.filter((m) => m.pick && sel.has(m.id)) : [];

  const toggle = (id, on) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const pick = (m, id) => {
    const c = st.byId.get(String(id).trim());
    const next = { ...m, pick: c ? { ...c } : null };
    setSt((s) => ({ ...s, models: s.models.map((x) => (x.id === m.id ? next : x)) }));
    toggle(m.id, !!c && !samePrice(next, next.pick));
  };

  const apply = async () => {
    const items = chosen.map((m) => ({ id: m.id, price_in: m.pick.price_in, price_out: m.pick.price_out, price_cache_read: m.pick.price_cache_read, price_cache_write: m.pick.price_cache_write || 0 }));
    if (!items.length) return toast.error('ما اخترت ولا نموذج');
    setBusy(true);
    try {
      await api.post('/api/admin/pricing/apply', { items, markup_pct: markup === '' ? null : +markup });
      toast.success(`${items.length} نموذج صار بنفس سعر OpenRouter${markup ? ` + ${markup}%` : ''}`);
      onOpenChange(false); onApplied?.();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const cols = [
    { key: 'sel', header: <Check label="الكل" checked={allOn} disabled={!selectable.length} onChange={(on) => setSel((s) => { const n = new Set(s); selectable.forEach((m) => (on ? n.add(m.id) : n.delete(m.id))); return n; })} />, width: 44, hideOnMobile: true,
      cell: (m) => <Check label={`اختيار ${m.id}`} checked={sel.has(m.id)} disabled={!m.pick} onChange={(on) => toggle(m.id, on)} /> },
    { key: 'model', header: 'النموذج', primary: true, cell: (m) => (
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="pt-0.5 min-[761px]:hidden"><Check label={`اختيار ${m.id}`} checked={sel.has(m.id)} disabled={!m.pick} onChange={(on) => toggle(m.id, on)} /></span>
        <div className="min-w-0">
          <div className="truncate font-semibold">{m.name}</div>
          <div className="truncate font-mono text-[11.5px] text-muted ltr text-start">{m.id}</div>
        </div>
      </div>
    ) },
    { key: 'cur', header: 'سعرك الحالي (دخل · خرج /1M)', cell: (m) => (
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        {m.pricing_mode === 'request' ? <span>{usdPrecise(m.price_request)} / طلب</span> : <span className="num ltr">{per1M(m.price_in)} · {per1M(m.price_out)}</span>}
        {m.pricing_mode === 'provider' && <Badge className="h-5 text-[10.5px]">provider</Badge>}
        {!m.price_in && !m.price_out && m.pricing_mode !== 'request' && <Badge tone="warn" className="h-5 text-[10.5px]">مجاني!</Badge>}
      </div>
    ) },
    { key: 'or', header: 'نموذج OpenRouter', mobileFull: true, cell: (m) => {
      const x = m.pick, same = samePrice(m, x);
      return (
        <div className="min-w-[200px] max-w-[300px] max-sm:max-w-none" onClick={(e) => e.stopPropagation()}>
          <Select size="sm" mono value={x?.id || ''} onChange={(v) => pick(m, v)} options={catalogOpts} searchable placeholder="z-ai/glm-…" aria-label="نموذج OpenRouter" />
          <div className="mt-1 text-[11.5px]">
            {x ? <span className="text-muted">{m.match && x.id === m.match.id ? (m.match.how === 'route' ? 'من مسار OpenRouter' : 'مطابقة بالاسم') : 'اختيار يدوي'}{same && <span className="text-ok"> · نفس السعر</span>}</span>
              : <span className="text-warn">ما انطابق — اختار المعرّف</span>}
          </div>
        </div>
      );
    } },
    { key: 'in', header: 'دخل /1M', align: 'end', cell: (m) => <span className="num ltr">{m.pick ? per1M(m.pick.price_in) : '—'}</span> },
    { key: 'out', header: 'خرج /1M', align: 'end', cell: (m) => <span className="num ltr">{m.pick ? per1M(m.pick.price_out) : '—'}</span> },
    { key: 'cache', header: 'كاش قراءة · كتابة', align: 'end', cell: (m) => <span className="num ltr">{m.pick ? `${per1M(m.pick.price_cache_read)} · ${m.pick.price_cache_write ? per1M(m.pick.price_cache_write) : '—'}` : '—'}</span> },
  ];

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="xl" icon={Coins} title="نفس أسعار OpenRouter"
      description={<>البوابة جابت أسعار OpenRouter الحالية لكل مليون توكن، وطابقتها مع نماذجك (من مسار OpenRouter أو من الاسم). اختار النماذج وطبّق: بيصير وضع التسعير <b>token</b> بنفس سعرهم بالضبط. وإذا ما انطابق نموذج، اختار معرّفه عند OpenRouter.</>}
      footer={<>
        <span className="me-auto text-xs text-muted">{chosen.length ? `${chosen.length} محدد` : ''}</span>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
        <Button variant="primary" loading={busy} disabled={!st || !chosen.length} onClick={apply}>طبّق على المحدد</Button>
      </>}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="نسبة إضافية فوق سعرهم %" className="w-[200px]">
          <Input type="number" min="0" max="1000" inputMode="numeric" value={markup} onChange={(e) => setMarkup(e.target.value)} placeholder="خليها متل ما هي" className="num" />
        </Field>
        <Switch checked={onlyDiff} onCheckedChange={setOnlyDiff} label="بس اللي سعرها مختلف" className="pb-2.5" />
        {st && (
          <div className="ms-auto flex flex-wrap gap-1.5 pb-2">
            <Badge>{st.models.length} نموذج</Badge>
            <Badge tone="ok">{matched} انطابق</Badge>
            <Badge tone={diff ? 'warn' : 'ok'}>{diff} سعره مختلف</Badge>
          </div>
        )}
      </div>
      {err ? <Empty icon={TriangleAlert} title="ما قدرنا نجيب أسعار OpenRouter" text={err.message} action={<Button icon={RefreshCcw} onClick={load}>جرّب مرة تانية</Button>} />
        : loading || !st ? <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
          : <DataTable columns={cols} rows={rows} rowKey={(m) => m.id} dense maxHeight="56vh" rowClassName={(m) => cn(sel.has(m.id) && 'bg-accent-soft/40')}
            empty={{ icon: CircleCheck, title: 'كل النماذج المطابقة سعرها نفس OpenRouter' }} />}
    </Modal>
  );
}
