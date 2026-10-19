/**
 * DstNotice — calm, inline note about UTC-offset changes.
 * Never red, never modal. Text carries the meaning; the glyph is decoration.
 */
import React from 'react';
import { Instant, formatDiff, formatOffset, formatShortDate, formatTimeString, MS, nextTransition, offsetMinutes, TimeFormat } from '../lib/time';
import { cx } from '../primitives';

export function DstNotice({ children, tone = 'info', className }: { children: React.ReactNode; tone?: 'info' | 'quiet'; className?: string }) {
  return (
    <p role="note" className={cx('flex max-w-[340px] items-start gap-2 rounded-md px-2.5 py-1.5 text-caption', tone === 'info' ? 'bg-edge-band text-ink' : 'text-ink-muted', className)}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="mt-px shrink-0 text-edge">
        <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 3.2V6l1.8 1.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/** Human sentence for the next offset change in `zone`, or null if none within the horizon. */
export function describeTransition(zone: string, place: string, from: Instant, fmt: TimeFormat, horizonDays = 30): string | null {
  const t = nextTransition(zone, from, horizonDays);
  if (!t) return null;
  const dir = t.to > t.from ? 'forward' : 'back';
  // Wall time as announced locally ("2:00 AM"), i.e. in the old offset.
  const d = new Date(t.at + t.from * MS.MIN);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const when = fmt.hour12 ? `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}` : `${String(h).padStart(2, '0')}:${m}`;
  return `${place} clocks go ${dir} ${formatDiff(Math.abs(t.to - t.from)).replace(/^[+−]/, '')} on ${formatShortDate(zone, t.at)} at ${when} (now ${formatOffset(t.from)} → ${formatOffset(t.to)}).`;
}

export interface RecurringShift {
  place: string;
  fromWeek: number; // first affected occurrence (0-based)
  date: string;
  before: string;
  after: string;
}

/**
 * For a weekly meeting fixed in UTC (how the ICS is written), list places whose
 * local time changes within `weeks` occurrences.
 */
export function recurringShifts(places: { label: string; zone: string }[], start: Instant, weeks: number, fmt: TimeFormat): RecurringShift[] {
  const out: RecurringShift[] = [];
  for (const p of places) {
    const base = offsetMinutes(p.zone, start);
    for (let k = 1; k < weeks; k++) {
      const t = start + k * 7 * MS.DAY;
      if (offsetMinutes(p.zone, t) !== base) {
        out.push({ place: p.label, fromWeek: k, date: formatShortDate(p.zone, t), before: formatTimeString(p.zone, start, fmt), after: formatTimeString(p.zone, t, fmt) });
        break;
      }
    }
  }
  return out;
}
