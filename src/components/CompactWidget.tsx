/**
 * CompactWidget — the always-on-top instrument (≈ 264 × 2–5 rows).
 * Glanceable: city, local time, day state. Scroll over it to preview other
 * times (it snaps back after 8 s idle, or press the time chip).
 */
import { Maximize2, Pin, PinOff, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { dayState } from '../lib/schedule';
import { Instant, MS, dayShift, formatDiff, formatTime } from '../lib/time';
import { stepInstant } from '../lib/time-selection';
import { IconButton, cx } from '../primitives';
import type { Location } from '../state/store';

export interface CompactWidgetProps {
  title: string;
  locations: Location[]; // first 2–5 are shown
  referenceZone: string;
  now: Instant;
  value: Instant;
  live: boolean;
  onChange(at: Instant): void;
  onReset(): void;
  hour12: boolean;
  pinned: boolean;
  opacity: number; // 0.6–1
  chrome: 'windows' | 'macos';
  nativeMac?: boolean;
  onTogglePin(): void;
  onExpand(): void;
  onClose(): void;
  onOpacity(v: number): void;
}

const DOT = { work: 'var(--work)', edge: 'var(--edge)', off: 'var(--ink-faint)', sleep: 'var(--sleep)' } as const;

export function CompactWidget({ title, locations, referenceZone, now, value: at, live, onChange, onReset, hour12, pinned, opacity, chrome, nativeMac, onTogglePin, onExpand, onClose, onOpacity }: CompactWidgetProps) {
  const [showOpacity, setShowOpacity] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout>>();
  const rootRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ at, referenceZone, onChange, onReset });
  latest.current = { at, referenceZone, onChange, onReset };
  const preview = (direction: 1 | -1, minutes = 15) => {
    const current = latest.current;
    const previewAt = stepInstant(current.at, direction, minutes, current.referenceZone);
    current.onChange(previewAt);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => { if (latest.current.at === previewAt) latest.current.onReset(); }, 8000);
  };
  const shown = locations.slice(0, 5);

  useEffect(() => {
    const element = rootRef.current;
    const wheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('input,button')) return;
      if (e.deltaY === 0) return;
      e.preventDefault(); preview(e.deltaY < 0 ? 1 : -1);
    };
    element?.addEventListener('wheel', wheel, { passive: false });
    const visibility = () => { if (document.hidden) clearTimeout(idle.current); };
    document.addEventListener('visibilitychange', visibility);
    return () => { element?.removeEventListener('wheel', wheel); document.removeEventListener('visibilitychange', visibility); clearTimeout(idle.current); };
  }, []);

  return (
    <div
      ref={rootRef}
      className="lg-root flex w-[264px] flex-col overflow-hidden rounded-lg shadow-window"
      style={{ background: `color-mix(in srgb, var(--surface) ${Math.round(opacity * 100)}%, transparent)`, backdropFilter: opacity < 1 ? 'blur(18px) saturate(1.2)' : undefined }}
      tabIndex={0}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(e.key)) {
          e.preventDefault(); preview(e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : -1, e.shiftKey ? 1 : 5);
        }
        if (e.key === 'Home') { e.preventDefault(); clearTimeout(idle.current); onReset(); }
      }}
      role="region"
      aria-label={`${title} — compact clock`}
    >
      {/* drag region / mini title bar */}
      <div data-tauri-drag-region className={cx('flex h-8 items-center gap-1 pl-3 pr-1', chrome === 'macos' && 'pl-2')}>
        {chrome === 'macos' && (
          nativeMac
            ? <button aria-label="Close widget" onClick={onClose} className="mr-1.5 flex h-3 w-3 items-center justify-center text-ink-muted hover:text-ink"><X size={12} /></button>
            : <button aria-label="Close widget" onClick={onClose} className="mr-1.5 h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,.25)]" />
        )}
        <span data-tauri-drag-region className="flex-1 truncate text-caption font-medium text-ink-muted">{title}</span>
        <IconButton label="Window opacity" className="!h-6 !w-6" active={showOpacity} onClick={() => setShowOpacity(!showOpacity)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M6 1.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" /></svg>
        </IconButton>
        <IconButton label={pinned ? 'Unpin (stop staying on top)' : 'Pin on top'} className="!h-6 !w-6" active={pinned} onClick={onTogglePin}>
          {pinned ? <Pin size={12} /> : <PinOff size={12} />}
        </IconButton>
        <IconButton label="Open full planner" shortcut="Ctrl+Shift+M" className="!h-6 !w-6" onClick={onExpand}><Maximize2 size={12} /></IconButton>
        {chrome === 'windows' && <IconButton label="Close widget" className="!h-6 !w-6 hover:!bg-win-close hover:!text-white" onClick={onClose}><X size={13} /></IconButton>}
      </div>

      {showOpacity && (
        <div className="flex items-center gap-2 px-3 pb-2 text-caption text-ink-muted">
          <span>Opacity</span>
          <input type="range" className="lg-range flex-1" min={60} max={100} value={Math.round(opacity * 100)} aria-label="Widget opacity" onChange={(e) => onOpacity(+e.target.value / 100)} />
          <span className="tnum w-8 text-right">{Math.round(opacity * 100)}%</span>
        </div>
      )}

      <ul className="flex flex-col pb-1.5">
        {shown.length === 0 && <li className="px-3 py-3 text-caption text-ink-muted">No favourites yet — add locations in the planner.</li>}
        {shown.map((l) => {
          const { time, period } = formatTime(l.zone, at, { hour12 });
          const st = dayState(l, at);
          const shift = dayShift(l.zone, referenceZone, at);
          return (
            <li key={l.id} className="flex h-9 items-center gap-2.5 px-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: DOT[st] }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-body text-ink">{l.name}</span>
              {shift !== 0 && <span className="tnum text-caption text-ink-muted">{shift > 0 ? `+${shift}d` : `${shift}d`}</span>}
              <span className="tnum text-[18px] font-medium leading-[22px] tracking-[-0.01em] text-ink">{time}</span>
              <span className="w-5 text-micro font-semibold text-ink-muted">{period}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex h-7 items-center border-t border-line px-3 text-caption text-ink-faint">
        {!live ? (
          <button onClick={() => { clearTimeout(idle.current); onReset(); }} className="tnum flex items-center gap-1.5 rounded-sm text-accent">
            Previewing {formatDiff(Math.round((at - now) / MS.MIN))} · Back to now
          </button>
        ) : (
          <span>Scroll to preview other times</span>
        )}
      </div>
    </div>
  );
}
