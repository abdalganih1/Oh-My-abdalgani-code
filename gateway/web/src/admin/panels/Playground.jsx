// Admin Playground: chat with any model through the real gateway path (/v1/*) using an internal
// account, optionally pinned to one route, plus a one-click 12-check compatibility suite.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUp, Bot, Cpu, FlaskConical, Image as ImageIcon, Gauge, Plug, RotateCcw, Settings2, Sparkles, Square, Timer, Trash2, Wrench, Zap, CheckCircle2, XCircle, MinusCircle, AlertTriangle, MessagesSquare,
} from 'lucide-react';
import {
  Badge, Button, Card, CopyButton, Empty, Field, Input, Progress, Segmented, Select, Sheet, Spinner, Switch, Textarea, cn, toast,
} from '../../ui/index.js';
import Markdown from '../../ui/Markdown.jsx';
import { usePersisted, useMedia } from '../../lib/hooks.js';
import { ms, tokens, usdPrecise, int } from '../../lib/format.js';
import { api } from '../ctx.js';
import Thinking from './playground/Thinking.jsx';
import { RED_PNG, SUITE, WEATHER, callModel, costsSince, ensureKey, safeParse, spend24h } from './playground/engine.js';

const FORMATS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'responses', label: 'Codex' },
];
const EFFORTS = [{ value: '', label: 'افتراضي' }, ...['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((e) => ({ value: e, label: e }))];
const STATUS_GROUPS = { new: 'جديد', active: 'متاح', legacy: 'قديم', hidden: 'مخفي', archived: 'مؤرشف' };
const QUICK = ['عرّف عن حالك بجملة: مين انت ومين صنعك؟', 'Write a Python function that reverses a string, with a test.', 'اشرحلي شو يعني API بطريقة بسيطة', "What's the weather in Damascus? (فعّل الأدوات)"];
const DEFAULTS = { model: '', route: '', format: 'openai', stream: true, tools: false, maxTokens: 1024, temperature: '', effort: '', system: '' };

let uid = 0;
const nid = () => `m${++uid}`;

// ── one assistant turn ──
function AssistantMsg({ m, onContinue }) {
  const o = m.out || {};
  const streaming = m.streaming;
  const thinkingActive = streaming && !!o.reasoning && !m.tAnswer;
  const answering = streaming && !thinkingActive && !o.error;
  const empty = !o.text && !o.reasoning && !(o.toolCalls || []).length && !o.error;
  const meta = o.meta || {};
  const u = meta.usage || {};
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl grad-bg text-white shadow-[0_6px_18px_-6px_var(--glow)]"><Bot size={16} /></span>
      <div className="min-w-0 flex-1 space-y-2.5">
        {o.reasoning && <Thinking text={o.reasoning} active={thinkingActive} seconds={m.tThink} />}
        {empty && streaming && (
          <div className="flex items-center gap-2 py-1 text-sm text-muted"><span className="flex gap-1">{[0, 1, 2].map((i) => <i key={i} className="size-1.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 0.12}s` }} />)}</span>عم يتصل بالنموذج…</div>
        )}
        {o.text && <Markdown className={cn('text-[14.5px] text-fg', answering && '[&>*:last-child]:caret')}>{o.text}</Markdown>}
        {(o.toolCalls || []).map((t, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-line bg-sunken/60">
            <div className="flex items-center gap-2 border-b border-line px-3.5 py-2 text-[13px]"><Wrench size={14} className="text-accent" /><span className="text-muted">استدعاء أداة</span><b className="font-mono ltr">{t.name}</b></div>
            <pre className="overflow-x-auto px-3.5 py-2.5 font-mono text-[12px] leading-relaxed ltr">{prettyJson(t.args)}</pre>
          </div>
        ))}
        {o.error && (
          <div className="flex items-start gap-2 rounded-2xl border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /><span dir="auto" className="min-w-0 break-words">{o.error}</span>
          </div>
        )}
        {m.aborted && <div className="text-xs text-muted">⏹ انوقف</div>}
        {m.canContinue && (
          <Button size="sm" variant="soft" icon={Zap} onClick={onContinue}>ابعت نتيجة وهمية للأداة وكمّل</Button>
        )}
        {!streaming && meta.latency > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11.5px] text-muted">
            <Chip icon={Cpu} title="النموذج الحقيقي">{meta.model || '—'}</Chip>
            <Chip icon={Plug} title="المزوّد / المعرّف عنده" mono>{meta.upstream || '—'}</Chip>
            <Chip icon={Zap} title="زمن أول توكن" mono>{ms(meta.ttft)}</Chip>
            <Chip icon={Timer} title="الزمن الكلي" mono>{ms(meta.latency)}</Chip>
            <Chip icon={Gauge} title="توكنات دخل → خرج" mono>{tokens(u.in || 0)} → {tokens(u.out || 0)}</Chip>
            {m.cost != null && <Chip title="الكلفة">{usdPrecise(m.cost)}</Chip>}
            <Badge tone={meta.status < 400 ? 'ok' : 'bad'} className="h-5 px-2 text-[11px]">{meta.status}</Badge>
            {o.text && <CopyButton text={o.text} className="size-6" />}
          </div>
        )}
      </div>
    </motion.div>
  );
}
function Chip({ icon: Icon, children, title, mono }) {
  return (
    <span title={title} className={cn('inline-flex h-6 max-w-[220px] items-center gap-1 rounded-lg border border-line bg-sunken/70 px-2', mono && 'font-mono ltr')}>
      {Icon && <Icon size={12} className="shrink-0" />}<span className="truncate">{children}</span>
    </span>
  );
}
const prettyJson = (s) => { try { return JSON.stringify(JSON.parse(s || '{}'), null, 2); } catch { return s || '{}'; } };

function UserMsg({ m }) {
  if (m.role === 'tool') {
    return <div className="flex justify-center"><span className="rounded-full border border-line bg-sunken px-3 py-1 text-xs text-muted">↩︎ نتيجة الأداة: <code className="font-mono ltr">{'{"temp_c":24,"condition":"sunny"}'}</code></span></div>;
  }
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex justify-end">
      <div className="max-w-[85%] rounded-3xl rounded-ee-md bg-[linear-gradient(135deg,var(--brand-a),#4d7bff)] px-4 py-2.5 text-[14.5px] leading-relaxed text-white shadow-[0_10px_30px_-12px_var(--glow)]">
        {m.image && <img src={m.image} alt="" className="mb-2 size-16 rounded-xl border border-white/30 [image-rendering:pixelated]" />}
        <div dir="auto" className="whitespace-pre-wrap break-words">{m.content}</div>
      </div>
    </motion.div>
  );
}

// ── settings column ──
function SettingsPanel({ S, set, models, model, onSuite, onClear, onImage, busy, spend }) {
  const modelOpts = useMemo(() => models.map((m) => ({ value: m.id, label: m.name, hint: m.id, group: STATUS_GROUPS[m.status] || m.status })), [models]);
  const routeOpts = useMemo(() => [{ value: '', label: 'تلقائي', hint: 'حسب ترتيب التوجيه والاحتياط' },
    ...(model?.routes || []).map((r, i) => ({ value: String(r.id), label: `${i + 1}. ${r.provider_id} → ${r.upstream_model}`, hint: !r.enabled ? 'موقوف' : r.archived_at ? 'مؤرشف' : undefined, disabled: !r.enabled }))], [model]);
  return (
    <div className="space-y-4">
      <Field label="النموذج">
        <Select value={S.model} onChange={(v) => set({ model: v, route: '' })} options={modelOpts} placeholder="اختر نموذج…" searchable />
      </Field>
      {model && (
        <div className="flex flex-wrap gap-1.5">
          {model.reasoning ? <Badge tone="accent">تفكير</Badge> : null}
          {model.vision ? <Badge tone="accent">صور</Badge> : null}
          <Badge>{tokens(model.context_length)} سياق</Badge>
          <Badge tone={model.status === 'archived' ? 'bad' : model.status === 'new' ? 'new' : 'neutral'}>{STATUS_GROUPS[model.status] || model.status}</Badge>
        </div>
      )}
      <Field label="المسار" hint="ثبّت مزوّد معيّن لتجرّبه لحاله">
        <Select value={S.route} onChange={(v) => set({ route: v })} options={routeOpts} mono={false} />
      </Field>
      <Field label="صيغة الـ API">
        <Segmented full value={S.format} onChange={(v) => set({ format: v })} options={FORMATS} />
      </Field>
      <div className="grid gap-2.5 rounded-2xl border border-line bg-sunken/40 p-3">
        <Switch checked={S.stream} onCheckedChange={(v) => set({ stream: v })} label="بث مباشر (stream)" />
        <Switch checked={S.tools} onCheckedChange={(v) => set({ tools: v })} label={<>أداة <span className="font-mono ltr">get_weather</span></>} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max tokens"><Input type="number" min="1" value={S.maxTokens} onChange={(e) => set({ maxTokens: e.target.value })} mono /></Field>
        <Field label="Temperature"><Input type="number" step="0.1" min="0" max="2" placeholder="auto" value={S.temperature} onChange={(e) => set({ temperature: e.target.value })} mono /></Field>
      </div>
      <Field label="جهد التفكير (effort)"><Select value={S.effort} onChange={(v) => set({ effort: v })} options={EFFORTS} /></Field>
      <Field label="تعليمات النظام (system)"><Textarea rows={3} value={S.system} onChange={(e) => set({ system: e.target.value })} placeholder="اختياري" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" icon={FlaskConical} onClick={onSuite} disabled={busy || !S.model} className="col-span-2">الفحص الشامل (12 اختبار)</Button>
        <Button variant="secondary" size="sm" icon={ImageIcon} onClick={onImage} disabled={busy || !S.model}>اختبار صورة</Button>
        <Button variant="secondary" size="sm" icon={Trash2} onClick={onClear} disabled={busy}>مسح المحادثة</Button>
      </div>
      {spend && (
        <p className="text-[12px] leading-relaxed text-muted">آخر 24 ساعة: <b className="text-fg num">{int(spend.n)}</b> طلب · <b className="text-fg">{usdPrecise(spend.cost)}</b> — الكلفة بتنحسب بالتقارير تحت "🧪 Playground"</p>
      )}
    </div>
  );
}

// ── suite view ──
const ST = {
  pass: { icon: CheckCircle2, cls: 'text-ok', label: 'نجح', tone: 'ok' },
  fail: { icon: XCircle, cls: 'text-bad', label: 'فشل', tone: 'bad' },
  warn: { icon: AlertTriangle, cls: 'text-warn', label: 'غير مدعوم', tone: 'warn' },
  skip: { icon: MinusCircle, cls: 'text-muted', label: 'تخطّي', tone: 'neutral' },
};
function SuiteView({ suite, model }) {
  if (!suite) {
    return <Empty icon={FlaskConical} title="الفحص الشامل" text="12 اختبار بيجرّبوا النموذج بكل الصيغ: رد بسيط، بث، عربي، أدوات، متابعة بعد الأداة، Anthropic، Codex، JSON وفهم الصور." />;
  }
  const done = suite.results.filter(Boolean).length;
  const pass = suite.results.filter((r) => r?.st === 'pass').length;
  const counted = suite.results.filter((r) => r && r.st !== 'skip').length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="font-display text-[15px] font-semibold">{model?.name || suite.model}</div>
          <div className="font-mono text-xs text-muted ltr">{suite.model}</div>
        </div>
        <div className="ms-auto flex items-center gap-2">
          {suite.running != null ? <Badge tone="accent" dot pulse>عم يفحص {suite.running + 1}/{SUITE.length}</Badge> : <Badge tone={pass === counted ? 'ok' : 'warn'}>{pass}/{counted} نجح</Badge>}
          {suite.cost && <Badge>{suite.cost}</Badge>}
        </div>
      </div>
      <Progress value={done} max={SUITE.length} tone={suite.results.some((r) => r?.st === 'fail') ? 'warn' : undefined} />
      <div className="grid gap-2">
        {SUITE.map((t, i) => {
          const r = suite.results[i];
          const s = r ? ST[r.st] : null;
          const running = suite.running === i;
          return (
            <motion.div key={i} layout className={cn('flex items-start gap-3 rounded-2xl border px-3.5 py-3', running ? 'border-accent/40 bg-accent-soft/40' : 'border-line bg-solid/50')}>
              <span className="mt-0.5 shrink-0">{running ? <Spinner size={18} className="text-accent" /> : s ? <s.icon size={18} className={s.cls} /> : <span className="block size-[18px] rounded-full border-2 border-line-strong" />}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13.5px] font-medium">{t.name}</span>
                  {t.optional && <span className="text-[11px] text-muted">(اختياري)</span>}
                  {r?.o && (
                    <span className="ms-auto flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      <span className="num">⚡ {ms(r.o.meta.ttft)}</span><span className="num">⏱ {ms(r.o.meta.latency)}</span>
                      {r.o.meta.usage && <span className="num">{tokens(r.o.meta.usage.in || 0)}→{tokens(r.o.meta.usage.out || 0)}</span>}
                      {r.o.meta.upstream && <span className="font-mono ltr">{r.o.meta.upstream}</span>}
                    </span>
                  )}
                </div>
                {r?.note && <div dir="auto" className="mt-1 line-clamp-2 break-words text-xs text-muted">{r.note}</div>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default function Playground() {
  const [models, setModels] = useState([]);
  const [S, setS] = usePersisted('abd:pgSettings', DEFAULTS);
  const set = useCallback((p) => setS((s) => ({ ...s, ...p })), [setS]);
  const [msgs, setMsgs] = useState([]);
  const convo = useRef([]);
  const [busy, setBusy] = useState(false);
  const ctrl = useRef(null);
  const [view, setView] = useState('chat');
  const [suite, setSuite] = useState(null);
  const [spend, setSpend] = useState(null);
  const [input, setInput] = useState('');
  const [sheet, setSheet] = useState(false);
  const wide = useMedia('(min-width: 1180px)');
  const scroller = useRef(null);
  const stick = useRef(true);
  const ta = useRef(null);

  const model = models.find((m) => m.id === S.model);
  const refreshSpend = useCallback(() => spend24h().then((s) => s && setSpend(s)), []);

  useEffect(() => {
    api.get('/api/admin/models').then((ms_) => {
      setModels(ms_);
      setS((s) => (s.model && ms_.some((m) => m.id === s.model) ? s : { ...s, model: (ms_.find((m) => m.status === 'new') || ms_.find((m) => m.status === 'active') || ms_[0])?.id || '', route: '' }));
    }).catch((e) => toast.error(e.message));
    ensureKey().then(refreshSpend).catch((e) => toast.error(e.message));
    return () => ctrl.current?.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // follow the conversation while streaming unless the user scrolled up
  useLayoutEffect(() => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [msgs]);

  const patch = (id, p) => setMsgs((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof p === 'function' ? p(m) : p) } : m)));

  const settings = () => ({ model: S.model, route: S.route, format: S.format, stream: S.stream, system: S.system.trim(), maxTokens: +S.maxTokens || 1024, temperature: S.temperature, effort: S.effort, tools: S.tools ? [WEATHER] : null });

  /** Run one assistant turn into message `id`, with rAF-batched streaming updates. */
  async function runTurn(id) {
    const t0 = performance.now();
    let frame = 0, tReason = null, tAnswer = null, latest = null;
    const flush = () => {
      frame = 0; const o = latest; if (!o) return;
      if (o.reasoning && tReason == null) tReason = performance.now();
      if ((o.text || o.toolCalls.length) && tReason != null && tAnswer == null) tAnswer = performance.now();
      patch(id, { out: { ...o, toolCalls: [...o.toolCalls], meta: { ...o.meta } }, tAnswer, tThink: tReason != null ? ((tAnswer ?? performance.now()) - tReason) / 1000 : null });
    };
    ctrl.current = new AbortController();
    const o = await callModel({ ...settings(), messages: convo.current, signal: ctrl.current.signal, onDelta: (x) => { latest = x; if (!frame) frame = requestAnimationFrame(flush); } });
    cancelAnimationFrame(frame); latest = o; flush();
    patch(id, { streaming: false, tThink: tReason != null ? ((tAnswer ?? performance.now()) - tReason) / 1000 : null });
    return { o, t0 };
  }

  async function send(text, image) {
    if (busy || !S.model || !text.trim()) return;
    const user = { role: 'user', content: text, ...(image ? { image } : {}) };
    convo.current.push(user);
    const aid = nid();
    stick.current = true;
    setMsgs((l) => [...l, { id: nid(), ...user }, { id: aid, role: 'assistant', streaming: true, out: null }]);
    setBusy(true);
    const since = Math.floor(Date.now() / 1000) - 1;
    try {
      const { o } = await runTurn(aid);
      if (o.error) { convo.current.pop(); return; }
      const calls = o.toolCalls.map((t, i) => ({ ...t, id: t.id || `call_${Date.now()}_${i}` }));
      convo.current.push({ role: 'assistant', content: o.text, ...(calls.length ? { toolCalls: calls } : {}) });
      if (calls.length) patch(aid, { canContinue: true });
      const rows = await costsSince(since);
      if (rows[0]) patch(aid, { cost: rows[0].cost });
      refreshSpend();
    } catch (e) {
      convo.current.pop();
      if (e.name === 'AbortError') patch(aid, { streaming: false, aborted: true });
      else patch(aid, (m) => ({ streaming: false, out: { ...(m.out || { text: '', reasoning: '', toolCalls: [], meta: {} }), error: e.message } }));
    } finally { setBusy(false); ctrl.current = null; }
  }

  async function continueAfterTool(fromId) {
    patch(fromId, { canContinue: false });
    const last = convo.current.at(-1);
    for (const t of last.toolCalls || []) convo.current.push({ role: 'tool', id: t.id, content: JSON.stringify({ city: safeParse(t.args).city || '?', temp_c: 24, condition: 'sunny' }) });
    const aid = nid();
    setMsgs((l) => [...l, { id: nid(), role: 'tool' }, { id: aid, role: 'assistant', streaming: true, out: null }]);
    setBusy(true);
    try {
      const { o } = await runTurn(aid);
      if (!o.error) convo.current.push({ role: 'assistant', content: o.text });
    } catch (e) {
      patch(aid, (m) => ({ streaming: false, aborted: e.name === 'AbortError', out: e.name === 'AbortError' ? m.out : { ...(m.out || { text: '', reasoning: '', toolCalls: [], meta: {} }), error: e.message } }));
    } finally { setBusy(false); ctrl.current = null; }
  }

  async function runSuite() {
    if (busy || !S.model) return;
    setView('chat'); setView('suite');
    const m = model; const results = [];
    const since = Math.floor(Date.now() / 1000) - 1;
    const max = Math.max(512, +S.maxTokens || 0);
    setBusy(true); ctrl.current = new AbortController();
    const draw = (running, extra = {}) => setSuite({ model: S.model, results: [...results], running, ...extra });
    try {
      for (let i = 0; i < SUITE.length; i++) {
        const t = SUITE[i];
        draw(i);
        if (t.vision && !m?.vision) { results[i] = { st: 'skip', note: 'النموذج مش معلّم إنه بيقبل صور (عدّلها من إعدادات النموذج)' }; continue; }
        const prev = t.dependsOn != null ? results[t.dependsOn] : null;
        if (t.dependsOn != null && (!prev || prev.st !== 'pass')) { results[i] = { st: 'skip', note: 'بيعتمد على اختبار الأداة اللي قبله' }; continue; }
        try {
          const o = await callModel({ model: S.model, route: S.route, format: t.fmt, stream: t.stream, messages: t.build ? t.build(prev.o) : t.msgs, tools: t.tools || null, maxTokens: max, system: '', temperature: '', effort: '', extra: t.extra, signal: ctrl.current.signal });
          const ok = !o.error && t.check(o);
          const snippet = o.error || (o.toolCalls.length ? `🔧 ${o.toolCalls.map((x) => `${x.name}(${x.args})`).join(', ')} ${o.text}` : o.text || (o.reasoning ? '(بس تفكير، بلا نص — زيد max tokens)' : '(رد فاضي)'));
          results[i] = { st: ok ? 'pass' : t.optional && !o.error ? 'warn' : 'fail', o, note: `${t.note && ok ? t.note(o) + ' · ' : ''}${snippet}`.slice(0, 220) };
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          results[i] = { st: 'fail', note: e.message };
        }
      }
      draw(null);
      const rows = await costsSince(since);
      draw(null, { cost: `كلفة الفحص ${usdPrecise(rows.reduce((a, r) => a + (r.cost || 0), 0))} · ${rows.length} طلب` });
      refreshSpend();
    } catch (e) {
      draw(null);
      if (e.name === 'AbortError') toast('انوقف الفحص'); else toast.error(e.message);
    } finally { setBusy(false); ctrl.current = null; }
  }

  const clear = () => { convo.current = []; setMsgs([]); };
  const submit = (e) => { e?.preventDefault(); const t = input.trim(); if (!t) return; setInput(''); send(t); };
  useLayoutEffect(() => { const t = ta.current; if (!t) return; t.style.height = 'auto'; t.style.height = `${Math.min(220, t.scrollHeight)}px`; }, [input]);

  const settingsPanel = (
    <SettingsPanel S={S} set={set} models={models} model={model} busy={busy} spend={spend}
      onSuite={() => { setSheet(false); runSuite(); }} onClear={clear} onImage={() => { setSheet(false); setView('chat'); send('What single color fills this image? Answer in one word.', RED_PNG); }} />
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <Card pad={false} spotlight={false} bodyClassName="flex min-h-0 flex-1 flex-col" className="flex h-[calc(100dvh-8.5rem)] min-h-[520px] flex-col overflow-hidden max-lg:h-[calc(100dvh-7.5rem)]">
        {/* header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'chat', label: 'محادثة', icon: MessagesSquare }, { value: 'suite', label: 'الفحص الشامل', icon: FlaskConical }]} />
          {model && <span className="hidden min-w-0 truncate text-[12.5px] text-muted sm:inline">{model.name} · <span className="font-mono ltr">{FORMATS.find((f) => f.value === S.format)?.label}</span>{S.route ? ' · مسار مثبّت' : ''}</span>}
          <div className="ms-auto flex items-center gap-1.5">
            {!wide && <Button variant="secondary" size="sm" icon={Settings2} onClick={() => setSheet(true)}>الإعدادات</Button>}
            {view === 'suite' && (busy ? <Button size="sm" variant="danger" icon={Square} onClick={() => ctrl.current?.abort()}>إيقاف</Button> : <Button size="sm" variant="primary" icon={suite ? RotateCcw : FlaskConical} onClick={runSuite} disabled={!S.model}>{suite ? 'أعد الفحص' : 'ابدأ الفحص'}</Button>)}
          </div>
        </div>

        {view === 'suite' ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"><SuiteView suite={suite} model={model} /></div>
        ) : (
          <>
            <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {msgs.length === 0 ? (
                <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4 }} className="relative mb-5">
                    <div className="absolute inset-0 rounded-3xl bg-accent/30 blur-2xl" />
                    <div className="relative grid size-16 place-items-center rounded-3xl grad-bg text-white"><Sparkles size={30} /></div>
                  </motion.div>
                  <h3 className="font-display text-xl font-semibold">جرّب أي نموذج متل ما بيشوفه الطالب</h3>
                  <p className="mt-2 text-sm text-muted">الطلب بيمشي بنفس طريق البوابة الحقيقي: التوجيه، الاحتياط، الترجمة بين الصيغ، والمحاسبة.</p>
                  <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                    {QUICK.map((q, i) => (
                      <motion.button key={q} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
                        onClick={() => send(q)} disabled={!S.model}
                        className="rounded-2xl border border-line bg-solid/60 px-4 py-3 text-start text-[13px] text-fg-2 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-fg hover:shadow-[var(--shadow-card)]" dir="auto">{q}</motion.button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-6">
                  {msgs.map((m) => (m.role === 'assistant'
                    ? <AssistantMsg key={m.id} m={m} onContinue={() => continueAfterTool(m.id)} />
                    : <UserMsg key={m.id} m={m} />))}
                </div>
              )}
            </div>
            {/* composer */}
            <form onSubmit={submit} className="border-t border-line p-3 sm:p-4">
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-line-strong bg-solid p-2 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--accent-2)]">
                <textarea ref={ta} rows={1} value={input} onChange={(e) => setInput(e.target.value)} dir="auto"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
                  placeholder={S.model ? 'اكتب رسالتك… (Enter للإرسال، Shift+Enter لسطر جديد)' : 'اختر نموذج أولاً'}
                  className="max-h-[220px] min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[14.5px] leading-relaxed outline-none placeholder:text-muted/70 max-sm:text-base" />
                {busy
                  ? <Button type="button" variant="danger" size="icon" onClick={() => ctrl.current?.abort()} aria-label="إيقاف"><Square size={16} /></Button>
                  : <Button type="submit" variant="primary" size="icon" disabled={!input.trim() || !S.model} aria-label="إرسال"><ArrowUp size={18} /></Button>}
              </div>
            </form>
          </>
        )}
      </Card>

      {wide ? (
        <Card title="الإعدادات" icon={Settings2} spotlight={false} className="h-fit max-h-[calc(100dvh-8.5rem)] overflow-y-auto xl:sticky xl:top-24">{settingsPanel}</Card>
      ) : (
        <Sheet open={sheet} onOpenChange={setSheet} title="إعدادات الـ Playground" width={420}>{settingsPanel}</Sheet>
      )}
    </div>
  );
}
