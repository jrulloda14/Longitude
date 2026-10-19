/**
 * Meeting suitability — pure functions over (zone, working hours, instant).
 *
 * IMPORTANT: this knows nothing about anyone's calendar. It only compares a
 * time against the working / sleeping hours the user configured per location.
 * UI copy must say "within working hours", never "available".
 */
import { MS, Instant, minuteOfDay, wallTime } from './time';

export interface WorkingHours {
  /** minutes after local midnight, e.g. 9 * 60 */
  start: number;
  /** minutes after local midnight; may be < start for overnight shifts */
  end: number;
  /** working weekdays, 0 = Sunday */
  days: number[];
}

export interface SleepHours {
  start: number; // e.g. 23 * 60
  end: number; // e.g. 7 * 60
}

export const DEFAULT_WORK: WorkingHours = { start: 9 * 60, end: 17 * 60 + 30, days: [1, 2, 3, 4, 5] };
export const DEFAULT_SLEEP: SleepHours = { start: 23 * 60, end: 7 * 60 };

export type DayState = 'work' | 'edge' | 'off' | 'sleep';

export interface Participant {
  id: string;
  label: string;
  zone: string;
  work: WorkingHours;
  sleep: SleepHours;
}

const inRange = (m: number, start: number, end: number) =>
  start <= end ? m >= start && m < end : m >= start || m < end;

/** How the instant feels for this participant. `edge` = within 60 min outside work hours on a work day. */
export function dayState(p: Pick<Participant, 'zone' | 'work' | 'sleep'>, at: Instant): DayState {
  const m = minuteOfDay(p.zone, at);
  const wd = wallTime(p.zone, at).weekday;
  if (inRange(m, p.sleep.start, p.sleep.end)) return 'sleep';
  const workDay = p.work.days.includes(wd);
  if (workDay && inRange(m, p.work.start, p.work.end)) return 'work';
  if (workDay && (inRange(m, (p.work.start - 60 + 1440) % 1440, p.work.start) || inRange(m, p.work.end, (p.work.end + 60) % 1440)))
    return 'edge';
  return 'off';
}

const RANK: Record<DayState, number> = { work: 0, edge: 1, off: 2, sleep: 3 };

/** Worst state across the meeting's duration, sampled every 15 minutes. */
export function stateDuring(p: Participant, start: Instant, durationMin: number): DayState {
  let worst: DayState = 'work';
  const end = start + durationMin * MS.MIN;
  for (let t = start; t < end; t += 15 * MS.MIN) {
    const s = dayState(p, t);
    if (RANK[s] > RANK[worst]) worst = s;
  }
  return worst;
}

export type OverlapLevel = 'good' | 'partial' | 'poor' | 'none';

export interface OverlapVerdict {
  level: OverlapLevel;
  headline: string;
  people: { id: string; label: string; state: DayState }[];
  /** 0 = perfect; used to rank suggestions */
  cost: number;
}

/**
 * good    — everyone inside working hours
 * partial — nobody asleep; one or more just outside working hours or off
 * poor    — someone asleep, or most people outside working hours
 */
export function evaluate(people: Participant[], start: Instant, durationMin: number): OverlapVerdict {
  if (people.length === 0) return { level: 'none', headline: 'Add locations to compare', people: [], cost: 0 };
  const rows = people.map((p) => ({ id: p.id, label: p.label, state: stateDuring(p, start, durationMin) }));
  const n = rows.length;
  const working = rows.filter((r) => r.state === 'work').length;
  const asleep = rows.filter((r) => r.state === 'sleep').length;
  const cost = rows.reduce((s, r) => s + [0, 1, 3, 8][RANK[r.state]], 0);
  let level: OverlapLevel;
  let headline: string;
  if (working === n) {
    level = 'good';
    headline = n === 1 ? 'Within working hours' : `Within working hours for all ${n}`;
  } else if (asleep > 0 || working < n / 2) {
    level = 'poor';
    headline = asleep > 0 ? `${asleep === 1 ? '1 location is' : asleep + ' locations are'} in sleeping hours` : `Outside working hours for ${n - working} of ${n}`;
  } else {
    level = 'partial';
    headline = `Outside working hours for ${n - working} of ${n}`;
  }
  return { level, headline, people: rows, cost };
}

export interface Range {
  start: Instant;
  end: Instant;
}

/** Absolute ranges inside [from, to) where every participant is in working hours. */
export function commonWorkingRanges(people: Participant[], from: Instant, to: Instant, step = 15): Range[] {
  if (!people.length) return [];
  const out: Range[] = [];
  let open: Instant | null = null;
  for (let t = from; t <= to; t += step * MS.MIN) {
    const all = t < to && people.every((p) => dayState(p, t) === 'work');
    if (all && open === null) open = t;
    if (!all && open !== null) {
      out.push({ start: open, end: t });
      open = null;
    }
  }
  return out;
}

export interface Suggestion {
  start: Instant;
  verdict: OverlapVerdict;
}

/** Best start times in [from, to), ranked by cost then closeness to `near`. */
export function suggestTimes(
  people: Participant[],
  from: Instant,
  to: Instant,
  durationMin: number,
  near: Instant,
  count = 3,
  step = 30,
): Suggestion[] {
  const all: Suggestion[] = [];
  for (let t = from; t + durationMin * MS.MIN <= to; t += step * MS.MIN) {
    all.push({ start: t, verdict: evaluate(people, t, durationMin) });
  }
  all.sort((a, b) => a.verdict.cost - b.verdict.cost || Math.abs(a.start - near) - Math.abs(b.start - near));
  // Spread suggestions: skip ones within 90 min of an already chosen slot.
  const picked: Suggestion[] = [];
  for (const s of all) {
    if (picked.every((p) => Math.abs(p.start - s.start) >= 90 * MS.MIN)) picked.push(s);
    if (picked.length === count) break;
  }
  return picked.sort((a, b) => a.start - b.start);
}

export const STATE_LABEL: Record<DayState, string> = {
  work: 'Working hours',
  edge: 'Just outside working hours',
  off: 'Off hours',
  sleep: 'Sleeping hours',
};
