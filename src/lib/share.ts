/** Existing summary/ICS facade; all local dates derive from the canonical instant. */
import { Instant, MS, addLocalDays, assertInstant, dayShift, formatLongDate, formatOffset, formatShortDate, formatTimeString, normalizeZone, offsetMinutes, TimeFormat, zoneAbbreviation } from './time';
import { evaluate, type WorkingHours, type SleepHours } from './schedule';
import { TimeCache } from './time-cache';

export interface SummaryPlace { label: string; zone: string; work?: WorkingHours; sleep?: SleepHours }
export type RecurrenceBasis = 'utc' | 'reference';
export interface SummaryInput {
  title: string; start: Instant; durationMin: number; reference: SummaryPlace;
  places: SummaryPlace[]; format: TimeFormat;
  recurrence?: { basis: RecurrenceBasis; count: number };
}
export function validText(value: unknown, max = 500): asserts value is string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    || [...value].some(c => { const n = c.codePointAt(0)!; return n >= 0xd800 && n <= 0xdfff; })) throw new RangeError(`Use valid text of at most ${max} characters, without control characters.`);
}
export function validateSummary(s: SummaryInput): void {
  validText(s.title); assertInstant(s.start); assertInstant(s.start + s.durationMin * MS.MIN);
  if (!Number.isInteger(s.durationMin) || s.durationMin < 1 || s.durationMin > 1440) throw new RangeError('Duration must be 1–1440 minutes.');
  if (!s.format || typeof s.format.hour12 !== 'boolean' || !Array.isArray(s.places) || s.places.length > 32) throw new RangeError('Invalid meeting participants or format.');
  for (const p of [s.reference, ...s.places]) { validText(p.label); normalizeZone(p.zone); }
  if (s.recurrence && (!['utc', 'reference'].includes(s.recurrence.basis) || !Number.isInteger(s.recurrence.count) || s.recurrence.count < 2 || s.recurrence.count > 52)) throw new RangeError('Use 2–52 weekly occurrences and an explicit time basis.');
}
const names = new TimeCache<string, Intl.DateTimeFormat>(128);
/** Runtime's actual standard/daylight name; never infer DST from January or a one-hour shift. */
export function zoneLongName(zone: string, at: Instant): string {
  zone = normalizeZone(zone); assertInstant(at);
  const fmt = names.get(zone) ?? names.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'long' }));
  return fmt.formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? zoneAbbreviation(zone, at);
}
function dayNote(zone: string, ref: string, at: Instant): string {
  const d = dayShift(zone, ref, at);
  return !d ? '' : d === 1 ? ' (next day)' : d === -1 ? ' (previous day)' : ` (${d > 0 ? '+' : ''}${d} days)`;
}
export function participantLines(s: SummaryInput): string[] {
  validateSummary(s);
  return s.places.map((p, i) => {
    const end = s.start + s.durationMin * MS.MIN;
    const startDay = formatLongDate(p.zone, s.start), endDay = formatLongDate(p.zone, end);
    const before = formatOffset(offsetMinutes(p.zone, s.start)), after = formatOffset(offsetMinutes(p.zone, end));
    let work = 'Working hours not provided';
    if (p.work && p.sleep) {
      const row = evaluate([{ id: String(i), label: p.label, zone: p.zone, work: p.work, sleep: p.sleep }], s.start, s.durationMin).people[0];
      work = Math.abs(row.workingMin - s.durationMin) < 1e-9 ? 'Within working hours' : `Outside working hours (${+row.workingMin.toFixed(2)}/${s.durationMin} working minutes)`;
    }
    return `${p.label} — ${formatTimeString(p.zone, s.start, s.format)}${dayNote(p.zone, s.reference.zone, s.start)} – ${formatTimeString(p.zone, end, s.format)}\n${startDay}${endDay !== startDay ? ` → ${endDay}` : ''}\n${p.zone} · ${zoneAbbreviation(p.zone, s.start)} · ${before}${after !== before ? ` → ${after}` : ''} · ${zoneLongName(p.zone, s.start)}\n${work}`;
  });
}
export function summaryParticipants(s: SummaryInput): string { return participantLines(s).join('\n\n'); }
export function recurrenceLabel(s: SummaryInput): string {
  return !s.recurrence ? '' : `Repeats weekly, ${s.recurrence.count} occurrences: ${s.recurrence.basis === 'utc' ? 'fixed UTC' : `fixed ${s.reference.zone} wall time (gaps shift forward; folds use earlier occurrence)`}.`;
}
export function summaryText(s: SummaryInput): string {
  const rows = participantLines(s);
  return [`${s.title.trim() || 'Meeting'} — ${formatLongDate(s.reference.zone, s.start)}`, `${formatTimeString(s.reference.zone, s.start, s.format)} · ${s.reference.zone} · Duration: ${s.durationMin} min`, '', ...rows.flatMap(r => [r, '']), 'Configured hours only; calendar availability is not checked.', recurrenceLabel(s)].filter((r, i, a) => r || i < a.length - 2).join('\n').trimEnd();
}
export function summaryCompact(s: SummaryInput): string {
  validateSummary(s);
  return [`${s.title.trim() || 'Meeting'} · ${formatLongDate(s.reference.zone, s.start)} · ${s.durationMin} min`, ...s.places.map(p => `${p.label} ${formatTimeString(p.zone, s.start, s.format)}${dayNote(p.zone, s.reference.zone, s.start)} (${formatShortDate(p.zone, s.start)}, ${zoneAbbreviation(p.zone, s.start)}, ${formatOffset(offsetMinutes(p.zone, s.start))})`), recurrenceLabel(s)].filter(Boolean).join(' · ');
}
export function summaryUtc(s: SummaryInput): string {
  validateSummary(s);
  return `${s.title.trim() || 'Meeting'} — ${new Date(s.start).toISOString()} – ${new Date(s.start + s.durationMin * MS.MIN).toISOString()} · ${s.durationMin} min (UTC)`;
}
export function weeklyOccurrences(s: SummaryInput): Instant[] {
  validateSummary(s);
  return Array.from({ length: s.recurrence?.count ?? 1 }, (_, i) => {
    const at = !i ? s.start : s.recurrence?.basis === 'reference' ? addLocalDays(s.reference.zone, s.start, i * 7) : s.start + i * 7 * MS.DAY;
    assertInstant(at); assertInstant(at + s.durationMin * MS.MIN); return at;
  });
}
export function safeCalendarName(title: string): string {
  validText(title);
  let stem = title.normalize('NFKD').replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 80).replace(/[- ]+$/g, '') || 'meeting';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(stem)) stem = `meeting-${stem}`;
  return `${stem}.ics`;
}
export interface ExportSession { uid: string; created: Instant }
export function createExportSession(now: Instant = Date.now()): ExportSession { assertInstant(now); return { uid: `${crypto.randomUUID()}@longitude.app`, created: now }; }
export interface IcsOptions { uid?: string; now?: Instant; created?: Instant; weeklyCount?: number }
export function icsUtc(t: Instant): string { assertInstant(t); return new Date(t).toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z'; }
export const escapeIcsText = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
/** Every physical line, including continuation whitespace, is at most 75 UTF-8 octets. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder(); let out = '', bytes = 0;
  for (const ch of line) { const n = encoder.encode(ch).length; if (bytes + n > 75) { out += '\r\n '; bytes = 1; } out += ch; bytes += n; }
  return out;
}
export function buildIcs(s: SummaryInput, opts: IcsOptions = {}): string {
  if (opts.weeklyCount !== undefined) s = { ...s, recurrence: { basis: 'utc', count: opts.weeklyCount } };
  validateSummary(s);
  const now = opts.now ?? Date.now(), created = opts.created ?? now, uid = opts.uid ?? createExportSession(now).uid;
  validText(uid, 254); if (!uid || /[\s:;,\\]/.test(uid)) throw new RangeError('Invalid event UID.');
  const occurrences = weeklyOccurrences(s);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Longitude//Timezone Planner//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${icsUtc(now)}`, `CREATED:${icsUtc(created)}`, `DTSTART:${icsUtc(s.start)}`, `DTEND:${icsUtc(s.start + s.durationMin * MS.MIN)}`, `SUMMARY:${escapeIcsText(s.title.trim() || 'Meeting')}`, `DESCRIPTION:${escapeIcsText(summaryText(s))}`,
    ...(s.recurrence?.basis === 'utc' ? [`RRULE:FREQ=WEEKLY;COUNT=${s.recurrence.count}`] : occurrences.length > 1 ? [`RDATE:${occurrences.map(icsUtc).join(',')}`] : []), 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
