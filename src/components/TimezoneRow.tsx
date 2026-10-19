/**
 * TimezoneRow — one location, compact. Hierarchy: local time > city > meta.
 * DayStrip — that location's own 24 hours (local midnight → midnight),
 * shaded work / edge / off / sleep, with a tick at the selected time.
 */
import { Anchor, GripVertical, MoreHorizontal } from 'lucide-react';
import React, { useMemo } from 'react';
import { DayState, STATE_LABEL, dayState } from '../lib/schedule';
import {
  Instant, MS, dayNumber, dayShift, formatDiff, formatOffset, formatShortDate, formatTime, offsetMinutes, zoneAbbreviation,
} from '../lib/time';
import { localDayBounds } from '../lib/time-axis';
import { Tip, cx } from '../primitives';
import type { Location } from '../state/store';
import { MiniClock } from './InteractiveClock';

export const BAND: Record<DayState, string> = {
  work: 'var(--work-band)',
  edge: 'var(--edge-band)',
  off: 'var(--off-band)',
  sleep: 'var(--sleep-band)',
};

export function DayStrip({ location, at, width = 72, height = 6 }: { location: Location; at: Instant; width?: number; height?: number }) {
  const day = dayNumber(location.zone, at);
  const { start, end } = useMemo(() => localDayBounds(location.zone, at), [location.zone, day]);
  const cells = useMemo(() => Array.from({ length: Math.ceil((end - start) / (30 * MS.MIN)) }, (_, i) => {
    const from = start + i * 30 * MS.MIN;
    const to = Math.min(end, from + 30 * MS.MIN);
    return { from, to, state: dayState(location, from + (to - from) / 2) };
  }), [location, start, end]);
  const pos = (at - start) / (end - start);
  return (
    <svg width={width} height={height + 6} viewBox={`0 0 ${width} ${height + 6}`} aria-hidden className="shrink-0">
      <defs>
        <clipPath id={`clip-${location.id}`}><rect x={0} y={3} width={width} height={height} rx={2} /></clipPath>
      </defs>
      <g clipPath={`url(#clip-${location.id})`}>
        {cells.map(c => (
          <rect key={c.from} x={((c.from - start) / (end - start)) * width} y={3} width={((c.to - c.from) / (end - start)) * width + 0.3} height={height} fill={BAND[c.state]} />
        ))}
      </g>
      <rect x={Math.min(width - 2, Math.max(0, pos * width - 1))} y={0} width={2} height={height + 6} rx={1} fill="var(--ink)" />
    </svg>
  );
}

export interface TimezoneRowProps {
  location: Location;
  at: Instant;
  referenceZone: string;
  isReference: boolean;
  hour12: boolean;
  /** sentence from describeTransition(), shown as a quiet chip + tooltip */
  dstNote?: string | null;
  /** hide the 24 h day strip in narrow layouts */
  showStrip?: boolean;
  dragging?: boolean;
  dropIndicator?: 'before' | 'after' | null;
  onMenu(e: React.MouseEvent | { clientX: number; clientY: number }): void;
  onSetReference(): void;
  /** HTML5 drag handle wiring from the list */
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  rowProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function TimezoneRow({ location, at, referenceZone, isReference, hour12, dstNote, showStrip = true, dragging, dropIndicator, onMenu, onSetReference, dragHandleProps, rowProps }: TimezoneRowProps) {
  const { time, period } = formatTime(location.zone, at, { hour12 });
  const diff = offsetMinutes(location.zone, at) - offsetMinutes(referenceZone, at);
  const shift = dayShift(location.zone, referenceZone, at);
  const state = dayState(location, at);
  const abbr = zoneAbbreviation(location.zone, at);

  return (
    <div
      {...rowProps}
      role="listitem"
      tabIndex={0}
      aria-label={`${location.name}, ${time} ${period}, ${formatShortDate(location.zone, at)}, ${STATE_LABEL[state]}${isReference ? ', reference' : `, ${formatDiff(diff)} from reference`}`}
      onContextMenu={(e) => { e.preventDefault(); onMenu(e); }}
      onDoubleClick={onSetReference}
      onKeyDown={(e) => {
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onMenu({ clientX: r.right - 180, clientY: r.top + 24 });
        }
        rowProps?.onKeyDown?.(e);
      }}
      className={cx(
        'focus-inset group relative flex h-[52px] items-center gap-3 rounded-md pl-1 pr-2 transition-[background,opacity] duration-100',
        isReference ? 'bg-field' : 'hover:bg-field',
        dragging && 'opacity-40',
        rowProps?.className,
      )}
    >
      {dropIndicator && <span aria-hidden className={cx('absolute left-2 right-2 h-0.5 rounded-full bg-accent', dropIndicator === 'before' ? '-top-px' : '-bottom-px')} />}
      <span {...dragHandleProps} aria-hidden className="flex h-8 w-3 cursor-grab items-center justify-center text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing">
        <GripVertical size={12} />
      </span>
      <Tip label={STATE_LABEL[state]} side="right">
        <span className="inline-flex"><MiniClock zone={location.zone} at={at} size={26} state={state} /></span>
      </Tip>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-body font-medium text-ink">{location.name}</span>
          {location.note && <span className="truncate text-caption text-ink-muted">{location.note}</span>}
          {isReference && (
            <Tip label="Reference — the dial reads in this time zone">
              <span className="inline-flex items-center gap-0.5 rounded-sm text-micro font-medium uppercase text-accent"><Anchor size={10} aria-hidden /> Ref</span>
            </Tip>
          )}
        </div>
        <div className="tnum flex items-center gap-1 truncate text-caption text-ink-muted">
          <span className="truncate">{location.country}</span>
          <span className="text-ink-faint">·</span>
          <span title={location.zone}>{abbr.startsWith('UTC') ? abbr : `${abbr} ${formatOffset(offsetMinutes(location.zone, at)).replace('UTC', '')}`}</span>
          {!isReference && (<><span className="text-ink-faint">·</span><span className="text-ink">{formatDiff(diff)}</span></>)}
          {dstNote && (
            <Tip label={dstNote}>
              <span tabIndex={0} className="ml-0.5 rounded-sm border border-line px-1 text-[10px] leading-[14px] text-edge">DST</span>
            </Tip>
          )}
        </div>
      </div>

      {showStrip && <DayStrip location={location} at={at} />}

      <div className="flex w-[92px] flex-col items-end">
        <div className="flex items-baseline gap-1">
          <span className="tnum text-row font-medium tracking-[-0.01em] text-ink">{time}</span>
          {period && <span className="text-micro font-semibold text-ink-muted">{period}</span>}
        </div>
        <div className="tnum flex items-center gap-1 text-caption text-ink-muted">
          {shift !== 0 && (
            <span className="rounded-sm bg-field px-1 text-[10px] leading-[14px] text-ink">{shift > 0 ? `+${shift} day` : `${shift} day`}</span>
          )}
          <span>{formatShortDate(location.zone, at).replace(/ \w+$/, '')}</span>
        </div>
      </div>

      <button
        aria-label={`More actions for ${location.name}`}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu({ clientX: r.left - 160, clientY: r.bottom }); }}
        className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint opacity-0 hover:bg-field hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}
