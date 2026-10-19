/**
 * Meeting summary text + RFC 5545 iCalendar export. Pure string builders.
 * Platform glue (clipboard, save dialog) lives in src/platform.ts.
 */
import { Instant, MS, dayShift, formatLongDate, formatShortDate, formatTimeString, TimeFormat } from './time';

export interface SummaryPlace {
  label: string;
  zone: string;
}

export interface SummaryInput {
  title: string;
  start: Instant;
  durationMin: number;
  reference: SummaryPlace;
  places: SummaryPlace[]; // reference included, display order
  format: TimeFormat;
}

function dayNote(zone: string, refZone: string, at: Instant, compact: boolean): string {
  const d = dayShift(zone, refZone, at);
  if (d === 0) return '';
  if (compact) return d > 0 ? ` (+${d})` : ` (${d})`;
  return d === 1 ? ' (next day)' : d === -1 ? ' (previous day)' : ` (${d > 0 ? '+' : ''}${d} days)`;
}

/** Multi-line summary, e.g.
 *  Design review — Tuesday, October 20, 2026
 *  Manila — 9:00 PM
 *  Sydney — 12:00 AM (next day)
 */
export function summaryText(s: SummaryInput): string {
  const head = `${s.title || 'Meeting'} — ${formatLongDate(s.reference.zone, s.start)}`;
  const lines = s.places.map(
    (p) => `${p.label} — ${formatTimeString(p.zone, s.start, s.format)}${dayNote(p.zone, s.reference.zone, s.start, false)}`,
  );
  const dur = s.durationMin % 60 === 0 ? `${s.durationMin / 60}h` : `${s.durationMin} min`;
  return [head, ...lines, `Duration: ${dur}`].join('\n');
}

/** One line, for chat: "Tue 20 Oct · Manila 9:00 PM · New York 9:00 AM · Sydney 12:00 AM (+1)" */
export function summaryCompact(s: SummaryInput): string {
  const parts = s.places.map(
    (p) => `${p.label} ${formatTimeString(p.zone, s.start, s.format)}${dayNote(p.zone, s.reference.zone, s.start, true)}`,
  );
  return [formatShortDate(s.reference.zone, s.start), ...parts].join(' · ');
}

// ── iCalendar ───────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
function icsUtc(t: Instant): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold content lines at 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export interface IcsOptions {
  uid?: string;
  now?: Instant;
  /** weekly recurrence count; omit for a single event */
  weeklyCount?: number;
}

/**
 * Times are written in UTC (…Z) so every calendar client converts them with
 * its own tz rules — no VTIMEZONE block needed and no offsets embedded.
 */
export function buildIcs(s: SummaryInput, opts: IcsOptions = {}): string {
  const now = opts.now ?? Date.now();
  const uid = opts.uid ?? `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}@longitude.app`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Longitude//Timezone Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(s.start)}`,
    `DTEND:${icsUtc(s.start + s.durationMin * MS.MIN)}`,
    `SUMMARY:${esc(s.title || 'Meeting')}`,
    `DESCRIPTION:${esc(summaryText(s))}`,
    ...(opts.weeklyCount ? [`RRULE:FREQ=WEEKLY;COUNT=${opts.weeklyCount}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
