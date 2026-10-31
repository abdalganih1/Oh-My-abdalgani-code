// Small shared pieces for the students & coupons panels.
import { motion } from 'motion/react';
import { KeyRound, X } from 'lucide-react';
import { Button, CopyButton, cn } from '../../../ui/index.js';

const hue = (seed) => {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
};

/** Initials avatar with a stable per-person gradient. */
export function Avatar({ name, seed, size = 40, className, dim }) {
  const parts = String(name || '؟').trim().split(/\s+/).filter(Boolean);
  const initials = (parts.length > 1 ? [parts[0], parts[1]] : [parts[0] || '؟']).map((p) => [...p].find((c) => /\p{L}|\p{N}/u.test(c)) || [...p][0]).join('');
  const h = hue(seed ?? name);
  return (
    <span aria-hidden
      className={cn('relative grid shrink-0 place-items-center rounded-[34%] font-display font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_6px_16px_-8px_rgba(0,0,0,.5)]', dim && 'opacity-55 grayscale', className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, hsl(${h} 78% 60%), hsl(${(h + 48) % 360} 72% 46%))` }}>
      {initials}
    </span>
  );
}

/** One-time secret (API key, temp password): shown once, big, copyable. */
export function SecretBox({ label, value, onClose, className }) {
  if (!value) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
      className={cn('relative overflow-hidden rounded-2xl border border-warn/30 bg-warn-soft p-4', className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warn/15 text-warn"><KeyRound size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-warn">{label}</p>
          <div className="mt-2 flex items-center gap-1 rounded-xl border border-line-strong bg-solid ps-3">
            <code className="min-w-0 flex-1 select-all break-all py-2 font-mono text-[13px] text-fg ltr text-start">{value}</code>
            <CopyButton text={value} label="نسخ" className="shrink-0" />
          </div>
        </div>
        {onClose && <Button variant="ghost" size="icon-sm" aria-label="إخفاء" onClick={onClose}><X size={16} /></Button>}
      </div>
    </motion.div>
  );
}

/** Small section title inside sheets. */
export function SectionTitle({ icon: Icon, children, actions }) {
  return (
    <div className="mb-3 mt-1 flex flex-wrap items-center gap-2">
      {Icon && <Icon size={16} className="text-accent" />}
      <h3 className="font-display text-[14.5px] font-semibold">{children}</h3>
      {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** "/" focuses the given input (unless typing somewhere already). */
export function useSlashFocus(ref) {
  return (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.('input,textarea,select,[contenteditable=true],[role=dialog]')) return;
    e.preventDefault(); ref.current?.focus();
  };
}
