// Model groups + the default fixed aliases (abd-main / abd-fast / ...).
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Braces, Layers, ListTree, Pencil, Plus, RefreshCcw, Save, Shuffle, Trash2, TriangleAlert, X } from 'lucide-react';
import { Badge, Button, Card, DataTable, Empty, Field, Input, Segmented, Select, Skeleton, Textarea, cn, toast, useConfirm } from '../../ui/index.js';
import { useAsync } from '../../lib/hooks.js';
import { api, useAdmin } from '../ctx.js';
import { ID_RE } from './cfg/shared.js';

function Groups() {
  const { groups, reloadGroups } = useAdmin();
  const confirm = useConfirm();
  const [f, setF] = useState({ id: '', name: '', description: '' });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { Promise.resolve(reloadGroups()).finally(() => setLoaded(true)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const reset = () => { setF({ id: '', name: '', description: '' }); setEditing(false); };

  const save = async (e) => {
    e.preventDefault();
    if (!ID_RE.test(f.id.trim())) return toast.error('المعرّف بالإنجليزي: حروف، أرقام، . _ : / -');
    setBusy(true);
    try {
      await api.post('/api/admin/groups', { id: f.id.trim(), name: f.name.trim(), description: f.description.trim() });
      toast.success(editing ? 'تم الحفظ' : `انضافت الفئة ${f.name.trim() || f.id.trim()}`);
      reset(); await reloadGroups();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const del = async (g) => {
    if (!(await confirm({ title: `حذف الفئة ${g.id}؟`, description: 'النماذج والكوبونات والاشتراكات المربوطة فيها رح تفقد الربط.', danger: true, confirmText: 'احذف', icon: Trash2 }))) return;
    try { await api.del(`/api/admin/groups/${encodeURIComponent(g.id)}`); toast.success('انحذفت'); if (f.id === g.id) reset(); await reloadGroups(); } catch (err) { toast.error(err.message); }
  };
  const edit = (g) => { setF({ id: g.id, name: g.name || '', description: g.description || '' }); setEditing(true); };

  const cols = [
    { key: 'id', header: 'المعرّف', primary: true, cell: (g) => (
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink"><Layers size={15} /></span>
        <div className="min-w-0">
          <div className="truncate font-semibold">{g.name}</div>
          <div className="truncate font-mono text-[11.5px] text-muted ltr text-start">{g.id}</div>
        </div>
      </div>
    ) },
    { key: 'description', header: 'الوصف', mobileFull: true, cell: (g) => <span className="text-[13px] text-muted">{g.description || '—'}</span> },
    { key: 'act', header: '', align: 'end', mobileFull: true, cell: (g) => (
      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button size="icon-sm" variant="ghost" aria-label={`تعديل ${g.id}`} onClick={() => edit(g)}><Pencil size={15} /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={`حذف ${g.id}`} className="text-bad hover:bg-bad-soft hover:text-bad" onClick={() => del(g)}><Trash2 size={15} /></Button>
      </div>
    ) },
  ];

  return (
    <Card title="الفئات" icon={Layers} subtitle={<>الكوبون أو الاشتراك ممكن ينحصر بفئة. نموذج بلا فئة يغطيه فقط اشتراك "كل النماذج". <span className="ltr">(Model groups)</span></>}
      actions={<Badge tone="accent">{groups.length} فئة</Badge>}>
      <DataTable columns={cols} rows={groups} loading={!loaded && !groups.length} rowKey={(g) => g.id} onRowClick={edit}
        rowClassName={(g) => cn(editing && f.id === g.id && 'bg-accent-soft/60')}
        empty={{ icon: Layers, title: 'ما في فئات بعد', text: 'ضيف فئة مثل coding أو chat لتحصر فيها الكوبونات والاشتراكات.' }} />
      <form onSubmit={save} className="mt-4 rounded-2xl border border-line bg-sunken/50 p-4" autoComplete="off">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="font-display text-[14px] font-semibold">{editing ? <>تعديل <span className="font-mono ltr">{f.id}</span></> : 'فئة جديدة'}</h3>
          {editing && <Button size="xs" variant="ghost" icon={X} onClick={reset} className="ms-auto">إلغاء التعديل</Button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-end">
          <Field label="المعرّف"><Input mono value={f.id} onChange={set('id')} readOnly={editing} required placeholder="coding" /></Field>
          <Field label="الاسم"><Input value={f.name} onChange={set('name')} placeholder="نماذج البرمجة" /></Field>
          <Field label="الوصف"><Input value={f.description} onChange={set('description')} placeholder="اختياري" /></Field>
          <Button type="submit" variant="primary" icon={editing ? Save : Plus} loading={busy}>{editing ? 'حفظ' : 'إضافة'}</Button>
        </div>
      </form>
    </Card>
  );
}

let rowKey = 0;
const toRows = (obj) => Object.entries(obj || {}).map(([alias, model]) => ({ k: ++rowKey, alias, model: String(model ?? '') }));

function Aliases() {
  const { data, error, loading, reload } = useAsync(() => Promise.all([api.get('/api/admin/aliases'), api.get('/api/admin/models').catch(() => [])]), []);
  const [mode, setMode] = useState('visual');
  const [rows, setRows] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!data) return;
    const [aliases] = data;
    setRows(toRows(aliases)); setText(JSON.stringify(aliases, null, 2)); setDirty(false);
    if (Object.values(aliases).some((v) => typeof v !== 'string')) setMode('json'); // nested values: only JSON can show them faithfully
  }, [data]);
  const models = data?.[1] || [];
  const modelOpts = useMemo(() => {
    const opts = models.filter((m) => m.status !== 'archived').map((m) => ({ value: m.id, label: m.id, hint: m.name }));
    for (const r of rows) if (r.model && !opts.some((o) => o.value === r.model)) opts.unshift({ value: r.model, label: r.model, hint: 'غير موجود بقائمة النماذج' });
    return opts;
  }, [models, rows]);

  const jsonError = useMemo(() => {
    if (mode !== 'json') return null;
    try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? null : 'لازم يكون object مثل {"abd-main": "glm-5.2"}'; } catch { return 'JSON غير صالح'; }
  }, [text, mode]);
  const rowsObj = () => Object.fromEntries(rows.filter((r) => r.alias.trim()).map((r) => [r.alias.trim(), r.model.trim()]));
  const switchMode = (m) => {
    if (m === mode) return;
    if (m === 'json') setText(JSON.stringify(rowsObj(), null, 2));
    else {
      try {
        const v = JSON.parse(text);
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        if (Object.values(v).some((x) => typeof x !== 'string')) return toast.error('في قيم مش نصوص — خليك بوضع JSON');
        setRows(toRows(v));
      } catch { return toast.error('صلّح الـ JSON أول'); }
    }
    setMode(m);
  };
  const edit = (fn) => { setRows(fn); setDirty(true); };
  const dupes = new Set(rows.map((r) => r.alias.trim()).filter((a, i, all) => a && all.indexOf(a) !== i));

  const save = async () => {
    let obj;
    if (mode === 'json') { try { obj = JSON.parse(text); } catch { return toast.error('JSON غير صالح'); } if (jsonError) return toast.error(jsonError); }
    else {
      if (dupes.size) return toast.error(`اسم مكرر: ${[...dupes].join(', ')}`);
      if (rows.some((r) => r.alias.trim() && !r.model.trim())) return toast.error('في اسم بلا نموذج');
      obj = rowsObj();
    }
    setBusy(true);
    try { await api.put('/api/admin/aliases', obj); toast.success('تم الحفظ'); setDirty(false); await reload(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <Card title="الأسماء الثابتة الافتراضية" icon={Shuffle}
      subtitle={<>الأدوات بتنضبط على هالأسماء (<span className="ltr">aliases</span>). كل طالب بيقدر يغيّرها لنفسه من لوحته.</>}
      actions={<Segmented size="sm" value={mode} onChange={switchMode} options={[{ value: 'visual', label: 'مرئي', icon: ListTree }, { value: 'json', label: 'JSON', icon: Braces }]} />}>
      {error && !data ? <Empty icon={TriangleAlert} title="ما قدرنا نجيب الأسماء" text={error.message} action={<Button icon={RefreshCcw} onClick={reload}>جرّب مرة تانية</Button>} />
        : loading && !data ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}</div>
          : mode === 'json' ? (
            <Field hint={<>مثال: <span className="font-mono ltr">{'{"abd-main": "glm-5.2"}'}</span></>} error={jsonError}>
              <Textarea mono rows={8} value={text} onChange={(e) => { setText(e.target.value); setDirty(true); }} spellCheck={false} aria-label="aliases JSON" />
            </Field>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-line bg-solid/60 p-2 sm:grid-cols-[minmax(0,220px)_auto_minmax(0,1fr)_auto]">
                  <Input mono value={r.alias} onChange={(e) => edit((rs) => rs.map((x) => (x.k === r.k ? { ...x, alias: e.target.value } : x)))} placeholder="abd-main" aria-label="الاسم الثابت"
                    className={cn(dupes.has(r.alias.trim()) && '!border-bad')} />
                  <ArrowLeft size={16} className="mx-1 text-muted max-sm:hidden" />
                  <Button size="icon-sm" variant="ghost" aria-label="حذف" className="text-bad hover:bg-bad-soft hover:text-bad sm:order-last" onClick={() => edit((rs) => rs.filter((x) => x.k !== r.k))}><Trash2 size={15} /></Button>
                  <div className="col-span-2 sm:col-span-1">
                    <Select mono value={r.model} onChange={(v) => edit((rs) => rs.map((x) => (x.k === r.k ? { ...x, model: v } : x)))} options={modelOpts} searchable placeholder="اختر نموذج…" aria-label="النموذج" />
                  </div>
                </div>
              ))}
              {!rows.length && <p className="rounded-2xl border border-dashed border-line-strong p-5 text-center text-sm text-muted">ما في أسماء ثابتة. ضيف <span className="font-mono ltr">abd-main</span> مثلاً.</p>}
              <Button size="sm" variant="soft" icon={Plus} onClick={() => edit((rs) => [...rs, { k: ++rowKey, alias: '', model: '' }])}>اسم جديد</Button>
            </div>
          )}
      {data && (
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-4">
          {dirty && <span className="me-auto text-xs text-warn">في تغييرات ما انحفظت</span>}
          {dirty && <Button variant="ghost" onClick={reload}>تراجع</Button>}
          <Button variant="primary" icon={Save} loading={busy} disabled={mode === 'json' && !!jsonError} onClick={save}>حفظ</Button>
        </div>
      )}
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-2">
      <Groups />
      <Aliases />
    </div>
  );
}
