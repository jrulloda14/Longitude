/** Contextual explanations built on the established IANA engine, not UI arithmetic. */
import { Instant, MS, TimeFormat, formatDiff, formatOffset, formatShortDate, formatTimeString, nextTransition, offsetMinutes, resolveWall, wallTime } from './time';
import { SummaryInput, weeklyOccurrences } from './share';
import { civilUtc } from './time-validation';
export function describeTransition(zone: string, place: string, from: Instant, fmt: TimeFormat, horizonDays = 30): string | null {
  const t = nextTransition(zone, from, horizonDays); if (!t) return null;
  const announced = t.at + t.from * MS.MIN;
  return `${place} clocks go ${t.to > t.from ? 'forward' : 'back'} ${formatDiff(Math.abs(t.to - t.from)).replace(/^[+−]/, '')} on ${formatShortDate('UTC', announced)} at ${formatTimeString('UTC', announced, fmt)} (${formatOffset(t.from)} → ${formatOffset(t.to)}).`;
}
export interface RecurringShift { place: string; fromWeek: number; date: string; before: string; after: string }
export function recurringShifts(places: { label: string; zone: string }[], start: Instant, weeks: number, fmt: TimeFormat, basis: 'utc' | 'reference' = 'utc', referenceZone = places[0]?.zone ?? 'UTC'): RecurringShift[] {
  const occurrences = weeklyOccurrences({ title: 'Meeting', start, durationMin: 1, reference: { label: '', zone: referenceZone }, places, format: fmt, recurrence: { count: weeks, basis } });
  const out: RecurringShift[] = [];
  for (const p of places) for (let k = 1; k < occurrences.length; k++) {
    const t = occurrences[k], before = formatTimeString(p.zone, start, fmt), after = formatTimeString(p.zone, t, fmt);
    if (before !== after || offsetMinutes(p.zone, start) !== offsetMinutes(p.zone, t)) {
      // A reference-wall meeting can retain the same local time despite its offset changing.
      if (basis === 'reference' && before === after) continue;
      out.push({ place: p.label, fromWeek: k, date: formatShortDate(p.zone, t), before, after }); break;
    }
  }
  return out;
}
export function meetingDstNotes(s: SummaryInput, today: Instant): string[] {
  const notes: string[] = [], end = s.start + s.durationMin * MS.MIN;
  for (const p of s.places) {
    const at = offsetMinutes(p.zone, s.start), current = offsetMinutes(p.zone, today);
    if (at !== current) notes.push(`${p.label} uses ${formatOffset(at)} on this selected date (${formatOffset(current)} today).`);
    const transition = nextTransition(p.zone, s.start, 14);
    if (transition) {
      if (transition.at < end) notes.push(`${p.label}'s clock changes during this meeting: ${formatOffset(transition.from)} → ${formatOffset(transition.to)}. Duration remains ${s.durationMin} elapsed minutes.`);
      else notes.push(describeTransition(p.zone, p.label, s.start, s.format, 14)!);
    }
  }
  if (s.recurrence?.basis === 'reference') {
    const original = wallTime(s.reference.zone, s.start);
    weeklyOccurrences(s).slice(1).forEach((_, i) => {
      // Classify the requested calendar date, including a wholly skipped date,
      // rather than the shifted occurrence's resulting date.
      const w = wallTime('UTC', civilUtc(original.year, original.month, original.day) + (i + 1) * 7 * MS.DAY), r = resolveWall(s.reference.zone, w.year, w.month, w.day, original.hour, original.minute);
      if (r.kind !== 'ok') notes.push(`Occurrence ${i + 2} in ${s.reference.zone}: ${r.kind === 'ambiguous' ? 'ambiguous wall time; earlier occurrence selected' : `nonexistent wall time; shifted forward ${r.gapMinutes} minutes`}.`);
    });
  }
  return [...new Set(notes)];
}
