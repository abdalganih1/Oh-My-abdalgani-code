// Security: abuse alerts (scan now, resolve, unpause, disable student, block IP), zero-priced
// models warning, protection rules, blocklist, student devices, busiest IPs, security events.
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, Ban, BellRing, Check, ChevronDown, CircleCheck, Clock, Cpu, Globe, HardDrive, Info, KeyRound, Lock, Monitor, Play, Repeat, Save,
  ScanSearch, ShieldAlert, ShieldCheck, ShieldQuestion, Siren, Sliders, Trash2, Unlock, UserX, Users, Wallet, X,
} from 'lucide-react';
import {
  Badge, Button, Card, DataTable, Empty, Field, Input, Modal, Reveal, Segmented, Select, Skeleton, Switch, Tip, cn, toast, useConfirm,
} from '../../ui/index.js';
import { useAsync } from '../../lib/hooks.js';
import { ago, date, int } from '../../lib/format.js';
import { api, useAdmin } from '../ctx.js';

const SEV = {
  high: { label: 'عالي', tone: 'bad', icon: Siren },
  warn: { label: 'تحذير', tone: 'warn', icon: AlertTriangle },
  info: { label: 'معلومة', tone: 'neutral', icon: Info },
};

export default function Security() {
  const sec = useAsync(() => api.get('/api/admin/security'), []);
  const [blockIp, setBlockIp] = useState(null); // ip string → modal
  const S = sec.data;
  return (
    <div className="flex flex-col gap-5">
      <Alerts onBlockIp={setBlockIp} />

      <AnimatePresence>
        {S?.unpriced_models?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-3 rounded-3xl border border-bad/30 bg-bad-soft p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-bad text-white"><AlertTriangle size={19} /></span>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-bad">نماذج بسعر صفر</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
                أي طالب عنده رصيد بيستخدم هالنماذج <b>مجاناً</b> (الحد الوحيد هو سقف التوكنات اليومي). حدّد سعرها من "النماذج والتوجيه":
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">{S.unpriced_models.map((m) => <Badge key={m.id} tone="bad" className="font-mono ltr">{m.id}</Badge>)}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Rules S={S} loading={sec.loading && !S} onSaved={() => sec.reload()} />
      <Blocklist S={S} loading={sec.loading && !S} reload={sec.reload} />
      <Devices S={S} loading={sec.loading && !S} reload={sec.reload} onBlockIp={setBlockIp} />

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <TopIps S={S} loading={sec.loading && !S} onBlockIp={setBlockIp} />
        <SecEvents S={S} loading={sec.loading && !S} />
      </div>

      <BlockIpModal ip={blockIp} onClose={() => setBlockIp(null)} onDone={() => { setBlockIp(null); sec.reload(); }} />
    </div>
  );
}

// ── abuse alerts ──
function Alerts({ onBlockIp }) {
  const { refreshStats } = useAdmin();
  const confirm = useConfirm();
  const [all, setAll] = useState(false);
  const list = useAsync(() => api.get(`/api/admin/alerts${all ? '?all=1' : ''}`), [all]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(null);
  const scan = async () => {
    setScanning(true);
    try { const r = await api.post('/api/admin/alerts/scan'); toast[r.found?.length ? 'warning' : 'success'](r.found?.length ? `تنبيهات جديدة: ${r.found.length}` : 'ما في شي جديد'); }
    catch (e) { toast.error(e.message); } finally { setScanning(false); }
    list.reload(); refreshStats();
  };
  const act = async (key, fn, msg = 'تم') => {
    setBusy(key);
    try { await fn(); toast.success(msg); list.reload(); refreshStats(); } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };
  const rows = list.data || [];
  const open = rows.filter((a) => !a.resolved);
  const resolveAll = async () => {
    if (!(await confirm({ title: `تعليم ${open.length} تنبيه كمحلول؟`, description: 'التنبيهات بتنتقل للمحلولة. ما في أي إجراء على الطلاب.', confirmText: 'تم للكل' }))) return;
    act('all', () => Promise.all(open.map((a) => api.post(`/api/admin/alerts/${a.id}/resolve`))), 'انحلّوا كلهم');
  };
  return (
    <Reveal>
      <Card title="تنبيهات الإساءة" icon={BellRing}
        subtitle={list.data ? (open.length ? `${open.length} تنبيه مفتوح` : 'ما في تنبيهات مفتوحة') : null}
        actions={<>
          <Switch checked={all} onCheckedChange={setAll} label="عرض المحلولة" size="sm" />
          {open.length > 1 && <Button variant="ghost" size="sm" icon={Check} loading={busy === 'all'} onClick={resolveAll}>تم للكل</Button>}
          <Button variant="primary" icon={ScanSearch} loading={scanning} onClick={scan}>افحص الآن</Button>
        </>}>
        <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
          فحص تلقائي كل 30 دقيقة: يوم استخدام ثقيل، قفزة مفاجئة، مفتاح من شبكات كثيرة، شبكة عليها حسابات كثيرة، أخطاء كثيرة (سكربت عم يجرّب)، أداة عالقة بحلقة، تسجيلات بالجملة. نفس التنبيه ما بيتكرر بنفس اليوم.
        </p>
        {list.loading && !list.data ? <div className="space-y-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div> : !rows.length ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-ok/20 bg-ok-soft/50 px-6 py-10 text-center">
            <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="grid size-14 place-items-center rounded-2xl bg-ok-soft text-ok"><ShieldCheck size={28} /></motion.span>
            <div className="font-display font-semibold">ما في تنبيهات مفتوحة</div>
            <p className="text-[13px] text-muted">كلشي هادي. الفحص التلقائي شغّال كل 30 دقيقة.</p>
          </div>
        ) : (
          <ul className="max-h-[520px] space-y-2.5 overflow-y-auto">
            <AnimatePresence initial={false}>
              {rows.map((a) => {
                const s = SEV[a.severity] || SEV.info;
                return (
                  <motion.li key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: a.resolved ? 0.6 : 1, y: 0 }} exit={{ opacity: 0, x: 30 }}
                    className={cn('relative overflow-hidden rounded-2xl border bg-solid/60 p-4', a.resolved ? 'border-line' : s.tone === 'bad' ? 'border-bad/30' : s.tone === 'warn' ? 'border-warn/30' : 'border-line-strong')}>
                    {!a.resolved && <span className={cn('absolute inset-y-0 start-0 w-1', s.tone === 'bad' ? 'bg-bad' : s.tone === 'warn' ? 'bg-warn' : 'bg-line-strong')} />}
                    <div className="flex flex-wrap items-start gap-3">
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', s.tone === 'bad' ? 'bg-bad-soft text-bad' : s.tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-sunken text-muted')}><s.icon size={17} /></span>
                      <div className="min-w-0 flex-1 basis-[220px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={s.tone}>{s.label}</Badge>
                          {a.resolved ? <Badge tone="ok"><CircleCheck size={12} />محلول</Badge> : null}
                          <Tip content={date(a.created_at)}><span className="text-[12px] text-muted">{ago(a.created_at)}</span></Tip>
                          <span className="font-mono text-[11px] text-muted ltr">{a.rule}</span>
                        </div>
                        <div className="mt-1.5 text-[13.5px] leading-relaxed">{a.message}</div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                          <span>إجراء النظام: <span className="text-fg-2">{a.action || '—'}</span></span>
                          {a.user_id && <span>الطالب: <span className="text-fg-2">{a.user_name || `#${a.user_id}`}</span></span>}
                          {a.ip && <span>IP: <span className="font-mono text-fg-2 ltr">{a.ip}</span></span>}
                        </div>
                      </div>
                      <div className="flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">
                        {!a.resolved && <Button size="sm" variant="secondary" icon={Check} loading={busy === `r${a.id}`} onClick={() => act(`r${a.id}`, () => api.post(`/api/admin/alerts/${a.id}/resolve`))}>تم</Button>}
                        {a.rule === 'agent_loop' && !a.resolved && a.user_id && (
                          <Button size="sm" variant="soft" icon={Play} loading={busy === `p${a.id}`} onClick={() => act(`p${a.id}`, () => api.del(`/api/admin/pauses/${a.user_id}`), 'انفك الإيقاف')}>فك الإيقاف</Button>
                        )}
                        {a.user_id && (
                          <Button size="sm" variant="danger" icon={UserX} loading={busy === `d${a.id}`} onClick={async () => {
                            if (!(await confirm({ title: 'إيقاف حساب الطالب؟', description: `${a.user_name || `#${a.user_id}`} — مفاتيحه وجلساته بتتوقف.`, danger: true, confirmText: 'إيقاف الطالب' }))) return;
                            act(`d${a.id}`, () => api.patch(`/api/admin/users/${a.user_id}`, { disabled: true }), 'انوقف الحساب');
                          }}>إيقاف الطالب</Button>
                        )}
                        {a.ip && <Button size="sm" variant="danger" icon={Ban} onClick={() => onBlockIp(a.ip)}>حظر IP</Button>}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </Card>
    </Reveal>
  );
}

// ── protection rules ──
const RULE_GROUPS = [
  { title: 'الأجهزة', icon: Monitor, fields: [
    { k: 'device_policy', label: 'ربط الأجهزة', type: 'select', options: [
      { value: 'off', label: 'معطّل' }, { value: 'track', label: 'مراقبة فقط', hint: 'تسجيل الأجهزة بدون منع' }, { value: 'enforce', label: 'إلزامي', hint: 'المفتاح يشتغل فقط من أجهزة مسجّلة' }] },
    { k: 'max_devices', label: 'أقصى عدد أجهزة لكل طالب', min: 1 },
  ] },
  { title: 'التسجيل والسقوف', icon: Wallet, fields: [
    { k: 'signup_mode', label: 'التسجيل الذاتي', type: 'select', options: [{ value: 'open', label: 'مفتوح' }, { value: 'approval', label: 'بموافقة المدير' }, { value: 'closed', label: 'مغلق' }] },
    { k: 'signup_per_ip_day', label: 'أقصى حسابات جديدة من نفس الشبكة باليوم', min: 1 },
    { k: 'user_cap_default_usd', label: 'السقف اليومي الافتراضي للطالب الجديد ($)', step: 0.01, min: 0.1 },
    { k: 'user_cap_max_usd', label: 'أعلى سقف يومي يقدر الطالب يختاره ($)', step: 0.01, min: 0.1 },
    { k: 'user_daily_tokens', label: 'سقف توكنات يومي لكل طالب (0 = بلا)', min: 0 },
    { k: 'global_daily_upstream_usd', label: 'ميزانية يومية كلية للمزوّدين ($، 0 = بلا)', step: 0.01, min: 0 },
  ] },
  { title: 'عتبات التنبيه', icon: BellRing, fields: [
    { k: 'alert_daily_requests', label: 'تنبيه إذا طالب تجاوز (طلب/يوم)', min: 0 },
    { k: 'alert_spike_factor', label: 'تنبيه قفزة (× معدله)', step: 0.5, min: 0 },
    { k: 'alert_ips_per_user', label: 'تنبيه مفتاح من شبكات ≥', min: 2 },
    { k: 'alert_users_per_ip', label: 'تنبيه حسابات من نفس الشبكة ≥', min: 2 },
    { k: 'alert_error_rate', label: 'تنبيه نسبة فشل ≥', step: 0.05, min: 0, max: 1, hint: 'من 0 لـ 1 (0.5 = 50%)' },
  ] },
  { title: 'كاشف الحلقات', icon: Repeat, fields: [
    { k: 'loop_guard_repeats', label: 'طلبات متطابقة', min: 0, hint: '0 = معطّل' },
    { k: 'loop_guard_window_s', label: 'خلال (ثانية)', min: 10 },
    { k: 'loop_guard_pause_min', label: 'إيقاف الطالب (دقائق)', min: 1 },
  ] },
  { title: 'الحظر التلقائي والحدود', icon: Lock, fields: [
    { k: 'auth_fail_limit', label: 'حظر تلقائي بعد محاولات خاطئة', min: 3 },
    { k: 'auth_fail_window_min', label: 'خلال (دقائق)', min: 1 },
    { k: 'auto_block_min', label: 'مدة الحظر التلقائي (دقائق)', min: 1 },
    { k: 'max_body_mb', label: 'أقصى حجم طلب (MB)', min: 1 },
  ] },
];
const RULE_KEYS = RULE_GROUPS.flatMap((g) => g.fields.map((f) => f.k));

function Rules({ S, loading, onSaved }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [explain, setExplain] = useState(false);
  useEffect(() => { if (S?.settings) setF(Object.fromEntries(RULE_KEYS.map((k) => [k, S.settings[k] ?? '']))); }, [S]);
  const dirty = useMemo(() => f && S && RULE_KEYS.some((k) => String(f[k]) !== String(S.settings[k] ?? '')), [f, S]);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.put('/api/admin/security', f); toast.success('تم الحفظ'); onSaved(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Reveal delay={0.04}>
      <Card title="قواعد الحماية" icon={Sliders} subtitle="بتنطبق فوراً على كل الطلبات"
        actions={dirty && <Badge tone="warn" dot pulse>تعديلات غير محفوظة</Badge>}>
        {loading || !f ? <Skeleton className="h-64" /> : (
          <form onSubmit={submit}>
            <div className="grid gap-4 lg:grid-cols-2">
              {RULE_GROUPS.map((g) => (
                <fieldset key={g.title} className={cn('min-w-0 rounded-2xl border border-line bg-sunken/40 p-4', g.fields.length > 4 && 'lg:row-span-2')}>
                  <legend className="flex items-center gap-2 px-1.5 text-[13px] font-semibold"><g.icon size={15} className="text-accent" />{g.title}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {g.fields.map((x) => (
                      <Field key={x.k} label={x.label} hint={x.hint} className={x.type === 'select' && 'sm:col-span-2'}>
                        {x.type === 'select' ? (
                          <Select value={f[x.k]} onChange={(v) => setF({ ...f, [x.k]: v })} options={x.options} aria-label={x.label} />
                        ) : (
                          <Input type="number" step={x.step || 1} min={x.min} max={x.max} required className="ltr" value={f[x.k]} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} />
                        )}
                      </Field>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" icon={Save} loading={busy}>حفظ</Button>
              {dirty && <Button variant="ghost" onClick={() => setF(Object.fromEntries(RULE_KEYS.map((k) => [k, S.settings[k] ?? ''])))}>تراجع</Button>}
              <button type="button" onClick={() => setExplain((v) => !v)} aria-expanded={explain}
                className="ms-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-accent-ink hover:bg-accent-soft">
                <ShieldQuestion size={15} />شو بتعمل كل حماية؟<ChevronDown size={15} className={cn('transition-transform', explain && 'rotate-180')} />
              </button>
            </div>
            <AnimatePresence initial={false}>
              {explain && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {EXPLAIN.map((x) => (
                      <li key={x.t} className="flex gap-3 rounded-2xl border border-line bg-solid/60 p-3.5 text-[12.5px] leading-relaxed text-fg-2">
                        <x.icon size={17} className="mt-0.5 shrink-0 text-accent" />
                        <div>{x.t && <b className="text-fg">{x.t}: </b>}{x.d}</div>
                      </li>
                    ))}
                  </div>
                </motion.ul>
              )}
            </AnimatePresence>
          </form>
        )}
      </Card>
    </Reveal>
  );
}
const EXPLAIN = [
  { icon: Wallet, t: 'الحجز المسبق', d: 'قبل أي طلب البوابة بتحجز كلفته التقديرية من الرصيد، وبعده بتحسب الكلفة الحقيقية وبترجّع الفرق. ما حدا بيقدر يصرف أكثر من رصيده، ولا يبعت طلبات متوازية على نفس الرصيد.' },
  { icon: Ban, t: 'الحظر التلقائي', d: 'مفتاح خاطئ أو كلمة سر المدير غلط أو كوبون مزيّف عدة مرات من نفس العنوان ← العنوان محظور مؤقتاً، وبتوصلك رسالة.' },
  { icon: Clock, t: 'حدود السرعة', d: 'على شبكة Cloudflare نفسها: 240 طلب/دقيقة لكل عنوان IP و90 لكل مفتاح، قبل ما يوصل أي شي لقاعدة البيانات.' },
  { icon: Monitor, t: 'ربط الأجهزة', d: 'أداة التثبيت بتولّد معرّف عشوائي لكل جهاز (بدون أي معرّف عتادي). بوضع "إلزامي" المفتاح المسروق ما بيشتغل من جهاز غريب، والجهاز الزائد بينتظر موافقتك. بتقدر تحظر جهاز أو IP بضغطة.' },
  { icon: ShieldAlert, t: 'الميزانية الكلية', d: 'لو صار هجوم أو خطأ، الخدمة بتتوقف لحالها عند المبلغ اليومي اللي حددته بدل ما تفضى حساباتك عند المزوّدين.' },
  { icon: KeyRound, t: '', d: 'أخطاء المزوّدين ما بتوصل للطلاب (بتنحفظ بسجلك فقط)، ومفاتيح المزوّدين مشفّرة بقاعدة البيانات.' },
];

// ── blocklist ──
const DURATIONS = [{ value: '0', label: 'دائم' }, { value: '60', label: 'ساعة' }, { value: '1440', label: 'يوم' }, { value: '10080', label: 'أسبوع' }];
function Blocklist({ S, loading, reload }) {
  const [f, setF] = useState({ kind: 'ip', value: '', reason: '', minutes: '0' });
  const [busy, setBusy] = useState(false);
  const [un, setUn] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post('/api/admin/blocks', f); setF({ kind: f.kind, value: '', reason: '', minutes: '0' }); toast.success('تم الحظر'); reload(); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const unblock = async (b) => {
    setUn(b.id);
    try { await api.del(`/api/admin/blocks/${b.id}`); toast.success('انفك الحظر'); reload(); } catch (err) { toast.error(err.message); } finally { setUn(null); }
  };
  return (
    <Reveal delay={0.06}>
      <Card title="المحظورون" icon={Lock} actions={S?.blocks?.length ? <Badge tone="bad">{S.blocks.length}</Badge> : null}>
        <form onSubmit={submit} className="grid gap-2.5 rounded-2xl border border-line bg-sunken/40 p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,200px)_140px_auto] sm:items-center">
          <Segmented value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: 'ip', label: 'عنوان IP', icon: Globe }, { value: 'device', label: 'جهاز', icon: HardDrive }]} />
          <Input mono required minLength={3} maxLength={100} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={f.kind === 'ip' ? '1.2.3.4' : 'معرّف الجهاز'} aria-label="القيمة" />
          <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="السبب" aria-label="السبب" />
          <Select value={f.minutes} onChange={(v) => setF({ ...f, minutes: v })} options={DURATIONS} aria-label="المدة" />
          <Button type="submit" variant="danger" icon={Ban} loading={busy}>حظر</Button>
        </form>
        <DataTable className="mt-4" loading={loading} rows={S?.blocks || []} dense
          empty={<Empty icon={ShieldCheck} title="لا يوجد" text="ما في عناوين أو أجهزة محظورة حالياً." className="py-8" />}
          columns={[
            { key: 'kind', header: 'النوع', cell: (b) => (
              <span className="inline-flex items-center gap-1.5">{b.kind === 'ip' ? <Globe size={14} className="text-muted" /> : <HardDrive size={14} className="text-muted" />}{b.kind === 'ip' ? 'IP' : 'جهاز'}{b.auto ? <Badge tone="warn">تلقائي</Badge> : null}</span>
            ) },
            { key: 'value', header: 'القيمة', primary: true, cell: (b) => <span className="font-mono text-[12.5px] ltr break-all">{b.value}</span> },
            { key: 'reason', header: 'السبب', cell: (b) => <span className="text-[12.5px]">{b.reason || '—'}</span> },
            { key: 'exp', header: 'ينتهي', cell: (b) => (b.expires_at ? <Tip content={date(b.expires_at)}><span className="text-[12.5px]">{ago(b.expires_at)}</span></Tip> : <Badge tone="bad">دائم</Badge>) },
            { key: 'act', header: '', align: 'end', cell: (b) => <Button size="xs" variant="secondary" icon={Unlock} loading={un === b.id} onClick={(e) => { e.stopPropagation(); unblock(b); }}>فك الحظر</Button> },
          ]} />
      </Card>
    </Reveal>
  );
}

// ── devices ──
const DEV_ST = { active: { label: 'مسموح', tone: 'ok' }, pending: { label: 'بانتظارك', tone: 'warn' }, blocked: { label: 'محظور', tone: 'bad' } };
function Devices({ S, loading, reload, onBlockIp }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(null);
  const [flt, setFlt] = useState('all');
  const all = S?.devices || [];
  const pend = all.filter((d) => d.status === 'pending').length;
  const rows = flt === 'all' ? all : all.filter((d) => d.status === flt);
  const run = async (key, fn) => { setBusy(key); try { await fn(); toast.success('تم'); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(null); } };
  return (
    <Reveal delay={0.08}>
      <Card title="أجهزة الطلاب" icon={Monitor} subtitle={S ? `${int(all.length)} جهاز${pend ? ` · ${pend} بانتظار موافقتك` : ''}` : null}
        actions={all.length ? <Segmented size="sm" value={flt} onChange={setFlt} options={[
          { value: 'all', label: 'الكل' }, { value: 'pending', label: `بانتظارك${pend ? ` (${pend})` : ''}` }, { value: 'active', label: 'مسموح' }, { value: 'blocked', label: 'محظور' },
        ]} /> : null}>
        <DataTable loading={loading} rows={rows} maxHeight={460} dense
          rowClassName={(d) => d.status === 'pending' && 'bg-warn-soft/40'}
          empty={<Empty icon={Monitor} title={all.length ? 'ما في أجهزة بهالحالة' : 'لا أجهزة بعد'} text={all.length ? null : <>بتظهر لما الطلاب يستخدموا الأدوات المثبتة عبر <span className="font-mono ltr">abdalgani-setup</span></>} />}
          columns={[
            { key: 'user', header: 'الطالب', cell: (d) => <span className="font-medium">{d.user_name || d.user_id}</span> },
            { key: 'dev', header: 'الجهاز', primary: true, cell: (d) => (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5"><HardDrive size={14} className="shrink-0 text-muted" /><span className="truncate">{d.name || '—'}</span></div>
                <Tip content={<span className="font-mono ltr">{d.device_id}</span>}><div className="font-mono text-[11px] text-muted ltr text-start">{d.device_id.slice(0, 12)}…</div></Tip>
              </div>
            ) },
            { key: 'st', header: 'الحالة', cell: (d) => <Badge tone={DEV_ST[d.status]?.tone || 'neutral'} dot>{DEV_ST[d.status]?.label || d.status}</Badge> },
            { key: 'ip', header: 'آخر IP', cell: (d) => <span className="font-mono text-[12px] ltr">{d.last_ip || ''}</span> },
            { key: 'seen', header: 'آخر استخدام', cell: (d) => <Tip content={date(d.last_seen)}><span className="text-[12.5px]">{ago(d.last_seen)}</span></Tip> },
            { key: 'req', header: 'طلبات', align: 'end', cell: (d) => int(d.requests) },
            { key: 'act', header: '', align: 'end', mobileFull: true, cell: (d) => (
              <div className="flex flex-wrap justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                {d.status !== 'active' && <Button size="xs" variant="primary" icon={Check} loading={busy === `a${d.id}`} onClick={() => run(`a${d.id}`, () => api.patch(`/api/admin/devices/${d.id}`, { status: 'active' }))}>سماح</Button>}
                {d.status !== 'blocked' && <Button size="xs" variant="danger" icon={Ban} loading={busy === `b${d.id}`} onClick={() => run(`b${d.id}`, () => api.patch(`/api/admin/devices/${d.id}`, { status: 'blocked' }))}>حظر</Button>}
                <Tip content="حذف من القائمة (يحرر مكان للطالب)">
                  <Button size="xs" variant="ghost" aria-label="حذف الجهاز" loading={busy === `x${d.id}`} onClick={async () => {
                    if (!(await confirm({ title: 'حذف الجهاز من القائمة؟', description: 'إذا رجع بيتسجّل من جديد حسب الحد.', danger: true, confirmText: 'حذف' }))) return;
                    run(`x${d.id}`, () => api.del(`/api/admin/devices/${d.id}`));
                  }}><Trash2 size={14} /></Button>
                </Tip>
                {d.last_ip && <Tip content="حظر هذا العنوان"><Button size="xs" variant="danger" icon={Globe} onClick={() => onBlockIp(d.last_ip)}>حظر IP</Button></Tip>}
              </div>
            ) },
          ]} />
      </Card>
    </Reveal>
  );
}

// ── busiest IPs ──
function TopIps({ S, loading, onBlockIp }) {
  const max = Math.max(1, ...(S?.top_ips || []).map((x) => x.requests));
  return (
    <Reveal delay={0.1}>
      <Card title="أكثر العناوين نشاطاً (24 ساعة)" icon={Globe} className="h-full">
        <DataTable loading={loading} rows={S?.top_ips || []} rowKey={(x) => x.ip} dense empty={{ icon: Globe, title: 'لا بيانات' }}
          columns={[
            { key: 'ip', header: 'العنوان', primary: true, cell: (x) => (
              <div className="min-w-0">
                <span className="font-mono text-[12.5px] ltr">{x.ip}</span>
                <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full grad-bg" style={{ width: `${(x.requests / max) * 100}%` }} /></div>
              </div>
            ) },
            { key: 'req', header: 'طلبات', align: 'end', cell: (x) => int(x.requests) },
            { key: 'users', header: 'طلاب', align: 'end', cell: (x) => (x.users > 1 ? <Tip content="أكثر من حساب من نفس الشبكة"><span className="inline-flex items-center gap-1 text-warn"><Users size={13} />{x.users}</span></Tip> : x.users) },
            { key: 'err', header: 'أخطاء', align: 'end', cell: (x) => <span className={cn(x.errors && x.errors / x.requests > 0.3 && 'text-bad')}>{int(x.errors)}</span> },
            { key: 'act', header: '', align: 'end', cell: (x) => <Button size="xs" variant="danger" icon={Ban} onClick={(e) => { e.stopPropagation(); onBlockIp(x.ip); }}>حظر</Button> },
          ]} />
      </Card>
    </Reveal>
  );
}

// ── security events ──
const EV_ICON = { security_block: ShieldAlert, device_new: Monitor, device_rejected: X };
function SecEvents({ S, loading }) {
  const ev = S?.events || [];
  return (
    <Reveal delay={0.12}>
      <Card title="أحداث الأمان" icon={ShieldAlert} className="h-full">
        {loading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11" />)}</div> : !ev.length ? <Empty icon={ShieldCheck} title="لا أحداث" className="py-8" /> : (
          <ul className="max-h-[380px] space-y-1 overflow-y-auto">
            {ev.map((e) => {
              const I = EV_ICON[e.kind] || Cpu;
              return (
                <li key={e.id} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-sunken/70">
                  <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg', e.kind === 'device_new' ? 'bg-accent-soft text-accent-ink' : 'bg-warn-soft text-warn')}><I size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-relaxed break-words">{e.message}</div>
                    <Tip content={date(e.created_at)}><span className="text-[11.5px] text-muted">{ago(e.created_at)}</span></Tip>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Reveal>
  );
}

// ── block an IP with a reason (replaces the legacy prompt()) ──
function BlockIpModal({ ip, onClose, onDone }) {
  const [reason, setReason] = useState('abuse');
  const [minutes, setMinutes] = useState('0');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ip) { setReason('abuse'); setMinutes('0'); } }, [ip]);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post('/api/admin/blocks', { kind: 'ip', value: ip, reason, minutes }); toast.success(`انحظر ${ip}`); onDone(); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!ip} onOpenChange={(o) => !o && onClose()} size="sm" icon={Ban} title={<>حظر <span className="font-mono ltr">{ip}</span>؟</>}
      description="أي طلب من هالعنوان بيترفض قبل ما يوصل للبوابة."
      footer={<><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button type="submit" form="abd-blockip" variant="danger" icon={Ban} loading={busy}>حظر</Button></>}>
      <form id="abd-blockip" onSubmit={submit} className="grid gap-3">
        <Field label="السبب"><Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label="المدة"><Segmented full value={minutes} onChange={setMinutes} options={DURATIONS} /></Field>
      </form>
    </Modal>
  );
}
