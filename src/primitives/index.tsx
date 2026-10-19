/**
 * Primitives — small, accessible, token-styled building blocks.
 * Production may swap Popover/Menu/Dialog internals for Radix UI primitives
 * without changing these props.
 */
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ── Button ──────────────────────────────────────────────────────────────────

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  /** shows a spinner and blocks clicks */
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-label font-medium transition-colors duration-100',
        size === 'sm' ? 'h-6 px-2' : 'h-7 px-3',
        variant === 'primary' && 'bg-accent text-on-accent hover:brightness-110 active:brightness-95',
        variant === 'secondary' && 'bg-field text-ink hover:bg-[color:var(--line)] active:brightness-95',
        variant === 'ghost' && 'text-ink-muted hover:bg-field hover:text-ink',
        (disabled || loading) && 'pointer-events-none opacity-45',
        className,
      )}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="animate-spin">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // required: becomes aria-label and tooltip
  active?: boolean;
  shortcut?: string;
  tipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export function IconButton({ label, active, shortcut, className, children, tipSide = 'bottom', ...rest }: IconButtonProps) {
  return (
    <Tip label={label} shortcut={shortcut} side={tipSide}>
      <button
        {...rest}
        aria-label={label}
        aria-pressed={active === undefined ? undefined : active}
        className={cx(
          'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-100',
          active ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-field hover:text-ink',
          rest.disabled && 'pointer-events-none opacity-40',
          className,
        )}
      >
        {children}
      </button>
    </Tip>
  );
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

export function Tip({ label, shortcut, side = 'bottom', children, delay = 450 }: {
  label: React.ReactNode;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>();
  const id = useId();
  const show = () => { clearTimeout(t.current); t.current = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(t.current); setOpen(false); };
  useEffect(() => () => clearTimeout(t.current), []);
  const pos = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }[side];
  return (
    <span className="relative inline-flex" onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide} onPointerDown={hide}>
      {React.cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {open && (
        <span role="tooltip" id={id} className={cx('lg-pop-in pointer-events-none absolute z-50 flex items-center gap-2 whitespace-nowrap rounded-md bg-surface px-2 py-1 text-caption text-ink shadow-pop', pos)}>
          {label}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </span>
      )}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-sm border border-line px-1 font-sans text-[10px] leading-[14px] text-ink-faint">{children}</kbd>;
}

// ── Segmented control ───────────────────────────────────────────────────────

export interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string; disabled?: boolean }[];
  onChange(v: T): void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md', className }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    let j = i;
    do j = (j + d + options.length) % options.length; while (options[j].disabled && j !== i);
    onChange(options[j].value);
    refs.current[j]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-md bg-field p-0.5', className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => (refs.current[i] = el)}
            role="radio"
            aria-checked={on}
            title={o.title}
            disabled={o.disabled}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors duration-100',
              size === 'sm' ? 'h-5 px-2 text-caption' : 'h-6 px-2.5 text-label',
              on ? 'bg-ground text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-ink-muted hover:text-ink',
              o.disabled && 'opacity-40',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Switch ──────────────────────────────────────────────────────────────────

export function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange(v: boolean): void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors duration-150',
        checked ? 'border-accent bg-accent' : 'border-line-strong bg-transparent',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      <span className={cx('absolute h-3 w-3 rounded-full transition-transform duration-150', checked ? 'translate-x-[15px] bg-on-accent' : 'translate-x-[2px] bg-ink-muted')} />
    </button>
  );
}

// ── Popover & Menu ─────────────────────────────────────────────────────────

/** Closes on outside pointerdown or Escape. Positioned by the caller via className/style. */
export function Popover({ open, onClose, children, className, style, label }: {
  open: boolean;
  onClose(): void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current(); } };
    const t = setTimeout(() => document.addEventListener('pointerdown', down), 0);
    document.addEventListener('keydown', key, true);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key, true); };
  }, [open]);
  if (!open) return null;
  return (
    <div ref={ref} role="dialog" aria-label={label} className={cx('lg-pop-in absolute z-40 rounded-lg bg-surface p-1 shadow-pop', className)} style={style}>
      {children}
    </div>
  );
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  separatorBefore?: boolean;
  onSelect?(): void;
}

/** Keyboard-navigable menu list; used by context menus and dropdowns. */
export function MenuList({ items, onClose, autoFocus = true, label }: { items: MenuItem[]; onClose(): void; autoFocus?: boolean; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (autoFocus) refs.current.find((r, i) => r && !items[i].disabled)?.focus();
  }, [autoFocus]);
  const move = (from: number, d: number) => {
    let j = from;
    for (let k = 0; k < items.length; k++) {
      j = (j + d + items.length) % items.length;
      if (!items[j].disabled) break;
    }
    refs.current[j]?.focus();
  };
  return (
    <div role="menu" aria-label={label} className="min-w-[188px]">
      {items.map((it, i) => (
        <React.Fragment key={it.id}>
          {it.separatorBefore && <div role="separator" className="mx-1 my-1 h-px bg-line" />}
          <button
            ref={(el) => (refs.current[i] = el)}
            role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={it.checked}
            aria-disabled={it.disabled || undefined}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
              if (e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              if (e.key === 'Tab') onClose();
            }}
            onClick={() => { if (it.disabled) return; it.onSelect?.(); onClose(); }}
            className={cx(
              'focus-inset flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-body outline-none',
              it.disabled ? 'text-ink-faint opacity-60' : it.danger ? 'text-danger hover:bg-field focus:bg-field' : 'text-ink hover:bg-field focus:bg-field',
            )}
          >
            <span className="flex w-4 justify-center text-ink-muted">{it.checked ? <Check /> : it.icon}</span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.shortcut && <span className="text-caption text-ink-faint">{it.shortcut}</span>}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

const Check = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** A context menu anchored at client coordinates, clamped inside its positioned container. */
export function ContextMenu({ at, items, onClose, container, label }: {
  at: { x: number; y: number } | null;
  items: MenuItem[];
  onClose(): void;
  container: React.RefObject<HTMLElement>;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!at || !container.current || !ref.current) return setPos(null);
    const box = container.current.getBoundingClientRect();
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    setPos({ left: Math.min(at.x - box.left, box.width - w - 6), top: Math.min(at.y - box.top, box.height - h - 6) });
  }, [at, container]);
  if (!at) return null;
  return (
    <Popover open onClose={onClose} label={label} className="!absolute" style={pos ?? { left: -9999, top: 0 }}>
      <div ref={ref}>
        <MenuList items={items} onClose={onClose} label={label} />
      </div>
    </Popover>
  );
}

// ── Dialog ─────────────────────────────────────────────────────────────────

/** Modal inside the window (not a browser-level overlay). Traps focus; Esc closes. */
export function Dialog({ open, onClose, title, children, width = 440, className, describedBy, returnFocusRef }: {
  open: boolean;
  onClose(): void;
  title: string;
  children: React.ReactNode;
  width?: number;
  className?: string;
  describedBy?: string;
  returnFocusRef?: React.RefObject<HTMLElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    // Safari does not focus buttons on pointer click. Callers can identify the
    // invoker explicitly instead of restoring to document.body after closing.
    const prev = returnFocusRef?.current ?? document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus], input, button, [tabindex="0"]');
    first?.focus();
    const key = (e: KeyboardEvent) => {
      // Safari pointer clicks can leave focus on body. Handle the active modal
      // at document level while allowing a later modal to own its own keys.
      const modals = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (modals[modals.length - 1] !== el) return;
      if (e.key === 'Escape') { e.preventDefault(); close.current(); }
      if (e.key === 'Tab' && el && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Safari may skip ordinary buttons under its native keyboard preference.
        // A modal owns a deterministic tab sequence, including explicit actions,
        // while inactive radio stops, hidden controls and disabled fields are skipped.
        const f = Array.from(el.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]'))
          .filter(node => node.tabIndex >= 0 && !node.matches(':disabled, [aria-disabled="true"]') && node.getClientRects().length > 0);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        const next = i < 0 ? (e.shiftKey ? f.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length;
        e.preventDefault(); f[next].focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      // Restore outside React's cleanup phase: the readout commits its editable
      // value synchronously on focus, and another dialog may already own focus.
      queueMicrotask(() => {
        if (prev?.isConnected && (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected)) prev.focus();
      });
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center bg-[color:var(--ground)]/0 pt-16" onPointerDown={(e) => e.target === e.currentTarget && onClose()} style={{ background: 'color-mix(in srgb, var(--ground) 55%, transparent)' }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy} className={cx('lg-pop-in overflow-hidden rounded-lg bg-surface shadow-pop', className)} style={{ width, maxWidth: 'calc(100% - 32px)' }}>
        <h2 id={titleId} className="sr-only">{title}</h2>
        {children}
      </div>
    </div>
  );
}
