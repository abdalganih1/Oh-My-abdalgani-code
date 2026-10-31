// Request history: every past request by date range + filters, cursor pagination,
// range totals, a details drawer and CSV of what is loaded.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Download, Eraser, FileWarning, Gauge, List, Search, Timer, TrendingUp, Users as UsersIcon, Wallet } from 'lucide-react';
import { Badge, Button, Card, CopyButton, DataTable, Input, Segmented, Select, Sheet, Stat, CountUp, cn, toast } from '../../ui/index.js';
import { useDebounced, usePersisted } from '../../lib/hooks.js';
import { csvBlob, saveBlob } from '../../lib/api.js';
import { TZ, dateInput, fromDateInput, int, ms, pct, time, tokens, usdPrecise } from '../../lib/format.js';
import { api } from '../ctx.js';

const RANGES = { '1h': 3600, '24h': 86400, '7d': 7 * 86400, '30d': 30 * 86400, '90d': 90 * 86400 };
const EP = { '/v1/chat/completions': 'chat', '/v1/messages': 'messages', '/v1/responses': 'responses' };
const STATUS_OPTS = [
  { value: '', label: 'كل الحالات' }, { value: 'ok', label: 'ناجحة' }, { value: 'err', label: 'فاشلة' },
  { value: '429', label: '429 حد/رصيد' }, { value: '402', label: '402 رصيد الطالب' }, { value: '502', label: '502 المزوّد' }, { value: '504', label: '504 مهلة' },
];
const EP_OPTS = [{ value: '', label: 'كل الصيغ' }, { value: '/v1/chat/completions', label: 'OpenAI chat' }, { value: '/v1/messages', label: 'Anthropic messages' }, { value: '/v1/responses', label: 'Codex responses' }];
const DAY_FMT = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dayKey = (ts) => new Date((ts + TZ * 60) * 1000).toISOString().slice(0, 10);
const EMPTY_F = { user_id: '', model: '', provider: '', endpoint: '', status: '', q: '' };

function StatusBadge({ st }) {
  return <Badge tone={st < 400 ? 'ok' : st === 429 || st === 402 ? 'warn' : 'bad'} dot className="num">{st}</Badge>;
}

function Detail({ r, onClose, onStudent }) {
  let err = r?.error || '';
  try { if (err.trim().startsWith('{')) err = JSON.stringify(JSON.parse(err), null, 2); } catch { /* raw */ }
  const kv = (label, value, mono) => (
    <div className="min-w-0 rounded-xl border border-line bg-sunken/50 px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cn('mt-0.5 break-words text-[13.5px] font-medium', mono && 'font-mono text-[12.5px] ltr text-start')}>{value}</div>
    </div>
  );
  return (
    <Sheet open={!!r} onOpenChange={(o) => !o && onClose()} title={r ? <span className="flex items-center gap-2">طلب <span className="font-mono ltr">#{r.id}</span> <StatusBadge st={r.status} /></span> : ''}
      description={r ? new Date(r.created_at * 1000).toLocaleString('en-GB') : ''}
      footer={r && <Button variant="soft" icon={UsersIcon} onClick={() => onStudent(r.user_id)}>كل طلبات هالطالب</Button>}>
      {r && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {kv('الطالب', <>{r.user_name || '—'} <span className="text-muted">#{r.user_id}</span></>)}
            {kv('الصيغة', r.endpoint, true)}
            {kv('النموذج المطلوب', r.requested_model || r.model_id, true)}
            {kv('النموذج الفعلي', r.model_id, true)}
            {kv('المزوّد', <>{r.provider_id || '—'} <span className="text-muted">{r.upstream_model || ''}</span></>, true)}
            {kv('زمن الاستجابة', r.latency_ms != null ? `${int(r.latency_ms)} ms` : '—')}
            {kv('توكنات الدخل', <>{int(r.prompt_tokens)}{r.cached_tokens ? <span className="text-muted"> (كاش {int(r.cached_tokens)})</span> : null}{r.cache_write_tokens ? <span className="text-muted"> (كتابة كاش {int(r.cache_write_tokens)})</span> : null}</>)}
            {kv('توكنات الخرج', int(r.completion_tokens))}
            {kv('كلفة على الطالب', <>{usdPrecise(r.cost)}{r.charged === 0 && r.cost ? <span className="text-muted"> (ما انخصمت)</span> : null}</>)}
            {kv('كلفة علينا', usdPrecise(r.upstream_cost))}
            {kv('IP', r.ip || '—', true)}
            {kv('الجهاز', r.device_id || '—', true)}
          </div>
          {err && (
            <div>
              <div className="mb-1.5 flex items-center gap-2"><FileWarning size={15} className="text-bad" /><b className="text-sm">الخطأ</b><CopyButton text={err} className="ms-auto" label="نسخ" /></div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-bad/20 bg-bad-soft/50 p-3 font-mono text-[12px] leading-relaxed ltr">{err}</pre>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

export default function Logs() {
  const [range, setRange] = usePersisted('abd:lgRange', '24h');
  const [custom, setCustom] = useState({ from: 0, to: 0 });
  const [f, setF] = useState(EMPTY_F);
  const dq = useDebounced(f.q, 450), dmodel = useDebounced(f.model, 450);
  const [rows, setRows] = useState([]);
  const [next, setNext] = useState(null);
  const [sum, setSum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [sel, setSel] = useState(null);
  const [lists, setLists] = useState({ users: [], providers: [], models: [] });
  const seq = useRef(0);

  const win = useCallback(() => {
    if (range === 'custom' && custom.from) return custom;
    const to = Math.floor(Date.now() / 1000);
    return { from: to - (RANGES[range] || 86400), to };
  }, [range, custom]);

  const params = useCallback((before) => {
    const { from, to } = win();
    const q = new URLSearchParams({ from: String(from), to: String(to), limit: '100' });
    const put = (k, v) => { if (v) q.set(k, v); };
    put('user_id', f.user_id); put('model', dmodel.trim()); put('provider', f.provider); put('endpoint', f.endpoint); put('status', f.status); put('q', dq.trim());
    if (before) q.set('before', String(before));
    return q;
  }, [win, f.user_id, f.provider, f.endpoint, f.status, dmodel, dq]);

  const reload = useCallback(async () => {
    const id = ++seq.current; setLoading(true);
    try {
      const r = await api.get(`/api/admin/logs?${params()}`);
      if (id !== seq.current) return;
      setRows(r.rows); setNext(r.next); setSum(r.summary);
    } catch (e) { toast.error(e.message); } finally { if (id === seq.current) setLoading(false); }
  }, [params]);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    Promise.all([api.get('/api/admin/users'), api.get('/api/admin/providers'), api.get('/api/admin/models')])
      .then(([users, providers, models]) => setLists({ users, providers, models })).catch(() => {});
  }, []);

  const loadMore = async () => {
    if (!next) return; setMore(true);
    try { const r = await api.get(`/api/admin/logs?${params(next)}`); setRows((x) => x.concat(r.rows)); setNext(r.next); } catch (e) { toast.error(e.message); } finally { setMore(false); }
  };

  const exportCsv = () => {
    if (!rows.length) return toast.error('ما في شي للتصدير');
    const cols = ['id', 'created_at', 'user_id', 'user_name', 'requested_model', 'model_id', 'provider_id', 'upstream_model', 'endpoint', 'status', 'prompt_tokens', 'cached_tokens', 'cache_write_tokens', 'completion_tokens', 'cost_usd', 'upstream_cost_usd', 'latency_ms', 'ip', 'device_id', 'error'];
    const { from, to } = win();
    saveBlob(csvBlob(cols, rows, (r, c) => (c === 'created_at' ? new Date(r.created_at * 1000).toISOString() : c === 'cost_usd' ? (r.cost || 0) / 1e6 : c === 'upstream_cost_usd' ? (r.upstream_cost || 0) / 1e6 : r[c])), `requests_${dateInput(from)}_${dateInput(to)}.csv`);
  };

  const { from, to } = win();
  const pick = (which, v) => {
    if (!v) return;
    const next = which === 'from' ? { from: fromDateInput(v), to } : { from, to: fromDateInput(v, true) - 1 };
    if (next.from > next.to) [next.from, next.to] = [next.to - 86399, next.from + 86399];
    setCustom(next); setRange('custom');
  };
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const active = Object.values(f).some(Boolean);
  const margin = sum ? sum.cost - sum.upstream : 0;

  const columns = useMemo(() => [
    { key: 'time', header: 'الوقت', cell: (r) => <span className="font-mono text-[12.5px] text-muted">{time(r.created_at)}</span>, width: 96 },
    { key: 'user', header: 'الطالب', primary: true, cell: (r) => <span className="font-medium">{r.user_name || `#${r.user_id}`}</span> },
    { key: 'model', header: 'النموذج', mobileFull: true, cell: (r) => (
      <span className="font-mono text-[12.5px] ltr">{r.requested_model && r.requested_model !== r.model_id && <span className="text-muted">{r.requested_model} → </span>}{r.model_id}</span>
    ) },
    { key: 'provider', header: 'المزوّد', cell: (r) => <span className="text-[13px]">{r.provider_id || '—'}</span> },
    { key: 'ep', header: 'الصيغة', hideOnMobile: true, cell: (r) => <span className="text-xs text-muted">{EP[r.endpoint] || r.endpoint}</span> },
    { key: 'in', header: 'دخل', align: 'end', cell: (r) => tokens(r.prompt_tokens) },
    { key: 'out', header: 'خرج', align: 'end', cell: (r) => tokens(r.completion_tokens) },
    { key: 'cost', header: 'كلفة', align: 'end', cell: (r) => usdPrecise(r.cost) },
    { key: 'ms', header: 'ms', align: 'end', cell: (r) => <span className="text-muted">{r.latency_ms ?? ''}</span> },
    { key: 'st', header: 'حالة', cell: (r) => <StatusBadge st={r.status} /> },
  ], []);

  return (
    <div className="grid gap-4 sm:gap-5">
      <Card spotlight={false}>
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented value={range} onChange={(v) => setRange(v)} options={[{ value: '1h', label: 'ساعة' }, { value: '24h', label: '24 ساعة' }, { value: '7d', label: '7 أيام' }, { value: '30d', label: '30 يوم' }, { value: '90d', label: '90 يوم' }]} />
          <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted max-sm:w-full">
            <CalendarRange size={16} className="shrink-0" />
            <input type="date" value={dateInput(from)} onChange={(e) => pick('from', e.target.value)}
              className="h-9 min-w-0 rounded-xl border border-line-strong bg-solid px-2.5 text-[13px] text-fg ltr max-sm:flex-1" />
            <span>←</span>
            <input type="date" value={dateInput(to - 1)} onChange={(e) => pick('to', e.target.value)}
              className="h-9 min-w-0 rounded-xl border border-line-strong bg-solid px-2.5 text-[13px] text-fg ltr max-sm:flex-1" />
          </div>
          <div className="ms-auto flex gap-2">
            {active && <Button size="sm" variant="ghost" icon={Eraser} onClick={() => setF(EMPTY_F)}>مسح الفلاتر</Button>}
            <Button size="sm" icon={Download} onClick={exportCsv}>CSV للمعروض</Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6 [&>*:last-child]:max-lg:col-span-2">
          <Select value={f.user_id} onChange={set('user_id')} aria-label="الطالب" options={[{ value: '', label: 'كل الطلاب' }, ...lists.users.map((u) => ({ value: String(u.id), label: u.name, hint: u.email || undefined }))]} />
          <Select value={f.model} onChange={set('model')} aria-label="النموذج" options={[{ value: '', label: 'كل النماذج' }, ...lists.models.map((m) => ({ value: m.id, label: m.id, hint: m.name }))]} />
          <Select value={f.provider} onChange={set('provider')} aria-label="المزوّد" options={[{ value: '', label: 'كل المزوّدين' }, ...lists.providers.map((p) => ({ value: p.id, label: p.name }))]} />
          <Select value={f.endpoint} onChange={set('endpoint')} aria-label="الصيغة" options={EP_OPTS} />
          <Select value={f.status} onChange={set('status')} aria-label="الحالة" options={STATUS_OPTS} />
          <Input icon={Search} value={f.q} onChange={(e) => set('q')(e.target.value)} placeholder="IP · جهاز · نص الخطأ" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Stat icon={List} label="الطلبات" loading={!sum} value={sum && <CountUp value={sum.n} />} sub={sum && `${int(sum.err)} فاشل (${pct(sum.err, sum.n)}) · ${sum.users} طالب`} tone={sum && sum.n && sum.err / sum.n > 0.2 ? 'bad' : undefined} />
        <Stat icon={Gauge} label="التوكنات" loading={!sum} value={sum && <CountUp value={sum.pin + sum.pout} format={tokens} />} sub={sum && `دخل ${tokens(sum.pin)} · خرج ${tokens(sum.pout)}${sum.cached ? ` · كاش ${tokens(sum.cached)}` : ''}`} />
        <Stat icon={Wallet} label="على الطلاب" loading={!sum} value={sum && usdPrecise(sum.cost)} sub={sum && `علينا للمزوّدين ${usdPrecise(sum.upstream)}`} />
        <Stat icon={TrendingUp} label="الهامش" loading={!sum} value={sum && usdPrecise(margin)} sub={sum && (sum.cost ? `${pct(margin, sum.cost)} من الإيراد` : '—')} tone={margin < 0 ? 'bad' : sum?.cost ? 'good' : undefined} />
        <Stat icon={Timer} label="متوسط الاستجابة" loading={!sum} value={sum && (sum.avg_ms ? ms(sum.avg_ms) : '—')} sub="للطلبات الناجحة" className="max-lg:col-span-2" />
      </div>

      <Card spotlight={false} pad={false} bodyClassName="p-3 sm:p-4">
        <DataTable columns={columns} rows={rows} loading={loading} onRowClick={setSel}
          groupBy={(r) => dayKey(r.created_at)} groupLabel={(g) => DAY_FMT.format(new Date(`${g}T12:00:00`))}
          rowClassName={(r) => (r.status >= 400 ? 'shadow-[inset_-3px_0_0_var(--bad)]' : '')}
          empty={{ icon: List, title: 'ما في طلبات', text: 'ما في طلبات بهالفترة وهالفلاتر' }} />
        {rows.length > 0 && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <span className="text-xs text-muted">معروض {int(rows.length)} من {int(sum?.n ?? rows.length)}</span>
            {next && <Button variant="secondary" loading={more} onClick={loadMore}>تحميل المزيد</Button>}
          </div>
        )}
      </Card>

      <Detail r={sel} onClose={() => setSel(null)} onStudent={(uid) => { setF({ ...EMPTY_F, user_id: String(uid) }); setSel(null); }} />
    </div>
  );
}
