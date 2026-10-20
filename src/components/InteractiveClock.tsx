/**
 * InteractiveClock — the hero instrument.
 *
 * A 12-hour analog dial rendered in SVG (viewBox 200×200). The hands show the
 * SELECTED instant in `zone`. Users set the time like a watch crown:
 *   • drag the minute hand — one revolution = 1 hour (continuous; crossing
 *     12 rolls the hour, crossing midnight rolls the date)
 *   • drag the hour hand   — one revolution = 12 hours
 *   • mouse wheel          — ±step per notch (Shift = 1 min, Alt = 1 h)
 *   • keyboard (role=slider): ←/→/↑/↓ ±step, Shift ±1 min, PgUp/PgDn ±1 h,
 *     [ / ] ±1 day, Home or N = now
 *   • double-click         — back to now
 *
 * The outer ring is the sky: real solar elevation for the city's coordinates
 * across the displayed half-day (AM or PM), so the ring flips at noon/midnight.
 *
 * Purely presentational: it never owns time. Parent passes `value` and gets
 * `onChange(next)`; snapping happens here so every input path agrees.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { skyState } from '../lib/sun';
import { MS, Instant, addLocalDays, dayNumber, formatShortDate, formatTimeString, formatDiff, formatOffset, offsetMinutes, resolveWall, wallTime } from '../lib/time';
import { snapInstant, stepInstant } from '../lib/time-selection';
import { cx } from '../primitives';

export type ChangeSource = 'drag' | 'wheel' | 'key' | 'input' | 'reset';

export interface InteractiveClockProps {
  /** selected instant (epoch ms) */
  value: Instant;
  /** wall-clock now — drives the ghost hands and relative date */
  now: Instant;
  /** IANA zone the dial reads in (the reference location) */
  zone: string;
  /** coordinates for the sky ring; omit to hide it */
  coords?: { lat: number; lon: number };
  /** true when value follows now (no ghost hands, ink minute hand) */
  live: boolean;
  /** snap increment in minutes for drag / wheel / arrows (Shift overrides to 1) */
  step?: 1 | 5 | 15;
  hour12?: boolean;
  /** rendered px size (square) */
  size?: number;
  reducedMotion?: boolean;
  /** hide numerals and date window for very small instances */
  minimal?: boolean;
  onChange(next: Instant, source: ChangeSource): void;
  onReset(): void;
  /** fires when a drag starts/ends — parent can dim other UI, show hints */
  onDragChange?(dragging: boolean): void;
  className?: string;
}

const C = 100;
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (deg: number, r: number) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))] as const;
const norm = (d: number) => ((d % 360) + 360) % 360;
const shortest = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const angDist = (a: number, b: number) => Math.abs(shortest(a - b));

/** Next grid point from `v` in direction `dir` (an off-grid value snaps to the grid first). */
export function stepFrom(v: Instant, dir: 1 | -1, minutes: number, zone = 'UTC'): Instant {
  return stepInstant(v, dir, minutes, zone);
}

function arc(a0: number, a1: number, r: number): string {
  const [x0, y0] = pt(a0, r);
  const [x1, y1] = pt(a1, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * Live ticks move the minute hand 0.1° a second. Easing those sub-pixel steps
 * re-ran style and layout on every frame and was most of the idle CPU (M7.1),
 * so only visible jumps ease. The decision is made when the time changes and
 * held across unrelated re-renders, so a glide in flight is never cut short.
 */
const TICK_MAX_MS = 5000;
function useEaseJumps(value: Instant): boolean {
  const ref = useRef<{ value: Instant; ease: boolean } | null>(null);
  if (ref.current === null) ref.current = { value, ease: true };
  else if (value !== ref.current.value) ref.current = { value, ease: Math.abs(value - ref.current.value) > TICK_MAX_MS };
  return ref.current.ease;
}

/** Keeps a hand's rotation unwrapped so CSS transitions take the short way round. */
function useUnwrapped(target: number): number {
  const ref = useRef<number | null>(null);
  if (ref.current === null) ref.current = target;
  else ref.current = ref.current + shortest(target - norm(ref.current));
  return ref.current;
}

export function InteractiveClock({
  value, now, zone, coords, live, step = 5, hour12 = true, size = 288, reducedMotion, minimal,
  onChange, onReset, onDragChange, className,
}: InteractiveClockProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ hand: 'hour' | 'minute'; last: number; accum: number; start: Instant; emitted: Instant; x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState<null | 'hour' | 'minute'>(null);
  const [hover, setHover] = useState<null | 'hour' | 'minute'>(null);
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const [dragOrigin, setDragOrigin] = useState<Instant | null>(null);

  const off = offsetMinutes(zone, value);
  const local = value / MS.MIN + off; // local wall minutes since epoch
  const minuteMod = norm((local % 60) * 6);
  const hourMod = norm((local % 720) * 0.5);
  const minuteDeg = useUnwrapped(minuteMod);
  const hourDeg = useUnwrapped(hourMod);
  const easeJump = useEaseJumps(value);

  const nowOff = offsetMinutes(zone, now);
  const nowLocal = now / MS.MIN + nowOff;
  const nowMinuteDeg = norm((nowLocal % 60) * 6);
  const nowHourDeg = norm((nowLocal % 720) * 0.5);

  const w = wallTime(zone, value);
  const pm = w.hour >= 12;
  const dayDiff = dayNumber(zone, value) - dayNumber(zone, now);

  // Sky ring — 48 × 15-min segments for the displayed half-day.
  const halfStart = useMemo(() => resolveWall(zone, w.year, w.month, w.day, pm ? 12 : 0, 0).instant, [zone, w.year, w.month, w.day, pm]);
  const sky = useMemo(() => {
    if (!coords) return null;
    return Array.from({ length: 48 }, (_, i) => skyState(halfStart + (i + 0.5) * 15 * MS.MIN, coords.lat, coords.lon));
  }, [coords?.lat, coords?.lon, halfStart]);

  // Midnight / noon crossing feedback.
  const prevDay = useRef(dayNumber(zone, value));
  useEffect(() => {
    const d = dayNumber(zone, value);
    if (d !== prevDay.current && dragging) {
      setFlash({ text: d > prevDay.current ? `→ ${formatShortDate(zone, value)}` : `← ${formatShortDate(zone, value)}`, key: Date.now() });
    }
    prevDay.current = d;
  }, [value, zone, dragging]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1100);
    return () => clearTimeout(t);
  }, [flash]);

  const emit = useCallback((target: Instant, s: number, source: ChangeSource) => {
    const snapped = snapInstant(target, s, zone);
    onChange(snapped, source);
    return snapped;
  }, [onChange, zone]);

  // ── Pointer ──
  const toDial = (e: React.PointerEvent | PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 200 - C;
    const y = ((e.clientY - r.top) / r.height) * 200 - C;
    return { angle: norm((Math.atan2(x, -y) * 180) / Math.PI), dist: Math.hypot(x, y) };
  };
  const pickHand = (angle: number, dist: number): 'hour' | 'minute' => {
    const dh = angDist(angle, hourMod);
    const dm = angDist(angle, minuteMod);
    return dist < 60 && dh < 24 && dh <= dm ? 'hour' : 'minute';
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const { angle, dist } = toDial(e);
    if (dist > 101) return;
    e.preventDefault();
    svgRef.current!.focus({ preventScroll: true });
    svgRef.current!.setPointerCapture(e.pointerId);
    const hand = pickHand(angle, dist);
    drag.current = { hand, last: angle, accum: 0, start: value, emitted: value, x: e.clientX, y: e.clientY, moved: false };
    setDragging(hand);
    setDragOrigin(value);
    onDragChange?.(true);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const { angle, dist } = toDial(e);
    const d = drag.current;
    if (!d) {
      setHover(dist <= 100 ? pickHand(angle, dist) : null);
      return;
    }
    const delta = shortest(angle - d.last);
    d.moved ||= Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3;
    d.last = angle;
    d.accum += d.hand === 'minute' ? delta / 6 : delta * 2;
    const s = e.shiftKey ? 1 : step;
    const target = Math.round(d.start + d.accum * MS.MIN);
    const snapped = snapInstant(target, s, zone);
    if (snapped !== d.emitted) d.emitted = emit(target, s, 'drag');
  };
  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    if (e.type === 'pointerup' && !d.moved && e.detail < 2) {
      const { angle } = toDial(e);
      const local = wallTime(zone, d.start);
      const precision = e.shiftKey ? 1 : step;
      const minute = d.hand === 'minute' ? Math.round(angle / 6 / precision) * precision % 60 : local.minute;
      const hour = d.hand === 'hour' ? Math.round(angle / 30) % 12 + (local.hour >= 12 ? 12 : 0) : local.hour;
      onChange(resolveWall(zone, local.year, local.month, local.day, hour, minute).instant, 'input');
    }
    drag.current = null;
    setDragging(null);
    setDragOrigin(null);
    onDragChange?.(false);
    try { svgRef.current!.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  };

  // ── Wheel (non-passive so the page never scrolls under the dial) ──
  const wheelAcc = useRef(0);
  const latest = useRef({ value, step, onChange, zone });
  latest.current = { value, step, onChange, zone };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelAcc.current += e.deltaY;
      const notch = 40;
      if (Math.abs(wheelAcc.current) < notch) return;
      const dir = wheelAcc.current < 0 ? 1 : -1; // wheel up = forward in time
      wheelAcc.current = 0;
      const { value: v, step: st, onChange: oc, zone: z } = latest.current;
      const s = e.altKey ? 60 : e.shiftKey ? 1 : st;
      oc(stepFrom(v, dir, s, z), 'wheel');
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Keyboard ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    const s = e.shiftKey ? 1 : step;
    const snapTo = (dir: 1 | -1) => stepFrom(value, dir, s, zone);
    let next: Instant | null = null;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': next = snapTo(1); break;
      case 'ArrowLeft': case 'ArrowDown': next = snapTo(-1); break;
      case 'PageUp': next = value + MS.HOUR; break;
      case 'PageDown': next = value - MS.HOUR; break;
      case ']': next = addLocalDays(zone, value, 1); break;
      case '[': next = addLocalDays(zone, value, -1); break;
      case 'Home': case 'n': case 'N': e.preventDefault(); onReset(); return;
      default: return;
    }
    e.preventDefault();
    onChange(next, 'key');
  };

  const timeText = formatTimeString(zone, value, { hour12 });
  const dayText = formatShortDate(zone, value);
  const anim = !dragging && !reducedMotion && easeJump;
  const accentMinute = !live;
  const dragDelta = dragOrigin !== null ? Math.round((value - dragOrigin) / MS.MIN) : 0;

  const skyFill = { day: 'var(--sky-day)', twilight: 'var(--sky-twilight)', night: 'var(--sky-night)' } as const;
  const activeTick = Math.round(minuteMod / 6) % 60;

  return (
    <svg
      ref={svgRef}
      className={cx('lg-dial touch-none select-none', dragging ? 'cursor-grabbing' : hover ? 'cursor-grab' : 'cursor-default', className)}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="slider"
      tabIndex={0}
      aria-label={`Selected time in ${zone.replace(/_/g, ' ')}`}
      aria-valuemin={0}
      aria-valuemax={1439}
      aria-valuenow={w.hour * 60 + w.minute}
      aria-valuetext={`${timeText}, ${dayText}, ${zone} ${formatOffset(off)}${live ? ', now' : ''}`}
      aria-keyshortcuts="ArrowUp ArrowDown PageUp PageDown Home"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onPointerLeave={() => !drag.current && setHover(null)}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    >
      {/* face */}
      <circle cx={C} cy={C} r={99} fill="var(--dial-face)" stroke="var(--line)" strokeWidth={1} />
      <circle className="lg-dial-focus" cx={C} cy={C} r={99} fill="none" stroke="var(--focus)" strokeWidth={2} opacity={0} />

      {/* sky ring */}
      {sky && (
        <g aria-hidden>
          {sky.map((s, i) => (
            <path key={i} d={arc(i * 7.5, (i + 1) * 7.5 + 0.15, 93.5)} stroke={skyFill[s]} strokeWidth={5} fill="none" />
          ))}
          <circle cx={C} cy={C} r={90.6} fill="none" stroke="var(--line)" strokeWidth={0.5} />
        </g>
      )}

      {/* ticks */}
      <g aria-hidden>
        {Array.from({ length: 60 }, (_, i) => {
          const hourTick = i % 5 === 0;
          const [x0, y0] = pt(i * 6, hourTick ? 80.5 : 84);
          const [x1, y1] = pt(i * 6, 87.5);
          const hot = dragging === 'minute' && i === activeTick;
          return (
            <line key={i} x1={x0} y1={y0} x2={x1} y2={y1}
              stroke={hot ? 'var(--accent)' : hourTick ? 'var(--ink-muted)' : 'var(--control-border)'}
              strokeWidth={hot ? 1.6 : hourTick ? 1.2 : 0.6} strokeLinecap="round" />
          );
        })}
      </g>

      {/* numerals */}
      {!minimal && (
        <g aria-hidden className="tnum" fontFamily="var(--font-sans)" fontSize={9} fontWeight={500} textAnchor="middle">
          {Array.from({ length: 12 }, (_, i) => {
            const h = i === 0 ? 12 : i;
            if (h === 3 || h === 9) return null; // date window at 3, AM/PM window at 9
            const [x, y] = pt(i * 30, 71);
            const current = (w.hour % 12 || 12) === h;
            const label = hour12 ? String(h) : String(pm ? (h === 12 ? 12 : h + 12) : h === 12 ? 0 : h).padStart(2, '0');
            return (
              <text key={i} x={x} y={y + 3.2} fill={current ? 'var(--ink)' : 'var(--ink-faint)'} fontSize={hour12 ? 9 : 8}>
                {label}
              </text>
            );
          })}
        </g>
      )}

      {/* AM/PM window at 9 o'clock, date window at 3 o'clock */}
      {!minimal && (
        <g aria-hidden>
          <rect x={52} y={93} width={24} height={14} rx={2.5} fill="var(--ground)" stroke="var(--line)" strokeWidth={0.75} />
          <text key={pm ? 'pm' : 'am'} className="lg-flip" x={64} y={102.6} textAnchor="middle" fontSize={hour12 ? 7 : 6} fontWeight={600} letterSpacing={0.4} fontFamily="var(--font-sans)" fill="var(--ink-muted)">
            {hour12 ? (pm ? 'PM' : 'AM') : pm ? '12–24' : '0–12'}
          </text>
          <rect x={124} y={93} width={24} height={14} rx={2.5} fill="var(--ground)" stroke={dayDiff ? 'var(--accent)' : 'var(--line)'} strokeWidth={dayDiff ? 1 : 0.75} />
          <text key={w.day} className="lg-flip tnum" x={136} y={103} textAnchor="middle" fontSize={8.5} fontWeight={600} fontFamily="var(--font-sans)" fill={dayDiff ? 'var(--accent)' : 'var(--ink)'}>
            {w.day}
          </text>
        </g>
      )}

      {/* ghost hands: the real current time, shown only when detached */}
      {!live && (
        <g aria-hidden opacity={0.9}>
          <line className="lg-hand" style={{ transform: `rotate(${nowHourDeg}deg)` }} x1={C} y1={C} x2={C} y2={C - 46} stroke="var(--control-border)" strokeWidth={2} strokeLinecap="round" strokeDasharray="0.1 3.2" />
          <line className="lg-hand" style={{ transform: `rotate(${nowMinuteDeg}deg)` }} x1={C} y1={C} x2={C} y2={C - 70} stroke="var(--control-border)" strokeWidth={1.4} strokeLinecap="round" strokeDasharray="0.1 3" />
        </g>
      )}

      {/* drag feedback */}
      {dragging && dragDelta !== 0 && (
        <text aria-hidden x={C} y={146} textAnchor="middle" className="tnum" fontSize={8} fontWeight={500} fontFamily="var(--font-sans)" fill="var(--ink-muted)">
          {formatDiff(dragDelta)}
        </text>
      )}
      {flash && (
        <text key={flash.key} aria-hidden className="lg-flip" x={C} y={157} textAnchor="middle" fontSize={7.5} fontWeight={600} fontFamily="var(--font-sans)" fill="var(--accent)">
          {flash.text}
        </text>
      )}

      {/* hour hand */}
      <g className={cx('lg-hand', anim && 'lg-hand-anim')} style={{ transform: `rotate(${hourDeg}deg)` }}>
        <line x1={C} y1={C + 9} x2={C} y2={C - 47} stroke="var(--ink)" strokeWidth={dragging === 'hour' || hover === 'hour' ? 5.4 : 4.6} strokeLinecap="round" />
        <line x1={C} y1={C - 47} x2={C} y2={C - 60} stroke="transparent" strokeWidth={14} />
      </g>

      {/* minute hand */}
      <g className={cx('lg-hand', anim && 'lg-hand-anim')} style={{ transform: `rotate(${minuteDeg}deg)` }}>
        <line x1={C} y1={C + 13} x2={C} y2={C - 72} stroke={accentMinute ? 'var(--accent)' : 'var(--ink)'} strokeWidth={dragging === 'minute' || hover === 'minute' ? 3.2 : 2.5} strokeLinecap="round" />
        <circle cx={C} cy={C - 72} r={dragging === 'minute' ? 3.4 : 0} fill="var(--accent)" />
      </g>

      {/* hub */}
      <circle cx={C} cy={C} r={4.6} fill={accentMinute ? 'var(--accent)' : 'var(--ink)'} />
      <circle cx={C} cy={C} r={1.6} fill="var(--dial-face)" />
    </svg>
  );
}

// ── ClockHand (exported for custom faces) ──────────────────────────────────

export interface ClockHandProps {
  /** rotation in degrees, 0 = 12 o'clock, may exceed 360 (unwrapped) */
  angle: number;
  length: number;
  width: number;
  tail?: number;
  color?: string;
  animate?: boolean;
}

export function ClockHand({ angle, length, width, tail = 0, color = 'var(--ink)', animate = true }: ClockHandProps) {
  return (
    <g className={cx('lg-hand', animate && 'lg-hand-anim')} style={{ transform: `rotate(${angle}deg)` }}>
      <line x1={C} y1={C + tail} x2={C} y2={C - length} stroke={color} strokeWidth={width} strokeLinecap="round" />
    </g>
  );
}

// ── MiniClock — non-interactive face used in rows and the widget ───────────

export function MiniClock({ zone, at, size = 24, state }: { zone: string; at: Instant; size?: number; state?: 'work' | 'edge' | 'off' | 'sleep' }) {
  const local = at / MS.MIN + offsetMinutes(zone, at);
  const m = norm((local % 60) * 6);
  const h = norm((local % 720) * 0.5);
  const mDeg = useUnwrapped(m);
  const hDeg = useUnwrapped(h);
  const ease = useEaseJumps(at);
  const ring = state === 'work' ? 'var(--work)' : state === 'edge' ? 'var(--edge)' : state === 'sleep' ? 'var(--sleep)' : 'var(--control-border)';
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden className="shrink-0">
      <circle cx={C} cy={C} r={92} fill="var(--dial-face)" stroke={ring} strokeWidth={12} />
      <ClockHand angle={hDeg} length={46} width={18} animate={ease} />
      <ClockHand angle={mDeg} length={68} width={12} animate={ease} />
    </svg>
  );
}
