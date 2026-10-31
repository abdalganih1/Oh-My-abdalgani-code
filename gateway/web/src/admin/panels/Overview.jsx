// Reports: any period → usage + money KPIs, time series, top models/students, peak hours,
// monthly revenue vs paid, provider breakdown, manual expenses, CSV export.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarRange, Clock, Coins, Cpu, Download, Flame, HandCoins, Hash, Layers,
  PiggyBank, Plug, Plus, Receipt, RefreshCw, Trash2, TrendingDown, TrendingUp, Users, Wallet, Zap,
} from 'lucide-react';
import {
  Badge, BarChart, Button, Card, CountUp, DataTable, Empty, Field, Heatmap, Input, Legend, Reveal, Segmented, Select, Skeleton, Sparkline,
  cn, fillSeries, toast, useConfirm, useSpotlight,
} from '../../ui/index.js';
import { useAsync, usePersisted } from '../../lib/hooks.js';
import { DAYS, M, TZ, date, dateInput, day, fromDateInput, int, pct, signedUsd, tokens, usd, usdPrecise } from '../../lib/format.js';
import { api } from '../ctx.js';

// ── ranges (same rules as the legacy panel; local-timezone midnights) ──
const PRESETS = [
  { value: 'today', label: 'اليوم' }, { value: '7', label: '7 أيام' }, { value: '30', label: '30 يوم' },
  { value: 'month', label: 'هذا الشهر' }, { value: 'lastmonth', label: 'الشهر الماضي' }, { value: '90', label: '90 يوم' },
];
function rangeFor(key, custom) {
  const now = Math.floor(Date.now() / 1000);
  const local = new Date(Date.now() + TZ * 60000);
  const midnight = Math.floor(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) / 1000) - TZ * 60;
  const monthStart = (y, m) => Math.floor(Date.UTC(y, m, 1) / 1000) - TZ * 60;
  if (key === 'today') return { from: midnight, to: now + 1 };
  if (key === 'month') return { from: monthStart(local.getUTCFullYear(), local.getUTCMonth()), to: now + 1 };
  if (key === 'lastmonth') return { from: monthStart(local.getUTCFullYear(), local.getUTCMonth() - 1), to: monthStart(local.getUTCFullYear(), local.getUTCMonth()) };
  if (key === 'custom' && custom?.from && custom?.to) return { from: fromDateInput(custom.from), to: fromDateInput(custom.to, true) };
  const n = Number(key) || 30;
  return { from: midnight - (n - 1) * 86400, to: now + 1 };
}
const tzLabel = `UTC${TZ >= 0 ? '+' : '−'}${Math.abs(TZ / 60)}`;
const secs = (v) => (v ? `${(v / 1000).toFixed(1)} ث` : '—');
const money = (v, axis) => (axis ? usd(v, v < 1e6 ? 2 : 0) : usdPrecise(v));

const METRIC = {
  requests: { title: 'الطلبات', short: 'طلبات', icon: Hash, fmt: (v, axis) => (axis ? tokens(v) : int(v)) },
  tokens: { title: 'التوكنات', short: 'توكنات', icon: Layers, fmt: (v) => tokens(v) },
  consumed: { title: 'المستهلك من رصيد الطلاب', short: 'مستهلك من الطلاب', icon: Wallet, fmt: money },
  upstream_cost: { title: 'كلفة المزوّدين علينا (استخدام)', short: 'كلفة علينا', icon: Receipt, fmt: money },
};

export default function Overview() {
  const [key, setKey] = usePersisted('abd:reportRange', '30');
  const [custom, setCustom] = usePersisted('abd:reportCustom', { from: '', to: '' });
  const [metric, setMetric] = useState('requests');
  const [modelSort, setModelSort] = useState('requests');
  const [userSort, setUserSort] = useState('requests');
  const [nonce, setNonce] = useState(0);
  const range = useMemo(() => rangeFor(key, custom), [key, custom, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const rep = useAsync(() => api.get(`/api/admin/reports?from=${range.from}&to=${range.to}&tz=${TZ}`), [range.from, range.to]);
  const R = rep.data;

  // date inputs mirror the active preset
  const [fromIn, setFromIn] = useState(dateInput(range.from));
  const [toIn, setToIn] = useState(dateInput(range.to - 1));
  useEffect(() => { setFromIn(dateInput(range.from)); setToIn(dateInput(range.to - 1)); }, [range.from, range.to]);
  const onDate = (f, t) => {
    setFromIn(f); setToIn(t);
    if (f && t) {
      if (f > t) { toast.error('تاريخ البداية بعد النهاية'); return; }
      setCustom({ from: f, to: t }); setKey('custom');
    }
  };
  const pickPreset = (v) => { setKey(v); setNonce((n) => n + 1); };

  const [csvBusy, setCsvBusy] = useState(false);
  const exportCsv = async () => {
    setCsvBusy(true);
    try { await api.download(`/api/admin/reports/export?from=${range.from}&to=${range.to}`, 'usage.csv'); toast.success('تم تصدير الملف'); }
    catch (e) { toast.error(e.message); } finally { setCsvBusy(false); }
  };

  const series = useMemo(() => (R ? fillSeries(R.series, R.range.from, R.range.to, TZ, R.range.bucket) : []), [R]);
  const spark = (k) => series.map((r) => r[k] || 0);

  return (
    <div className="flex flex-col gap-5">
      {/* ── range toolbar ── */}
      <Reveal>
        <Card className="relative z-[2]" bodyClassName="!pt-4 sm:!pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 max-w-full">
              <div className="mb-1.5 text-[12px] font-medium text-muted">الفترة</div>
              <Segmented value={key} onChange={pickPreset} options={PRESETS} className="max-w-full" />
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2 sm:flex-none">
              <Field label="من" className="min-w-[140px] flex-1 sm:w-[160px] sm:flex-none">
                <Input type="date" value={fromIn} max={toIn || undefined} onChange={(e) => onDate(e.target.value, toIn)} className="ltr" aria-label="من تاريخ" />
              </Field>
              <Field label="إلى" className="min-w-[140px] flex-1 sm:w-[160px] sm:flex-none">
                <Input type="date" value={toIn} min={fromIn || undefined} onChange={(e) => onDate(fromIn, e.target.value)} className="ltr" aria-label="إلى تاريخ" />
              </Field>
            </div>
            <div className="ms-auto flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="تحديث" onClick={() => rep.reload()} disabled={rep.loading}><RefreshCw size={17} className={cn(rep.loading && 'animate-spin')} /></Button>
              <Button variant="secondary" icon={Download} loading={csvBusy} onClick={exportCsv}>تصدير CSV</Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <CalendarRange size={14} className="text-accent" />
            <span>من {day(range.from)} إلى {day(range.to - 1)} — بتوقيتك (<span className="ltr">{tzLabel}</span>)</span>
            {key === 'custom' && <Badge tone="accent">فترة مخصّصة</Badge>}
            {R && <Badge tone="neutral">{R.range.bucket === 'hour' ? 'تجميع بالساعة' : 'تجميع باليوم'}</Badge>}
          </div>
        </Card>
      </Reveal>

      {rep.error && !R ? (
        <Card><Empty icon={BarChart3} title="ما قدرنا نجيب التقرير" text={rep.error.message} action={<Button variant="primary" icon={RefreshCw} onClick={() => rep.reload()}>جرّب كمان مرة</Button>} /></Card>
      ) : (
        <div className={cn('flex flex-col gap-5 transition-opacity', rep.loading && R && 'opacity-60')}>
          <MoneyHero R={R} range={range} />
          <UsageKpis R={R} spark={spark} />
          <MoneyKpis R={R} />

          {/* ── time series ── */}
          <Reveal delay={0.05}>
            <Card className="relative" title={R ? `${METRIC[metric].title} ${R.range.bucket === 'hour' ? 'بالساعة' : 'باليوم'}` : 'النشاط عبر الوقت'} icon={Activity}
              subtitle={R ? `المجموع: ${METRIC[metric].fmt(series.reduce((a, r) => a + (r[metric] || 0), 0))}` : null}
>
              <Segmented size="sm" value={metric} onChange={setMetric} options={Object.entries(METRIC).map(([v, m]) => ({ value: v, label: m.short, icon: m.icon }))} className="mb-3 sm:absolute sm:end-6 sm:top-5 sm:mb-0" />
              {!R ? <Skeleton className="h-[240px]" /> : series.length && series.some((r) => r[metric]) ? (
                <BarChart labels={series.map((r) => (R.range.bucket === 'hour' ? r.t.slice(11) : r.t.slice(5)))}
                  series={[{ name: METRIC[metric].title, color: 'var(--series-1)', values: series.map((r) => r[metric] || 0) }]} format={METRIC[metric].fmt} height={250} />
              ) : <Empty icon={Activity} title="ما في نشاط بهالفترة" text="جرّب فترة أطول." />}
            </Card>
          </Reveal>

          {/* ── top lists ── */}
          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <TopModels R={R} sort={modelSort} setSort={setModelSort} />
            <TopUsers R={R} sort={userSort} setSort={setUserSort} />
          </div>

          <PeakHours R={R} />
          <MonthlyMoney R={R} />

          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <PaidBreakdown R={R} />
            <Expenses onChange={() => rep.reload()} />
          </div>

          <ProvidersReport R={R} />
        </div>
      )}
    </div>
  );
}

// ── hero: revenue vs paid vs profit ──
function MoneyHero({ R, range }) {
  const onMove = useSpotlight();
  const m = R?.money;
  const total = m ? Math.max(1, m.revenue + m.paid) : 1;
  const good = (m?.profit ?? 0) >= 0;
  const days = Math.max(1, Math.round((range.to - range.from) / 86400));
  return (
    <Reveal>
      <section onPointerMove={onMove} className="glass spot relative overflow-hidden rounded-3xl p-5 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -top-24 end-[-10%] size-[340px] rounded-full bg-[radial-gradient(closest-side,var(--mesh-1),transparent)] blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 start-[-8%] size-[300px] rounded-full bg-[radial-gradient(closest-side,var(--mesh-2),transparent)] blur-2xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
              <PiggyBank size={16} className="text-accent" /> صافي الربح بالفترة
              {m && <Badge tone={good ? 'ok' : 'bad'} className="ms-1">{good ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{m.revenue ? `هامش ${pct(m.profit, m.revenue)}` : 'لا إيراد بالفترة'}</Badge>}
            </div>
            {!m ? <Skeleton className="mt-3 h-14 w-56" /> : (
              <div className={cn('mt-2 font-display text-[44px] font-bold leading-none tracking-tight num sm:text-[58px]', good ? 'grad-text' : 'text-bad')}>
                <CountUp value={m.profit} format={(v) => signedUsd(Math.round(v))} />
              </div>
            )}
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted">
              اللي أخذته من الطلاب (اشتراكات وكوبونات مبيعة) ناقص كل اللي دفعته للمزوّدين: استخدام + اشتراكات ثابتة محسوبة نسبياً + مصاريف يدوية.
              {m && <> المعدّل اليومي: <b className="num text-fg-2">{signedUsd(Math.round(m.profit / days))}</b>.</>}
            </p>
          </div>
          <div className="min-w-0 space-y-4">
            <HeroBar icon={ArrowDownRight} label="أخذت من الطلاب" value={m?.revenue} share={m ? m.revenue / total : 0} color="var(--series-1)"
              sub={m ? `${int(m.subscriptions)} اشتراك · ${int(m.coupons_redeemed)} كوبون مفعّل` : ''} />
            <HeroBar icon={ArrowUpRight} label="دفعت للمزوّدين" value={m?.paid} share={m ? m.paid / total : 0} color="var(--series-2)"
              sub={m ? `استخدام ${usd(m.upstream_usage)} · اشتراكات ${usd(m.fixed_fees)} · مصاريف ${usd(m.expenses)}` : ''} />
          </div>
        </div>
      </section>
    </Reveal>
  );
}
function HeroBar({ icon: Icon, label, value, share, color, sub }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg-2"><Icon size={15} style={{ color }} />{label}</span>
        {value == null ? <Skeleton className="h-6 w-20" /> : <span className="font-display text-xl font-bold num"><CountUp value={value} format={(v) => usd(Math.round(v))} /></span>}
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-sunken">
        <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 55%, transparent))` }}
          initial={{ width: 0 }} animate={{ width: `${Math.max(value ? 2 : 0, share * 100)}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
      </div>
      {sub && <div className="mt-1.5 truncate text-[12px] text-muted" title={sub.replace(/[⁦⁩]/g, '')}>{sub}</div>}
    </div>
  );
}

// ── KPI tiles ──
function Kpi({ icon: Icon, label, value, format, sub, tone, spark, sparkColor, delay = 0, loading, className }) {
  const onMove = useSpotlight();
  return (
    <motion.div onPointerMove={onMove} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn('glass spot relative flex min-w-0 flex-col overflow-hidden rounded-2xl p-4 sm:p-5', className)}>
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
        <span className={cn('grid size-7 place-items-center rounded-lg', tone === 'good' ? 'bg-ok-soft text-ok' : tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-accent-soft text-accent-ink')}><Icon size={15} /></span>
        <span className="truncate">{label}</span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-24" /> : (
        <div className={cn('mt-2.5 font-display text-[26px] font-bold leading-tight tracking-tight num max-sm:text-[22px]', tone === 'good' && 'text-ok', tone === 'bad' && 'text-bad')}>
          {typeof value === 'number' ? <CountUp value={value} format={format} /> : value}
        </div>
      )}
      {sub && <div className="mt-1 text-[12px] leading-snug text-muted">{sub}</div>}
      {spark && spark.length > 1 && !loading && <Sparkline values={spark} width={220} height={30} color={sparkColor || 'var(--series-1)'} className="mt-auto w-full max-w-full pt-3 opacity-90" />}
    </motion.div>
  );
}
function SectionTitle({ icon: Icon, children, hint }) {
  return (
    <div className="mb-3 mt-1 flex items-center gap-2 px-1">
      <Icon size={16} className="text-accent" />
      <h2 className="font-display text-[15px] font-semibold">{children}</h2>
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
      <span className="ms-2 h-px flex-1 bg-gradient-to-l from-transparent to-line-strong rtl:bg-gradient-to-r" />
    </div>
  );
}
function UsageKpis({ R, spark }) {
  const t = R?.totals;
  const cached = t?.cached_tokens ? ` · من الكاش ${tokens(t.cached_tokens)} (${Math.round((t.cached_tokens / Math.max(1, t.prompt_tokens)) * 100)}% من الدخل)` : '';
  return (
    <section>
      <SectionTitle icon={Zap}>الاستخدام</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi icon={Hash} label="الطلبات" loading={!t} value={t?.requests} format={(v) => int(Math.round(v))}
          sub={t && <>{int(t.errors)} فشل <span className={cn(t.errors / Math.max(1, t.requests) > 0.1 && 'text-bad')}>({pct(t.errors, t.requests)})</span></>} spark={spark('requests')} />
        <Kpi icon={Layers} label="التوكنات الإجمالية" loading={!t} value={t?.tokens} format={tokens} delay={0.04}
          sub={t && `دخل ${tokens(t.prompt_tokens)} · خرج ${tokens(t.completion_tokens)}${cached}`} spark={spark('tokens')} sparkColor="var(--series-2)" />
        <Kpi icon={Users} label="طلاب نشطين" loading={!t} value={t?.active_users} format={(v) => int(Math.round(v))} delay={0.08} sub="أرسلوا طلب واحد على الأقل" />
        <Kpi icon={Clock} label="متوسط زمن الرد" loading={!t} value={t?.avg_latency ? t.avg_latency : '—'} format={(v) => secs(v)} delay={0.12} sub="للطلبات الناجحة" />
      </div>
    </section>
  );
}
function MoneyKpis({ R }) {
  const m = R?.money;
  return (
    <section>
      <SectionTitle icon={Coins}>المال</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Kpi icon={HandCoins} label="أخذت من الطلاب" loading={!m} value={m?.revenue} format={(v) => usd(Math.round(v))} sub={m && `${int(m.subscriptions)} اشتراك · ${int(m.coupons_redeemed)} كوبون مفعّل`} />
        <Kpi icon={Receipt} label="دفعت للمزوّدين" loading={!m} value={m?.paid} format={(v) => usd(Math.round(v))} delay={0.04} sub={m && `استخدام ${usd(m.upstream_usage)} · اشتراكات ${usd(m.fixed_fees)} · مصاريف ${usd(m.expenses)}`} />
        <Kpi icon={m && m.profit < 0 ? TrendingDown : TrendingUp} label="صافي الربح" loading={!m} value={m?.profit} format={(v) => signedUsd(Math.round(v))} tone={m ? (m.profit >= 0 ? 'good' : 'bad') : null} delay={0.08}
          sub={m && (m.revenue ? `هامش ${pct(m.profit, m.revenue)}` : 'لا إيراد بالفترة')} />
        <Kpi icon={Wallet} label="رصيد مستهلك من الطلاب" loading={!m} value={m?.consumed} format={(v) => usd(Math.round(v))} delay={0.12} sub="قيمة ما استخدموه من رصيد الدولار" spark={R?.series?.length > 1 ? R.series.map((x) => x.consumed) : null} sparkColor="var(--series-3)" />
        <Kpi icon={PiggyBank} label="رصيد لسا بذمتك" loading={!m} value={m?.outstanding_usd} format={(v) => usd(Math.round(v))} delay={0.16} className="col-span-2 lg:col-span-1"
          sub={m && `${tokens(m.outstanding_tokens)} توكن غير مستهلكة (كل الاشتراكات الفعّالة)`} />
      </div>
    </section>
  );
}

// ── ranked lists with inline bars ──
function RankRow({ rank, title, subtitle, value, share, ofTotal, extra, delay }) {
  return (
    <motion.li initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay, duration: 0.35 }}
      className="group relative rounded-xl px-2.5 py-2.5 transition-colors hover:bg-accent-soft/50">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg text-[12px] font-bold num', rank <= 3 ? 'grad-bg text-white shadow-[0_6px_16px_-6px_var(--glow)]' : 'bg-sunken text-muted')}>{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 truncate text-[14px] font-semibold">{title}</div>
            <div className="shrink-0 text-[13.5px] font-semibold num">{value}</div>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
            <motion.div className="h-full rounded-full grad-bg" initial={{ width: 0 }} animate={{ width: `${Math.max(share ? 1.5 : 0, share * 100)}%` }} transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }} />
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-[11.5px] text-muted">
            <span className="min-w-0 truncate">{subtitle}</span>
            <span className="shrink-0">{ofTotal}{extra && <> · {extra}</>}</span>
          </div>
        </div>
      </div>
    </motion.li>
  );
}
const MODEL_SORT = [{ value: 'requests', label: 'حسب الطلبات' }, { value: 'tokens', label: 'حسب التوكنات' }, { value: 'consumed', label: 'حسب المستهلك' }, { value: 'upstream_cost', label: 'حسب كلفتنا' }];
const USER_SORT = MODEL_SORT.slice(0, 3);
const fmtBy = (s, v) => (s === 'requests' ? int(v) : s === 'tokens' ? tokens(v) : usdPrecise(v));

function TopModels({ R, sort, setSort }) {
  const mv = (x) => (sort === 'tokens' ? x.prompt_tokens + x.completion_tokens : x[sort]);
  const list = R ? [...R.models].sort((a, b) => mv(b) - mv(a)) : [];
  const max = Math.max(0, ...list.map(mv)), total = list.reduce((a, x) => a + mv(x), 0);
  return (
    <Reveal delay={0.05}>
      <Card title="أكثر النماذج استخداماً" icon={Cpu} className="h-full" actions={<Select size="sm" value={sort} onChange={setSort} options={MODEL_SORT} className="w-[150px]" aria-label="ترتيب النماذج" />}>
        {!R ? <ListSkeleton /> : !list.length ? <Empty icon={Cpu} title="لا طلبات بالفترة" /> : (
          <ol className="-mx-2.5 max-h-[460px] overflow-y-auto">
            {list.map((x, i) => (
              <RankRow key={x.model_id || i} rank={i + 1} delay={Math.min(0.3, i * 0.03)} title={x.name || x.model_id}
                subtitle={<span className="font-mono ltr">{x.model_id}</span>} value={fmtBy(sort, mv(x))} share={max ? mv(x) / max : 0}
                ofTotal={pct(mv(x), total)} extra={`${int(x.users)} طالب${x.errors ? ` · ${int(x.errors)} فشل` : ''}`} />
            ))}
          </ol>
        )}
      </Card>
    </Reveal>
  );
}
function TopUsers({ R, sort, setSort }) {
  const list = R ? [...R.users].sort((a, b) => b[sort] - a[sort]) : [];
  const max = Math.max(0, ...list.map((x) => x[sort])), total = list.reduce((a, x) => a + x[sort], 0);
  return (
    <Reveal delay={0.08}>
      <Card title="أكثر الطلاب طلباً" icon={Users} className="h-full" actions={<Select size="sm" value={sort} onChange={setSort} options={USER_SORT} className="w-[150px]" aria-label="ترتيب الطلاب" />}>
        {!R ? <ListSkeleton /> : !list.length ? <Empty icon={Users} title="لا طلبات بالفترة" /> : (
          <ol className="-mx-2.5 max-h-[460px] overflow-y-auto">
            {list.map((x, i) => (
              <RankRow key={x.user_id ?? i} rank={i + 1} delay={Math.min(0.3, i * 0.03)} title={x.name || `#${x.user_id}`}
                subtitle={x.top_model ? <>المفضّل: <span className="font-mono ltr">{x.top_model}</span></> : '—'} value={fmtBy(sort, x[sort])} share={max ? x[sort] / max : 0}
                ofTotal={pct(x[sort], total)} extra={<>آخر طلب {date(x.last_request)}</>} />
            ))}
          </ol>
        )}
      </Card>
    </Reveal>
  );
}
function ListSkeleton() { return <div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>; }

// ── peak hours ──
function PeakHours({ R }) {
  const info = useMemo(() => {
    if (!R?.heat?.length) return null;
    const top = [...R.heat].sort((a, b) => b.requests - a.requests)[0];
    const byHour = Array.from({ length: 24 }, (_, h) => R.heat.filter((c) => c.hour === h).reduce((a, c) => a + c.requests, 0));
    const byDay = Array.from({ length: 7 }, (_, d) => R.heat.filter((c) => c.dow === d).reduce((a, c) => a + c.requests, 0));
    return { top, byHour, peakHour: byHour.indexOf(Math.max(...byHour)), peakDay: byDay.indexOf(Math.max(...byDay)) };
  }, [R]);
  const hh = (h) => `${String(h).padStart(2, '0')}:00`;
  return (
    <Reveal delay={0.05}>
      <Card title="ساعات الذروة" icon={Flame} subtitle="عدد الطلبات لكل ساعة من كل يوم (بتوقيتك). اللون الأقوى = ضغط أعلى.">
        {!R ? <Skeleton className="h-[220px]" /> : !info ? <Empty icon={Flame} title="ما في طلبات بهالفترة" /> : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <PeakChip label="أعلى ضغط" value={<>{DAYS[info.top.dow]} <span className="ltr">{hh(info.top.hour)}</span></>} sub={`${int(info.top.requests)} طلب`} />
              <PeakChip label="الساعة الأكثر عموماً" value={<span className="ltr">{hh(info.peakHour)}</span>} sub={`${int(info.byHour[info.peakHour])} طلب`} />
              <PeakChip label="أنشط يوم بالأسبوع" value={DAYS[info.peakDay]} />
            </div>
            <Heatmap cells={R.heat} dayNames={DAYS} format={(v) => `${int(v)} طلب`} />
            <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted ltr">
              <span>أقل</span>
              {['--panel-2', '--seq-100', '--seq-300', '--seq-500', '--seq-700'].map((v) => <i key={v} className="size-3 rounded-[3px] border border-line/60" style={{ background: `var(${v})` }} />)}
              <span>أكثر</span>
            </div>
          </>
        )}
      </Card>
    </Reveal>
  );
}
function PeakChip({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken/60 px-3.5 py-2.5">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="mt-0.5 font-display text-[15px] font-semibold">{value}{sub && <span className="ms-2 text-[12px] font-normal text-muted">{sub}</span>}</div>
    </div>
  );
}

// ── monthly money ──
const MONEY_SERIES = [{ name: 'أخذت من الطلاب', color: 'var(--series-1)' }, { name: 'دفعت للمزوّدين', color: 'var(--series-2)' }];
function MonthlyMoney({ R }) {
  const months = R?.months || [];
  return (
    <Reveal delay={0.05}>
      <Card title="الإيراد مقابل المدفوع — شهرياً" icon={Wallet} actions={<Legend series={MONEY_SERIES} />}>
        {!R ? <Skeleton className="h-[220px]" /> : !months.length ? <Empty icon={Wallet} title="لا بيانات" /> : (
          <>
            <BarChart labels={months.map((x) => x.month)} height={210}
              series={[{ ...MONEY_SERIES[0], values: months.map((x) => x.revenue) }, { ...MONEY_SERIES[1], values: months.map((x) => x.paid) }]}
              format={(v, axis) => usd(v, axis ? 0 : 2)} />
            <DataTable className="mt-4" rows={months} rowKey={(r) => r.month} dense
              columns={[
                { key: 'month', header: 'الشهر', primary: true, cell: (r) => <span className="font-semibold num ltr">{r.month}</span> },
                { key: 'revenue', header: 'أخذت من الطلاب', align: 'end', cell: (r) => usd(r.revenue) },
                { key: 'paid', header: 'دفعت للمزوّدين', align: 'end', cell: (r) => usd(r.paid) },
                { key: 'profit', header: 'الربح', align: 'end', cell: (r) => <b className={r.profit >= 0 ? 'text-ok' : 'text-bad'}>{signedUsd(r.profit)}</b> },
                { key: 'consumed', header: 'مستهلك من الأرصدة', align: 'end', cell: (r) => usd(r.consumed) },
              ]} />
          </>
        )}
      </Card>
    </Reveal>
  );
}

// ── what we paid, itemised ──
function PaidBreakdown({ R }) {
  const items = useMemo(() => {
    if (!R) return [];
    const m = R.money, span = R.range.to - R.range.from;
    return [
      ...R.providers.filter((p) => p.upstream_cost > 0).map((p) => ({ k: `u:${p.provider_id}`, kind: 'استخدام', label: p.name || p.provider_id, amount: p.upstream_cost, precise: true })),
      ...m.fixed_plans.map((p) => ({ k: `f:${p.id}`, kind: 'اشتراك ثابت', label: p.name, note: `${usd(p.monthly_fee)}/شهر، محسوب نسبياً`, amount: Math.round((p.monthly_fee * span) / (30.4375 * 86400)) })),
      ...(m.expenses ? [{ k: 'exp', kind: 'يدوي', label: 'مصاريف يدوية', amount: m.expenses }] : []),
    ];
  }, [R]);
  const total = R?.money.paid || 0;
  const TONE = { 'استخدام': 'accent', 'اشتراك ثابت': 'new', 'يدوي': 'warn' };
  return (
    <Reveal delay={0.05}>
      <Card title="تفصيل المدفوع للمزوّدين" icon={Receipt} className="h-full">
        {!R ? <ListSkeleton /> : (
          <>
            {!items.length ? <Empty icon={Receipt} title="ما دفعت شي بهالفترة" className="py-8" /> : (
              <ul className="divide-y divide-line">
                {items.map((it) => (
                  <li key={it.k} className="flex items-center gap-3 py-2.5">
                    <Badge tone={TONE[it.kind]}>{it.kind}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium">{it.label}</div>
                      {it.note && <div className="text-[11.5px] text-muted">{it.note}</div>}
                    </div>
                    <div className="text-end">
                      <div className="text-[13.5px] font-semibold num">{it.precise ? usdPrecise(it.amount) : usd(it.amount)}</div>
                      <div className="text-[11px] text-muted">{pct(it.amount, total)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center justify-between rounded-2xl border border-line bg-sunken/60 px-4 py-3">
              <span className="font-semibold">المجموع</span>
              <span className="font-display text-lg font-bold num">{usd(total)}</span>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              الاشتراكات الشهرية الثابتة (مثل <span className="ltr">z.ai coding plan</span>) تُضبط من تبويب المزوّدين ← "طريقة الدفع". تكاليف الاستخدام تُحسب من الكلفة الحقيقية اللي بيرجعها المزوّد (<span className="ltr">OpenRouter</span>) أو من سعر المسار.
            </p>
          </>
        )}
      </Card>
    </Reveal>
  );
}

// ── manual expenses ──
function Expenses({ onChange }) {
  const confirm = useConfirm();
  const list = useAsync(() => api.get('/api/admin/expenses'), []);
  const providers = useAsync(() => api.get('/api/admin/providers'), []);
  const [f, setF] = useState({ amount: '', provider_id: '', spent_at: '', note: '' });
  const [busy, setBusy] = useState(false);
  const provOpts = [{ value: '', label: '— عام —' }, ...(providers.data || []).map((p) => ({ value: p.id, label: p.name, hint: p.id }))];
  const submit = async (e) => {
    e.preventDefault();
    const amount = Math.round(Number(f.amount) * M);
    if (!(amount > 0)) { toast.error('المبلغ لازم يكون أكبر من صفر'); return; }
    setBusy(true);
    try {
      await api.post('/api/admin/expenses', { amount, provider_id: f.provider_id || null, note: f.note, spent_at: f.spent_at ? fromDateInput(f.spent_at) + 43200 : undefined });
      setF({ amount: '', provider_id: '', spent_at: '', note: '' }); toast.success('أُضيف المصروف');
      list.reload(); onChange();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const del = async (x) => {
    if (!(await confirm({ title: 'حذف المصروف؟', description: `${usd(x.amount)} · ${x.provider_name || 'عام'}${x.note ? ` · ${x.note}` : ''}`, danger: true, confirmText: 'حذف' }))) return;
    try { await api.del(`/api/admin/expenses/${x.id}`); toast.success('انحذف'); list.reload(); onChange(); } catch (err) { toast.error(err.message); }
  };
  return (
    <Reveal delay={0.08}>
      <Card title="مصروف يدوي" icon={Wallet} subtitle="شحن رصيد، فاتورة، أي مبلغ دفعته برّا البوابة" className="h-full">
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="المبلغ ($)"><Input type="number" step="0.01" min="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="ltr" placeholder="25.00" /></Field>
          <Field label="المزوّد"><Select value={f.provider_id} onChange={(v) => setF({ ...f, provider_id: v })} options={provOpts} aria-label="المزوّد" /></Field>
          <Field label="التاريخ"><Input type="date" value={f.spent_at} onChange={(e) => setF({ ...f, spent_at: e.target.value })} className="ltr" /></Field>
          <Field label="ملاحظة"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="شحن رصيد OpenRouter" /></Field>
          <Button type="submit" variant="primary" icon={Plus} loading={busy} className="col-span-2 sm:col-span-1 sm:justify-self-start">إضافة</Button>
        </form>
        <div className="mt-4 max-h-[260px] overflow-y-auto rounded-2xl border border-line">
          {list.loading && !list.data ? <div className="p-3"><ListSkeleton /></div> : !list.data?.length ? (
            <div className="px-4 py-6 text-center text-[13px] text-muted">لا مصاريف</div>
          ) : (
            <ul className="divide-y divide-line">
              {list.data.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13.5px] font-medium"><span className="truncate">{x.provider_name || 'عام'}</span><span className="shrink-0 text-[11.5px] font-normal text-muted">{day(x.spent_at)}</span></div>
                    {x.note && <div className="truncate text-[12px] text-muted">{x.note}</div>}
                  </div>
                  <span className="text-[13.5px] font-semibold num">{usd(x.amount)}</span>
                  <Button variant="ghost" size="icon-sm" aria-label="حذف المصروف" className="text-muted hover:text-bad" onClick={() => del(x)}><Trash2 size={15} /></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </Reveal>
  );
}

// ── providers during the period ──
function ProvidersReport({ R }) {
  const max = Math.max(1, ...(R?.providers || []).map((p) => p.requests));
  return (
    <Reveal delay={0.05}>
      <Card title="المزوّدون خلال الفترة" icon={Plug}>
        <DataTable loading={!R} rows={R?.providers || []} rowKey={(p, i) => p.provider_id || `none${i}`}
          empty={{ icon: Plug, title: 'لا طلبات' }}
          columns={[
            { key: 'name', header: 'المزوّد', primary: true, cell: (p) => (
              <div className="min-w-0">
                <div className={cn('font-semibold', !p.provider_id && 'text-muted')}>{p.name || p.provider_id || '— (لم يصل لمزوّد)'}</div>
                <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full grad-bg" style={{ width: `${(p.requests / max) * 100}%` }} /></div>
              </div>
            ) },
            { key: 'billing', header: 'الدفع', cell: (p) => (p.billing === 'subscription' ? <Badge tone="new">اشتراك ثابت</Badge> : p.billing ? <Badge>حسب الاستخدام</Badge> : '—') },
            { key: 'requests', header: 'طلبات', align: 'end', cell: (p) => int(p.requests) },
            { key: 'errors', header: 'فشل', align: 'end', cell: (p) => <span className={cn(p.errors && p.errors / p.requests > 0.1 && 'text-bad')}>{int(p.errors)} <span className="text-[11.5px] text-muted">({pct(p.errors, p.requests)})</span></span> },
            { key: 'tokens', header: 'توكنات', align: 'end', cell: (p) => tokens(p.tokens) },
            { key: 'cost', header: 'كلفتنا', align: 'end', cell: (p) => usdPrecise(p.upstream_cost) },
            { key: 'lat', header: 'زمن الرد', align: 'end', cell: (p) => secs(p.avg_latency) },
          ]} />
      </Card>
    </Reveal>
  );
}
