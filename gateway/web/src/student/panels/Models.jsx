// النماذج — the catalog with search (/), status + group filters, "available to me only", and
// a one-click "make it abd-main".
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Check, Eye, Lock, Search, Star, X } from 'lucide-react';
import { Badge, Button, Card, Empty, Input, Kbd, Select, Switch, cn, useSpotlight } from '../../ui/index.js';
import { day, priceLabel, STATUS, tokens } from '../../lib/format.js';
import { useStudent } from '../ctx.js';

const STATUS_OPTS = [
  { value: '', label: 'كل الحالات' },
  { value: 'new', label: 'جديد' }, { value: 'active', label: 'متاح' }, { value: 'legacy', label: 'قديم' }, { value: 'archived', label: 'مؤرشف' },
];

function ModelCard({ m, main, onUse, busy }) {
  const { groupName } = useStudent();
  const onMove = useSpotlight();
  const st = STATUS[m.status];
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.22 }}
      onPointerMove={onMove}
      className={cn('glass spot relative flex min-w-0 flex-col gap-2.5 rounded-3xl p-4 sm:p-5', !m.available && 'opacity-70', main && 'ring-2 ring-accent/50')}>
      {main && <span className="absolute -top-2.5 start-4 inline-flex items-center gap-1 rounded-full grad-bg px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-[0_6px_16px_-6px_var(--glow)]"><Star size={11} />abd-main</span>}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[15.5px] font-semibold" title={m.name}>{m.name}</h3>
          <div className="truncate font-mono text-[11.5px] text-muted ltr text-start" title={m.id}>{m.id}</div>
        </div>
        {st && <Badge tone={st.tone} dot={m.status === 'new'} pulse={m.status === 'new'}>{st.label}</Badge>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="accent">{groupName(m.group_id)}</Badge>
        {m.reasoning && <Badge><Brain size={11} />تفكير</Badge>}
        {m.vision && <Badge><Eye size={11} />صور</Badge>}
        {m.available ? <Badge tone="ok"><Check size={11} />مسموح</Badge> : <Badge><Lock size={11} />خارج اشتراكك</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-xl border border-line bg-sunken/60 px-2.5 py-1.5"><div className="text-muted">سياق</div><b className="num ltr">{tokens(m.context_length)}</b></div>
        <div className="rounded-xl border border-line bg-sunken/60 px-2.5 py-1.5"><div className="text-muted">خرج</div><b className="num ltr">{tokens(m.max_output)}</b></div>
      </div>
      <div className="text-[12.5px] leading-relaxed text-fg-2">{priceLabel(m)}</div>
      {m.description && <p className="line-clamp-3 text-[12.5px] leading-relaxed text-muted">{m.description}</p>}
      {m.status === 'archived' && <div className="text-[12.5px] text-bad">توقف {day(m.archived_at)}</div>}
      {m.available && (
        <div className="mt-auto pt-1">
          {main
            ? <div className="flex h-8 items-center gap-1.5 text-[12.5px] font-medium text-accent-ink"><Check size={15} />هاد هو <span className="ltr">abd-main</span> هلق</div>
            : <Button size="sm" variant="soft" className="w-full" loading={busy} onClick={() => onUse(m.id)}>اجعله <span className="ltr">abd-main</span></Button>}
        </div>
      )}
    </motion.div>
  );
}

export default function Models() {
  const { catalog, me, setAlias } = useStudent();
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [gr, setGr] = useState('');
  const [av, setAv] = useState(false);
  const [busy, setBusy] = useState(null);
  const searchRef = useRef(null);
  const mainId = me.aliases.find((a) => a.alias === 'abd-main')?.model_id;

  useEffect(() => {
    const on = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable || document.querySelector('[role="dialog"]');
      if (typing) return;
      e.preventDefault(); searchRef.current?.focus();
    };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, []);

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return catalog.models.filter((m) => (st ? m.status === st : m.status !== 'archived') && (!gr || m.group_id === gr) && (!av || m.available)
      && (!s || m.id.toLowerCase().includes(s) || m.name.toLowerCase().includes(s)));
  }, [catalog.models, q, st, gr, av]);

  const use = async (id) => { setBusy(id); await setAlias('abd-main', id); setBusy(null); };
  const groupOpts = [{ value: '', label: 'كل الفئات' }, ...catalog.groups.map((g) => ({ value: g.id, label: g.name }))];
  const filtered = q || st || gr || av;

  return (
    <div className="grid gap-4 sm:gap-5">
      <Card pad={false} spotlight={false} className="sticky top-[88px] z-10 p-3 sm:p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-[2_1_260px]">
            <Input ref={searchRef} icon={Search} type="search" placeholder="بحث عن نموذج…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث عن نموذج" />
            <Kbd className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 max-sm:hidden">/</Kbd>
          </div>
          <Select className="min-w-[140px] flex-[1_1_140px]" value={st} onChange={setSt} options={STATUS_OPTS} aria-label="الحالة" />
          <Select className="min-w-[150px] flex-[1_1_150px]" value={gr} onChange={setGr} options={groupOpts} aria-label="الفئة" />
          <Switch label="المتاح لي فقط" checked={av} onCheckedChange={setAv} className="px-1" />
        </div>
      </Card>
      <div className="flex items-center gap-2 px-1 text-[12.5px] text-muted">
        <span className="num">{list.length}</span> نموذج
        {filtered && <Button size="xs" variant="ghost" icon={X} onClick={() => { setQ(''); setSt(''); setGr(''); setAv(false); }}>مسح الفلاتر</Button>}
      </div>
      {list.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {list.map((m) => <ModelCard key={m.id} m={m} main={m.id === mainId} onUse={use} busy={busy === m.id} />)}
          </AnimatePresence>
        </div>
      ) : (
        <Card><Empty icon={Search} title="ما في نماذج بهالفلتر" text="جرّب تشيل بعض الفلاتر أو تبحث باسم تاني." /></Card>
      )}
    </div>
  );
}
