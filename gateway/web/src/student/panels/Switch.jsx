// تبديل النماذج — pick the real model behind each fixed alias (saves immediately), reset/delete
// custom aliases, and add a new custom alias.
import { useMemo, useState } from 'react';
import { Lock, Plus, RotateCcw, Shuffle, Sparkles, Trash2 } from 'lucide-react';
import { Badge, Button, Card, DataTable, Field, Input, Reveal, Select, Spinner, toast, useConfirm } from '../../ui/index.js';
import { api, useStudent } from '../ctx.js';

const code = (t) => <code className="rounded-md border border-line bg-sunken px-1.5 py-px font-mono text-[12.5px] ltr">{t}</code>;

function useModelOptions() {
  const { catalog } = useStudent();
  return useMemo(() => catalog.models.filter((m) => m.available && m.status !== 'archived').map((m) => ({
    value: m.id,
    label: `${m.name}${m.status === 'legacy' ? ' — قديم' : m.status === 'new' ? ' — جديد' : ''}`,
    hint: m.id,
  })), [catalog.models]);
}

export default function SwitchPanel() {
  const { me, catalog, setAlias, reload } = useStudent();
  const confirm = useConfirm();
  const opts = useModelOptions();
  const [busy, setBusy] = useState(null);
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);

  const change = async (alias, id) => { setBusy(alias); await setAlias(alias, id); setBusy(null); };
  const reset = async (a) => {
    if (!a.default_model_id && !(await confirm({ title: `حذف الاسم ${a.alias}؟`, description: 'الأدوات اللي بتستخدم هالاسم رح توقف تشتغل فيه.', danger: true, confirmText: 'حذف' }))) return;
    setBusy(a.alias);
    try { await api.del(`/api/me/aliases/${encodeURIComponent(a.alias)}`); await reload(); toast.success(a.default_model_id ? 'رجع للافتراضي' : 'انحذف الاسم'); }
    catch (err) { toast.error(err.message); } finally { setBusy(null); }
  };
  const add = async (e) => {
    e.preventDefault();
    const m = model || opts[0]?.value;
    if (!m) { toast.error('ما في نماذج متاحة لك'); return; }
    setSaving(true);
    if (await setAlias(name.trim().toLowerCase(), m)) setName('');
    setSaving(false);
  };

  const cols = [
    { key: 'alias', header: 'الاسم الثابت (بالأدوات)', primary: true, width: '30%', cell: (a) => (
      <div className="min-w-0">
        <span className="whitespace-nowrap rounded-lg border border-line bg-sunken px-2 py-0.5 font-mono text-[13px] ltr">{a.alias}</span>
        <div className="mt-1 truncate text-[12px] text-muted">= {a.model_name}</div>
      </div>
    ) },
    { key: 'target', header: 'يشير إلى', mobileFull: true, cell: (a) => {
      const target = catalog.models.find((m) => m.id === a.model_id);
      const locked = target && !target.available;
      const o = locked ? [{ value: a.model_id, label: `${a.model_id} 🔒`, disabled: true, group: 'الحالي' }, ...opts.map((x) => ({ ...x, group: 'المتاح إلك' }))] : opts;
      return (
        <div className="flex min-w-0 max-w-[460px] items-center gap-2">
          <div className="min-w-0 flex-1">
            <Select value={a.model_id} onChange={(v) => v !== a.model_id && change(a.alias, v)} options={o} disabled={busy === a.alias} aria-label={`النموذج ورا ${a.alias}`} />
            {locked && <div className="mt-1 text-[12px] text-bad">النموذج الحالي خارج اشتراكك — اختر غيره</div>}
          </div>
          {busy === a.alias && <Spinner size={16} />}
        </div>
      );
    } },
    { key: 'act', header: '', align: 'end', mobileFull: true, cell: (a) => (a.custom
      ? <Button size="xs" variant="danger" icon={a.default_model_id ? RotateCcw : Trash2} disabled={busy === a.alias} onClick={() => reset(a)}>{a.default_model_id ? 'رجوع للافتراضي' : 'حذف'}</Button>
      : <Badge>افتراضي</Badge>) },
  ];

  return (
    <div className="grid gap-4 sm:gap-5 [&>*]:min-w-0">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-accent/25 bg-accent-soft p-4 text-[14px] leading-[1.9] text-fg-2 sm:p-5">
          <div aria-hidden className="pointer-events-none absolute -top-20 end-0 size-60 rounded-full bg-[radial-gradient(closest-side,var(--mesh-1),transparent)]" />
          <div className="relative flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl grad-bg text-white"><Sparkles size={17} /></span>
            <p>أدواتك مضبوطة على أسماء ثابتة مثل {code('abd-main')} و{code('abd-fast')}. غيّر هون لأي نموذج مسموح إلك، وبيشتغل <b className="text-fg">فوراً</b> بكل الأدوات بدون إعادة تثبيت. ولتحديث الأسماء الظاهرة داخل أدواتك (اختياري) شغّل {code('abdalgani-setup --sync')}.</p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <Card title="أسمائي الثابتة" icon={Shuffle} subtitle="اختيارك بينحفظ فوراً">
          <DataTable columns={cols} rows={me.aliases} rowKey={(a) => a.alias} stickyHeader={false} className="overflow-visible" empty={{ icon: Shuffle, title: 'ما في أسماء' }} />
        </Card>
      </Reveal>

      <Reveal delay={0.1}>
        <Card title="اسم مخصص جديد" icon={Plus} subtitle="اعمل اسمك الخاص (أحرف صغيرة وأرقام و . - _) وخلّيه يشير لأي نموذج مسموح إلك">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] sm:items-end">
            <Field label="الاسم"><Input mono placeholder="my-model" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="النموذج"><Select value={model || opts[0]?.value} onChange={setModel} options={opts} aria-label="النموذج" /></Field>
            <Button type="submit" variant="primary" icon={Plus} loading={saving}>حفظ</Button>
          </form>
          {!opts.length && <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-muted"><Lock size={13} />ما في نماذج متاحة لك — فعّل كود تفعيل أول.</p>}
        </Card>
      </Reveal>
    </div>
  );
}
