// Logged-out landing: marketing hero (typing terminal, bento features, tool marquee) + auth card
// (login / register with optional Cloudflare Turnstile / API-key login) — same API calls as legacy.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { Toaster } from 'sonner';
import { ArrowLeft, AtSign, Gauge, Globe, KeyRound, Lock, PieChart, ShieldCheck, Shuffle, Sparkles, User } from 'lucide-react';
import { Button, Input, Logo, Segmented, ThemeButton, TipProvider, cn, toast, useSpotlight } from '../ui/index.js';
import { useMedia } from '../lib/hooks.js';
import { store } from '../lib/store.js';
import { TOKEN_KEY } from './ctx.js';

// ── typing terminal (same script as legacy) ──
const TERM = [
  ['p', '$ ', 'curl -fsSL https://api.abdalgani.com/install.sh | bash -s -- --tool OpenCode'],
  ['dim', '', '→ installing OpenCode v2 … done'],
  ['ok', '✓ ', 'connected to abdalgani gateway'],
  ['ok', '✓ ', 'models synced: abd-main · abd-fast · abd-think'],
  ['ok', '✓ ', 'Arabic pack: /ar /en'],
  ['p', '$ ', 'abdalgani-setup --status'],
  ['hl', '', 'abd-main → glm-5.2   balance $9.84   cap $5/day'],
];
const TERM_CLS = { p: 'text-[#7ee0f5]', dim: 'text-white/40', ok: 'text-[#3ddc97]', hl: 'rounded-md bg-[#7457ff]/25 px-1.5 py-0.5 text-[#d9d2ff]' };
const TOOLS = ['OpenCode', 'Hermes', 'pi', 'Claude Code', 'Codex', 'Kilo', 'Qwen Code', 'Goose', 'Aider', 'OpenClaw', 'Kimi', 'EH Code', 'GLM', 'OpenRouter', 'NVIDIA', 'Anthropic', 'OpenAI'];

function useTyping(reduce) {
  const [st, setSt] = useState({ done: reduce ? TERM.length : 0, typing: 0 });
  useEffect(() => {
    if (reduce) { setSt({ done: TERM.length, typing: 0 }); return undefined; }
    let i = 0, c = 0, t;
    const tick = () => {
      if (document.hidden) { t = setTimeout(tick, 600); return; }
      const [cls, , txt] = TERM[i];
      if (cls === 'p' && c < txt.length) { c += 2; setSt({ done: i, typing: c }); t = setTimeout(tick, 28); return; }
      i += 1; c = 0; setSt({ done: i, typing: 0 });
      if (i < TERM.length) t = setTimeout(tick, cls === 'p' ? 380 : 260);
      else t = setTimeout(() => { i = 0; setSt({ done: 0, typing: 0 }); t = setTimeout(tick, 250); }, 5200);
    };
    t = setTimeout(tick, 500);
    return () => clearTimeout(t);
  }, [reduce]);
  return st;
}

function TermLine({ l, partial }) {
  const [cls, pre, txt] = l;
  return (
    <div className="min-h-[1.85em] whitespace-pre-wrap break-all">
      <span className={TERM_CLS[cls]}>{pre}</span>
      {cls === 'p' ? <span className={cn(partial != null && 'caret')}>{partial != null ? txt.slice(0, partial) : txt}</span> : <span className={TERM_CLS[cls]}>{txt}</span>}
    </div>
  );
}

function Terminal({ reduce, rx, ry }) {
  const { done, typing } = useTyping(reduce);
  const cur = TERM[done];
  return (
    <motion.div style={{ rotateX: rx, rotateY: ry, transformPerspective: 1100 }} className="relative" aria-hidden>
      {/* layered ghost panes for depth */}
      <div className="absolute inset-x-6 -bottom-3 top-6 rounded-3xl border border-white/5 bg-[#141a3a]/60 blur-[1px] [transform:translateZ(-40px)]" />
      <div className="absolute inset-x-12 -bottom-6 top-12 rounded-3xl border border-white/5 bg-[#141a3a]/35 [transform:translateZ(-80px)]" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#080b1a]/95 text-[#dfe3f5] shadow-[0_40px_120px_-30px_rgba(80,60,255,.55),inset_0_1px_0_rgba(255,255,255,.06)]">
        <div className="pointer-events-none absolute -top-24 left-1/3 h-48 w-72 rounded-full bg-[#7457ff]/25 blur-3xl" />
        <div className="relative flex h-10 items-center gap-2 border-b border-white/8 bg-white/[.03] px-4 ltr">
          <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-[#ff5f57]" /><i className="size-2.5 rounded-full bg-[#febc2e]" /><i className="size-2.5 rounded-full bg-[#28c840]" /></span>
          <span className="ms-2 font-mono text-[11.5px] text-white/45">~ terminal</span>
          <span className="ms-auto flex items-center gap-1.5 font-mono text-[10.5px] text-[#3ddc97]/80"><i className="size-1.5 animate-pulse-soft rounded-full bg-[#3ddc97]" />live</span>
        </div>
        <div className="relative min-h-[15.5em] p-4 font-mono text-[12px] leading-[1.85] ltr sm:p-5 sm:text-[12.5px]">
          {TERM.slice(0, done).map((l, i) => <TermLine key={i} l={l} />)}
          {cur && cur[0] === 'p' && typing > 0 ? <TermLine l={cur} partial={typing} /> : <span className="caret" />}
        </div>
      </div>
    </motion.div>
  );
}

// ── bento feature tiles ──
function Tile({ icon: Icon, title, text, className, children, delay = 0 }) {
  const onMove = useSpotlight();
  return (
    <motion.div onPointerMove={onMove} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn('glass spot group relative overflow-hidden rounded-3xl p-5', className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-ink ring-1 ring-accent/20 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"><Icon size={19} /></span>
        <div className="min-w-0">
          <h3 className="font-display text-[15.5px] font-semibold">{title}</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{text}</p>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </motion.div>
  );
}

function AliasViz() {
  return (
    <div className="flex flex-col gap-2 ltr" aria-hidden>
      {['abd-main', 'abd-fast', 'abd-think'].map((a, i) => (
        <div key={a} className="flex items-center gap-2">
          <span className="w-[86px] shrink-0 rounded-lg border border-line bg-solid/70 px-2 py-1 text-center font-mono text-[11.5px]">{a}</span>
          <span className="relative h-px flex-1 overflow-hidden bg-line-strong">
            <motion.i className="absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-accent to-transparent" initial={{ x: '-40px' }} animate={{ x: '400px' }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }} />
          </span>
          <span className="h-6 w-20 shrink-0 rounded-lg skeleton opacity-80" />
        </div>
      ))}
    </div>
  );
}
function CapViz() {
  return (
    <div aria-hidden>
      <div className="mb-1.5 flex justify-between text-[11.5px] text-muted"><span className="num ltr">$1.20 / $5.00</span><span>اليوم</span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
        <motion.div className="h-full rounded-full grad-bg" initial={{ width: 0 }} whileInView={{ width: '24%' }} viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} />
      </div>
    </div>
  );
}
function ArViz() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b0e1d] px-3 py-2 font-mono text-[11.5px] text-[#dfe3f5]" aria-hidden>
      <div className="ltr text-start"><span className="text-[#7ee0f5]">&gt; </span>/ar</div>
      <div className="mt-0.5 font-sans text-[12.5px] text-[#c8b8ff]" dir="rtl">أهلاً! شو بدك نبرمج اليوم؟</div>
    </div>
  );
}
function SpendViz() {
  const v = [38, 64, 30, 82, 52, 70, 44, 90, 58];
  return (
    <div className="flex h-14 items-end gap-1.5 ltr" aria-hidden>
      {v.map((h, i) => (
        <motion.span key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-[var(--brand-a)]/40 to-[var(--brand-b)]" initial={{ height: 4 }} whileInView={{ height: `${h}%` }}
          viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }} />
      ))}
    </div>
  );
}

function NewViz() {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      {[['new', 'جديد'], ['ok', 'متاح'], ['warn', 'قديم']].map(([t, l], i) => (
        <motion.span key={t} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 * i }}
          className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium',
            t === 'new' ? 'border-new/25 bg-new-soft text-new' : t === 'ok' ? 'border-ok/20 bg-ok-soft text-ok' : 'border-warn/25 bg-warn-soft text-warn')}>
          <i className={cn('size-1.5 rounded-full bg-current', t === 'new' && 'animate-pulse-soft')} />{l}
        </motion.span>
      ))}
    </div>
  );
}

// ── auth ──
const AUTH_TEXT = {
  login: ['أهلاً فيك 👋', 'سجّل دخولك لتشوف رصيدك ونماذجك.'],
  register: ['خلّينا نبلّش ✨', 'حساب مجاني بدقيقة، وبعدها بتشحنه بكود التفعيل.'],
  key: ['دخول بمفتاح', 'الصق مفتاح API تبعك.'],
};
async function authPost(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}
const fd = (f) => Object.fromEntries(new FormData(f).entries());

function AuthCard({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const turnstile = useRef('');
  const formsRef = useRef(null);

  useEffect(() => {
    let off = false;
    fetch('/api/auth/config').then((r) => r.json()).then((c) => {
      if (off) return;
      setCfg(c);
      if (c.turnstile_site_key) {
        window.onTurnstile = (t) => { turnstile.current = t; };
        if (!document.querySelector('script[data-turnstile]')) {
          const sc = document.createElement('script');
          sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; sc.async = true; sc.dataset.turnstile = '1';
          document.head.appendChild(sc);
        }
      }
    }).catch(() => { /* offline */ });
    return () => { off = true; };
  }, []);

  const pick = (m) => {
    setMode(m);
    setTimeout(() => formsRef.current?.querySelector(`form[data-a="${m}"] input:not([type=hidden])`)?.focus(), 60);
  };
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const onLogin = (e) => { e.preventDefault(); const f = e.currentTarget; run(async () => { const r = await authPost('/api/auth/login', fd(f)); store.set(TOKEN_KEY, r.session); await onAuthed(); }); };
  const onRegister = (e) => {
    e.preventDefault(); const f = e.currentTarget;
    run(async () => {
      const r = await authPost('/api/auth/register', { ...fd(f), turnstile: turnstile.current });
      if (r.pending) { toast.success('تم التسجيل ✅ حسابك بانتظار موافقة المدرّس'); return; }
      store.set(TOKEN_KEY, r.session); await onAuthed();
      setTimeout(() => toast.success('أهلاً! اتّبع الخطوات بأول الصفحة 👆'), 400);
    });
  };
  const onKey = (e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('key'); run(async () => { store.set(TOKEN_KEY, String(v).trim()); await onAuthed(); }); };

  const closed = cfg?.signup_mode === 'closed';
  const tabs = [{ value: 'login', label: 'دخول' }, ...(closed ? [] : [{ value: 'register', label: 'حساب جديد' }]), { value: 'key', label: 'مفتاح API' }];
  const [title, hint] = AUTH_TEXT[mode];

  return (
    <div className="relative">
      {/* glowing animated rim */}
      <div className="pointer-events-none absolute -inset-px overflow-hidden rounded-[30px] opacity-80" aria-hidden>
        <div className="absolute inset-[-60%] animate-spin-slow bg-[conic-gradient(from_0deg,transparent_0deg,var(--brand-a)_60deg,transparent_120deg,transparent_180deg,var(--brand-b)_240deg,transparent_300deg)]" />
      </div>
      <div className="pointer-events-none absolute -inset-8 -z-10 rounded-[40px] bg-[radial-gradient(closest-side,var(--glow),transparent)] blur-2xl" aria-hidden />
      <div id="auth" ref={formsRef} className="relative rounded-[29px] border border-line bg-solid/90 p-6 shadow-[var(--shadow-pop)] backdrop-blur-xl sm:p-7">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <h2 className="font-display text-[22px] font-bold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{hint}</p>
          </motion.div>
        </AnimatePresence>
        <Segmented full value={mode} onChange={pick} options={tabs} className="mb-5 mt-5" />

        <form data-a="login" hidden={mode !== 'login'} onSubmit={onLogin} className="flex flex-col gap-3" autoComplete="on">
          <Input icon={AtSign} name="email" type="email" placeholder="الإيميل" autoComplete="email" required aria-label="الإيميل" />
          <Input icon={Lock} name="password" type="password" placeholder="كلمة السر" autoComplete="current-password" required aria-label="كلمة السر" />
          <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={busy && mode === 'login'} iconEnd={ArrowLeft}>دخول</Button>
        </form>

        <form data-a="register" hidden={mode !== 'register'} onSubmit={onRegister} className="flex flex-col gap-3" autoComplete="on">
          <Input icon={User} name="name" placeholder="اسمك" autoComplete="name" required aria-label="اسمك" />
          <Input icon={AtSign} name="email" type="email" placeholder="الإيميل" autoComplete="email" required aria-label="الإيميل" />
          <Input icon={Lock} name="password" type="password" placeholder="كلمة سر (8 أحرف على الأقل)" autoComplete="new-password" minLength={8} required aria-label="كلمة السر" />
          {cfg?.turnstile_site_key && <div className="cf-turnstile min-h-[65px]" data-sitekey={cfg.turnstile_site_key} data-callback="onTurnstile" />}
          <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={busy && mode === 'register'} iconEnd={ArrowLeft}>إنشاء حساب</Button>
          <ol className="mt-2 flex flex-col gap-2 rounded-2xl border border-line bg-sunken/60 p-3.5 text-[13px] text-fg-2">
            {[<>بتعمل حسابك هون (مجاني، بدون رصيد)</>, <>بتعمل مفتاح API لحالك من اللوحة</>, <>بتاخد <b>كود تفعيل</b> من المدرّس وبتشحن فيه</>].map((t, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-lg grad-bg font-display text-[12px] font-bold text-white">{i + 1}</span><span>{t}</span>
              </li>
            ))}
          </ol>
        </form>

        <form data-a="key" hidden={mode !== 'key'} onSubmit={onKey} className="flex flex-col gap-3">
          <Input icon={KeyRound} name="key" mono placeholder="sk-abd-..." autoComplete="off" required aria-label="مفتاح API" />
          <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" loading={busy && mode === 'key'} iconEnd={ArrowLeft}>دخول</Button>
          <p className="text-[12.5px] text-muted">إذا عندك مفتاح قديم من المدرّس بتقدر تدخل فيه مباشرة.</p>
        </form>

        <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ok" />بياناتك محمية: كلمات السر مشفّرة، ومفاتيحك ما بتنحفظ إلا كبصمة.
        </p>
      </div>
    </div>
  );
}

export default function Landing({ onAuthed }) {
  const reduce = useReducedMotion();
  const fine = useMedia('(pointer: fine) and (min-width: 1024px)');
  const live = fine && !reduce;
  const mx = useMotionValue(0), my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 }), sy = useSpring(my, { stiffness: 60, damping: 18 });
  const rx = useTransform(sy, [-0.5, 0.5], [7, -7]), ry = useTransform(sx, [-0.5, 0.5], [-9, 9]);
  const orbX = useTransform(sx, [-0.5, 0.5], [-40, 40]), orbY = useTransform(sy, [-0.5, 0.5], [-30, 30]);
  const orb2X = useTransform(sx, [-0.5, 0.5], [30, -30]);
  const onMove = (e) => { if (!live) return; mx.set(e.clientX / window.innerWidth - 0.5); my.set(e.clientY / window.innerHeight - 0.5); };

  return (
    <TipProvider>
      <div className="grain relative min-h-dvh overflow-x-clip" onPointerMove={onMove}>
        <div className="nebula" aria-hidden><i /><b /></div>
        {/* parallax glow orbs */}
        <motion.div aria-hidden style={live ? { x: orbX, y: orbY } : undefined} className="pointer-events-none absolute -top-40 start-[-10%] -z-0 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,var(--mesh-1),transparent)] blur-2xl" />
        <motion.div aria-hidden style={live ? { x: orb2X } : undefined} className="pointer-events-none absolute end-[-8%] top-[30%] -z-0 h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,var(--mesh-2),transparent)] blur-2xl" />

        <header className="relative z-10 mx-auto flex max-w-[1240px] items-center gap-3 px-4 pt-5 sm:px-6">
          <a href="/" className="flex items-center gap-3">
            <Logo size={40} />
            <span className="leading-tight">
              <span className="block font-display text-[16px] font-bold tracking-tight">abdalgani AI</span>
              <span className="block text-[11.5px] text-muted">بوابة الذكاء الاصطناعي للطلاب</span>
            </span>
          </a>
          <div className="ms-auto flex items-center gap-2">
            <span className="hidden sm:block"><Button variant="ghost" size="sm" onClick={() => document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>دخول</Button></span>
            <ThemeButton />
          </div>
        </header>

        <main className="relative z-10 mx-auto grid max-w-[1240px] gap-x-12 gap-y-10 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:pt-16">
          {/* pitch */}
          <section className="min-w-0 lg:col-start-1 lg:row-start-1">
            <motion.a href="#auth" onClick={(e) => { e.preventDefault(); document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="glass inline-flex max-w-full items-center gap-2 rounded-full py-1 pe-3.5 ps-1 text-[12.5px] text-fg-2 transition-colors hover:text-fg">
              <span className="inline-flex items-center gap-1 rounded-full grad-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-white"><Sparkles size={12} />جديد</span>
              <span className="truncate">نماذج جديدة بتنضاف تلقائياً أول ما تنزل</span>
            </motion.a>

            <motion.h1 initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.9, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 font-display text-[clamp(2.6rem,7.4vw,5.4rem)] font-bold leading-[1.08] tracking-tight">
              كل نماذج البرمجة
              <br />
              <span className="relative inline-block">
                <span aria-hidden className="absolute inset-0 grad-text opacity-60 blur-2xl">بمفتاح واحد.</span>
                <span className="relative grad-text">بمفتاح واحد.</span>
              </span>
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.18 }}
              className="mt-6 max-w-[620px] text-[16px] leading-[1.85] text-fg-2 sm:text-[17px]">
              مفتاح واحد بيشتغل مع <span className="ltr">OpenCode</span> و<span className="ltr">Hermes</span> و<span className="ltr">pi</span> و<span className="ltr">Claude Code</span> و<span className="ltr">Codex</span> وغيرهم. وبتشوف بالضبط وين راح كل سنت من رصيدك، وبتبدّل بين النماذج بضغطة بدون ما تعيد تثبيت شي.
            </motion.p>
          </section>

          {/* auth */}
          <motion.aside initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.8, delay: 0.15 }}
            className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <AuthCard onAuthed={onAuthed} />
          </motion.aside>

          <section className="min-w-0 lg:col-start-1 lg:row-start-2">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.3, ease: [0.16, 1, 0.3, 1] }} className="max-w-[680px]">
              <Terminal reduce={reduce} rx={live ? rx : 0} ry={live ? ry : 0} />
            </motion.div>
          </section>

          {/* bento */}
          <section className="grid min-w-0 gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4" aria-label="المزايا">
            <Tile icon={Shuffle} title="بدّل بضغطة" text="أسماء ثابتة بأدواتك، وبتشوف النموذج الحقيقي ورا كل اسم" className="sm:col-span-2"><AliasViz /></Tile>
            <Tile icon={Gauge} title="سقف بإيدك" text="حد يومي بيحمي رصيدك من الحلقات والمفاتيح المسروقة" delay={0.05}><CapViz /></Tile>
            <Tile icon={Globe} title="عربي بالتيرمينال" text={<>الأمر <span className="font-mono ltr">/ar</span> بيخلي أي أداة تحكي عربي</>} delay={0.1}><ArViz /></Tile>
            <Tile icon={PieChart} title="وين راح كل سنت" text="بتشوف استهلاكك يوم بيوم، وكل نموذج قديش أخد من رصيدك" className="sm:col-span-2" delay={0.15}><SpendViz /></Tile>
            <Tile icon={Sparkles} title="الجديد أول ما ينزل" text={<>نماذج جديدة بتنضاف تلقائياً، وبتجرّبها كـ <span className="font-mono ltr">abd-main</span> بضغطة</>} className="sm:col-span-2" delay={0.2}><NewViz /></Tile>
          </section>
        </main>

        {/* tool marquee */}
        <div className="relative z-10 mx-auto max-w-[1240px] px-4 pb-12 sm:px-6" aria-hidden>
          <p className="mb-3 text-center text-[12px] text-muted">بيشتغل مع أدواتك المفضّلة</p>
          <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]" dir="ltr">
            <div className="flex w-max animate-[marquee_38s_linear_infinite] hover:[animation-play-state:paused]">
              {[...TOOLS, ...TOOLS].map((t, i) => (
                <span key={i} className="glass mx-1.5 whitespace-nowrap rounded-full px-4 py-1.5 font-display text-[13px] font-medium text-fg-2">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Toaster position="top-center" dir="rtl" richColors closeButton toastOptions={{ style: { borderRadius: 16, fontFamily: 'var(--font-sans)' } }}
        theme={document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'} />
    </TipProvider>
  );
}
