// Live log (LiteLLM-style). Resource rules kept from the legacy panel: a setTimeout chain (never
// overlapping), only new rows (cursor `after`), max 500 rows kept, paused when the tab is hidden
// or after 10 idle minutes, exponential back-off on errors (5s → 60s).
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, AlertTriangle, Clock, Coins, Cpu, Globe, Hash, Monitor, Pause, Play, Radio, Trash2, User, Zap } from 'lucide-react';
import {
  Badge, Button, Card, CopyButton, DataTable, Empty, Input, Select, Sheet, Sparkline, Switch, Tip, cn,
} from '../../ui/index.js';
import { useAsync, useDebounced, useVisible } from '../../lib/hooks.js';
import { date, int, ms, time, tokens, usdPrecise } from '../../lib/format.js';
import { api } from '../ctx.js';

const MAX_ROWS = 500, BASE = 5000, IDLE = 10 * 60 * 1000;

const CSS = `
@keyframes abd-live-fresh { 0% { background: var(--accent-2); box-shadow: inset -3px 0 0 var(--accent); } 70% { background: var(--accent-2); } 100% { background: transparent; box-shadow: inset 0 0 0 transparent; } }
.abd-live-fresh { animation: abd-live-fresh 4s ease-out both; }
@media (prefers-reduced-motion: reduce) { .abd-live-fresh { animation: none; background: var(--accent-2); } }
`;

export default function Live() {
  const users = useAsync(() => api.get('/api/admin/users'), []);
  const [userId, setUserId] = useState('');
  const [model, setModel] = useState('');
  const modelQ = useDebounced(model.trim(), 600);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [running, setRunning] = useState(true);
  const visible = useVisible();
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [fresh, setFresh] = useState(() => new Set());
  const [status, setStatus] = useState({ text: 'جارٍ الاتصال…', tone: 'neutral' });
  const [open, setOpen] = useState(null);
  const S = useRef({ after: 0, backoff: BASE, lastAct: Date.now(), gen: 0, filterKey: '' });

  // user activity keeps the poller alive
  useEffect(() => {
    const on = () => { S.current.lastAct = Date.now(); };
    const evs = ['pointermove', 'keydown', 'scroll', 'click'];
    evs.forEach((e) => window.addEventListener(e, on, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, on));
  }, []);

  useEffect(() => {
    const st = S.current;
    const fk = `${userId}|${modelQ}|${errorsOnly}`;
    if (fk !== st.filterKey) { st.filterKey = fk; st.after = 0; setRows([]); setFresh(new Set()); setLoaded(false); }
    if (!running) { setStatus(st.idle ? { text: 'موقوف (ما في نشاط)', tone: 'warn' } : { text: 'موقوف', tone: 'neutral' }); return undefined; }
    if (!visible) { setStatus({ text: 'موقوف (التبويب مخفي)', tone: 'neutral' }); return undefined; }
    st.lastAct = Date.now(); st.idle = false;
    const gen = ++st.gen;
    let timer = null;
    const schedule = (t) => { clearTimeout(timer); timer = setTimeout(tick, t); };
    async function tick() {
      if (gen !== st.gen) return;
      if (Date.now() - st.lastAct > IDLE) { st.idle = true; setRunning(false); return; }
      try {
        const q = new URLSearchParams({ after: String(st.after), limit: st.after ? '200' : '100' });
        if (userId) q.set('user_id', userId);
        if (modelQ) q.set('model', modelQ);
        if (errorsOnly) q.set('errors', '1');
        const res = await api.get(`/api/admin/live?${q}`);
        if (gen !== st.gen) return;
        const got = res.rows || [];
        if (got.length) {
          const first = st.after === 0;
          st.after = got.at(-1).id;
          const newest = [...got].reverse();
          setRows((prev) => [...newest, ...prev].slice(0, MAX_ROWS));
          if (!first) {
            const ids = new Set(newest.map((r) => r.id));
            setFresh(ids);
          }
        }
        setLoaded(true);
        st.backoff = BASE;
        setStatus({ text: `مباشر · ${new Date().toLocaleTimeString('en-GB')}`, tone: 'ok', live: true });
      } catch {
        if (gen !== st.gen) return;
        st.backoff = Math.min(60000, st.backoff * 2);
        setStatus({ text: `خطأ — إعادة بعد ${st.backoff / 1000}ث`, tone: 'bad' });
      }
      schedule(st.backoff);
    }
    schedule(0);
    return () => { st.gen++; clearTimeout(timer); };
  }, [running, visible, userId, modelQ, errorsOnly]);

  const toggle = () => { S.current.lastAct = Date.now(); S.current.idle = false; setRunning((r) => !r); };
  const clear = () => { setRows([]); setFresh(new Set()); };

  const userOpts = useMemo(() => [{ value: '', label: 'كل الطلاب' }, ...(users.data || []).map((u) => ({ value: String(u.id), label: u.name, hint: u.email || `#${u.id}` }))], [users.data]);

  // buffer stats + per-minute pulse (last 30 min)
  const stats = useMemo(() => {
    const n = rows.length, err = rows.filter((r) => r.status >= 400).length;
    const okLat = rows.filter((r) => r.status < 400 && r.latency_ms != null);
    const cost = rows.reduce((a, r) => a + (r.cost || 0), 0);
    const tok = rows.reduce((a, r) => a + (r.prompt_tokens || 0) + (r.completion_tokens || 0), 0);
    const nowMin = Math.floor(Date.now() / 60000);
    const perMin = Array.from({ length: 30 }, () => 0);
    for (const r of rows) { const k = nowMin - Math.floor(r.created_at / 60); if (k >= 0 && k < 30) perMin[29 - k]++; }
    return { n, err, avg: okLat.length ? okLat.reduce((a, r) => a + r.latency_ms, 0) / okLat.length : null, cost, tok, perMin };
  }, [rows]);

  const columns = [
    { key: 'time', header: 'الوقت', cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-fg-2 num">{time(r.created_at)}</span> },
    { key: 'user', header: 'الطالب', primary: true, cell: (r) => (
      <div className="flex min-w-0 items-center gap-2">
        <StatusDot ok={r.status < 400} />
        <span className="truncate font-medium">{r.user_name || r.user_id}</span>
      </div>
    ) },
    { key: 'model', header: 'النموذج', mobileFull: true, cell: (r) => (
      <span className="font-mono text-[12px] ltr">
        {r.requested_model && r.requested_model !== r.model_id && <span className="text-muted">{r.requested_model} → </span>}{r.model_id}
      </span>
    ) },
    { key: 'provider', header: 'المزوّد', cell: (r) => <span className="text-[12.5px]">{r.provider_id || '—'}</span> },
    { key: 'in', header: 'دخل', align: 'end', cell: (r) => tokens(r.prompt_tokens) },
    { key: 'out', header: 'خرج', align: 'end', cell: (r) => tokens(r.completion_tokens) },
    { key: 'cost', header: 'كلفة', align: 'end', cell: (r) => usdPrecise(r.cost) },
    { key: 'ms', header: 'ms', align: 'end', hideOnMobile: true, cell: (r) => <span className="text-[12.5px]">{r.latency_ms ?? ''}</span> },
    { key: 'ip', header: 'IP', hideOnMobile: true, cell: (r) => <span className="font-mono text-[11.5px] text-muted ltr">{r.ip || ''}</span> },
    { key: 'status', header: 'حالة', cell: (r) => (
      <Tip content={r.error || null}><span><Badge tone={r.status < 400 ? 'ok' : 'bad'} className="num">{r.status}</Badge></span></Tip>
    ) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <style>{CSS}</style>
      <Card className="relative z-[2]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('relative grid size-11 shrink-0 place-items-center rounded-2xl', status.live && running ? 'bg-ok-soft text-ok' : status.tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-sunken text-muted')}>
              {status.live && running && <span className="absolute inset-0 animate-ping rounded-2xl bg-ok/15" />}
              <Radio size={20} className="relative" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-[15.5px] font-semibold">السجل المباشر</div>
              <Badge tone={status.tone} dot pulse={status.live && running} className="mt-1">{status.text}</Badge>
            </div>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={Trash2} onClick={clear} disabled={!rows.length}>مسح</Button>
            <Button variant={running ? 'secondary' : 'primary'} icon={running ? Pause : Play} onClick={toggle} className="min-w-[110px]">
              {running ? 'إيقاف' : 'استئناف'}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
          <Select value={userId} onChange={setUserId} options={userOpts} searchable aria-label="الطالب" placeholder="كل الطلاب" />
          <Input icon={Cpu} mono value={model} onChange={(e) => setModel(e.target.value)} placeholder="model id" aria-label="النموذج" />
          <Switch checked={errorsOnly} onCheckedChange={setErrorsOnly} label="الفاشلة فقط" />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          بيتحدّث كل 5 ثواني (بيجيب الجديد بس). بيتوقف لحاله إذا خبّيت التبويب أو ما لمست الصفحة 10 دقائق — كرمال ما يستهلك موارد عالفاضي. آخر {int(MAX_ROWS)} طلب بس بينعرضوا.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Mini icon={Hash} label="بالقائمة" value={int(stats.n)} />
        <Mini icon={AlertTriangle} label="فشل" value={int(stats.err)} tone={stats.err ? 'bad' : null} sub={stats.n ? `${Math.round((stats.err / stats.n) * 100)}%` : null} />
        <Mini icon={Clock} label="متوسط الرد" value={ms(stats.avg)} />
        <Mini icon={Coins} label="كلفة على الطلاب" value={usdPrecise(stats.cost)} sub={`${tokens(stats.tok)} توكن`} />
        <div className="glass col-span-2 flex min-w-0 flex-col justify-between rounded-2xl p-4 lg:col-span-1">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted"><Activity size={14} className="text-accent" />طلبات/دقيقة · آخر 30 د</div>
          <Sparkline values={stats.perMin} width={240} height={34} className="mt-2 w-full max-w-full" />
        </div>
      </div>

      <Card pad={false} bodyClassName="p-2 sm:p-3">
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} onRowClick={setOpen} loading={!loaded && running && visible} dense maxHeight="70vh"
          rowClassName={(r) => cn(fresh.has(r.id) && 'abd-live-fresh', r.status >= 400 && 'bg-bad-soft/40')}
          empty={<Empty icon={Zap} title="ما في طلبات بعد" text={running ? 'أول ما يوصل طلب جديد بيظهر هون فوراً.' : 'السجل موقوف — اضغط استئناف.'}
            action={!running && <Button variant="primary" icon={Play} onClick={toggle}>استئناف</Button>} />} />
      </Card>

      <Details row={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function StatusDot({ ok }) {
  return <span className={cn('size-2 shrink-0 rounded-full', ok ? 'bg-ok' : 'bg-bad shadow-[0_0_0_3px_var(--bad-bg)]')} />;
}

function Mini({ icon: Icon, label, value, sub, tone }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass min-w-0 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[12px] font-medium text-muted"><Icon size={14} className={tone === 'bad' ? 'text-bad' : 'text-accent'} />{label}</div>
      <div className={cn('mt-1.5 font-display text-xl font-bold num', tone === 'bad' && 'text-bad')}>{value}{sub && <span className="ms-2 text-[12px] font-normal text-muted">{sub}</span>}</div>
    </motion.div>
  );
}

function Details({ row: r, onClose }) {
  const [last, setLast] = useState(null);
  useEffect(() => { if (r) setLast(r); }, [r]);
  const x = r || last;
  return (
    <Sheet open={!!r} onOpenChange={(o) => !o && onClose()} title={x ? <span>طلب <span className="font-mono ltr">#{x.id}</span></span> : ''}
      description={x ? date(x.created_at) : ''}
      footer={x && <CopyButton text={() => JSON.stringify(x, null, 2)} label="نسخ JSON" />}>
      {x && (
        <div className="space-y-5">
          <div className={cn('flex items-center gap-3 rounded-2xl border p-4', x.status < 400 ? 'border-ok/25 bg-ok-soft' : 'border-bad/25 bg-bad-soft')}>
            <Badge tone={x.status < 400 ? 'ok' : 'bad'} className="text-[13px] num">{x.status}</Badge>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[12.5px] ltr text-start">{x.endpoint}</div>
              <div className="text-[12px] text-muted">{ms(x.latency_ms)}</div>
            </div>
          </div>
          {x.error && (
            <div className="rounded-2xl border border-bad/25 bg-bad-soft/60 p-3.5">
              <div className="mb-1 text-[12px] font-semibold text-bad">خطأ</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed ltr text-start">{x.error}</pre>
            </div>
          )}
          <Group title="الطلب">
            <Row icon={User} label="الطالب" value={<>{x.user_name || '—'} <span className="text-muted num">({x.user_id})</span></>} />
            <Row icon={Cpu} label="النموذج" value={<span className="font-mono text-[12.5px] ltr">{x.requested_model}{x.requested_model !== x.model_id && <> → {x.model_id}</>}</span>} />
            <Row icon={Zap} label="المزوّد" value={<span className="font-mono text-[12.5px] ltr">{x.provider_id || '—'} <span className="text-muted">({x.upstream_model || '—'})</span></span>} />
          </Group>
          <Group title="التوكنات والكلفة">
            <div className="grid grid-cols-3 gap-2">
              <Box label="دخل" value={int(x.prompt_tokens)} />
              <Box label="من الكاش" value={int(x.cached_tokens)} />
              <Box label="خرج" value={int(x.completion_tokens)} />
              <Box label="على الطالب" value={usdPrecise(x.cost)} className="col-span-3 sm:col-span-1" />
              <Box label="علينا" value={usdPrecise(x.upstream_cost)} className="col-span-3 sm:col-span-2" />
            </div>
          </Group>
          <Group title="المصدر">
            <Row icon={Globe} label="IP" value={x.ip ? <span className="inline-flex items-center gap-1 font-mono text-[12.5px] ltr">{x.ip}<CopyButton text={x.ip} /></span> : '—'} />
            <Row icon={Monitor} label="جهاز" value={x.device_id ? <span className="inline-flex min-w-0 items-center gap-1 font-mono text-[12px] ltr"><span className="truncate">{x.device_id}</span><CopyButton text={x.device_id} /></span> : '—'} />
          </Group>
        </div>
      )}
    </Sheet>
  );
}
function Group({ title, children }) {
  return <section><h3 className="mb-2 text-[12px] font-semibold text-muted">{title}</h3><div className="space-y-1">{children}</div></section>;
}
function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-1 py-1.5">
      <Icon size={15} className="shrink-0 text-muted" />
      <span className="w-16 shrink-0 text-[12.5px] text-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-[13.5px]">{value}</span>
    </div>
  );
}
function Box({ label, value, className }) {
  return (
    <div className={cn('rounded-xl border border-line bg-sunken/60 px-3 py-2', className)}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="font-semibold num">{value}</div>
    </div>
  );
}
