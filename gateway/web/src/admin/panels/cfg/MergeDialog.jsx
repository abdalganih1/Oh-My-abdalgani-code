// Merge duplicate models (the same model published from two providers) into one model with all routes.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Combine, Cpu } from 'lucide-react';
import { Badge, Button, Modal, Select, cn, toast } from '../../../ui/index.js';
import { priceLabel } from '../../../lib/format.js';
import { api } from '../../ctx.js';
import { modelKey } from './shared.js';

/**
 * props: open, models (all), initial: { into?: id, from?: id[] }, onClose, onDone(intoId)
 */
export default function MergeDialog({ open, models, initial, onClose, onDone, provName = (x) => x }) {
  const live = useMemo(() => (models || []).filter((m) => m.status !== 'archived'), [models]);
  const [into, setInto] = useState('');
  const [from, setFrom] = useState([]);
  const [pricing, setPricing] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ids = [initial?.into, ...(initial?.from || [])].filter(Boolean);
    const first = ids[0] || '';
    setInto(first);
    setFrom(ids.slice(1));
  }, [open, initial]);

  const target = live.find((m) => m.id === into);
  const sources = live.filter((m) => from.includes(m.id));
  // pricing: keep the target's, unless it is unpriced and a source has prices
  useEffect(() => {
    if (!target) return;
    const unpriced = (m) => (m.pricing_mode === 'request' ? !m.price_request : !m.price_in && !m.price_out && m.pricing_mode !== 'provider');
    setPricing(target.pricing_mode === 'auto' ? into : unpriced(target) ? (sources.find((s) => !unpriced(s))?.id || into) : into);
  }, [into, from.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = target ? modelKey(target.id) : '';
  const suggestions = live.filter((m) => m.id !== into && !from.includes(m.id))
    .sort((a, b) => Number(modelKey(b.id) === k || b.routes.some((r) => modelKey(r.upstream_model) === k)) - Number(modelKey(a.id) === k || a.routes.some((r) => modelKey(r.upstream_model) === k)));
  const allRoutes = target ? [...target.routes, ...sources.flatMap((s) => s.routes.filter((r) => !target.routes.some((t) => t.provider_id === r.provider_id && t.upstream_model === r.upstream_model)))] : [];

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/admin/models/merge', { into, from, pricing_from: pricing });
      toast.success(`صار ${into} نموذج واحد فيه ${allRoutes.length} مسار (${r.routes_moved} انضاف)`);
      onDone?.(into);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const opt = (m) => ({ value: m.id, label: m.name, hint: `${m.id} · ${m.routes.map((r) => provName(r.provider_id)).join(' + ') || 'بلا مسار'}` });
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} size="lg" icon={Combine} title="دمج نماذج بنموذج واحد"
      description="نفس النموذج من أكتر من مزوّد؟ ادمجهم: بيصير نموذج واحد، كل مزوّد مسار فيه (الأول بيخدم والباقي احتياط). اختيارات الطلاب وسجل الطلبات بينتقلوا للنموذج الباقي."
      footer={<>
        <Button variant="ghost" onClick={onClose}>إلغاء</Button>
        <Button variant="primary" icon={Combine} loading={busy} disabled={!target || !from.length} onClick={submit}>ادمج {from.length ? `(${from.length + 1})` : ''}</Button>
      </>}>
      <div className="grid gap-4">
        <div>
          <div className="mb-1.5 text-[13px] font-medium">النموذج اللي بيضل (اسمه ومعرّفه بيبقوا)</div>
          <Select value={into} onChange={(v) => { setInto(v); setFrom((f) => f.filter((x) => x !== v)); }} options={live.map(opt)} placeholder="اختر النموذج…" aria-label="النموذج الباقي" />
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium">النماذج اللي بتنضم إله (بتنحذف بعد ما تنقل مساراتها)</div>
          <div className="flex flex-col gap-1.5">
            {sources.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-xl border border-line bg-solid px-3 py-2 text-[13px]">
                <Cpu size={15} className="shrink-0 text-accent" />
                <span className="font-medium">{m.name}</span>
                <span className="truncate font-mono text-[11.5px] text-muted ltr">{m.id}</span>
                <Button size="xs" variant="ghost" className="ms-auto" onClick={() => setFrom((f) => f.filter((x) => x !== m.id))}>شيل</Button>
              </div>
            ))}
            <Select value="" onChange={(v) => v && setFrom((f) => [...f, v])} options={suggestions.map(opt)} placeholder="+ ضيف نموذج للدمج…" aria-label="ضيف نموذج للدمج" />
          </div>
        </div>
        {target && from.length > 0 && (
          <>
            {target.pricing_mode === 'auto' && pricing === into ? (
              <p className="rounded-xl bg-accent-soft/60 px-3 py-2.5 text-[12.5px] text-fg-2">التسعير تلقائي: بيتحدد لحاله من OpenRouter لكل مسار.</p>
            ) : <div className="rounded-2xl border border-line bg-sunken/50 p-3.5">
              <div className="mb-2 text-[13px] font-semibold">التسعير بعد الدمج</div>
              <div className="flex flex-col gap-1.5">
                {[target, ...sources].map((m) => (
                  <label key={m.id} className={cn('flex cursor-pointer items-start gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px]', pricing === m.id ? 'bg-accent-soft/70' : 'hover:bg-raised')}>
                    <input type="radio" name="merge-pricing" checked={pricing === m.id} onChange={() => setPricing(m.id)} className="mt-1 accent-[var(--accent)]" />
                    <span><b className="font-mono ltr">{m.id}</b> — {priceLabel(m)}</span>
                  </label>
                ))}
              </div>
            </div>}
            <div>
              <div className="mb-1.5 text-[13px] font-semibold">المسارات بعد الدمج</div>
              <div className="flex flex-col gap-1">
                {allRoutes.map((r, i) => (
                  <div key={`${r.provider_id}|${r.upstream_model}`} className="flex items-center gap-1.5 text-[12.5px]">
                    <span className={cn('grid size-5 place-items-center rounded-md text-[10.5px] font-bold num', i === 0 ? 'bg-accent-soft text-accent-ink' : 'bg-sunken text-muted')}>{i + 1}</span>
                    <span className="font-medium">{provName(r.provider_id)}</span>
                    <ArrowLeft size={12} className="text-muted" />
                    <span className="truncate font-mono text-[11.5px] text-muted ltr">{r.upstream_model}</span>
                    {i >= target.routes.length && <Badge tone="new" className="h-5 text-[10.5px]">جديد</Badge>}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-muted">الترتيب الفعلي حسب أولوية المزوّدين، إلا إذا فعّلت "ترتيب مخصص" بالنموذج.</p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
