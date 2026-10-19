/** Portable absolute-time geometry for existing timeline/day-strip surfaces. */
import { Instant, MIN_INSTANT, MS, addLocalDays, assertInstant, nextTransition, resolveWall, startOfLocalDay, wallTime } from './time';

export function localDayBounds(zone: string, at: Instant): { start: Instant; end: Instant } {
  const start = startOfLocalDay(zone, at);
  // A skipped midnight may make start 01:00; the next day still starts at its
  // first actual instant, not at that same wall hour.
  const end = startOfLocalDay(zone, addLocalDays(zone, start, 1));
  return { start, end };
}

export interface HourCell {
  start: Instant; end: Instant; hour: number; minute: number;
  midnight: boolean; transition: boolean; wholeHour: boolean;
}

/** Split at real local hour boundaries AND offset changes (e.g. Lord Howe :30). */
export function localHourCells(zone: string, from: Instant, to: Instant): HourCell[] {
  assertInstant(from); assertInstant(to);
  if (to <= from || to - from > 3 * MS.DAY) throw new RangeError('Timeline span must be positive and at most three days');
  const boundaries = new Set([from, to]);
  const transitions = new Set<number>();
  let cursor = Math.max(MIN_INSTANT, from - 1);
  const horizon = Math.ceil((to - from) / MS.DAY) + 1;
  for (;;) {
    const next = nextTransition(zone, cursor, horizon);
    if (!next || next.at >= to) break;
    transitions.add(next.at); boundaries.add(next.at); cursor = next.at;
  }
  const segments = [...boundaries].sort((a, b) => a - b);
  for (let i = 0; i < segments.length - 1; i++) {
    const start = segments[i];
    const w = wallTime(zone, start);
    const milliseconds = ((start % 1000) + 1000) % 1000;
    let hour = start + MS.HOUR - (w.minute * MS.MIN + w.second * 1000 + milliseconds);
    while (hour < segments[i + 1]) { boundaries.add(hour); hour += MS.HOUR; }
  }
  const ordered = [...boundaries].sort((a, b) => a - b);
  return ordered.slice(0, -1).map((start, i) => {
    const w = wallTime(zone, start);
    const end = ordered[i + 1];
    return { start, end, hour: w.hour, minute: w.minute,
      midnight: w.hour === 0 && w.minute === 0,
      transition: transitions.has(start),
      wholeHour: w.minute === 0 && w.second === 0 && end - start >= MS.HOUR,
    };
  });
}

export function civilHourTicks(zone: string, at: Instant): { hour: number; at: Instant }[] {
  const { start, end } = localDayBounds(zone, at);
  const w = wallTime(zone, start);
  return [0, 6, 12, 18].map(hour => ({ hour, at: hour === 0 ? start : resolveWall(zone, w.year, w.month, w.day, hour, 0).instant }))
    .filter(tick => tick.at >= start && tick.at < end);
}
