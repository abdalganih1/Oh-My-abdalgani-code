// The model's reasoning, shown calmly:
//  • while it is thinking: open, live timer, shimmering "يفكّر…", text streams into a fixed-height
//    window that follows the newest line (unless you scroll up to read — then it stays put)
//  • when the answer starts: collapses to a one-line summary ("فكّر 6.2ث · ~340 توكن")
//  • your toggle always wins: open it and it stays open, close it and it stays closed
// The component keeps its own state, so streaming re-renders never reset it (the v2 bug).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Brain, ChevronDown } from 'lucide-react';
import { cn } from '../../../ui/index.js';
import { tokens } from '../../../lib/format.js';

export default function Thinking({ text, active, seconds }) {
  const [userOpen, setUserOpen] = useState(null); // null = follow the automatic behaviour
  const open = userOpen ?? active;
  const box = useRef(null);
  const pinned = useRef(true);
  const [now, setNow] = useState(0);
  const t0 = useRef(performance.now());

  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [active]);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && open && pinned.current) el.scrollTop = el.scrollHeight;
  }, [text, open]);

  const elapsed = active ? (now ? (now - t0.current) / 1000 : 0) : seconds;
  const approxTok = Math.max(1, Math.round(text.length / 4));

  return (
    <div className={cn('overflow-hidden rounded-2xl border transition-colors', active ? 'border-accent/30 bg-accent-soft/40' : 'border-line bg-sunken/50')}>
      <button type="button" data-think onClick={() => setUserOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start text-[13px]">
        <span className={cn('relative grid size-7 shrink-0 place-items-center rounded-lg', active ? 'bg-accent text-white' : 'bg-raised text-muted')}>
          <Brain size={15} />
          {active && <span className="absolute inset-0 animate-ping rounded-lg bg-accent/40" />}
        </span>
        {active
          ? <span className="shimmer-text font-medium">النموذج عم يفكّر…</span>
          : <span className="font-medium text-fg-2">تفكير النموذج</span>}
        <span className="num text-xs text-muted ltr">{elapsed != null ? `${elapsed.toFixed(1)}s` : ''} · ~{tokens(approxTok)} tok</span>
        <ChevronDown size={16} className={cn('ms-auto text-muted transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <div ref={box} onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
              className="relative max-h-72 overflow-y-auto border-t border-line/70 px-4 py-3">
              <div dir="auto" className={cn('whitespace-pre-wrap border-s-2 border-accent/40 ps-3 text-[12.8px] leading-[1.8] text-muted', active && 'caret')}>{text}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
