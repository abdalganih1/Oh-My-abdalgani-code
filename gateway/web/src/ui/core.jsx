// Core UI kit — every page builds on these. Theme comes from CSS variables (styles.css).
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { motion, useMotionValue, useSpring, animate } from 'motion/react';
import * as SwitchPrim from '@radix-ui/react-switch';
import * as TooltipPrim from '@radix-ui/react-tooltip';
import { toast } from 'sonner';
import { Check, Copy, Loader2 } from 'lucide-react';

export const cn = (...a) => clsx(...a);

// ── Button ──
const BTN = {
  base: 'relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none transition-[background,border-color,box-shadow,transform,color,opacity] duration-150 active:scale-[.97] disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  size: {
    xs: 'h-7 px-2.5 text-xs rounded-lg gap-1.5',
    sm: 'h-8 px-3 text-[13px] rounded-[10px] gap-1.5',
    md: 'h-10 px-4 text-sm rounded-xl',
    lg: 'h-12 px-6 text-[15px] rounded-2xl',
    icon: 'size-9 rounded-xl',
    'icon-sm': 'size-8 rounded-[10px]',
  },
  variant: {
    primary: 'text-white grad-bg shadow-[0_8px_24px_-8px_var(--glow),inset_0_1px_0_rgba(255,255,255,.25)] hover:shadow-[0_12px_32px_-8px_var(--glow),inset_0_1px_0_rgba(255,255,255,.3)] hover:brightness-110',
    secondary: 'bg-solid text-fg border border-line-strong shadow-[0_1px_2px_rgba(0,0,0,.04)] hover:border-accent/50 hover:bg-sunken',
    ghost: 'text-fg-2 hover:bg-sunken hover:text-fg',
    soft: 'bg-accent-soft text-accent-ink hover:bg-accent/20',
    danger: 'bg-bad-soft text-bad border border-bad/25 hover:bg-bad hover:text-white',
    outline: 'border border-line-strong text-fg hover:border-accent hover:text-accent-ink',
  },
};
export const Button = forwardRef(function Button({ variant = 'secondary', size = 'md', loading, icon: Icon, iconEnd: IconEnd, className, children, disabled, type = 'button', ...p }, ref) {
  const iconSize = size === 'xs' || size === 'sm' || size === 'icon-sm' ? 15 : 17;
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={cn(BTN.base, BTN.size[size], BTN.variant[variant], className)} {...p}>
      {loading ? <Loader2 size={iconSize} className="animate-spin" /> : Icon ? <Icon size={iconSize} strokeWidth={2} /> : null}
      {children}
      {IconEnd && !loading ? <IconEnd size={iconSize} strokeWidth={2} /> : null}
    </button>
  );
});

// ── Card (glass, cursor spotlight) ──
export function useSpotlight() {
  return useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, []);
}
export function Card({ title, icon: Icon, actions, subtitle, children, className, bodyClassName, pad = true, spotlight = true, as: As = 'section', ...p }) {
  const onMove = useSpotlight();
  return (
    <As onPointerMove={spotlight ? onMove : undefined} className={cn('glass rounded-3xl min-w-0', spotlight && 'spot', className)} {...p}>
      {(title || actions) && (
        <header className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', pad ? 'px-5 pt-5 sm:px-6' : 'px-5 pt-5', children ? 'pb-3' : 'pb-5')}>
          {title && (
            <div className="flex min-w-0 items-center gap-2.5">
              {Icon && <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Icon size={17} /></span>}
              <div className="min-w-0">
                <h2 className="font-display text-[15.5px] font-semibold leading-tight">{title}</h2>
                {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{subtitle}</p>}
              </div>
            </div>
          )}
          {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children != null && <div className={cn(pad && 'px-5 pb-5 sm:px-6', !title && !actions && pad && 'pt-5', bodyClassName)}>{children}</div>}
    </As>
  );
}

// ── Badge ──
const TONE = {
  neutral: 'bg-sunken text-fg-2 border-line',
  ok: 'bg-ok-soft text-ok border-ok/20',
  warn: 'bg-warn-soft text-warn border-warn/25',
  bad: 'bg-bad-soft text-bad border-bad/25',
  new: 'bg-new-soft text-new border-new/25',
  accent: 'bg-accent-soft text-accent-ink border-accent/25',
};
export function Badge({ tone = 'neutral', dot, pulse, className, children, ...p }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium', TONE[tone], className)} {...p}>
      {dot && <span className={cn('size-1.5 rounded-full bg-current', pulse && 'animate-pulse-soft')} />}
      {children}
    </span>
  );
}

// ── inputs ──
const FIELD = 'w-full min-w-0 rounded-xl border border-line-strong bg-solid px-3.5 text-[14px] text-fg placeholder:text-muted/70 transition-[border-color,box-shadow] hover:border-accent/40 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-2)] focus:outline-none disabled:opacity-55 max-sm:text-base';
export const inputClass = FIELD;
export const Input = forwardRef(function Input({ className, icon: Icon, mono, ...p }, ref) {
  if (!Icon) return <input ref={ref} className={cn(FIELD, 'h-10', mono && 'font-mono text-[13px] ltr', className)} {...p} />;
  return (
    <div className={cn('relative min-w-0', className)}>
      <Icon size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted start-3" />
      <input ref={ref} className={cn(FIELD, 'h-10 ps-9', mono && 'font-mono text-[13px]')} {...p} />
    </div>
  );
});
export const Textarea = forwardRef(function Textarea({ className, mono, ...p }, ref) {
  return <textarea ref={ref} className={cn(FIELD, 'min-h-[84px] py-2.5 leading-relaxed', mono && 'font-mono text-[13px] ltr', className)} {...p} />;
});
export function Field({ label, hint, error, children, className, inline }) {
  return (
    <label className={cn('flex min-w-0 gap-1.5 text-[12.5px] font-medium text-muted', inline ? 'flex-row items-center justify-between gap-3' : 'flex-col', className)}>
      {label && <span className="leading-tight">{label}</span>}
      {children}
      {hint && <span className="text-[11.5px] font-normal leading-snug text-muted/90">{hint}</span>}
      {error && <span className="text-[11.5px] font-normal text-bad">{error}</span>}
    </label>
  );
}

// ── Switch ──
export function Switch({ checked, onCheckedChange, disabled, label, className, size = 'md' }) {
  const sw = (
    <SwitchPrim.Root checked={!!checked} onCheckedChange={onCheckedChange} disabled={disabled}
      className={cn('relative shrink-0 rounded-full border border-line-strong bg-raised transition-colors data-[state=checked]:border-transparent data-[state=checked]:bg-accent disabled:opacity-50', size === 'sm' ? 'h-5 w-9' : 'h-6 w-11')}>
      <SwitchPrim.Thumb className={cn('block rounded-full bg-white shadow-md transition-transform duration-200 ease-[cubic-bezier(.3,1.4,.6,1)]', size === 'sm' ? 'size-4 translate-x-0.5 data-[state=checked]:translate-x-[18px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[18px]' : 'size-5 translate-x-0.5 data-[state=checked]:translate-x-[22px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[22px]')} />
    </SwitchPrim.Root>
  );
  if (!label) return sw;
  return <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-sm text-fg-2 select-none', className)}>{sw}<span>{label}</span></label>;
}

// ── Segmented control (animated pill) ──
let segId = 0;
export function Segmented({ value, onChange, options, size = 'md', className, full }) {
  const [id] = useState(() => `seg${++segId}`);
  return (
    <div role="tablist" className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-sunken p-1', full && 'flex w-full', className)}>
      {options.map((o) => {
        const v = typeof o === 'object' ? o.value : o, label = typeof o === 'object' ? o.label : o, Icon = o.icon;
        const on = v === value;
        return (
          <button key={v} role="tab" aria-selected={on} type="button" onClick={() => onChange(v)}
            className={cn('relative z-0 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] font-medium transition-colors', size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-[13px]', full && 'flex-1', on ? 'text-fg' : 'text-muted hover:text-fg')}>
            {on && <motion.span layoutId={id} transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} className="absolute inset-0 -z-10 rounded-[9px] bg-solid shadow-[0_1px_3px_rgba(0,0,0,.12),0_0_0_1px_var(--border)]" />}
            {Icon && <Icon size={14} />}{label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tooltip ──
export function Tip({ content, children, side = 'top' }) {
  if (!content) return children;
  return (
    <TooltipPrim.Root delayDuration={250}>
      <TooltipPrim.Trigger asChild>{children}</TooltipPrim.Trigger>
      <TooltipPrim.Portal>
        <TooltipPrim.Content side={side} sideOffset={6} className="z-[100] max-w-xs rounded-lg border border-line-strong bg-solid px-2.5 py-1.5 text-xs text-fg shadow-[var(--shadow-pop)] data-[state=delayed-open]:animate-in">
          {content}
        </TooltipPrim.Content>
      </TooltipPrim.Portal>
    </TooltipPrim.Root>
  );
}
export const TipProvider = TooltipPrim.Provider;

// ── Count-up number ──
export function CountUp({ value, format = (v) => Math.round(v).toLocaleString('en'), duration = 0.9 }) {
  const ref = useRef(null);
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const to = Number(value) || 0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = format(to); prev.current = to; return undefined; }
    const c = animate(prev.current, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => { el.textContent = format(v); } });
    prev.current = to;
    return () => c.stop();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className="num">{format(0)}</span>;
}

// ── Stat tile ──
export function Stat({ label, value, sub, icon: Icon, tone, className, children, loading }) {
  const onMove = useSpotlight();
  return (
    <div onPointerMove={onMove} className={cn('glass spot relative min-w-0 overflow-hidden rounded-2xl p-4 sm:p-5', className)}>
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
        {Icon && <Icon size={15} className="text-accent" />}{label}
      </div>
      {loading ? <div className="skeleton mt-2 h-8 w-28" /> : (
        <div className={cn('mt-1.5 font-display text-[26px] font-bold leading-tight tracking-tight num max-sm:text-[21px]', tone === 'good' && 'text-ok', tone === 'bad' && 'text-bad')}>{value}</div>
      )}
      {sub && <div className="mt-1 text-xs leading-snug text-muted">{sub}</div>}
      {children}
    </div>
  );
}

// ── Empty state ──
export function Empty({ icon: Icon, title, text, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="relative mb-2 grid size-14 place-items-center rounded-2xl border border-line bg-sunken text-accent">
          <div className="absolute inset-0 rounded-2xl bg-accent/10 blur-xl" /><Icon size={26} className="relative" />
        </div>
      )}
      {title && <div className="font-display font-semibold">{title}</div>}
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }) { return <div className={cn('skeleton', className)} />; }

export function Kbd({ children, className }) {
  return <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-sunken px-1.5 font-mono text-[10.5px] text-muted', className)}>{children}</kbd>;
}

// ── progress ──
export function Progress({ value, max = 1, tone, className }) {
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  const color = tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : null;
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-sunken', className)}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${p * 100}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className={cn('h-full rounded-full', !color && 'grad-bg')} style={color ? { background: color } : undefined} />
    </div>
  );
}
export function Ring({ value, size = 132, stroke = 11, children, className }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, value || 0));
  const id = useRef(`rg${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--brand-a)" /><stop offset="1" stopColor="var(--brand-b)" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-3)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - p) }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

// ── copy ──
export async function copyText(text, msg = 'تم النسخ') {
  try { await navigator.clipboard.writeText(text); toast.success(msg); return true; } catch { toast.error('انسخ يدوياً'); return false; }
}
export function CopyButton({ text, className, size = 'icon-sm', label }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="ghost" size={label ? 'sm' : size} className={className} aria-label="نسخ"
      onClick={async (e) => { e.stopPropagation(); if (await copyText(typeof text === 'function' ? text() : text)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}>
      {done ? <Check size={15} className="text-ok" /> : <Copy size={15} />}{label}
    </Button>
  );
}

/** Terminal-style code block with title bar + copy. */
export function CodeBlock({ code, title, className, wrap }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-line bg-[#0b0e1d] text-[#dfe3f5] shadow-[var(--shadow-card)]', className)}>
      <div className="flex h-10 items-center gap-2 border-b border-white/8 bg-white/[.03] px-3 ltr">
        <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-[#ff5f57]" /><i className="size-2.5 rounded-full bg-[#febc2e]" /><i className="size-2.5 rounded-full bg-[#28c840]" /></span>
        <span className="ms-2 truncate font-mono text-[11.5px] text-white/45">{title}</span>
        <CopyButton text={code} className="ms-auto text-white/60 hover:bg-white/10 hover:text-white" label="نسخ" />
      </div>
      <pre className={cn('overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.75] ltr', wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')}>{code}</pre>
    </div>
  );
}

/** Animated mount for page sections. */
export function Reveal({ children, delay = 0, className, as = 'div' }) {
  const C = motion[as] || motion.div;
  return (
    <C initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }} className={className}>
      {children}
    </C>
  );
}

export function Spinner({ className, size = 18 }) { return <Loader2 size={size} className={cn('animate-spin text-muted', className)} />; }

/** Smoothly follows a number (for live counters). */
export function useSmooth(v) {
  const mv = useMotionValue(v);
  const s = useSpring(mv, { stiffness: 120, damping: 20 });
  useEffect(() => { mv.set(v); }, [v, mv]);
  return s;
}
