// Overlays: searchable Select (combobox), Modal, Confirm, Sheet (side drawer).
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as DialogPrim from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Button, Input, cn } from './core.jsx';

/**
 * Select — a searchable dropdown.
 * options: [{ value, label, hint?, icon?, disabled?, group? }] or strings.
 * Search box shows when there are more than 7 options (or searchable={true}).
 */
export function Select({ value, onChange, options = [], placeholder = 'اختر…', className, size = 'md', searchable, disabled, mono, align = 'start', renderValue, 'aria-label': ariaLabel, emptyText = 'ما في نتائج' }) {
  const [open, setOpen] = useState(false);
  const opts = useMemo(() => options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) })), [options]);
  const cur = opts.find((o) => String(o.value) === String(value ?? ''));
  const showSearch = searchable ?? opts.length > 7;
  const groups = useMemo(() => {
    const m = new Map();
    for (const o of opts) { const g = o.group || ''; if (!m.has(g)) m.set(g, []); m.get(g).push(o); }
    return [...m.entries()];
  }, [opts]);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button type="button" aria-label={ariaLabel}
          className={cn('group inline-flex w-full min-w-0 items-center gap-2 rounded-xl border border-line-strong bg-solid px-3.5 text-start text-fg transition-[border-color,box-shadow] hover:border-accent/40 focus-visible:border-accent focus-visible:shadow-[0_0_0_4px_var(--accent-2)] focus-visible:outline-none disabled:opacity-55 data-[state=open]:border-accent data-[state=open]:shadow-[0_0_0_4px_var(--accent-2)]',
            size === 'sm' ? 'h-8 rounded-[10px] text-[13px]' : 'h-10 text-[14px] max-sm:text-base', className)}>
          {cur?.icon && <cur.icon size={15} className="shrink-0 text-muted" />}
          <span className={cn('min-w-0 flex-1 truncate', !cur && 'text-muted', mono && 'font-mono text-[12.5px] ltr text-start')}>{cur ? (renderValue ? renderValue(cur) : cur.label) : placeholder}</span>
          <ChevronDown size={16} className="shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-accent" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align={align} sideOffset={6} collisionPadding={12}
          className="z-[90] w-[var(--radix-popover-trigger-width)] min-w-[220px] max-w-[min(92vw,460px)] overflow-hidden rounded-2xl border border-line-strong bg-solid shadow-[var(--shadow-pop)] origin-[var(--radix-popover-content-transform-origin)] data-[state=open]:animate-[pop_.16s_ease-out]">
          <Command loop filter={(v, s, kw) => ((v + ' ' + (kw || []).join(' ')).toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
            {showSearch && (
              <div className="flex items-center gap-2 border-b border-line bg-sunken/60 px-3">
                <Search size={15} className="shrink-0 text-muted" />
                <Command.Input autoFocus placeholder="ابحث…" className="h-11 w-full bg-transparent text-[14px] outline-none placeholder:text-muted/70 max-sm:text-base" />
              </div>
            )}
            <Command.List className="max-h-[min(340px,50vh)] overflow-y-auto overscroll-contain p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{emptyText}</Command.Empty>
              {groups.map(([g, items]) => (
                <Command.Group key={g || '_'} heading={g || undefined} className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted">
                  {items.map((o) => {
                    const on = String(o.value) === String(value ?? '');
                    return (
                      <Command.Item key={String(o.value)} value={`${o.label} ${o.value}`} keywords={[o.hint || '']} disabled={o.disabled}
                        onSelect={() => { onChange?.(o.value); setOpen(false); }}
                        className={cn('flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-[13.5px] text-fg-2 outline-none data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-45 data-[selected=true]:bg-accent-soft data-[selected=true]:text-fg max-sm:min-h-11', on && 'font-semibold text-accent-ink')}>
                        {o.icon && <o.icon size={15} className="shrink-0 text-muted" />}
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate', mono && 'font-mono text-[12.5px] ltr text-start')}>{o.label}</span>
                          {o.hint && <span className="block truncate text-[11.5px] font-normal text-muted">{o.hint}</span>}
                        </span>
                        {on && <Check size={15} className="shrink-0 text-accent" />}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ── Modal ──
const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
export function Modal({ open, onOpenChange, title, description, icon: Icon, children, footer, size = 'md', className }) {
  return (
    <DialogPrim.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrim.Portal forceMount>
            <DialogPrim.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-[80] bg-[rgba(4,6,16,.55)] backdrop-blur-[6px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </DialogPrim.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[81] grid place-items-center p-3 sm:p-6 max-sm:items-end max-sm:p-0">
              <DialogPrim.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
                <motion.div
                  initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }}
                  className={cn('pointer-events-auto flex max-h-[min(92dvh,900px)] w-full flex-col overflow-hidden rounded-3xl border border-line-strong bg-solid shadow-[var(--shadow-pop)] max-sm:max-h-[94dvh] max-sm:rounded-b-none', SIZES[size], className)}>
                  <div className="flex items-start gap-3 px-5 pb-3 pt-5 sm:px-6">
                    {Icon && <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-ink"><Icon size={19} /></span>}
                    <div className="min-w-0 flex-1">
                      <DialogPrim.Title className="font-display text-lg font-semibold leading-snug">{title}</DialogPrim.Title>
                      {description ? <DialogPrim.Description className="mt-1 text-[13px] leading-relaxed text-muted">{description}</DialogPrim.Description> : <DialogPrim.Description className="sr-only">{typeof title === 'string' ? title : ''}</DialogPrim.Description>}
                    </div>
                    <DialogPrim.Close asChild><Button variant="ghost" size="icon-sm" aria-label="إغلاق"><X size={17} /></Button></DialogPrim.Close>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
                  {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sunken/50 px-5 py-3.5 sm:px-6">{footer}</div>}
                </motion.div>
              </DialogPrim.Content>
            </div>
          </DialogPrim.Portal>
        )}
      </AnimatePresence>
    </DialogPrim.Root>
  );
}

// ── Confirm (promise based) ──
const ConfirmCtx = createContext(null);
export function ConfirmProvider({ children }) {
  const [st, setSt] = useState(null);
  const resolver = useRef(null);
  const [typed, setTyped] = useState('');
  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolver.current = resolve; setTyped('');
    setSt(typeof opts === 'string' ? { title: opts } : opts);
  }), []);
  const close = (v) => { resolver.current?.(v); resolver.current = null; setSt(null); };
  const blocked = st?.requireText && typed.trim() !== st.requireText;
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!st} onOpenChange={(o) => { if (!o) close(false); }} title={st?.title} description={st?.description} size="sm" icon={st?.icon}
        footer={<>
          <Button variant="ghost" onClick={() => close(false)}>{st?.cancelText || 'إلغاء'}</Button>
          <Button variant={st?.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)}>{st?.confirmText || 'تأكيد'}</Button>
        </>}>
        {st?.body}
        {st?.requireText && (
          <div className="mt-1 space-y-2">
            <p className="text-[13px] text-muted">للتأكيد اكتب <b className="font-mono text-fg ltr">{st.requireText}</b></p>
            <Input mono autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !blocked) close(true); }} />
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ── Sheet (side drawer, used for record details) ──
export function Sheet({ open, onOpenChange, title, description, children, footer, width = 520 }) {
  return (
    <DialogPrim.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrim.Portal forceMount>
            <DialogPrim.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-[80] bg-[rgba(4,6,16,.45)] backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </DialogPrim.Overlay>
            <DialogPrim.Content asChild forceMount>
              <motion.aside
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', bounce: 0, duration: 0.42 }}
                style={{ width: `min(${width}px, 100vw)` }}
                className="fixed inset-y-0 left-0 z-[81] flex flex-col border-e border-line-strong bg-solid shadow-[var(--shadow-pop)]">
                <div className="flex items-start gap-3 border-b border-line px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <DialogPrim.Title className="font-display text-lg font-semibold">{title}</DialogPrim.Title>
                    <DialogPrim.Description className={description ? 'mt-0.5 text-[13px] text-muted' : 'sr-only'}>{description || ''}</DialogPrim.Description>
                  </div>
                  <DialogPrim.Close asChild><Button variant="ghost" size="icon-sm" aria-label="إغلاق"><X size={17} /></Button></DialogPrim.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
                {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken/50 px-5 py-3">{footer}</div>}
              </motion.aside>
            </DialogPrim.Content>
          </DialogPrim.Portal>
        )}
      </AnimatePresence>
    </DialogPrim.Root>
  );
}
