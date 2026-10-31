// Student detail drawer: balance & subscriptions, grant, caps, keys, devices, password, usage.
import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, CalendarClock, Coins, Gauge, Gift, KeyRound, Laptop, Lock, Mail, Pause, Play, Plus, RefreshCw, ShieldCheck, ShieldX, Trash2, Wallet, X,
} from 'lucide-react';
import {
  Badge, Button, DataTable, Empty, Field, Input, Progress, Ring, Segmented, Select, Sheet, Skeleton, Tip, cn, toast, useConfirm,
} from '../../../ui/index.js';
import { useMedia } from '../../../lib/hooks.js';
import { M, ago, date, day, tokens, usd, usdPrecise } from '../../../lib/format.js';
import { api, useAdmin } from '../../ctx.js';
import { Avatar, SecretBox, SectionTitle } from './bits.jsx';

const now = () => Date.now() / 1000;
const fmtAmt = (kind, v) => (kind === 'usd' ? usd(v) : `${tokens(v)} tok`);
const subState = (s) => (s.disabled ? { label: 'موقوف', tone: 'neutral' } : s.expires_at && s.expires_at < now() ? { label: 'منتهي', tone: 'bad' } : s.used >= s.total ? { label: 'مستهلك', tone: 'warn' } : { label: 'فعّال', tone: 'ok' });
const DEV = { active: { label: 'مسموح', tone: 'ok' }, pending: { label: 'بانتظارك', tone: 'warn' }, blocked: { label: 'محظور', tone: 'bad' } };

export default function UserSheet({ id, onOpenChange, onChanged }) {
  const confirm = useConfirm();
  const { groups, groupName } = useAdmin();
  const wide = useMedia('(min-width: 900px)');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [devices, setDevices] = useState(null);
  const [tab, setTab] = useState('wallet');
  const [secret, setSecret] = useState(null);
  const [busy, setBusy] = useState('');

  const load = async () => {
    try { setD(await api.get(`/api/admin/users/${id}`)); setErr(null); } catch (e) { setErr(e); }
  };
  const loadDevices = async () => {
    try { const s = await api.get('/api/admin/security'); setDevices((s.devices || []).filter((x) => x.user_id === id)); } catch { setDevices([]); }
  };
  useEffect(() => {
    if (id == null) return;
    setD(null); setErr(null); setDevices(null); setSecret(null); setTab('wallet');
    load(); loadDevices();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** run an action with a busy flag; reload detail + list afterwards */
  const act = async (key, fn, { reload = true, list = true } = {}) => {
    setBusy(key);
    try { const r = await fn(); if (reload) await load(); if (list) onChanged?.(); return r; } catch (e) { toast.error(e.message); return undefined; } finally { setBusy(''); }
  };

  const u = d?.user;
  const toggle = () => act('toggle', async () => {
    await api.patch(`/api/admin/users/${id}`, { disabled: !u.disabled });
    toast.success(u.disabled ? 'تم تفعيل الحساب' : 'تم إيقاف الحساب — وطلع من كل الأجهزة');
  });
  const approve = () => act('approve', async () => { await api.patch(`/api/admin/users/${id}`, { approved: true }); toast.success('تمت الموافقة'); });
  const resetPw = async () => {
    if (!(await confirm({ title: 'توليد كلمة سر مؤقتة؟', description: 'بيطلع الطالب من كل الأجهزة، ولازم يغيّرها بعد ما يدخل فيها.', confirmText: 'ولّد', icon: Lock }))) return;
    const r = await act('pw', () => api.patch(`/api/admin/users/${id}`, { reset_password: true }), { reload: false, list: false });
    if (r) setSecret({ label: 'كلمة السر المؤقتة — أرسلها للطالب ليغيّرها:', value: r.temp_password });
  };
  const newKey = async (name) => {
    const r = await act('newkey', () => api.post(`/api/admin/users/${id}/keys`, { name: name || 'admin-issued' }));
    if (r) { setSecret({ label: 'المفتاح الجديد — أرسله للطالب الآن (لن يظهر مرة ثانية):', value: r.api_key }); return true; }
    return false;
  };
  const revoke = async (k) => {
    if (!(await confirm({ title: 'إلغاء المفتاح؟', description: `أي أداة بتستخدم ${k.prefix}… رح توقف فوراً.`, danger: true, confirmText: 'إلغاء المفتاح' }))) return;
    await act(`rk${k.id}`, () => api.del(`/api/admin/users/${id}/keys/${k.id}`));
    toast.success('تم إلغاء المفتاح');
  };
  const del = async () => {
    if (!(await confirm({ title: `حذف ${u.name}؟`, description: 'رح ينحذف الطالب وكل بياناته: الاشتراكات والمفاتيح والأجهزة. ما في رجعة.', danger: true, confirmText: 'حذف نهائي', requireText: 'حذف', icon: Trash2 }))) return;
    const ok = await act('del', async () => { await api.del(`/api/admin/users/${id}`); return true; }, { reload: false });
    if (ok) { toast.success('تم الحذف'); onOpenChange(false); }
  };
  const toggleSub = (s) => act(`s${s.id}`, async () => {
    await api.patch(`/api/admin/subscriptions/${s.id}`, { disabled: !s.disabled });
    toast.success(s.disabled ? 'تم تفعيل الاشتراك' : 'تم إيقاف الاشتراك');
  });
  const setDevice = async (dv, status) => {
    setBusy(`d${dv.id}`);
    try { await api.patch(`/api/admin/devices/${dv.id}`, { status }); toast.success(status === 'active' ? 'تم السماح بالجهاز' : 'تم حظر الجهاز'); await loadDevices(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const delDevice = async (dv) => {
    if (!(await confirm({ title: 'حذف الجهاز من القائمة؟', description: 'إذا رجع بيتسجّل من جديد حسب الحد.', danger: true, confirmText: 'حذف' }))) return;
    setBusy(`d${dv.id}`);
    try { await api.del(`/api/admin/devices/${dv.id}`); toast.success('تم الحذف'); await loadDevices(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  const title = u ? (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={u.name} seed={u.id} size={44} dim={!!u.disabled} />
      <span className="min-w-0">
        <span className="block truncate">{u.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {u.approved === 0 ? <Badge tone="warn" dot pulse>بانتظار الموافقة</Badge> : u.disabled ? <Badge tone="bad" dot>موقوف</Badge> : <Badge tone="ok" dot>فعّال</Badge>}
          {!!u.self_signup && <Badge>تسجيل ذاتي</Badge>}
          <span className="font-mono text-[11px] font-normal text-muted ltr">#{u.id}</span>
        </span>
      </span>
    </span>
  ) : 'الطالب';

  return (
    <Sheet open={id != null} onOpenChange={onOpenChange} width={wide ? 760 : 560} title={title}
      footer={u && (
        <>
          {u.approved === 0 && <Button variant="primary" size="sm" icon={ShieldCheck} loading={busy === 'approve'} onClick={approve}>موافقة</Button>}
          <Button size="sm" variant={u.disabled ? 'soft' : 'secondary'} icon={u.disabled ? Play : Pause} loading={busy === 'toggle'} onClick={toggle}>{u.disabled ? 'تفعيل الحساب' : 'إيقاف الحساب'}</Button>
          <Button size="sm" variant="secondary" icon={Lock} loading={busy === 'pw'} onClick={resetPw}>كلمة سر مؤقتة</Button>
          <Button size="sm" variant="danger" icon={Trash2} loading={busy === 'del'} onClick={del} className="ms-auto">حذف</Button>
        </>
      )}>
      {err ? (
        <Empty icon={AlertTriangle} title="ما قدرنا نجيب بيانات الطالب" text={err.message} action={<Button icon={RefreshCw} onClick={load}>إعادة المحاولة</Button>} />
      ) : !d ? (
        <div className="space-y-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-36" /><Skeleton className="h-10" /><Skeleton className="h-48" /></div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted">
            {u.email && <span className="inline-flex items-center gap-1.5"><Mail size={13} /><span className="ltr">{u.email}</span></span>}
            {u.created_ip && <span>سجّل من <span className="font-mono ltr">{u.created_ip}</span></span>}
            <span>انضم {ago(u.created_at)}</span>
            <span>آخر دخول: {u.last_login_at ? ago(u.last_login_at) : '—'}</span>
            {u.note && <span className="text-fg-2">📝 {u.note}</span>}
          </div>

          <SecretBox label={secret?.label} value={secret?.value} onClose={() => setSecret(null)} />

          <Segmented full value={tab} onChange={setTab} options={[
            { value: 'wallet', label: 'الرصيد', icon: Wallet },
            { value: 'limits', label: 'السقف', icon: Gauge },
            { value: 'access', label: 'الوصول', icon: KeyRound },
            { value: 'usage', label: 'الاستخدام', icon: Activity },
          ]} />

          {tab === 'wallet' && <WalletTab d={d} groupName={groupName} groups={groups} busy={busy} toggleSub={toggleSub} onGrant={(body) => act('grant', async () => { await api.post(`/api/admin/users/${id}/subscriptions`, body); toast.success('تم المنح'); return true; })} />}
          {tab === 'limits' && <CapsTab u={u} busy={busy} onSave={(body) => act('caps', async () => { await api.patch(`/api/admin/users/${id}`, body); toast.success('تم حفظ السقف'); return true; })} />}
          {tab === 'access' && <AccessTab d={d} devices={devices} busy={busy} newKey={newKey} revoke={revoke} setDevice={setDevice} delDevice={delDevice} reloadDevices={loadDevices} />}
          {tab === 'usage' && <UsageTab usage={d.usage} />}
        </div>
      )}
    </Sheet>
  );
}

// ── wallet: balance, grant, subscriptions ──
function WalletTab({ d, groupName, groups, busy, toggleSub, onGrant }) {
  const live = d.subscriptions.filter((s) => !s.disabled && !(s.expires_at && s.expires_at < now()));
  const sum = (kind, f) => live.filter((s) => s.kind === kind).reduce((a, s) => a + f(s), 0);
  const usdTotal = sum('usd', (s) => s.total), usdUsed = sum('usd', (s) => s.used);
  const tokTotal = sum('tokens', (s) => s.total), tokUsed = sum('tokens', (s) => s.used);
  const paid = d.subscriptions.reduce((a, s) => a + (s.sale_price || 0), 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-sunken/50 p-4">
          <Ring value={usdTotal ? (usdTotal - usdUsed) / usdTotal : 0} size={96} stroke={9}>
            <div><div className="font-display text-[15px] font-bold num">{usd(usdTotal - usdUsed)}</div><div className="text-[10.5px] text-muted">متبقي</div></div>
          </Ring>
          <div className="space-y-1 text-[12.5px]">
            <div className="text-muted">رصيد الدولار الفعّال</div>
            <div className="num">مستخدم <b>{usd(usdUsed)}</b> من {usd(usdTotal)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniStat icon={Coins} label="توكنات متبقية" value={tokens(tokTotal - tokUsed)} sub={tokTotal ? `من ${tokens(tokTotal)}` : 'ما في'} />
          <MiniStat icon={Wallet} label="دفع الطالب (المجموع)" value={usd(paid)} sub={`${d.subscriptions.length} اشتراك`} />
        </div>
      </div>

      <GrantForm groups={groups} busy={busy === 'grant'} onGrant={onGrant} />

      <div>
        <SectionTitle icon={CalendarClock}>الاشتراكات</SectionTitle>
        {d.subscriptions.length ? (
          <div className="space-y-2">
            {d.subscriptions.map((s) => {
              const st = subState(s);
              return (
                <div key={s.id} className={cn('rounded-2xl border border-line bg-solid/60 p-3.5', s.disabled && 'opacity-65')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={s.kind === 'usd' ? 'accent' : 'new'}>{s.kind === 'usd' ? 'دولار' : 'توكنات'}</Badge>
                    <span className="text-[13px] font-medium">{groupName(s.group_id)}</span>
                    <Badge tone={st.tone} dot>{st.label}</Badge>
                    <Button size="xs" variant={s.disabled ? 'soft' : 'ghost'} className="ms-auto" loading={busy === `s${s.id}`} icon={s.disabled ? Play : Pause} onClick={() => toggleSub(s)}>{s.disabled ? 'تفعيل' : 'إيقاف'}</Button>
                  </div>
                  <Progress className="mt-2.5 h-1.5" value={s.used} max={s.total} tone={s.used / s.total > 0.9 ? 'bad' : s.used / s.total > 0.7 ? 'warn' : undefined} />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
                    <span className="num">{fmtAmt(s.kind, s.used)} / {fmtAmt(s.kind, s.total)}</span>
                    <span>ينتهي: {s.expires_at ? day(s.expires_at) : 'دائم'}</span>
                    {s.source && <span className="font-mono ltr">{s.source}</span>}
                    {s.sale_price != null && <span>دفع: {usd(s.sale_price)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <Empty icon={Gift} title="ما في اشتراكات" text="امنحه اشتراك من النموذج فوق، أو أعطه كوبون." className="py-8" />}
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, sub }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-sunken/50 p-3.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted"><Icon size={13} className="text-accent" />{label}</div>
      <div className="mt-1 truncate font-display text-lg font-bold num">{value}</div>
      {sub && <div className="truncate text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

function GrantForm({ groups, busy, onGrant }) {
  const init = { kind: 'usd', amount: '', group_id: '', valid_days: '30', sale_price: '0' };
  const [f, setF] = useState(init);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const submit = async (e) => {
    e.preventDefault();
    if (!(+f.amount > 0)) { toast.error('اكتب قيمة أكبر من صفر'); return; }
    const ok = await onGrant({ kind: f.kind, group_id: f.group_id, valid_days: f.valid_days, amount: Math.round(+f.amount * M), sale_price: Math.round((+f.sale_price || 0) * M) });
    if (ok) setF(init);
  };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-accent/20 bg-accent-soft/40 p-4">
      <SectionTitle icon={Gift}>منح اشتراك مباشر</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="النوع" className="sm:col-span-2">
          <Segmented full value={f.kind} onChange={set('kind')} options={[{ value: 'usd', label: 'دولار' }, { value: 'tokens', label: 'توكنات' }]} />
        </Field>
        <Field label={f.kind === 'usd' ? 'القيمة ($)' : 'القيمة (مليون توكن)'}><Input type="number" step="0.01" min="0.01" required value={f.amount} onChange={set('amount')} placeholder={f.kind === 'usd' ? '10' : '5'} className="num" /></Field>
        <Field label="الفئة"><Select value={f.group_id} onChange={set('group_id')} options={[{ value: '', label: 'كل النماذج' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} /></Field>
        <Field label="المدة بالأيام" hint="0 = دائم"><Input type="number" min="0" value={f.valid_days} onChange={set('valid_days')} className="num" /></Field>
        <Field label="دفع الطالب ($)" hint="للتقارير المالية"><Input type="number" step="0.01" min="0" value={f.sale_price} onChange={set('sale_price')} className="num" /></Field>
      </div>
      <div className="mt-4 flex justify-end"><Button type="submit" variant="primary" icon={Gift} loading={busy}>منح</Button></div>
    </form>
  );
}

// ── caps ──
function CapsTab({ u, busy, onSave }) {
  const [daily, setDaily] = useState((u.daily_cap / 1e6).toFixed(2));
  const [monthly, setMonthly] = useState(u.monthly_cap ? (u.monthly_cap / 1e6).toFixed(2) : '');
  const submit = (e) => {
    e.preventDefault();
    if (!(+daily >= 0.1)) { toast.error('السقف اليومي لازم يكون 0.1$ أو أكثر'); return; }
    onSave({ daily_cap: Math.round(+daily * M), monthly_cap: monthly ? Math.round(+monthly * M) : 0 });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-2xl border border-line bg-sunken/50 p-4 text-[13px] leading-relaxed text-fg-2">
        <SectionTitle icon={Gauge}>سقف الصرف</SectionTitle>
        هاد الحد الأعلى — الطالب بيقدر ينزّل سقفه بنفسه من لوحته، بس ما بيقدر يتجاوز اللي بتحطه هون.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="يومي ($)" hint="الحد الأدنى 0.10$"><Input type="number" step="0.01" min="0.1" required value={daily} onChange={(e) => setDaily(e.target.value)} className="num" /></Field>
        <Field label="شهري ($)" hint="فارغ = بلا سقف شهري"><Input type="number" step="0.01" min="0" placeholder="بلا" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="num" /></Field>
      </div>
      <div className="flex justify-end"><Button type="submit" variant="primary" loading={busy === 'caps'}>حفظ</Button></div>
    </form>
  );
}

// ── keys + devices ──
function AccessTab({ d, devices, busy, newKey, revoke, setDevice, delDevice, reloadDevices }) {
  const [name, setName] = useState('');
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle icon={KeyRound}>المفاتيح</SectionTitle>
        <form className="mb-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await newKey(name.trim())) setName(''); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم المفتاح (اختياري) — admin-issued" className="flex-1" />
          <Button type="submit" variant="soft" icon={Plus} loading={busy === 'newkey'}>مفتاح جديد</Button>
        </form>
        {d.keys.length ? (
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {d.keys.map((k) => (
              <div key={k.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 bg-solid/60 px-3.5 py-2.5', k.revoked && 'opacity-60')}>
                <KeyRound size={15} className={k.revoked ? 'text-muted' : 'text-accent'} />
                <span className="text-[13.5px] font-medium">{k.name}</span>
                <code className="font-mono text-[12px] text-muted ltr">{k.prefix}…</code>
                <span className="text-[11.5px] text-muted">آخر استخدام: {k.last_used_at ? ago(k.last_used_at) : 'أبداً'}</span>
                <span className="ms-auto">
                  {k.revoked ? <Badge tone="bad">ملغى</Badge> : <Button size="xs" variant="danger" icon={X} loading={busy === `rk${k.id}`} onClick={() => revoke(k)}>إلغاء</Button>}
                </span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted">ما في مفاتيح.</p>}
      </div>

      <div>
        <SectionTitle icon={Laptop} actions={<Button size="xs" variant="ghost" icon={RefreshCw} onClick={reloadDevices}>تحديث</Button>}>الأجهزة</SectionTitle>
        {devices == null ? <Skeleton className="h-16" /> : devices.length ? (
          <div className="space-y-2">
            {devices.map((dv) => {
              const st = DEV[dv.status] || { label: dv.status, tone: 'neutral' };
              return (
                <div key={dv.id} className="rounded-2xl border border-line bg-solid/60 p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Laptop size={15} className="text-muted" />
                    <span className="text-[13.5px] font-medium">{dv.name || '—'}</span>
                    <Badge tone={st.tone} dot>{st.label}</Badge>
                    <span className="ms-auto flex gap-1.5">
                      {dv.status !== 'active' && <Button size="xs" variant="soft" icon={ShieldCheck} loading={busy === `d${dv.id}`} onClick={() => setDevice(dv, 'active')}>سماح</Button>}
                      {dv.status !== 'blocked' && <Button size="xs" variant="danger" icon={ShieldX} loading={busy === `d${dv.id}`} onClick={() => setDevice(dv, 'blocked')}>حظر</Button>}
                      <Tip content="حذف من القائمة (يحرر مكان للطالب)"><Button size="icon-sm" variant="ghost" aria-label="حذف الجهاز" onClick={() => delDevice(dv)}><Trash2 size={15} /></Button></Tip>
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
                    <span className="font-mono ltr">{dv.device_id.slice(0, 12)}…</span>
                    {dv.last_ip && <span className="font-mono ltr">{dv.last_ip}</span>}
                    <span>آخر استخدام: {dv.last_seen ? ago(dv.last_seen) : '—'}</span>
                    <span className="num">{dv.requests} طلب</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-muted">لا أجهزة بعد — بتظهر لما الطالب يستخدم الأدوات المثبتة عبر <span className="font-mono ltr">abdalgani-setup</span></p>}
      </div>
    </div>
  );
}

// ── usage ──
function UsageTab({ usage }) {
  const sum = useMemo(() => ({
    cost: usage.reduce((a, l) => a + (l.cost || 0), 0),
    tok: usage.reduce((a, l) => a + (l.prompt_tokens || 0) + (l.completion_tokens || 0), 0),
    err: usage.filter((l) => l.status >= 400).length,
  }), [usage]);
  const cols = [
    { key: 'model_id', header: 'النموذج', primary: true, cell: (l) => <span className="font-mono text-[12.5px] ltr">{l.model_id}</span> },
    { key: 'created_at', header: 'الوقت', cell: (l) => <Tip content={date(l.created_at)}><span className="text-[12.5px] text-muted">{ago(l.created_at)}</span></Tip> },
    { key: 'tok', header: 'توكن', align: 'end', cell: (l) => tokens(l.prompt_tokens + l.completion_tokens) },
    { key: 'cost', header: 'كلفة', align: 'end', cell: (l) => usdPrecise(l.cost) },
    { key: 'status', header: 'حالة', align: 'center', cell: (l) => <Badge tone={l.status < 400 ? 'ok' : l.status === 429 || l.status === 402 ? 'warn' : 'bad'}><span className="num">{l.status}</span></Badge> },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <MiniStat icon={Activity} label="طلبات" value={usage.length} sub={usage.length >= 100 ? 'آخر 100' : 'كل طلباته'} />
        <MiniStat icon={Coins} label="الكلفة" value={usdPrecise(sum.cost)} sub={`${tokens(sum.tok)} توكن`} />
        <MiniStat icon={AlertTriangle} label="أخطاء" value={sum.err} sub={usage.length ? `${Math.round((sum.err / usage.length) * 100)}%` : '—'} />
      </div>
      <DataTable dense columns={cols} rows={usage} empty={{ icon: Activity, title: 'ما في طلبات بعد', text: 'أول ما يبلّش الطالب يستخدم البوابة، طلباته بتظهر هون.' }} />
    </div>
  );
}
