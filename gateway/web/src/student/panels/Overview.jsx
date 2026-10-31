// حسابي — onboarding, balance hero + redeem, stats, spending caps, real models behind aliases,
// 30-day chart, where the balance went, what's new, subscriptions, and the "what is a token" explainer.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity, BarChart3, Check, ChevronDown, Cpu, Gauge, HelpCircle, Layers, Lock, Save, Sparkles, Ticket, Wallet, ArrowLeft, CalendarClock,
} from 'lucide-react';
import { Badge, BarChart, Button, Card, CountUp, DataTable, Empty, Field, Input, Progress, Reveal, Ring, Segmented, Stat, cn, toast } from '../../ui/index.js';
import { day, M, STATUS, TZ, tokens, usd, usdPrecise, int } from '../../lib/format.js';
import { fillSeries } from '../../ui/charts.jsx';
import { api, focusLater, useStudent } from '../ctx.js';

const StatusBadge = ({ s }) => (STATUS[s] ? <Badge tone={STATUS[s].tone}>{STATUS[s].label}</Badge> : null);

// ── onboarding ──
function Onboarding() {
  const { me, rep, go } = useStudent();
  const steps = [
    { done: true, t: 'أنشئ حسابك', d: 'تمام، صار عندك حساب ✓' },
    { done: me.keys.length > 0, t: 'اعمل مفتاح API', d: 'من "المفاتيح والأمان" — مفتاح لكل جهاز', go: () => { go('keys'); focusLater('keyName'); } },
    { done: me.subscriptions.length > 0, t: 'فعّل كود التفعيل', d: 'خده من المدرّس وحطه بخانة الرصيد', go: () => focusLater('couponInput', true) },
    { done: (rep?.totals?.requests || 0) > 0, t: 'ثبّت أداتك وابعت أول طلب', d: 'أمر واحد من "التثبيت والاستخدام"', go: () => go('setup') },
  ];
  const n = steps.filter((s) => s.done).length, next = steps.findIndex((s) => !s.done);
  if (n === steps.length) return null;
  return (
    <Card title="ابدأ بأربع خطوات" icon={Sparkles} actions={<span className="text-[12.5px] text-muted num">{n} من {steps.length}</span>}>
      <Progress value={n} max={steps.length} className="mb-4" />
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => {
          const isNext = i === next;
          return (
            <button key={i} type="button" onClick={s.go} disabled={!s.go && !s.done}
              className={cn('group relative flex items-start gap-3 rounded-2xl border p-3.5 text-start transition-all',
                s.done ? 'border-ok/20 bg-ok-soft/60' : isNext ? 'border-accent/40 bg-accent-soft shadow-[0_10px_30px_-14px_var(--glow)] hover:-translate-y-0.5' : 'border-line bg-sunken/50 hover:border-accent/30')}>
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl font-display text-sm font-bold',
                s.done ? 'bg-ok text-white' : isNext ? 'grad-bg text-white' : 'border border-line-strong bg-solid text-muted')}>
                {s.done ? <Check size={16} strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <b className={cn('block text-[14px]', s.done && 'text-ok')}>{s.t}</b>
                <span className="block text-[12.5px] leading-snug text-muted">{s.d}</span>
              </span>
              {isNext && s.go && <ArrowLeft size={16} className="absolute end-3 top-3.5 text-accent transition-transform group-hover:-translate-x-1" />}
              {isNext && <span className="absolute -top-2 end-3 rounded-full grad-bg px-2 py-px text-[10.5px] font-semibold text-white">الخطوة الجاية</span>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ── hero: balance in one plain sentence + redeem ──
function Hero() {
  const { me, rep, reload, groupName, fmtAmount } = useStudent();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const active = me.subscriptions.filter((s) => s.active);
  const sum = (kind, f) => active.filter((s) => s.kind === kind).reduce((a, s) => a + s[f], 0);
  const usdLeft = sum('usd', 'remaining'), tokLeft = sum('tokens', 'remaining'), usdTotal = sum('usd', 'total'), tokTotal = sum('tokens', 'total');
  const b = rep.burn;
  const soonest = active.filter((s) => s.expires_at).sort((x, y) => x.expires_at - y.expires_at)[0];
  const daysTo = soonest ? Math.max(0, Math.ceil((soonest.expires_at * 1000 - Date.now()) / 86400000)) : null;

  let value, sub = [], tokLine = '', leftPct = 0;
  if (active.length) {
    const usedPct = usdTotal ? (1 - usdLeft / usdTotal) : (1 - tokLeft / tokTotal);
    leftPct = Math.max(0, Math.round((1 - usedPct) * 100));
    value = usdTotal ? <CountUp value={usdLeft} format={(v) => usd(v)} /> : `${tokens(tokLeft)} توكن`;
    const left = usdTotal ? b.usd_days_left : b.tokens_days_left;
    sub.push(`استهلكت ${Math.round(usedPct * 100)}% من ${usdTotal ? usd(usdTotal) : tokens(tokTotal) + ' توكن'}`);
    sub.push(left != null ? `بمعدل استهلاكك آخر أسبوع بيكفيك تقريباً ${left > 365 ? 'أكثر من سنة' : left + ' يوم'}` : 'ما استخدمت شي آخر أسبوع');
    if (daysTo != null) sub.push(`أقرب اشتراك بينتهي بعد ${daysTo} يوم (${day(soonest.expires_at)})`);
    tokLine = usdTotal && tokTotal ? `وعندك كمان ${tokens(tokLeft)} توكن مخصصة${b.tokens_days_left != null ? ` (تكفي تقريباً ${b.tokens_days_left} يوم)` : ''}.` : '';
  }

  const redeem = async (e) => {
    e.preventDefault(); if (busy) return; setBusy(true);
    try {
      const r = await api.post('/api/me/redeem', { code });
      toast.success(`✅ تم تفعيل ${fmtAmount(r.kind, r.amount)} — ${groupName(r.group_id)}`);
      setCode(''); await reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <section className="glass relative overflow-hidden rounded-3xl p-5 sm:p-7">
      <div aria-hidden className="pointer-events-none absolute -top-32 end-[-10%] size-[420px] rounded-full bg-[radial-gradient(closest-side,var(--mesh-1),transparent)]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 start-[-5%] size-[380px] rounded-full bg-[radial-gradient(closest-side,var(--mesh-2),transparent)]" />
      <div className="relative flex flex-col-reverse items-start gap-6 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-medium text-muted"><Wallet size={16} className="text-accent" />رصيدك الحالي</div>
          <div className={cn('mt-1 font-display font-bold leading-tight tracking-tight num', active.length ? 'text-[clamp(2.4rem,6vw,3.6rem)]' : 'text-[clamp(1.7rem,4vw,2.3rem)]')}>
            {active.length ? <span className="grad-text">{value}</span> : 'ما عندك رصيد'}
          </div>
          <p className="mt-2 max-w-[620px] text-[13.5px] leading-relaxed text-fg-2">
            {active.length ? sub.join(' · ') : 'اطلب كوبون من المدرّس وفعّله تحت — بدون رصيد ما بتشتغل الأدوات.'}
          </p>
          {tokLine && <p className="mt-1 text-[13px] text-muted">{tokLine}</p>}
          <form onSubmit={redeem} className="mt-5 flex max-w-[520px] flex-col gap-2 sm:flex-row">
            <Input id="couponInput" mono icon={Ticket} className="flex-1" placeholder="ABD-XXXX-XXXX-XXXX" required aria-label="كود التفعيل" autoComplete="off"
              value={code} onChange={(e) => setCode(e.target.value)} />
            <Button type="submit" variant="primary" icon={Ticket} loading={busy}>فعّل الكود</Button>
          </form>
        </div>
        <Ring value={leftPct / 100} size={150} stroke={12} className="self-center drop-shadow-[0_10px_30px_var(--glow)]">
          <div><b className="block font-display text-[28px] font-bold leading-none num">{leftPct}%</b><span className="text-[12px] text-muted">متبقي</span></div>
        </Ring>
      </div>
    </section>
  );
}

function Stats() {
  const { rep, catalog } = useStudent();
  const t = rep.totals, b = rep.burn;
  const avail = catalog.models.filter((m) => m.available).length;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <Stat icon={Activity} label="طلبات آخر 30 يوم" value={<CountUp value={t.requests} />} sub={`≈ ${b.per_day_requests} طلب باليوم آخر أسبوع`} />
      <Stat icon={Layers} label="توكنات آخر 30 يوم" value={tokens(t.tokens)} sub={`دخل ${tokens(t.prompt_tokens)} · خرج ${tokens(t.completion_tokens)}`} />
      <Stat icon={Wallet} label="صرفت آخر 30 يوم" value={usdPrecise(t.cost)} sub={`متوسط الطلب ${usdPrecise(t.avg_cost)}`} />
      <Stat icon={Cpu} label="نماذج متاحة لك" value={<span className="ltr">{avail} / {catalog.models.filter((m) => m.status !== 'archived').length}</span>} sub="حسب فئات اشتراكاتك" />
    </div>
  );
}

// ── caps ──
function Caps() {
  const { limits: l, reloadLimits } = useStudent();
  const [daily, setDaily] = useState(''), [monthly, setMonthly] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDaily((l.daily_cap / M).toFixed(2)); setMonthly(l.monthly_cap ? (l.monthly_cap / M).toFixed(2) : ''); }, [l.daily_cap, l.monthly_cap]);
  const pct = Math.min(100, Math.round((l.spent_today / l.daily_cap) * 100));
  const tone = pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : undefined;
  const reset = new Date(l.resets_at * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api.put('/api/me/limits', { daily_cap: Math.round(+daily * M), monthly_cap: monthly ? Math.round(+monthly * M) : null });
      toast.success('تم حفظ حدودك'); await reloadLimits();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Card title="حدود صرفي" icon={Gauge} subtitle="حماية لرصيدك: إذا علقت أداة بحلقة أو انسرق مفتاحك، ما بيقدر يصرف أكثر من سقفك.">
      <div className="rounded-2xl border border-line bg-sunken/50 p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[13px] text-fg-2">صرفت اليوم <b className="num">{usdPrecise(l.spent_today)}</b> من سقفك <b className="num">{usd(l.daily_cap)}</b></span>
          <span className={cn('font-display text-lg font-bold num', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn')}>{pct}%</span>
        </div>
        <Progress value={pct} max={100} tone={tone} className="h-2.5" />
        <div className="mt-2 text-[12px] text-muted">
          بيتصفّر الساعة <span className="ltr num">{reset}</span>{l.monthly_cap ? <> · هالشهر {usd(l.spent_month)} من {usd(l.monthly_cap)}</> : null}
        </div>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">السقف اليومي إجباري (بيبدأ بـ <span className="ltr">$5</span>) وبتقدر تغيّره هون.</p>
      <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="السقف اليومي ($)" hint={<>الحد الأعلى المسموح {usd(l.max_cap)}</>}>
          <Input type="number" step="0.01" min="0.1" max={(l.max_cap / M).toFixed(2)} required value={daily} onChange={(e) => setDaily(e.target.value)} className="ltr num" />
        </Field>
        <Field label="السقف الشهري ($، اختياري)" hint=" ">
          <Input type="number" step="0.01" min="0.1" placeholder="بلا" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="ltr num" />
        </Field>
        <Button type="submit" variant="primary" icon={Save} loading={busy} className="sm:mb-[22px]">حفظ</Button>
      </form>
    </Card>
  );
}

// ── real models behind aliases ──
function RealModels() {
  const { me, catalog } = useStudent();
  const rows = me.aliases.map((a) => ({ ...a, t: catalog.models.find((m) => m.id === a.model_id), was: a.fallback ? catalog.models.find((m) => m.id === a.archived_model_id) : null }));
  const cols = [
    { key: 'alias', header: 'الاسم بأدواتك', primary: true, cell: (a) => <span className="whitespace-nowrap rounded-lg border border-line bg-sunken px-2 py-0.5 font-mono text-[12.5px] ltr">{a.alias}</span> },
    { key: 'model', header: 'النموذج الحقيقي', mobileFull: true, cell: (a) => (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <b>{a.t?.name || a.model_name}</b>
          {a.t && <StatusBadge s={a.t.status} />}
          {a.t && !a.t.available && a.t.status !== 'archived' && <Badge tone="bad"><Lock size={11} />خارج اشتراكك</Badge>}
        </div>
        <div><span className="font-mono text-[11.5px] text-muted ltr">{a.model_id}</span></div>
        {a.was && <div className="text-[12px] text-warn">بدلاً من {a.was.name} (مؤرشف)</div>}
      </div>
    ) },
    { key: 'served', header: 'المزوّد · المعرّف عنده', mobileFull: true, cell: (a) => <span className="text-[12.5px] text-muted ltr">{a.served_by || '—'}</span> },
  ];
  return (
    <Card title="النماذج الحقيقية ورا أسمائك" icon={Cpu}>
      <DataTable columns={cols} rows={rows} rowKey={(a) => a.alias} dense empty={{ icon: Cpu, title: 'ما في أسماء' }} />
      <p className="mt-3 text-[12.5px] text-muted">كل رد من البوابة فيه كمان الترويسة <code className="rounded bg-sunken px-1 font-mono text-[11.5px] ltr">x-abdalgani-model</code> وحقل <code className="rounded bg-sunken px-1 font-mono text-[11.5px] ltr">model</code> بالنموذج الحقيقي.</p>
    </Card>
  );
}

// ── 30-day chart ──
const METRIC_NAMES = { cost: 'الكلفة', requests: 'الطلبات', tokens: 'التوكنات' };
function UsageChart() {
  const { rep } = useStudent();
  const [metric, setMetric] = useState('cost');
  const rows = useMemo(() => fillSeries(rep.series, rep.range.from, rep.range.to, TZ, 'day'), [rep]);
  const fmt = metric === 'cost' ? (v, axis) => (axis ? usd(v, v < 1e6 ? 2 : 0) : usdPrecise(v)) : metric === 'tokens' ? (v) => tokens(v) : (v) => int(v);
  return (
    <Card title={`${METRIC_NAMES[metric]} آخر 30 يوم`} icon={BarChart3}
      actions={<Segmented size="sm" value={metric} onChange={setMetric} options={[{ value: 'cost', label: 'الكلفة $' }, { value: 'requests', label: 'الطلبات' }, { value: 'tokens', label: 'التوكنات' }]} />}>
      {rep.series.length
        ? <BarChart labels={rows.map((x) => x.t.slice(5))} series={[{ name: METRIC_NAMES[metric], color: 'var(--series-1)', values: rows.map((x) => x[metric] || 0) }]} format={fmt} height={220} />
        : <Empty icon={BarChart3} title="لسا ما في استخدام" text="أول ما تبعت طلبات من أدواتك، رح تشوف استهلاكك يوم بيوم هون." className="py-8" />}
    </Card>
  );
}

// ── where did my balance go ──
function ByModel() {
  const { rep } = useStudent();
  const bm = rep.by_model, t = rep.totals;
  const totalCost = bm.reduce((a, x) => a + x.cost, 0), totalReq = bm.reduce((a, x) => a + x.requests, 0);
  const key = totalCost ? 'cost' : 'requests', max = Math.max(0, ...bm.map((x) => x[key])), total = key === 'cost' ? totalCost : totalReq;
  const cols = [
    { key: 'name', header: 'النموذج', primary: true, cell: (x) => <b>{x.name || x.model_id}</b> },
    { key: 'bar', header: '', width: '32%', hideOnMobile: true, cell: (x) => (
      <div className="h-2 overflow-hidden rounded-full bg-sunken">
        <motion.div className="h-full rounded-full grad-bg" initial={{ width: 0 }} animate={{ width: `${max ? Math.max(1, (x[key] / max) * 100) : 0}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
      </div>
    ) },
    { key: 'requests', header: 'طلبات', align: 'end', cell: (x) => int(x.requests) },
    { key: 'tokens', header: 'توكنات', align: 'end', cell: (x) => tokens(x.prompt_tokens + x.completion_tokens) },
    { key: 'cost', header: 'الكلفة', align: 'end', cell: (x) => usdPrecise(x.cost) },
    { key: 'pct', header: 'النسبة', align: 'end', cell: (x) => (total ? <Badge tone="accent">{Math.round((x[key] / total) * 100)}%</Badge> : '—') },
  ];
  return (
    <Card title="وين راح رصيدك؟" icon={BarChart3}>
      <DataTable columns={cols} rows={bm} rowKey={(x) => x.model_id} empty={{ icon: BarChart3, title: 'ما في استخدام آخر 30 يوم', text: 'أول طلب من أداتك رح يبيّن هون.' }} />
      {t.requests > 0 && <p className="mt-3 text-[13px] text-muted">الطلب الواحد عندك بالمتوسط ≈ <b className="text-fg-2">{tokens(t.avg_tokens)}</b> توكن ويكلّف <b className="text-fg-2">{usdPrecise(t.avg_cost)}</b>.</p>}
    </Card>
  );
}

// ── what's new ──
function News() {
  const { catalog, setAlias } = useStudent();
  const [busy, setBusy] = useState(null);
  const nowS = Date.now() / 1000;
  const fresh = catalog.models.filter((m) => m.status === 'new');
  const gone = catalog.models.filter((m) => m.status === 'archived' && m.archived_at && nowS - m.archived_at < 14 * 86400);
  if (!fresh.length && !gone.length) return null;
  return (
    <Card title="ما الجديد" icon={Sparkles}>
      <ul className="flex flex-col gap-2">
        {fresh.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-2xl border border-new/20 bg-new-soft/50 px-3.5 py-2.5 text-[13px]">
            <Badge tone="new" dot pulse>جديد</Badge>
            <b>{m.name}</b>
            <span className="font-mono text-[11.5px] text-muted ltr">{m.id}</span>
            <span className="text-muted">· أُضيف {day(m.created_at)}</span>
            <span className="ms-auto">
              {m.available
                ? <Button size="xs" variant="soft" loading={busy === m.id} onClick={async () => { setBusy(m.id); await setAlias('abd-main', m.id); setBusy(null); }}>جرّبه كـ <span className="ltr">abd-main</span></Button>
                : <Badge><Lock size={11} />خارج اشتراكك</Badge>}
            </span>
          </li>
        ))}
        {gone.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-sunken/50 px-3.5 py-2.5 text-[13px]">
            <Badge tone="bad">مؤرشف</Badge><span>{m.name}</span><span className="text-muted">· توقف {day(m.archived_at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── subscriptions ──
function Subs() {
  const { me, groupName, fmtAmount } = useStudent();
  const cols = [
    { key: 'kind', header: 'النوع', primary: true, cell: (s) => (s.kind === 'usd' ? '💵 دولار' : '🔢 توكنات') },
    { key: 'group', header: 'الفئة', cell: (s) => groupName(s.group_id) },
    { key: 'rem', header: 'المتبقي', align: 'end', cell: (s) => <b>{fmtAmount(s.kind, s.remaining)}</b> },
    { key: 'use', header: 'الاستهلاك', mobileFull: true, cell: (s) => {
      const pct = Math.min(100, Math.round((s.used / s.total) * 100));
      return <div className="min-w-[130px]"><div className="mb-1 text-[12px] text-muted">{fmtAmount(s.kind, s.used)} من {fmtAmount(s.kind, s.total)}</div><Progress value={pct} max={100} tone={pct >= 90 ? 'bad' : undefined} /></div>;
    } },
    { key: 'exp', header: 'ينتهي', cell: (s) => <span className="text-[12.5px]">{day(s.expires_at)}</span> },
    { key: 'st', header: 'الحالة', cell: (s) => {
      const expired = s.expires_at && s.expires_at * 1000 < Date.now();
      return s.active ? <Badge tone="ok" dot>فعّال</Badge> : expired ? <Badge tone="bad">منتهي</Badge> : s.disabled ? <Badge>موقوف</Badge> : <Badge tone="warn">مستنفد</Badge>;
    } },
    { key: 'src', header: 'المصدر', hideOnMobile: true, cell: (s) => <span className="font-mono text-[11.5px] text-muted ltr">{s.source || ''}</span> },
  ];
  return (
    <Card title="اشتراكاتي" icon={CalendarClock}>
      <DataTable columns={cols} rows={me.subscriptions} empty={{ icon: Ticket, title: 'ما عندك اشتراكات بعد', text: 'اطلب كود تفعيل من المدرّس وفعّله فوق.', action: <Button variant="soft" size="sm" icon={Ticket} onClick={() => focusLater('couponInput')}>فعّل كود</Button> }} />
    </Card>
  );
}

// ── explainer ──
function Explainer() {
  const [open, setOpen] = useState(false);
  return (
    <section className="glass overflow-hidden rounded-3xl">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-start sm:px-6">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><HelpCircle size={17} /></span>
        <span className="flex-1 font-display text-[15px] font-semibold">شو يعني "توكن"؟ وليش بعض الطلبات أغلى من غيرها؟</span>
        <ChevronDown size={18} className={cn('shrink-0 text-muted transition-transform duration-300', open && 'rotate-180 text-accent')} />
      </button>
      <motion.div initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
        <div className="px-5 pb-5 text-[14px] leading-[1.9] text-fg-2 sm:px-6">
          <ul className="flex list-disc flex-col gap-1.5 ps-5 marker:text-accent">
            <li><b>التوكن</b> = قطعة صغيرة من النص: تقريباً ¾ كلمة إنجليزية، أو نص كلمة عربية. الكود كمان بيتقسّم لتوكنات.</li>
            <li>كل طلب إله جزئين: <b>الدخل</b> (اللي بتبعته أنت: سؤالك + الملفات + كل المحادثة اللي قبل) و<b>الخرج</b> (رد النموذج). الخرج عادة أغلى.</li>
            <li><b>المحادثات الطويلة أغلى</b>: كل رسالة جديدة بتبعت معها كل اللي قبلها. أدوات البرمجة (OpenCode، Claude Code…) بتبعت كمان ملفات المشروع، فالطلب الواحد ممكن يكون عشرات آلاف التوكنات.</li>
            <li><b>بعض النماذج سعرها ثابت لكل طلب</b> مهما كان طوله، وبعضها حسب التوكنات — شوف السعر بصفحة "النماذج".</li>
          </ul>
          <p className="mt-3 rounded-2xl border border-accent/20 bg-accent-soft p-3.5"><b>نصائح لتوفير رصيدك:</b> ابدأ محادثة جديدة لكل مهمة جديدة · استخدم <code className="font-mono text-[12.5px] ltr">abd-fast</code> للأسئلة السريعة · لا تفتح ملفات ضخمة ما بتحتاجها · اطلب من الأداة تلخّص بدل ما تعيد قراءة كل شي.</p>
        </div>
      </motion.div>
    </section>
  );
}

export default function Overview() {
  return (
    <div className="grid gap-4 sm:gap-5 [&>*]:min-w-0">
      <Reveal><Onboarding /></Reveal>
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <Reveal delay={0.04}><Hero /></Reveal>
        <Reveal delay={0.08}><Stats /></Reveal>
      </div>
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-2 [&>*]:min-w-0">
        <Reveal delay={0.1}><Caps /></Reveal>
        <Reveal delay={0.12}><RealModels /></Reveal>
      </div>
      <Reveal delay={0.14}><UsageChart /></Reveal>
      <Reveal delay={0.16}><ByModel /></Reveal>
      <News />
      <Subs />
      <Explainer />
    </div>
  );
}
