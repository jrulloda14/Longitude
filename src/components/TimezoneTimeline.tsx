/**
 * TimezoneTimeline — every location against ONE absolute time axis
 * (the reference location's civil day, 23–25 h on DST days).
 *
 * Cells are each location's LOCAL hours placed at their absolute position,
 * so +5:30 / +5:45 zones simply sit half or three-quarters of a cell over —
 * hour labels stay whole and readable. Drag anywhere on the tracks to pick
 * the meeting start; the dial follows.
 */
import React, { useMemo, useRef } from 'react';
import { Range, dayState } from '../lib/schedule';
import { Instant, MS, dayNumber, dayShift, formatOffset, formatShortDate, formatTime, formatTimeString, offsetMinutes, wallTime } from '../lib/time';
import { civilHourTicks, localDayBounds, localHourCells } from '../lib/time-axis';
import { snapInstant, stepInstant } from '../lib/time-selection';
import { cx } from '../primitives';
import type { Location } from '../state/store';
import { BAND } from './TimezoneRow';

export interface TimezoneTimelineProps {
  locations: Location[];
  referenceZone: string;
  at: Instant;
  now: Instant;
  hour12: boolean;
  durationMin: number;
  /** ranges where everyone is in working hours (from commonWorkingRanges) */
  overlap: Range[];
  step?: number; // minutes, drag snap
  onChange(next: Instant): void;
  labelWidth?: number;
  rowHeight?: number;
  /** show each location's time at the cursor next to its name (off when rows above already show it) */
  showTimes?: boolean;
}

export function TimezoneTimeline({
  locations, referenceZone, at, now, hour12, durationMin, overlap, step = 15, onChange, labelWidth = 136, rowHeight = 26, showTimes = true,
}: TimezoneTimelineProps) {
  const [trackW, setTrackW] = React.useState(600);
  const civilDay = dayNumber(referenceZone, at);
  const { start: dayStart, end: dayEnd } = useMemo(() => localDayBounds(referenceZone, at), [referenceZone, civilDay]);
  const span = dayEnd - dayStart;
  const pct = (t: Instant) => `${(((t - dayStart) / span) * 100).toFixed(3)}%`;
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  React.useLayoutEffect(() => {
    if (!trackRef.current) return;
    const ro = new ResizeObserver(([e]) => setTrackW(e.contentRect.width));
    ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, []);
  const roomy = trackW / (span / MS.HOUR) >= 30;
  const sparse = trackW / (span / MS.HOUR) < 19;
  const ticks = useMemo(() => civilHourTicks(referenceZone, dayStart), [referenceZone, dayStart]);
  const rows = useMemo(() => locations.map(loc => ({ loc, cells: localHourCells(loc.zone, dayStart, dayEnd).map(c => ({
    ...c, state: dayState(loc, c.start + (c.end - c.start) / 2),
    description: `${formatShortDate(loc.zone, c.start)}, ${formatTimeString(loc.zone, c.start, { hour12 })} · ${formatOffset(offsetMinutes(loc.zone, c.start))}`,
  })) })), [locations, dayStart, dayEnd, hour12]);

  const setFromX = (clientX: number, fine: boolean) => {
    const r = trackRef.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const g = (fine ? 5 : step) * MS.MIN;
    const t = snapInstant(Math.round(dayStart + f * span - (durationMin * MS.MIN) / 2), fine ? 5 : step, referenceZone); // grab the block by its middle
    onChange(Math.max(dayStart, Math.min(dayEnd - g, t)));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const g = (e.shiftKey ? 5 : step) * MS.MIN;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(stepInstant(at, 1, g / MS.MIN, referenceZone)); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(stepInstant(at, -1, g / MS.MIN, referenceZone)); }
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const hourLabel = (h: number) => (hour12 ? String(h % 12 || 12) : String(h));
  const nowIn = now >= dayStart && now < dayEnd;

  return (
    <div className="select-none">
      {/* axis header */}
      <div className="flex items-end" style={{ paddingLeft: labelWidth }}>
        <div className="tnum relative h-5 flex-1 text-micro text-ink-faint">
          {ticks.map(({ hour: h, at: t }) => {
            return (
              <span key={h} className="absolute bottom-1 -translate-x-1/2 first:translate-x-0" style={{ left: pct(t) }}>
                {h === 0 ? formatShortDate(referenceZone, t) : h === 12 && wallTime(referenceZone, t).hour === 12 ? 'Noon' : hour12 ? formatTimeString(referenceZone, t, { hour12 }).replace(':00', '') : formatTimeString(referenceZone, t, { hour12 }).replace(/^0/, '')}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex">
        {/* labels */}
        <div className="shrink-0" style={{ width: labelWidth }}>
          {locations.map((loc) => {
            const { time, period } = formatTime(loc.zone, at, { hour12 });
            const shift = dayShift(loc.zone, referenceZone, at);
            return (
              <div key={loc.id} className="flex items-center justify-between gap-2 pr-3" style={{ height: rowHeight }}>
                <span className="truncate text-label text-ink">{loc.name}</span>
                {showTimes && <span className="tnum shrink-0 text-caption text-ink-muted">
                  {time}{period && <span className="ml-0.5 text-[9px]">{period}</span>}
                  {shift !== 0 && <sup className="ml-0.5 text-[9px] text-ink">{shift > 0 ? `+${shift}` : shift}</sup>}
                </span>}
              </div>
            );
          })}
        </div>

        {/* tracks */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Meeting start on the timeline"
          aria-valuemin={0}
          aria-valuemax={Math.ceil(span / MS.MIN) - 1}
          aria-valuenow={Math.floor((at - dayStart) / MS.MIN)}
          aria-valuetext={`${formatShortDate(referenceZone, at)}, ${formatTimeString(referenceZone, at, { hour12 })} · ${referenceZone} ${formatOffset(offsetMinutes(referenceZone, at))}`}
          data-day-start={dayStart} data-day-end={dayEnd}
          onKeyDown={onKey}
          onPointerDown={(e) => { if (e.button !== 0) return; dragging.current = true; e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); setFromX(e.clientX, e.shiftKey); }}
          onPointerMove={(e) => dragging.current && setFromX(e.clientX, e.shiftKey)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          className="relative min-w-0 flex-1 cursor-col-resize touch-none rounded-sm"
        >
          {rows.map(({ loc, cells }) => (
            <div key={loc.id} className="relative" style={{ height: rowHeight }}>
              {cells.map((c) => {
                const midnight = c.midnight;
                const full = c.wholeHour;
                return (
                  <div
                    key={c.start}
                    title={c.description}
                    data-cell-start={c.start} data-cell-end={c.end} data-zone={loc.zone}
                    className={cx('tnum absolute bottom-[3px] top-[3px] flex items-center justify-center overflow-hidden text-[10px] leading-none', midnight ? 'font-semibold text-ink' : 'text-ink-muted')}
                    style={{ left: pct(c.start), width: `max(0px, calc(${(((c.end - c.start) / span) * 100).toFixed(3)}% - 1px))`, background: BAND[c.state], borderRadius: 2, boxShadow: midnight ? 'inset 1.5px 0 0 var(--ink-muted)' : undefined }}
                  >
                    {full ? (midnight ? (roomy ? formatShortDate(loc.zone, c.start).slice(0, 3) : String(wallTime(loc.zone, c.start).day)) : sparse && c.hour % 3 ? '' : hourLabel(c.hour)) : c.transition && c.minute ? `${hourLabel(c.hour)}:${String(c.minute).padStart(2, '0')}` : ''}
                  </div>
                );
              })}
            </div>
          ))}

          {/* overlap windows */}
          {overlap.map((r) => (
            <div key={r.start} aria-hidden className="pointer-events-none absolute inset-y-0 rounded-sm" style={{ left: pct(r.start), width: pct(dayStart + (r.end - r.start)), boxShadow: 'inset 0 0 0 1px var(--work)' }} />
          ))}

          {/* now */}
          {nowIn && <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px" style={{ left: pct(now), background: 'repeating-linear-gradient(to bottom, var(--ink-faint) 0 2px, transparent 2px 5px)' }} />}

          {/* selected meeting block */}
          <div aria-hidden className="pointer-events-none absolute -inset-y-1 rounded-[3px] bg-accent-soft" style={{ left: pct(at), width: pct(dayStart + Math.min(durationMin * MS.MIN, dayEnd - at)), boxShadow: 'inset 0 0 0 1.5px var(--accent)' }} />
          <div aria-hidden className="pointer-events-none absolute -inset-y-1.5 w-0.5 rounded-full bg-accent" style={{ left: pct(at) }} />
        </div>
      </div>
    </div>
  );
}
